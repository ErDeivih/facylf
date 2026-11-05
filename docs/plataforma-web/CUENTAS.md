# Cuentas de la web

Estado: implementación del objetivo 7 del WALL (registro de usuarios con favoritos), 05/11/2026, con la
revisión de capturas del mismo día: **registro abierto** (cualquiera puede crear cuenta, sólo para
favoritos) y **`/entrar` y `/crear-cuenta` separadas**. Antes de esta entrega, `/entrar` era sólo el
diseño preparado. Ahora hay alta, entrada, sesión, cierre y favoritos reales sobre `app.usuario`,
`app.invitacion` y `app.favorito`, **sin Better Auth**.

## 1. Decisión de arquitectura

Better Auth no está instalado y no se instala sin decisión expresa. El registro tenía que funcionar ya,
así que la web implementa lo mínimo seguro con lo que existe:

| Pieza | Dónde | Por qué así |
|---|---|---|
| Contraseña | `app.credencial.password_hash` | scrypt de Node (`N=2^15, r=8, p=1`), sal nueva por contraseña, formato versionado. |
| Sesión | `app.sesion` + cookie `facylf_sesion` | En la base sólo el **SHA-256** del token. La cookie es `httpOnly`, `SameSite=Lax` y `Secure` en producción. |
| Alta | `app.alta_cuenta()` | Reutiliza `app.alta_usuario()` (invitación / aprobación / abierto) y guarda la credencial en la misma transacción. |
| Favoritos | `app.guarda_favorito` / `app.quita_favorito` / `app.mis_accesos` | Ya existían (0031/0037). La web sólo añade los envoltorios de equipo, porque la ficha usa `team_entry.id` y la función guarda la línea a partir de `team_season.id`. |
| Roles | `facylf_app` | La web nunca usa el rol de administración. `facylf_app` no tiene SELECT/INSERT directo sobre `credencial` ni `sesion`: sólo puede llamar a las funciones `security definer`. |

**Migraciones nuevas:** `0057-cuentas-contrasena-y-sesion.sql` (tablas y funciones),
`0058-cierre-de-sesion-con-permisos.sql` (cierre y limpieza con los permisos de su dueño) y
`0059-registro-abierto.sql` (pone `app.ajuste.registro_modo = 'abierto'`; idempotente y reversible).
No se edita ninguna migración aplicada. La cabecera de 0057 deja escrito el orden de reversión.

## 2. Flujo

### Alta

1. `/crear-cuenta` es una pantalla propia (decisión de David, 05/11/2026) y no pide invitación: el
   modo vigente es **`abierto`** (0059). Cualquiera puede crear una cuenta, que sólo sirve para
   favoritos y para lo público, con el paquete por defecto (`esencial`).
2. La web normaliza el correo, valida nombre (1–60), contraseña (10–200) y aceptación, deriva el hash
   y llama a `app.alta_cuenta(..., p_codigo = null)`. En modo abierto **no se consume ninguna
   invitación**; `app.alta_usuario` inserta el usuario activo. Si la base no está en modo abierto se
   responde «El registro no está abierto ahora mismo.».
3. La cuenta activa abre sesión y va a `/mi-panel` (o a `volver`, siempre una ruta interna).
4. Los modos `invitacion` y `aprobacion` siguen existiendo en SQL (y `app.invitacion` no se ha
   tocado), pero la interfaz ya no pide código. Para volver a ellos basta cambiar el ajuste desde
   administración; no hay pantalla todavía.

### Entrada

`/entrar` es sólo la entrada y enlaza a `/crear-cuenta`; no muestra la tarjeta de alta. `volver` se
conserva al pasar de una pantalla a la otra.

1. Comprobación de `Origin`/`Host` (CSRF) y límite por IP en memoria (40 intentos/10 min).
2. Freno por cuenta en la base (`app.espera_entrada`, 0043: 8 fallos seguidos / 15 min). Se pregunta
   **antes** de verificar la contraseña.
3. Si el correo no existe se hace igualmente una derivación scrypt de relleno: el tiempo de respuesta
   no distingue. El mensaje es siempre «Correo o contraseña incorrectos.».
4. Sólo con la contraseña correcta se cuenta el estado: pendiente, bloqueada, caducada.
5. Se crea `app.sesion` (máx. 20 por usuario, se limpian las caducadas) y se escribe la cookie.

### Sesión

- 7 días de caducidad. `app.sesion_valida()` comprueba token vigente, cuenta `activo` y
  `valido_hasta`, y toca `ultimo_uso_en` como mucho cada 5 minutos.
- `httpOnly` (JavaScript no la lee), `SameSite=Lax` (no viaja en POST de otro sitio) y `Secure` con
  `NODE_ENV=production`. En local por HTTP va sin `Secure` para que la sesión funcione.
- Cierre: `POST /api/cuentas/salir`, borra la fila y la cookie. Al bloquear una cuenta,
  `app.cambia_estado_usuario` ya corta sus sesiones de Better Auth si existieran; las de `app.sesion`
  dejan de valer en la siguiente petición por el estado de la cuenta.

### Favoritos

- `POST /api/favoritos` alterna / guarda / quita; `GET /api/favoritos?tipo=&id=` da el estado de la
  estrella. El `user_id` sale **siempre** de la cookie de sesión.
- Tipos admitidos: `club`, `equipo` (id de `team_entry`) y `jugador`. La etiqueta se recorta a 80
  caracteres y se le quitan caracteres de control; sólo la ve el propio usuario.
- `/mi-panel` lee `app.mis_accesos(user_id)` y traduce los enlaces de la web vieja a las rutas
  `/explorar/…`. Si un favorito no tiene último o próximo partido, esa línea no se pinta.
- **Avisos:** la sección de avisos del panel dice que llegarán más adelante y no tiene botones; el
  push no está implementado y no se simula.

## 3. Seguridad

- **CSRF:** todos los POST comprueban `Origin` contra `Host` y, si existe, `Sec-Fetch-Site`. Además
  `SameSite=Lax` en la cookie. No hay mutaciones por GET.
- **Enumeración:** entrada con mensaje único; el intento se anota también cuando el correo no existe.
  El alta responde con un texto que no confirma si el correo ya tiene cuenta.
- **Fuerza bruta:** freno por cuenta en la base y techo por IP en memoria. El de IP vive en el
  proceso: si algún día hay varias instancias, el límite bueno es el de la base.
- **Contraseñas:** scrypt con sal; comparación en tiempo constante; nunca se registra la contraseña.
- **Tokens:** 32 bytes aleatorios; en la base sólo SHA-256; rotación en cada entrada.
- **Datos personales:** no se guardan IP ni user-agent en la sesión. `app.intento_entrada` guarda sólo
  `sha256(correo)`. No se envía ningún dato de la cuenta a páginas públicas.
- **Autorización en servidor:** las páginas con cuenta resuelven la sesión en el servidor
  (`lib/sesion.ts`); no se acepta `user_id` de URL ni de formulario. Las consultas de cuenta van con
  `facylf_app` y no se cachean entre usuarios.

## 4. Cómo probarlo

- Unitarias y de flujo: `pnpm exec vitest run apps/web/test/cuentas.test.ts apps/web/test/cuentas-flujo.test.ts apps/web/test/entrar.test.ts apps/web/test/crear-cuenta.test.ts apps/web/test/mi-panel.test.ts`.
  El flujo contra PostgreSQL se salta si no hay `DATABASE_URL_APP`/`DATABASE_URL_MIGRACION`.
- Tipos: `pnpm --filter @facylf/web exec tsc --noEmit`.
- Manual: `/crear-cuenta` → nombre, correo, contraseña y aceptación (no hay código) → `/mi-panel` →
  abrir una ficha de equipo/club/jugador y pulsar Guardar → cerrar sesión → `/entrar` con las mismas
  credenciales.
- La migración 0059 deja `app.ajuste.registro_modo = 'abierto'`. Comprobarlo:
  `select valor from app.ajuste where clave = 'registro_modo';`.

## 5. Registro abierto: qué cambia y qué no

- **Qué cambia:** cualquiera puede crear una cuenta sin invitación. La cuenta nueva recibe el paquete
  por defecto (`esencial`), que es el mismo que tiene un usuario normal: favoritos y datos públicos,
  sin administración.
- **Qué NO cambia:** contraseñas con scrypt, sesión con token hasheado, CSRF por `Origin`, límite de
  10 altas por hora e IP, 40 intentos de entrada por 10 minutos e IP y freno por cuenta en la base.
- **Riesgo asumido:** no hay verificación de correo ni captcha. Un tercero puede crear cuentas con
  correos que no son suyos (sólo para favoritos). Si aparece abuso, se puede volver a `invitacion` o
  `aprobacion` cambiando el ajuste, sin tocar código.

## 6. Lo que todavía no hay (y no se finge)

- **Verificación de correo** y **recuperación de contraseña**: no hay correo saliente. No se muestra
  un enlace de recuperación que no funcionaría.
- **Avisos y notificaciones push:** no implementados. El panel deja claro que llegarán más adelante,
  sin botones que finjan. Las preferencias sí se pueden guardar desde `/mi-cuenta`.
- **2FA**, aprobación/rechazo desde pantalla: las funciones SQL existen (`app.aprueba_usuario`,
  `app.cambia_estado_usuario`, `app.crea_invitacion`) pero **no se conectan**: el panel de
  administración es de sólo lectura y lo dice. Conectar acciones destructivas sin 2FA y confirmación
  sería peor que no tenerlas.
- **Revocación de sesiones por dispositivo**: el cierre global funciona al bloquear la cuenta; no hay
  lista de dispositivos.
- **Better Auth**: si se instala más adelante, hay que decidir si migra las credenciales de
  `app.credencial` o convive; no se instala sin pedirlo.

## 7. Mi cuenta: preferencias y exportación

- **`POST /api/cuentas/preferencias`**: formulario sin JavaScript, comprueba `Origin`, toma el
  `user_id` de la cookie y llama a `app.guarda_preferencias`. Valida correo, horas y eventos; no
  acepta `user_id` del formulario. Conserva `push` mientras no exista control.
- **`GET /api/cuentas/exportar`**: descarga JSON de `app.exporta_mis_datos` para la sesión. No se
  cachea (`no-store`); sin sesión redirige a entrar.
- La pantalla `/mi-cuenta` enseña las preferencias guardadas y deja editarlas; el aviso de que los
  envíos automáticos aún no existen sigue visible. La baja de cuenta y el cambio de contraseña no
  están disponibles y se dicen.
