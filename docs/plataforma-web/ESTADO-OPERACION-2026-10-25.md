# Estado de la operación explicado para la siguiente sesión de DeepSeek · 25/10/2026

> **Para qué sirve este documento.** David ha pasado a DeepSeek toda la conversación de los días 23, 24 y 25 de
> octubre. Esto es el resumen **de lo que ocurrió, con qué pruebas, qué está bien, qué está mal y qué queda**. Si
> eres la sesión siguiente y no tienes memoria de aquellos mensajes, lee esto y con ello puedes trabajar.
>
> **Orden de lectura recomendado:** este documento → [`ENCARGO-DEEPSEEK-2026-10-25.md`](ENCARGO-DEEPSEEK-2026-10-25.md)
> (el trabajo pendiente, ya ordenado, con las decisiones y valores por defecto de David) → los bloques de arriba de
> [`ESTADO-DEEPSEEK.md`](ESTADO-DEEPSEEK.md) → [`REPARTO-CYL-2026-10-25.md`](REPARTO-CYL-2026-10-25.md) (cuánto falta
> en CyL) → [`LA-PREFERENTE-2026-10-25.md`](LA-PREFERENTE-2026-10-25.md) y su plan → `COBERTURA-FEDERACIONES.md`
> (qué publica cada federación) → `RENDIMIENTO-BASE.md` (reglas de consulta).

---

## 1. En una página: cómo está todo hoy (25/10/2026, 14:15)

| | Servidor | PC |
|---|---|---|
| encendido | **22 h 45 min seguidos** (desde el 24/10 a las ~15:30) | encendido |
| batería | **100 %, «Full», cargando** | — |
| guardia de energía | **E0** (tope 200 %) | — |
| contenedores | **23** (15 federaciones + importador/gestión) | **Docker Desktop PARADO** ← hay que arrancarlo |
| recolectores | 15 federaciones del servidor + CyL | 9 federaciones + forales/provinciales + CyL |
| carga / memoria | carga **14,6** · 8,99 GB disponibles | 5,0 GB libres |
| ingesta | funcionando | funcionando |

**Lo que bloquea trabajo ahora mismo:** Docker Desktop está parado en el PC. Sin él no hay PostgreSQL, y sin
PostgreSQL no se puede consultar, importar, ni medir nada de la plataforma. **Es lo primero que hay que hacer.**

---

## 2. Lo que hice yo (DeepSeek, sesiones del 23 y 24/10) y está comprobado

Todo esto lo verifiqué yo con la máquina delante; las salidas están pegadas en los bloques de `ESTADO-DEEPSEEK.md`
del 23/10 12:10, 12:55 y 14:05 y del 24/10 00:05 y 00:35.

### 2.1 Revisión R1-R7 del encargo de Claude (23/10)

| | Resultado |
|---|---|
| **R2** migraciones en un **PostgreSQL 18.6 real** | Base limpia `facylf_prueba`: **0001-0045 aplicadas en orden, 45 ficheros, 0 errores, 46 s**. Segunda pasada: 16 ficheros se quejan por `already exists` (0002-0018) — **de 0023 en adelante son repetibles** (Claude corrigió 0024/0025/0029 con `drop view/constraint if exists` y lo dejó así). Extensión `pg_stat_statements`, `pg_trgm` y `unaccent` presentes. Humo: `ops.chequeos()` y `avisos_de_datos()` responden |
| **R3** pruebas SQL | **m29…m45 + analisis: 285 comprobaciones, todas «TODO OK»**; m46 (nueva) 41 ✓; m47 19 ✓. **Total 346.** Banco de volumen: 32.760 partidos, 685.440 apariciones, 354 s, ~1,14 GB. Rendimiento: **«66 consultas · 0 a revisar»** |
| **R1** pruebas de siempre | `node --test scripts/lib/*.test.mjs`: **219 ✓**. `pnpm lint` ✓, `tsc` de la web ✓. `pnpm test`: **630 bien, 3 mal, los 3 por tiempo agotado** (el recuento de `/canonico` —lo arregló la 0047— y dos *hooks* de 90 s de `retirada.test.ts`; Claude los dejó en 30 s con `= any (array(…))`) |
| **R5** scripts | `node --check` de los 10 scripts de plataforma: todos ok |
| **R7** CI | `.github/workflows/test.yml` con 4 trabajos + `rendimiento.yml` copiados. **El CI no ejecuta desde el 21/09: GitHub rechaza los trabajos por facturación de la cuenta** («recent account payments have failed or your spending limit needs to be increased»). Los trabajos se registran con su nombre → el YAML es válido. **Es cosa de David** (Settings → Billing and plans) |
| **R4** lectura de código | `grep -n '\\' apps/web/src/consultas/*.ts` → ninguna plantilla lleva barra invertida dentro del SQL; permisos de `facylf_app` revisados (select sobre lo leído, escritura sólo en su esquema `app`) |

### 2.2 Correcciones que hice y están en producción

1. **T6 · Migración `0046-perfil-de-las-ocho-del-servidor.sql`** — las 8 federaciones que se recogen en el servidor
   salen de «sin medir»: Aragón 87 %, Asturias 100 %, Baleares 97 %, Cantabria 99 %, Castilla-La Mancha 100 %,
   **Extremadura false (42 %)**, **Galicia true (74 %)**, **Murcia false (35 %)**, con su nota. Lo no medido sigue
   NULL. Con `pruebas/sql/m46.mjs` (41 ✓) y dos comprobaciones de `m38` ajustadas. En la base real:
   `avisos_de_datos('extremadura')` → «identidad_por_nombre», **0 federaciones sin medir**.
2. **`shm_size: 1gb`** en `infra/docker-compose.yml`: Docker daba 64 MB a `/dev/shm` y las consultas en paralelo
   fallaban con «could not resize shared memory segment». Recreado **sólo** el servicio de la base
   (`up -d postgres`, datos intactos) y comprobado con una consulta de 3 procesos sobre 19,4 M de apariciones.
3. **Guardia de energía** (`scripts/servidor/guardia-energia.sh`), tres arreglos reales:
   - **Ya no se apaga al despertar**: si la batería está al 6 % pero la máquina acaba de arrancar (<15 min) y el
     cargador está puesto, pasa a **E4** (todo parado menos CyL) en vez de apagarse otra vez. *Probado en el
     campo dos veces el 24/10.*
   - **Modo conservación de Lenovo forzado a 0** en cada pasada: tras un apagón el EC lo volvía a poner a 1 y la
     batería se quedaba clavada en ~60 % sin cargar («Not charging»).
   - **E0 baja de 250 % a 200 %**: con 250 % y carga 13 el cargador no sostenía la batería (del 100 % al 6 % en
     hora y media); con 200 % y carga 10-11 aguanta cargando 22 horas seguidas. Un 20 % más lento es mejor que
     tres horas apagado.
4. **Prioridad de actas** (petición de David: «prioriza actas, para todas las federaciones»):
   `scripts/claude/prioriza-actas.mjs` (idempotente, simulación por defecto, `--aplicar`, deja copia de las
   prioridades anteriores junto a cada cola). Mete los trabajos `acta` pendientes en una banda fija
   (−1.399.000.000). Orden resultante: **descubrir** (catálogo/grupos/índice/calendario, que es lo que «conoce la
   jornada») → **bajar actas** → **seguir leyendo jornadas**. Aplicado el 23/10 a 454.766 trabajos del PC y
   265.549 del servidor. **Ojo: se deshace** (ver §4.2).
5. **Wake-on-LAN preparado** (`scripts/servidor/enciende-servidor.mjs` + `config/servidor-wol.json`):
   MAC de la tarjeta de cable **`68:F7:28:9E:8C:0A`** (`enp2s0`; el Wi-Fi `f4:06:69:67:25:69` no sirve), `Wake-on: g`
   activado y hecho permanente con la unidad `facylf-wol.service`. **Pero la prueba real de despertar falló** (ver §4.4).
6. **Nombres de personas fuera del árbol**: anonimicé los nombres reales de `packages/ingesta/test/acta.test.ts`
   (jugadores, entrenador y árbitro de un acta de verdad) y de un comentario de `scripts/informe-equipo.mjs`.
   20/20 pruebas del parser en verde tras el cambio.

### 2.3 Los commits

**Se subieron 53 commits a `main` el 23/10** (`93bc80e..d3ca697` y después `5e94e20`). El repositorio es
**privado**, el árbol quedó limpio y el código actual ya no lleva nombres reales. Aviso honesto: esos nombres
**sí están en commits ya publicados de antes**; si algún día el repositorio deja de ser privado, hay que
reescribir el historial **antes** y con copia previa.

---

## 3. Lo que está bien (no tocar)

- **Las 25 colas piden sin errores** (comprobado por mí el 23-24/10 con `intervalos-peticiones.mjs` y los registros):
  **cero intervalos por debajo de 4 s** en Madrid, Valencia, Cataluña y Andalucía; medianas de 6,2-7,2 s en las del
  PNPG y 10,6-13,9 s en Valencia.
- **La relectura de Cataluña va bien**: el lector nuevo sí lee tarjetas, cambios y código de jugador (una acta de
  muestra: «20 jugadores (20 con código), 12 eventos (3 tarjetas, 0 cambios), 5 técnicos»), sin iconos
  desconocidos y sin errores.
- **Madrid y Valencia, relanzados** el 23/10 a las 13:52 con el código nuevo: **Valencia corrigió 532 actas de
  partidos suspendidos** que figuraban como 0-0 y **Madrid 8**. Sin duplicar workers (los relanza el supervisor al
  terminar sus procesos).
- **El servidor aguanta**: 22 h 45 min encendido, 100 % de batería, 23 contenedores, E0.
- **El despertador del reloj de la placa funciona**: el 24/10 despertó solo a las 14:32 después de un apagado
  limpio a las 13:04.

---

## 4. Lo que está mal o abierto (con diagnóstico y qué haría)

### 4.1 Castilla-La Mancha está parada: **se queda sin plaza de Chrome** ← hallazgo del 24/10, 22:00

Síntoma: **67 peticiones y 0 actas en todo el día**, con **6.069 actas pendientes**. Su contenedor está «Up 23
horas» y su registro dice, literalmente:

```
· El catálogo no ha cambiado (8.3 h desde el último repaso): no se reprioriza el plan
· sesión limitada a 927 trabajos para reciclar Chrome y contener la memoria
· esperando para abrir Chrome: no cabe por reparto: 4 plazas ocupadas de 4
```

**No es un fallo del lector ni de la web: es el reparto de plazas de navegador.** Hay 4 plazas en el servidor y las
otras federaciones las ocupan; Castilla-La Mancha lleva 8 horas esperando y nunca le toca. Opciones (elegir una):
1. **Subir las plazas** del servidor (memoria disponible: 8,99 GB; un Chrome son unos 250-400 MB). Es el arreglo
   más simple y es configuración, no código.
2. **Reparto justo**: que una federación que lleve más de N minutos esperando tenga preferencia (hoy es
   `cedePorPrioridad`/`plazasCompartidas` en `scripts/lib/presupuesto-memoria.mjs`: **código de Claude**).
3. **Plaza reservada** para CLM como la que tiene CyL (`slot-prioridad.lock`).
Antes de tocar nada, comprobar en el registro de las demás si alguna está esperando también: **si hay varias
esperando, el problema es el número de plazas, no una federación concreta**.

### 4.2 La prioridad de actas se deshace sola

Al reejecutar `prioriza-actas.mjs` el 24/10 volvió a recolocar **102.318** trabajos en Andalucía y **138.985** en
Extremadura que ya estaban puestos la noche anterior. Motivo: el recolector **reencola** trabajos nuevos con su
prioridad normal, y el guion sólo puede tocar los que ya existen.
- **Parche**: volver a pasarlo cada pocas horas (segundos, idempotente).
- **Arreglo de verdad (código de Claude, una línea)**: en `scripts/lib/recolector-local.mjs`, el `order by` que
  elige el siguiente trabajo —hoy `order by prioridad, temporada desc, case when tipo='acta' then 0 else 1 end,
  creado_en`— para que `acta` vaya siempre delante: `case when tipo='acta' then prioridad - 500000000 else
  prioridad end`. Requiere desplegar en los 26 contenedores.

### 4.3 El cargador del servidor no es fiable (el problema físico del 24/10)

Cronología real del 24/10: se apagó limpio a las **13:04** (batería al 6 %, con el cargador puesto), despertó
solo a las **14:32**, se volvió a apagar a las **14:48** y a las **15:15**. Medido durante 12 minutos con el
cargador conectado («Charging», AC online): **cero energía entraba** (1.050.000 µWh sin moverse). Después, **sin
que conste qué se cambió, el mismo cargador cargó del 6 % al 100 %** entre las 16:30 y las 19:32 y desde entonces
aguanta.
**Conclusión:** el cargador (o el cable o el conector del portátil) es **intermitente**. Está en la lista de
decisiones de David desde hace días: comprar un cargador genuino Lenovo más potente. Mientras no se cambie,
volverá a pasar. La guardia ya lo apaga limpio, así que el riesgo es perder horas de ingesta, no los datos.

### 4.4 El Wake-on-LAN no despertó al servidor

Prueba real hecha el 24/10: con la máquina apagada a las 14:51 se enviaron **6 paquetes mágicos** a la MAC correcta
y **no despertó en 2 minutos**. Dos causas posibles y no excluyentes:
- **el BIOS no mantiene la tarjeta con corriente al apagarse** (hay que activar «Wake on LAN»/«Wake on LAN from S5»
  y desactivar «ErP»/«Deep sleep» en F2 → Config → Power);
- **la batería estaba al 6 % y sin cargar**, así que puede que no hubiera corriente ni para el adaptador.
**Pendiente de repetir la prueba con la batería al 100 %** (ahora lo está) y con la máquina apagada de forma
ordenada. Si el BIOS no lo trae, la alternativa es un **enchufe inteligente** (la app que David ya usa para
encender el PC) o el despertador del reloj de la placa, que ya funciona.

### 4.5 Nadie se enteró de las caídas: el canal de avisos sigue sin encender

El 24/10 el servidor estuvo parado desde las 15:15 y **no hubo ningún aviso**. Dos fallos sumados:
- **el canal de avisos al móvil nunca se activó** (es la tarea T3 del traspaso y depende de que David diga canal y
  credencial);
- **el vigía no avisa de «el servidor no contesta»**: sus ficheros de `estado/vigia/` se quedaron congelados a las
  14:44 y el script (`scripts/claude/enlace-claude.mjs`, de Claude) **se cuelga en el ssh y su cerrojo no deja
  entrar la pasada siguiente**. Además sólo alerta de cosas de las federaciones, no de la máquina ausente.
  **Apuntar a Claude**: añadir un chequeo «servidor sin datos > 20 min» y un tiempo máximo al ssh.

### 4.6 Desfases de datos conocidos y esperables

- **≈2,9 % de los partidos jugados de CyL no tienen ninguna fila de acta** (5.619 de 328.473 al 24/10): o no las
  publican o no las hemos descubierto.
- **67.443 jornadas sin leer en CyL** (34.533 PC + 33.484 servidor al 24/10) que pueden esconder del orden de
  **50.000-110.000 partidos más** (estimación por temporada; parte son jornadas futuras de 2026-27).
- **Galicia** es el mayor atraso de actas (56.905 al 24/10) y **Andalucía** el mayor del PC (102.318).
- Huecos que **vienen de la federación** y no hay que perseguir: están listados en `COBERTURA-FEDERACIONES.md`
  §2 y §3 con cómo se comprobó cada uno (códigos de jugador de Extremadura/Murcia, cambios y tarjetas que Galicia
  y Extremadura no apuntan, CyL 2016-17/2018-19 sin tarjetas, Euskadi 2019-20 sin cambios, Valencia 2024-25 con
  `"partidos":[]`, jornadas vacías de ligas nacionales en varias federaciones).

### 4.7 Cosas menores pero que cuestan tiempo

- **`scripts/claude/completitud-colas.mjs` no funciona en el PC**: espera `/app` (rutas del servidor). En el PC hay
  que usar `scripts/claude/estado-cyl.mjs <cola> <etiqueta>` o mis consultas de `sqlite` (`node:sqlite`).
- **`node:sqlite` en el contenedor necesita `--experimental-sqlite`**; y en el servidor **no hay node en el host**:
  los guiones se ejecutan dentro de un contenedor (`docker exec -i … sh -c 'cat > /tmp/x.mjs; node …'`).
- **Docker Desktop parado** en el PC (25/10): sin él no hay base de datos ni importación.

---

## 5. Cómo comprobar que las 17 federaciones van bien (rutina)

Cada día, en este orden (todo es de sólo lectura):

1. **¿Están todas las colas pidiendo?** `node scripts/claude/salud-federaciones.mjs` (una línea por federación) y,
   para ver ritmos: `node scripts/claude/intervalos-peticiones.mjs <fed> <fed> …` → **«menores de 4 s» debe ser 0**
   y p90 dentro del ritmo configurado (PNPG 6-8 s, Madrid 5-7 s, Valencia 10-14 s, CyL 6-8 s).
2. **¿Alguna parada con motivo?** Los registros (`descargas-<fed>/recolector-local/worker-programado.log`, y en el
   servidor `/app/descargas-<fed>/…`) dicen «esperando para abrir Chrome: no cabe por reparto» (plazas),
   «Sin trabajo disponible ahora» (nada que hacer, normal) o una pausa respetuosa con su fecha.
3. **¿Se están bajando actas o sólo jornadas?** Con `estado-cyl.mjs` o una consulta a `trabajos` por tipo y estado:
   si una federación sólo mueve `jornada` y tiene miles de `acta` pendientes, está descubriendo y no bajando
   (es lo esperable en temporada, pero conviene saberlo).
4. **Errores de la última hora**: `errores1h` del vigía (`estado/vigia/*.json`) y `errorTop1h`. Los
   `error_navegador` sueltos son normales; una subida fuerte de `sin_datos` o de actas sin alineaciones es señal
   de que la federación cambió la web (mirar con `scripts/claude/crudo-vs-cola.mjs`).
5. **Servidor**: `uptime`, batería y escalón de la guardia (`/var/log/facylf-guardia.log`), memoria disponible,
   disco (`/srv/data`), y **carga**: por encima de 14 hay que bajar el ritmo, no añadir trabajo.

## 6. Cómo comprobar que los datos están bien extraídos

- **Contrastar con el HTML/JSON crudo guardado**, no con la web en vivo: `scripts/claude/crudo-vs-cola.mjs`
  (40 actas por caso) compara lo guardado con lo que hay en la cola. Es la herramienta que zanjó que los huecos de
  las 8 federaciones del servidor son de la fuente, no del lector.
- **Señales de alarma por federación** (comparar con `COBERTURA-FEDERACIONES.md` §2, que tiene los porcentajes
  medidos): si los cambios, las tarjetas o el código de jugador **se hunden de repente** frente a su semana, es
  que cambió la web o el lector. El vigía ya tiene un chequeo de «calidad del acta» para eso.
- **Regla de oro del proyecto**: *desconocido no es cero*. Un `null` y un `0` significan cosas distintas; si una
  consulta no puede saber algo, debe devolver `null`, nunca `0`.
- **Menores**: los nombres de menores no salen del PC. Cualquier informe nuevo con nombres va a `informes/`
  (ignorado por Git), y las pruebas usan nombres inventados («APELLIDO UNO, NOMBRE UNO», «JUGADORA DOS»).

---

## 7. Trampas y errores míos, para que no los repitas

1. **A `pruebas/sql/volumen.mjs` y `rendimiento.mjs` se les pasa SIEMPRE una carpeta de datos explícita.**
   `volumen.mjs` hace `rmSync(argv[2])`: le pasé su propio fichero y lo borró (lo repuse desde
   `tmp/sql-pruebas/`).
2. **En este PC hay Windows PowerShell 5.1**: no existe `ForEach-Object -Parallel`. Para barridos de red se usa
   `[System.Net.NetworkInformation.Ping]` asíncrono.
3. **Por ssh, no metas comillas dobles ni `$()` dentro de la cadena**: PowerShell se las come y el comando llega
   roto («bash: error sintáctico cerca del elemento inesperado»). Si el guion es largo: `scp` de un fichero o
   escribir en `/tmp` con `docker exec -i … sh -c 'cat > /tmp/x.mjs'`. Y **nunca `grep -r` ni `find` sobre
   `/app` o `/srv/data/facylf`** (hay `node_modules`: se queda colgado).
4. **No usar `Select-Object -First N` para revisar listas de las que depende una conclusión** (me hizo decir dos
   veces que algo no existía cuando estaba en la línea 13).
5. **No dar por bueno un «está apagado» con una sola comprobación**: el 24/10 dije que el servidor estaba caído a
   las 21:58 y llevaba **toda la tarde encendido** (había caído en una ventana mala y el vigía estaba mudo).
   Comprobar siempre dos veces y con dos caminos (ping, Tailscale `servidor` = 100.117.58.93, ssh).
6. **`pnpm test` completo tarda ~20 min y compite con los recolectores**: los fallos por tiempo agotado no son
   fallos de datos. Para comprobar algo concreto, correr sólo el fichero.
7. **El servidor no se sobrecarga**: por encima de carga 14, menos de 3 GiB libres o más de 1 GiB de swap, se para
   lo que se esté haciendo. El 25/10 está en **14,6**: al borde.

---

## 8. Lo que decide David (no lo decidas tú)

Están con su valor por defecto en `ENCARGO-DEEPSEEK-2026-10-25.md` para no bloquear el trabajo:
1. **Pasar la cola de CyL del PC al servidor** hacia el 30/10 y subir la pausa de 10-13 s a 6-8 s (una sola máquina
   pidiendo). Por defecto: **sí**.
2. **Publicar (o no) en la web pública los datos de La Preferente** que la federación no tiene, marcados como «dato
   no oficial». Por defecto: **recoger sí, publicar no** hasta que haya permiso; hay un borrador de correo.
3. **Orden de las actas de La Preferente**: Cataluña → Andalucía y Galicia → competiciones nacionales.
4. **Personas huérfanas tras reimportar** Cataluña/Madrid/Valencia: por defecto **sólo se cuentan, no se borran**.
5. **Cargador del servidor** (genuino Lenovo, más potente) y **canal de avisos al móvil** (canal + credencial).
6. **Valencia está recogiendo temporadas antiguas** (iba por 2017-18 y su cola pasó de ~60.000 a ~119.000 trabajos):
   si no es lo que quiere, hay que revisar sus temporadas asignadas.
7. **`git push`**: los commits se subieron el 23/10 con su permiso; cualquier subida nueva con nombres de menores
   requiere su visto bueno.

---

## 9. Qué haría yo en la siguiente sesión, en orden

1. **Arrancar Docker Desktop** y comprobar que la base responde (`pnpm db:estado`).
2. Leer `ENCARGO-DEEPSEEK-2026-10-25.md` y ejecutar su bloque «hoy»: desplegar el código al servidor (corrige los
   0-0 de CyL 2014-15), reimportar CyL 2013-14 y 2014-15, medir (sin corregir) los partidos cuyo resultado no
   cuadra con los goles, y revisar los avisos de **Castilla-La Mancha, Navarra, Valencia y Las Palmas**.
3. **Castilla-La Mancha**: comprobar cuántas federaciones están esperando plaza de Chrome y, con eso, subir plazas
   o proponer el reparto justo a Claude (§4.1).
4. Reaplicar `prioriza-actas.mjs` en las dos máquinas y **pedir a Claude la línea del `order by`** (§4.2).
5. Repetir la **prueba de Wake-on-LAN** con la batería al 100 % (§4.4) y mirar el BIOS si falla.
6. Cuando Cataluña termine de releer 2026-27 (Claude lo comprueba el 27/10): **reimportar Cataluña, Madrid y
   Valencia 2026-27**, y sólo después contar las personas huérfanas (no borrar sin permiso).
7. Mantener la rutina del §5 y **no perseguir** los huecos del §4.6.
