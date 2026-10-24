# Encargo para DeepSeek — terminar la web (fase C) · 24/10/2026

> **David, 24/10:** «especifica toda la tarea que falta para terminar la web y se la damos a DeepSeek».
>
> Este documento dice **qué falta, en qué orden, con qué piezas y cuándo está terminada cada cosa**. La capa de
> datos está hecha y medida (migraciones 0001-0050 aplicadas, 66 consultas con contrato y presupuesto, 359
> pruebas SQL y 633 de `pnpm test` en verde). Lo que falta es **la web nueva**: casi todas las pantallas del
> prototipo, las cuentas de usuario, la caché, el panel y las pruebas de punta a punta.
>
> Se trabaja **por etapas (W0-W10)**. Cada etapa termina con sus pruebas en verde, un commit y una línea en
> `ESTADO-DEEPSEEK.md`. No se empieza una etapa sin cerrar la anterior, salvo donde se dice «en paralelo».

## 0. Leer antes de tocar nada (≈ 1,5 h)

1. Este documento entero.
2. `AGENTS.md`, `CLAUDE.md` y `DESIGN.md` (el contrato visual: tokens en `apps/web/src/app/tokens.css`).
3. `docs/plataforma-web/SISTEMA-DISENO.md`, `PRODUCTO-UX.md`, `CONTENIDO-MICROCOPIA.md`, `ESTADOS-VACIOS.md`,
   `GRAFICOS.md` y `CALIDAD-PRUEBAS.md`: cómo se ve, cómo se escribe, cómo se prueba.
4. `docs/plataforma-web/PLATAFORMA-NACIONAL.md` §5-§7 (arquitectura, navegación y seguridad) y `RENDIMIENTO-BASE.md` §3
   (las 11 reglas de toda consulta nueva).
5. **El prototipo**: `docs/plataforma-web/prototipo/` (22 tableros con datos inventados; su `README.md` explica
   el formato y da la ruta de cada uno). Es la referencia de composición de cada pantalla.
6. El código ya preparado: `apps/web/src/consultas/*.ts` (las consultas, sus parámetros de ejemplo y sus columnas),
   `apps/web/src/consultas/adaptadores/postgres/conexion.ts` (dos conexiones, `ejecutaConsulta`) y
   `docs/plataforma-web/codigo/` (auth, acceso, acciones, caché, proxy, push, estado de sección, anuncio, E2E).

## 1. Reglas de este encargo

- **Las de siempre**:
  - el PC no se sobrecarga: compilar y probar no se hace a la vez que una proyección o una reimportación;
  - **nombres de menores**: nunca sin el permiso `ver_menores_nombres`. Las consultas ya lo resuelven (`nombre = null`); la página enseña «Jugador menor de edad», nunca el nombre;
  - no se inventan datos: desconocido ≠ 0, y ninguna tabla vacía se pinta sin su tarjeta de estado;
  - la publicidad se queda **apagada**;
  - no se toca `infra/docker-compose.yml` sin David.
- **Git**:
  - se trabaja en la rama **`fase-c`**, con un commit por etapa o por pantalla, en castellano y explicando el porqué;
  - `git push` de la rama sí, porque el repositorio es privado;
  - **a `main` sólo se une cuando David haya visto las pantallas** (W10).
- **La web vieja sigue funcionando** hasta W9. Las rutas nuevas conviven con las viejas, que leen las colas con slug. Nada de romper `/competicion/[slug]` mientras no haya redirección.
- **La web sólo lee**:
  - `facylf_lector` para lo público;
  - `facylf_app` para lo de una cuenta (consultas con `rol: 'app'`, migración 0050).
  - Escribe sólo cuentas, favoritos, avisos, decisiones de identidad y zonas manuales, siempre por las funciones SQL de `app.*`, nunca con `insert` a mano.
- **Toda consulta nueva**:
  - va en `apps/web/src/consultas/` con contrato, `presupuestoMs`, `plan` y, si lee `app.*`, `rol: 'app'`;
  - lleva sus parámetros de ejemplo en el `PARAMETROS_*` del fichero;
  - pasa `node pruebas/sql/m50.mjs` (cada consulta con su rol) y `pnpm planes` (presupuesto y sin `Seq Scan` en tablas de hechos);
  - cumple las 11 reglas de `RENDIMIENTO-BASE.md` §3;
  - **no lleva barras invertidas dentro del SQL de la plantilla**.
- **Ninguna página agrega hechos de más de un partido.** Lo agregado sale de `analytics.*`. Si una pantalla necesita algo que no está en `analytics`, se propone una tabla o columna en una migración nueva (0051…), con prueba en `pruebas/sql/`.

## 2. Requisito previo: datos completos (W0)

Sin la proyección completa las pantallas enseñan datos parciales: hoy sólo Canarias y Melilla están proyectadas
y quedan **39.464 grupos**.

**W0. Proyectar todo** (de noche, una federación cada vez; PLAN-DEEPSEEK §2 A7):

```
node scripts/copia-seguridad.mjs
pnpm lectura:proyectar --federacion castilla-leon --limite 1000 --sin-globales   # repetir por federación
pnpm lectura:estado                                                              # hasta «Pendientes: ninguno»
node scripts/proyectar-lectura.mjs --temporadas-todo
node scripts/proyectar-lectura.mjs --identidad-todo
node scripts/mantenimiento-bd.mjs --noche
```

- **Terminado:** `lectura:estado` sin pendientes; `select * from ops.chequeos() where estado = 'fallo'` sin
  `proyeccion_pendiente`; `pnpm planes` verde.
- Mientras tanto se puede **desarrollar W1-W3 en paralelo** contra lo que haya (Castilla y León es la primera
  federación que conviene proyectar: es la de los ejemplos y la de las pruebas E2E).

## 3. Decisiones de arquitectura ya tomadas (no se reabren)

| Tema | Decisión | De dónde sale |
|---|---|---|
| Marco | **Next 16** con Cache Components, en el mismo `apps/web` (rama `fase-c`), salida `standalone` como hoy | PLATAFORMA-NACIONAL §10 |
| Rutas | Por **id numérico del canónico**: `/competicion/[id]`, `/partido/[id]`, `/equipo/[id]`, `/club/[id]`, `/jugador/[id]`, `/arbitro/[id]`, `/federacion/[codigo]`. Las viejas (slug) redirigen en W9 | PLATAFORMA-NACIONAL §6.2 |
| Estado | En la URL: federación, temporada, grupo, jornada, pestaña, filtros, orden y cursor | DESIGN.md |
| Conexiones | Dos pools: `facylf_lector` (público) y `facylf_app` (cuentas). `ejecutaConsulta(c, params)` elige por `c.rol` | 0050, `conexion.ts` |
| Cuentas | Better Auth: correo y contraseña con verificación, enlace mágico opcional, 2FA obligatoria para administradores, invitación o aprobación según `app.ajuste.registro_modo` | `codigo/auth.ts`, 0027/0031/0037/0043 |
| Privada | Sin sesión sólo se ven `/entrar`, `/registro`, `/recuperar` y lo técnico; `noindex` siempre | `codigo/proxy.ts`, PLATAFORMA-NACIONAL §7 |
| Caché | Lo público, por etiquetas (`grupo:`, `equipo:`, `club:`, `persona:`, `edicion:`, `federacion:`, `rankings`, `busqueda`, `ojeo`), sin tiempo de caducidad; el proyector invalida (`ops.invalidacion` → `POST /api/revalidar` + sondeo cada minuto). Nada de caché en `/mi`, `/cuenta` ni `/admin` | 0036, `codigo/cache.ts` |
| Permisos | `app.puede(usuario, capacidad)` antes de cada pantalla con capacidad; paquetes esencial/ojeador/analista de 0027 | 0027 |
| Diseño | Tokens de `tokens.css`, modo oscuro, Inter con cifras tabulares, objetivos de 44 px, móvil a 375 px, verde/rojo/ámbar sólo para resultado y tarjetas, con su letra | DESIGN.md, GRAFICOS.md |
| Gráficos | `recharts`, que ya está instalado, con la paleta de GRAFICOS.md; nunca tartas | GRAFICOS.md |

## 4. Etapas

### W1 · Next 16 y esqueleto (1-2 días)

1. Rama `fase-c`. Subir `next` a 16 y React a la versión que pida.
   - Seguir la guía oficial de actualización y su codemod (`npx @next/codemod@latest upgrade`).
   - Lo que cambia y nos toca:
     - `middleware.ts` → `proxy.ts`;
     - `params` y `searchParams` asíncronos;
     - `cacheComponents: true` en `next.config.ts`;
     - `unstable_cache` → `'use cache'` + `cacheTag` + `cacheLife`;
     - `revalidateTag` con perfil y `updateTag` para leer lo recién escrito en una acción.
   - **Comprobar en la documentación de la versión instalada** cada firma antes de usarla.
2. `pnpm --filter @facylf/web build` y las pruebas de siempre (`pnpm test`, `apps/web/test/*.test.ts`,
   `apps/web/e2e/recorridos.spec.ts`) **en verde con la web vieja todavía dentro**: la subida de versión no puede
   romper nada.
3. Esqueleto común:
   - **Layout**: cabecera según el tablero «Cabecera». Barra por funciones: logo · buscador · Explorar · Rankings · Ojeo · Comparar · Siguiendo · cuenta; en móvil el buscador baja a su propia fila.
   - **Tema claro/oscuro** con los tokens.
   - **Errores**: `not-found.tsx` y `error.tsx` con el texto de CONTENIDO-MICROCOPIA §7 y el id de incidencia de `ops.evento_app`.
   - **Componentes base** (en `apps/web/src/componentes/`, reutilizando los que ya hay):
     - `Seccion` y `EstadoSeccion` (de `codigo/estado-seccion.tsx`);
     - `AvisosDeDatos` (consulta `avisos-de-datos`: banda «límite» arriba y «notas» al pie);
     - `Miga`;
     - `SelectorTemporada` y `SelectorGrupo`, que escriben en la URL;
     - `Escudo`, con el color del club sólo en su contexto;
     - `Forma` (G/E/P con letra);
     - `TablaDensa`, con la cabecera pegajosa y la caja con desplazamiento horizontal;
     - `Cobertura` («minutos de 18 de 22 partidos»);
     - `Esqueleto`, del mismo alto que el contenido.
4. **Observabilidad**, como dice la cabecera de `apps/web/src/lib/observabilidad.ts`:
   - `midiendo` alrededor de `ejecutaConsulta`;
   - `anotaError` en `global-error` y en las rutas de API;
   - `/api/salud` y `/api/web-vitals`.
5. **Caché**: pasar `docs/plataforma-web/codigo/cache.ts` a `apps/web/src/lib/cache.ts`.
   - Adaptarlo a `ejecutaConsulta` (el `@/lib/db` del borrador ya no existe) y a `'use cache'`/`cacheTag`.
   - Rutas: `app/api/revalidar/route.ts` (con `REVALIDAR_SECRETO`) e `instrumentation.ts` (consumir pendientes al arrancar y cada minuto).
6. **Métricas de uso** (0039): en el layout, con `after()`, `select ops.anota_uso($patron, $usuario, $de_cache, $ms)`
   con el **patrón** de la ruta (`/equipo/[id]`), nunca la URL.

**Terminado:**
- build y pruebas viejas en verde;
- la cabecera y el tema se ven en una página vacía nueva (`/_esqueleto`, que se borra al final);
- tras una pasada del proyector, `select count(*) from ops.invalidacion where consumida_en is null` vuelve a 0 en un minuto;
- `ops.consulta_minuto` y `ops.uso_dia` reciben filas.

### W2 · Cuentas de usuario (2-3 días)

1. Dependencias e instalación:
   - `pnpm --filter @facylf/web add better-auth web-push nodemailer` (`pg` ya está);
   - mover `codigo/auth.ts` → `apps/web/src/lib/auth.ts`, `codigo/acceso.ts` → `src/lib/acceso.ts` y `codigo/proxy.ts` → `src/proxy.ts`;
   - repasar las rutas de import de `better-auth` con la versión instalada.
2. `.env`:
   - `BETTER_AUTH_SECRET` (32 bytes aleatorios) y `BETTER_AUTH_URL`;
   - `DATABASE_URL_APP` (rol `facylf_app`);
   - `SMTP_URL` y `SMTP_DE` cuando David dé un correo; sin ellos, los correos salen por consola.
3. Tablas de autenticación:
   - `npx @better-auth/cli migrate` crea las tablas en el esquema `auth`;
   - después: `grant usage on schema auth to facylf_publicador; grant select on auth."user" to facylf_publicador;`, porque `notificaciones.mjs` y la vigilancia leen el correo y la 2FA;
   - comprobar que el `delete from auth.session where "userId" = …` de `app.cambia_estado_usuario` (0043) usa el nombre real de la columna; si no, migración nueva que lo corrija.
4. Pantallas (tableros 13 y 22, textos en `codigo/acceso.ts` y CONTENIDO-MICROCOPIA):
   - `/entrar`: correo y contraseña, enlace mágico y «He olvidado la contraseña». `volver` sólo admite rutas internas.
   - `/registro?codigo=`: con el código de invitación ya relleno, y los errores de 0043 traducidos.
   - `/recuperar`: responde siempre lo mismo, exista o no la cuenta.
   - `/verificar`.
   - `/cuenta/pendiente`, `/cuenta/sin-acceso` (con el motivo), `/cuenta/caducado` y `/cuenta/seguridad` (activar la 2FA con código QR; obligatoria para administradores).
5. `exigeAcceso()` en el layout de todo lo privado, y `exigeAcceso({ admin: true })` en `/admin`: si no es administrador, 404.
6. **Primer administrador**:
   - `select app.crea_invitacion(…)` no sirve todavía porque no hay administrador, así que:
     `insert into app.invitacion (codigo, creada_por, paquete, usos_max) values ('DAVID-<aleatorio>', 'arranque', 'analista', 1)`;
   - David se registra con ese código y luego `update app.usuario set rol = 'administrador' where user_id = …`;
   - activa la 2FA.

**Terminado:**
- los 12 recorridos de `docs/plataforma-web/codigo/e2e/usuarios.spec.ts`, pasados a `apps/web/e2e/usuarios.spec.ts`, en verde contra una base de **prueba** (`DATABASE_URL_E2E`, nunca la real);
- `ops.chequeos()` no da `administradores_sin_2fa`.

### W3 · Fichas públicas (5-7 días; el grueso)

Cada página:
- es de servidor, lee con `consultaCacheada` y pinta `AvisosDeDatos` arriba;
- pone en cada sección `EstadoSeccion` según `estado-secciones` o `estado-secciones-equipo` (0044);
- enlaza cada nombre a su ficha;
- comprueba su capacidad: `ver_fichas` para fichas, `ver_actas` para actas, `panel_equipo` para el panel de equipo.

| Ruta | Tablero | Consultas que ya existen | Consultas que faltan (§5) |
|---|---|---|---|
| `/` | 1 | `busqueda-por-nombre` (sugerencias con debounce de 200 ms y un mínimo de 2 letras), `facetas-del-catálogo` / `listado-de-grupos` (Explorar en cascada), `mis-accesos` («Tus equipos», sólo con sesión) | — |
| `/buscar?q=` | — | `busqueda-por-nombre` (tope «más de 5.000»: ESTADOS-VACIOS §2) | — |
| `/competicion/[id]?grupo=&jornada=&vista=` | 2 | `zonas-del-grupo`, `estado-secciones`, `ranking-goleadores` (filtro de edición), `rachas-del-grupo` | **Q1** `edicion-por-id`, **Q2** `clasificacion-por-grupo` (total/casa/fuera, por id), **Q3** `jornada-del-grupo` |
| `/partido/[id]` | 3 | `sanciones-inferidas` (expulsiones) | **Q4** `partido-por-id`, **Q5** `alineaciones-del-partido`, **Q6** `eventos-del-partido`, **Q7** `cara-a-cara` |
| `/equipo/[id]` | 4 | `equipo-por-id`, `plantilla-del-equipo`, `partidos-del-equipo`, `curva-del-equipo`, `goles-por-tramo`, `forma-del-equipo`, `reparto-de-goles`, `minutos-por-equipo` (plantilla con minutos), `estado-secciones-equipo` | — |
| `/club/[id]` | 5 | `club-por-id`, `equipos-del-club` (conmutador A/B/C…), `evolucion-del-club` | — |
| `/jugador/[id]` | 6 | `persona-por-id`, `trayectoria-unificada` (barras apiladas por temporada y equipo), `minutos-por-equipo`, `sanciones-inferidas`, `candidatos-de-identidad` («por qué se unieron sus fichas») | — |
| `/federacion/[codigo]` | 19 | `ficha-federacion`, `avisos-de-datos` | **Q8** `competiciones-de-federacion` |
| `/competicion/[id]/estadisticas` | 11 | `goles-por-tramo` (de liga), `uso-de-cantera`, `arbitros` (de la edición), `sanciones-inferidas` | **Q9** `disciplina-de-la-competicion` |

Detalles que se piden expresamente (prototipo y PLATAFORMA-NACIONAL §6):
- **Jugador:** los minutos son la primera cifra (total, % del equipo, titularidades), con «≥» cuando no son exactos.
- **Equipo:** marca a los jugadores que suben del B o del cadete.
- **Competición:** franjas de zona con leyenda; texto «Zonas según lo ocurrido en las últimas temporadas…».
- **Acta:** cronología central con iconos y letra, y alineaciones a dos columnas.
- **Club:** escalera de divisiones con ▲ y ▼.
- **En todas:** cada cifra con su cobertura.

**Terminado (por página):**
- datos reales de Castilla y León;
- móvil a 375 px sin desplazamiento horizontal de la página;
- axe sin barreras serias;
- `EstadoSeccion` probado con una competición de cada nivel (completo, alineaciones, resultados, calendario);
- p95 dentro de presupuesto en `ops.consulta_minuto`.

### W4 · Rankings, Comparar, Ojeo y Árbitro (3-4 días)

| Ruta | Tablero | Permiso | Consultas que ya existen | Faltan |
|---|---|---|---|---|
| `/rankings?tipo=goles\|minutos\|tarjetas&fed=&temp=&cat=` | 8 | `rankings`; «todas las federaciones» pide `cruzar_federaciones` | `ranking-goleadores`, `comparacion-de-ligas` (pide `analisis_ligas`) | **Q10** `ranking-minutos`, **Q11** `ranking-tarjetas` |
| `/comparar?a=&b=` | 7 | `comparar` | `comparador-jugadores`, `trayectoria-unificada` (×2) | — |
| `/ojeo?…` | 9 | `cruzar_federaciones` (paquete ojeador o superior) | `ojeo-jugadores` (incluida la variante nacional) | — |
| `/arbitro/[id]` | 10 | `ver_fichas` | `arbitros` (comparado con sus colegas) | **Q12** `arbitro-por-id`, **Q13** `partidos-del-arbitro` |

- Ojeo y Comparar con nombres de menores: la versión cacheada va siempre **sin** nombres; quien tenga
  `ver_menores_nombres` pide la versión sin caché y el acceso queda en `app.registro_acceso`.
- **Terminado:** como W3, y la ruta del ojeo da 404 o «Tu paquete no incluye el ojeo» sin el permiso.

### W5 · Mi panel, avisos y Mi cuenta (2-3 días)

| Ruta | Tablero | Consultas y acciones |
|---|---|---|
| `/mi` | 14 | `mis-accesos`, `bandeja-avisos`; acciones de `codigo/acciones-usuario.ts` (favoritos: guardar, quitar, reordenar, avisar) |
| (estrella en cada ficha) | — | `app.es_favorito` / `guardarFavorito` / `quitarFavorito`; el equipo se guarda como *línea* (sigue de temporada en temporada) |
| (campana) | — | `bandeja-avisos`, `marcarLeidos` |
| `/cuenta` | 18 | `app.perfil` (**Q14** `mi-perfil`), `guardaPerfil`, `guardaPreferencias`, dispositivos (`suscripcion_push`), descargar mis datos (`app.exporta_mis_datos`), darse de baja (`app.baja_usuario`) |

1. **Push:**
   - `codigo/sw.js` → `apps/web/public/sw.js` y `codigo/push-cliente.ts` → `src/lib/push-cliente.ts`;
   - claves con `npx web-push generate-vapid-keys` → `WEBPUSH_PUBLICA`, `WEBPUSH_PRIVADA` y `WEBPUSH_CONTACTO`.
2. Tarea «FACyLF avisos» (`scripts/notificaciones.mjs`; ya hecha, registrarla en B3).

**Terminado:**
- favorito de un equipo → aparece en Mi panel;
- `node scripts/notificaciones.mjs` dos veces → un cambio de hora hecho a mano en la base de PRUEBA llega a la campana y por push;
- exportar y darse de baja funcionan;
- E2E de W2 en verde.

### W6 · Panel de administración (3-4 días)

Todo bajo `/admin` exige `exigeAcceso({ admin: true })`, no lleva caché, usa `rol: 'app'` y cada escritura pasa
por `codigo/acciones-admin.ts` (auditoría con autor).

| Ruta | Tablero | Consultas (`admin.ts`) | Escrituras |
|---|---|---|---|
| `/admin` | 21 | `admin-panel-resumen`, `admin-cuentas-resumen`, `admin-chequeos-ahora`, `admin-procesos`, `admin-avisos-por-dia`, `admin-uso-por-dia`, `admin-uso-por-pantalla`, `admin-accesos-sensibles` | silenciar alerta 24 h (nunca las de copias) |
| `/admin/usuarios` | 15 | `admin-usuarios`, `admin-invitaciones`, `admin-caducidades`, `admin-auditoria` | aprobar, rechazar, bloquear, reactivar, paquete y caducidad, permiso suelto, invitación (crear, que manda el correo, y anular), modo de registro |
| `/admin/datos` | 16 | `admin-casos-resumen`, `admin-casos-lista`, `cobertura-por-federacion` | `ops.revisa_caso` |
| `/admin/identidades` | (16) | **Q15** `admin-identidades-pendientes` | confirmar o separar (`identity_decision`, capacidad `confirmar_identidades`) |
| `/admin/salud` | 12 | `admin-chequeos-ahora`, **Q16** `admin-tiempos-consultas`, **Q17** `admin-errores-recientes`, `ops.copia` | — |
| `/admin/publicidad` | 17 | `admin-espacios-anuncio`, `admin-campanas-anuncio`, `admin-informe-anuncios`, `admin-anuncios-por-dia` | **se deja en sólo lectura y con el interruptor general a 0**; encender = David |
| `/admin/federaciones` | — | `ficha-federacion` | editar `core.federacion_perfil` (con auditoría) |

**Terminado:**
- cada escritura deja su fila en `app.auditoria` con el autor;
- un usuario normal en `/admin` ve 404;
- sin 2FA, se va a `/cuenta/seguridad`;
- E2E del panel (en `usuarios.spec.ts`) en verde.

### W7 · Estados, accesibilidad y velocidad percibida (2 días, transversal)

- Revisar las 19 pantallas contra ESTADOS-VACIOS.md §2:
  - ninguna sección vacía sin tarjeta;
  - esqueletos del mismo alto;
  - «Cargando…» en texto a los 3 s;
  - «Volver a intentar» a los 10 s.
- **Accesibilidad:**
  - axe en cada ruta en los E2E;
  - foco visible;
  - orden de tabulación;
  - etiquetas en cada control;
  - tablas con `scope`;
  - gráficos con alternativa en texto o tabla.
- **Móvil a 375 px:** sin desplazamiento horizontal de la página; las tablas anchas, en su caja con desplazamiento.

**Terminado:**
- `apps/web/e2e/recorridos.spec.ts` ampliado con los recorridos de PLATAFORMA-NACIONAL §6.1 y la comprobación «ninguna `section` vacía»;
- todo en verde;
- un informe de Lighthouse por pantalla principal pegado en ESTADO, sólo como referencia: no es una puerta.

### W8 · Operación (fase B, en paralelo desde W2)

PLAN-DEEPSEEK §3 B1-B7:
- canal de avisos al móvil (Telegram o ntfy; David crea el bot);
- `registrar-tareas-plataforma.ps1`;
- primera vigilancia y resumen;
- copia y restauración de prueba.

**Terminado:**
- aviso de prueba recibido;
- parte de las 8:05 llega solo;
- copia de las 3:31 y restauración correcta en `ops.copia`.

### W9 · Retirar la web vieja (1-2 días)

1. **Redirecciones permanentes** de las rutas con slug a las nuevas por id:
   - competición y grupo con `grupo-por-codigos-externos`;
   - equipo, club, jugador y acta con las consultas de §5 Q18 (`id-por-slug`).
   - Si no hay correspondencia, se enseña la página «no encontrado», nunca otra cosa.
2. Quitar de `apps/web` lo que lee las colas SQLite: `repositorio-local.ts`, `EquipoDesdeCola`, `JugadorDesdeCola` y `@facylf/ingesta` como dependencia de la web.
   - `/canonico` se queda (diagnóstico).
   - **La web ya no abre SQLite.**
3. Actualizar `apps/web/test/*` y `e2e/recorridos.spec.ts` a las rutas nuevas.

**Terminado:**
- `grep -r "sqlite\|repositorio-local" apps/web/src` vacío;
- todas las pruebas en verde;
- ninguna ruta vieja da error: todas redirigen o dan 404.

### W10 · Despliegue y entrega a David

1. `pnpm --filter @facylf/web build` (standalone).
2. `node scripts/despliega-plataforma.mjs` (azul/verde con vuelta atrás, DESPLIEGUE-CONTINUO.md): primero en seco y luego `--de-verdad`.
3. Pasar a David una lista de 10 enlaces para revisar (una de cada pantalla, con datos reales) y las capturas a 375 px y a 1440 px.
4. Con su visto bueno: unir `fase-c` a `main`, `git push` y anotar en ESTADO-DEEPSEEK.

**Terminado:** David ha revisado y `main` lleva la web nueva.

## 5. Consultas que faltan (especificación)

Todas en `apps/web/src/consultas/` y con prueba de contrato. Las públicas, `plan: 'indexado'` salvo que se diga
otra cosa. Leen `analytics.*` y el catálogo de `core.*` por clave, nunca agregan `core.appearance` ni
`core.match_event` de más de un partido, salvo Q5 y Q6, que leen **un** partido por su clave.

| # | Nombre | Parámetros | Devuelve | Presupuesto |
|---|---|---|---|---|
| Q1 | `edicion-por-id` | edición | nombre publicado, federación, temporada, categoría, división (escalón por encima y por debajo), grupos (id, nombre), jornadas previstas y jugadas, fechas de inicio y fin | 50 ms |
| Q2 | `clasificacion-por-grupo` | grupo, vista (`total`, `casa`, `fuera`) | la oficial (`core.standing_snapshot`, la última jornada) para `total`; para casa/fuera, la de `analytics` por equipo, si existe; si no, propone columnas en `analytics.team_edition_summary` (migración nueva) | 80 ms |
| Q3 | `jornada-del-grupo` | grupo, número de jornada o null (la actual) | partidos (id, local, visitante, marcador o hora, estado) y la lista de jornadas para el navegador | 60 ms |
| Q4 | `partido-por-id` | partido | fecha y hora, campo, estado, marcador, tanda de penaltis (0040), equipos (team_entry, club, posición y puntos de ese momento), árbitro principal, edición, grupo y jornada | 50 ms |
| Q5 | `alineaciones-del-partido` | partido, ver_menores | por lado: titulares y suplentes (dorsal, nombre o null, posición si la hay, capitán, minutos de entrada y salida), entrenador | 80 ms |
| Q6 | `eventos-del-partido` | partido, ver_menores | cronología (minuto, lado, tipo, quién, detalle) con goles, penaltis, en propia, tarjetas y cambios emparejados | 80 ms |
| Q7 | `cara-a-cara` | línea local, línea visitante, límite | partidos anteriores entre esas dos líneas de equipo (todas las temporadas) | 100 ms |
| Q8 | `competiciones-de-federacion` | federación, temporada | ediciones con su nivel medido (`analytics.edicion_capacidad.nivel`), grupos y equipos | 120 ms (`agregado`) |
| Q9 | `disciplina-de-la-competicion` | edición | por equipo: amarillas, rojas, dobles, expulsiones y partidos perdidos por sanción (sale de `analytics`) | 150 ms |
| Q10 | `ranking-minutos` | federación o null, temporada, categoría, edición o null, límite | igual que `ranking-goleadores`, ordenado por minutos (sólo competiciones con minutos fiables; cobertura en cada fila) | 300 ms |
| Q11 | `ranking-tarjetas` | ídem | amarillas, rojas y dobles por jugador | 300 ms |
| Q12 | `arbitro-por-id` | árbitro (`analytics.arbitro_persona`) | nombre, federación, temporadas, partidos, tarjetas por partido frente a la media de sus colegas | 80 ms |
| Q13 | `partidos-del-arbitro` | árbitro, cursor (fecha, id), límite | últimos partidos con marcador y tarjetas; paginación por clave | 100 ms |
| Q14 | `mi-perfil` | usuario | `app.perfil(usuario)`, con `rol: 'app'` | 30 ms |
| Q15 | `admin-identidades-pendientes` | federación o null, límite | candidatos de unión entre federaciones sin decidir (0024), con sus pruebas y riesgo de homónimo; `rol: 'app'` | 200 ms |
| Q16 | `admin-tiempos-consultas` | días | p95 por consulta en `ops.consulta_minuto` frente a su presupuesto; `rol: 'app'` | 150 ms |
| Q17 | `admin-errores-recientes` | límite | últimos `ops.evento_app` de nivel error o crítico (sin datos personales); `rol: 'app'` | 80 ms |
| Q18 | `id-por-slug` | tipo, federación, código externo | id canónico para las redirecciones de W9 (vía `source.external_ref`) | 30 ms |

Si al escribir una de éstas hace falta agregar hechos, **no se agrega en la consulta**: se añade la columna o la
tabla a `analytics` en una migración nueva, la rellena el proyector y se prueba en `pruebas/sql/m5x.mjs`.

## 6. Etiquetas de caché de las páginas nuevas

| Página | Etiquetas |
|---|---|
| Competición, jornada, estadísticas | `edicion:<id>`, `grupo:<id>` |
| Acta | `grupo:<id del grupo del partido>` |
| Equipo | `equipo:<team_entry>`, `grupo:<id>` |
| Club | `club:<id>` |
| Jugador, Comparar | `persona:<id>` (una por jugador) |
| Árbitro | `edicion:<…>` de sus ediciones o `rankings` |
| Federación | `federacion:<codigo>` |
| Rankings, comparación de ligas | `rankings` |
| Ojeo (sin nombres de menores) | `ojeo`, `federacion:<codigo>` |
| Buscador | `busqueda` |

`ops.invalida_grupo` (0036) ya emite `grupo`, `edicion`, `federacion`, `grupo-externo`, `equipo`, `club`,
`persona` y `rankings`. Si una página necesita otra etiqueta, se añade ahí con una migración nueva.

## 7. Lo que decide David (no lo decidas tú)

- El correo de envío (`SMTP_URL`) y el canal de avisos al móvil.
- Encender la publicidad (no se enciende).
- Si la web se abre fuera de casa algún día (hoy: sólo local, sin abrir puertos).
- El visto bueno de W10 antes de unir a `main`.
- Limpiar `core.person` (519.369 personas sin partidos; el buscador ya no las enseña).

## 8. Cómo dejar constancia

- Al cerrar cada etapa: un bloque arriba del todo en `ESTADO-DEEPSEEK.md` con lo hecho, las salidas de las pruebas, las capturas (si las hay) y lo que queda.
- La tabla de §4 de este documento, con el estado de cada etapa (pendiente / en curso / ✓).
- Lo que no se pudo hacer se dice con su porqué; nada se da por hecho sin la prueba que lo demuestra.

| Etapa | Estado |
|---|---|
| W0 Proyección completa | pendiente |
| W1 Next 16 y esqueleto | pendiente |
| W2 Cuentas | pendiente |
| W3 Fichas públicas | pendiente |
| W4 Rankings, Comparar, Ojeo, Árbitro | pendiente |
| W5 Mi panel, avisos, Mi cuenta | pendiente |
| W6 Panel de administración | pendiente |
| W7 Estados, accesibilidad, velocidad | pendiente |
| W8 Operación (fase B) | pendiente |
| W9 Retirar la web vieja | pendiente |
| W10 Despliegue y entrega | pendiente |
