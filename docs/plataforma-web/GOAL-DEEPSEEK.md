# GOAL vigente de DeepSeek — Fase 3 (desde 12/10/2026, tarde)

> Lo da Claude; DeepSeek lo sigue hasta cumplirlo. Memoria: `ESTADO-DEEPSEEK.md` (lee antes la «Revisión de Claude de la Fase 2»). Manual: `TRABAJO-CONTINUO-DEEPSEEK.md`.

GOAL: Cerrar CyL en el PC importando sus temporadas del servidor DESDE SUS PAQUETES (nunca desde la cola parada del PC), dejar cada federación verificada con la regla buena, y en cuanto vuelva el servidor traer paquetes frescos y repetir. Sin parar entre pasos y sin pedir confirmación salvo bloqueo real.

**Regla de verificación:** canónico == paquete − filas imposibles (`mira-lote --avisos`) − filas de descanso (contadas en el paquete). Un «X≠Y» con el origen menor en todo es un **origen equivocado**, no una pérdida.

## Fase 3 — pasos (en orden; al acabar uno, sigue)

1. ✓ (13/10) Desde la **raíz**: `pnpm exec vitest run packages/canonico` → pasa la **prueba 15**. (`pnpm --filter … test` no encuentra pruebas: el `include` de vitest se resuelve desde la raíz. Lo vio DeepSeek.)
2. **CyL, temporadas del servidor, desde su paquete MÁS NUEVO y con la opción**, una a una. (13/10: DeepSeek trajo paquetes frescos `federacion-<temp>.sqlite` de 2020-21, 2022-23, 2016-17, 2026-27, 2018-19 y 2024-25 y los está importando; el script ahora **rechaza** un paquete si hay otro más nuevo de la misma temporada.) Corrección de Claude: el `cyl-<temp>.sqlite` que puse era del 07/10; usar el viejo habría sido el mismo error de origen.
   ```powershell
   $env:FACYLF_APARTAR_ACTAS_DISCORDANTES = '1'
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion castilla-leon -Temporada 2020-21 -Paquete _traspaso\federacion-2020-21.sqlite
   ```
   Tras cada una: `importacion-resumen-castilla-leon-<temp>.json` (actas apartadas, fallidos), `canonico-por-federacion.mjs castilla-leon` y la regla de arriba. Esperado: 2020-21 recupera los ~405 de Salamanca; 2016-17 y 2026-27, lo suyo.
3. **Ceuta: márcala HECHA** (2017-18 cuadra con los 36 descansos; ver la revisión). Revisa con la misma regla cualquier otra temporada de Ceuta que no cuadrara.
4. **Palencia** (`vercompeti.php?tipc=0`): deja en `TAREA-LARGA` §6 la ficha completa para Claude (URL de cada nivel, qué trae cada página, ejemplo guardado con `guarda-pagina.mjs`). El lector lo escribe Claude.
5. **Cada 2 h, ronda de salud** (y anota si el servidor responde).
6. **En cuanto el servidor responda**: Fase 1 paso 3 (CyL primero: 2014-15 y 2012-13, y paquetes **nuevos** de sus otras temporadas), con `MemoryCurrent` antes y después; cada paquete se importa con `-Paquete` y la opción del paso 2.
7. Sin servidor y con todo lo anterior hecho: T-13 (revisitas con fecha) y repasar con la regla buena las federaciones ya importadas (canarias, melilla, rioja, andalucia), anotando sólo lo que no cuadre.

**No hacer**: importar sin `-Paquete` nada que no sea del PC (el script ya lo rechaza; no uses `-ColaViva`); pruebas a Valencia; reabrir las actas de Madrid; borrar nada de `_traspaso` ni de F:.

## Fase 2 (12/10, mañana) — hecha salvo el servidor; pasos de referencia

1. **Prueba del importador antes de usar la opción nueva**: `pnpm --filter @facylf/canonico test`. Si algo falla, pega la salida en ESTADO para Claude y **no** sigas con el paso 2 (sí con los demás).
2. **CyL sin huecos — Salamanca** (sólo PC, temporadas del PC): con `$env:FACYLF_APARTAR_ACTAS_DISCORDANTES='1'` en la misma consola, reimporta con `importar-temporada.ps1` **2020-21** y **2024-25**, y después **2016-17**, **2026-27** y **2018-19**. Tras cada una: `canonico-por-federacion.mjs castilla-leon` contra el paquete y `node scripts\claude\mira-lote.mjs --avisos castilla-leon` (cuántas `acta_apartada_por_no_cuadrar`). Esperado: canónico == cola − imposibles − descansos, y las actas apartadas listadas con sus dos parejas. Pega en ESTADO la tabla antes/después.
3. **Ceuta 2017-18 (−36)**: reimpórtala sola; si sigue faltando, `mira-lote.mjs --grupo <grupo>` de los grupos del fichero de fallos y anótalo para Claude.
4. **Madrid**: dentro de las 3 h siguientes, comprueba en `descargas-madrid\recolector-local\worker-programado.log` que no hay pausa nueva por `api/standings` y mide su ritmo (`ritmo-peticiones`/`cuenta-paquete --ritmo 60`). Esperado: muy por encima de 10/h mientras tenga vencidos. Si vuelve a pausarse, pega la línea exacta.
5. **T-12 de verdad** (método por zona de `TAREA-LARGA-FUTBOL-AFICIONADO.md` §2, pasos 2-4), empezando por los huecos ya anotados: **Palencia, Soria, Teruel, Girona, Gipuzkoa, Granada, Huelva, Jaén**; luego el resto de provincias de cada zona.
   - Paso 2: huella de plataformas con la provincia/ciudad (`"mygol.es"`, `"serversports"`/`"mod/soccer"`, `"playooz"`, `"apuntamelo.com"`, `"totalfutbol.es/ges"`, myTorneo por provincia).
   - Paso 3: webs propias (veteranos, empresas, F7/F11 locales, fútbol sala aficionado).
   - Cada liga encontrada: `busca-plataforma.mjs` (una petición) → si la plataforma tiene adaptador, `sembrar`; si es nueva o carga por JavaScript, estúdiala con REA (§3.2: `inspect_web_page`, `inspect_web_network_capture`, `analyze_web_bundle`) y deja la ficha para Claude; si es federada, descártala; si es PDF municipal, anótala.
   - Una zona sólo pasa a **HECHA** con la lista de búsquedas hechas (consulta → qué salió) y cada candidato clasificado. «Si existe, estará en una plataforma vetada» no vale como resultado.
6. **Cada 2 h, ronda de salud** como en la Fase 1 (y anota si el servidor responde).
7. **En cuanto el servidor responda**: deja lo que estés haciendo y ejecuta la **Fase 1 paso 3** (CyL primero), con `systemctl show facylf.slice -p MemoryCurrent` antes y después de cada traída.

**No hacer** en esta fase: más peticiones de prueba a Valencia (T-06 es decisión de David); reabrir las 1.062 actas de Madrid; borrar nada de `_traspaso` ni de F: (F: al 10 %: lo decide David).

## Fase 1 (11/10) — estado

Hechos 1, 2, 4; paso 5 sólo el inventario (ver Fase 2 paso 5); paso 3 y T-05/T-07/T-09/T-10 esperan al servidor. Detalle en ESTADO.

## Criterio de "HECHA" (único válido)

Una federación está HECHA cuando `node scripts/claude/canonico-por-federacion.mjs <fed>` muestra en el canónico del PC todas las temporadas que existen en su origen (desde 2010-11 o la primera que publique hasta 2026-27) y, temporada a temporada, **canónico == cola − filas imposibles − filas de descanso** (las imposibles salen con `mira-lote.mjs --avisos <fed>`). El «con resultado» bajo **no** es un fallo de importación: mide la fuente (lo demostró DeepSeek el 12/10). Si falta una sola temporada, NO está hecha: anota cuáles faltan.

## Fase 1 — pasos originales (referencia)

1. **Ceuta**: espera a que termine la importación en curso; verifica con `canonico-por-federacion.mjs ceuta`. Anota en ESTADO.
2. **Canarias grupo 903639327** (ELIMINATORIA 2026-27): repite `pnpm importar --federacion canarias --temporada 2026-27 --grupo 903639327` y copia en ESTADO la última línea de error real (salida completa en `pruebas\reconstruccion\salidas\`). No arregles código: es de Claude.
3. **Federaciones del servidor**, de una en una, de pequeña a grande: rioja, euskadi, navarra, cantabria, asturias, extremadura, murcia, castilla-la-mancha.
   `powershell -File scripts\claude\trae-federacion-servidor.ps1 -Federacion <fed> -Todas`
   Tras cada una: `canonico-por-federacion.mjs <fed>` y fila en ESTADO (temporadas presentes / faltantes / partidos). Las de más de ~200 MB, de noche. Galicia y Aragón también salen del servidor, solo de noche.
4. **De noche** (PC encendido; si está suspendido, sáltalo y sigue con el paso 5), de una en una, desde la cola PROPIA del PC con `importar-temporada.ps1` SIN `-Paquete`: andalucia, madrid, cataluna, valencia y las temporadas de CyL asignadas al PC. NUNCA del servidor (copia obsoleta; el script ya lo rechaza). Verifica cada una.
5. **T-12 zona 1** (CyL) con el método de `TAREA-LARGA-FUTBOL-AFICIONADO.md` §3: inventario → huella de plataformas (Burgos, Palencia, Soria, Ávila, Segovia, Zamora, Salamanca) → webs propias → comprobar que NO es federado (siguetuliga con ligas FCyL = federado, descartar). Webs con datos por JavaScript: laboratorio REA (`F:\EspacioCodigo\ProyectoServidor\rea-sandbox`, leer `estudiar-apps/OPERAR.md`) con `inspect_web_page`, `capture_browser_scenario`, `inspect_web_network_capture`, `analyze_web_bundle`. Cada candidato = fila en §6 de TAREA-LARGA (URL, plataforma, nº ligas/equipos, cómo carga datos, apto para adaptador) y nota en F-01 de `estudiar-apps/PENDIENTES.md`. El adaptador lo escribe Claude.
6. **Cada 2 h, ronda de salud**: `estado-colas.mjs`, `ritmo-peticiones.mjs` (medir con la tabla `peticiones`, no con `actualizado_en`), contenedores del servidor, carril en curso avanzando tras las 21:00 UTC los días de jornada. Lunes: rutina semanal.
7. Con todo lo anterior hecho o bloqueado: cola de fondo T-05 (bizkaia primero), T-06, T-07, T-08, T-09, T-10, T-11, T-13.

## Bloqueos

Si algo falla dos veces igual: anótalo en ESTADO (orden exacta, error exacto, hipótesis) y pasa al siguiente paso. No esperes.

## Informe

Uno solo al final del día, en ESTADO y en el chat: tabla por federación (temporadas en canónico / faltantes / HECHA sí-no), zona 1 (candidatos), bloqueos para Claude, decisiones para David. No digas "HECHA" sin la salida de `canonico-por-federacion.mjs` que lo pruebe.

## Límites (no negociables)

- **EL SERVIDOR NO SE SOBRECARGA NI SE LE AGOTA LA RAM** (regla de David, 13/10/2026). Se cayó el 11/10 y el 13/10 por traer federaciones encadenadas con la flota ya al tope.
  - Una sola traída a la vez, de pocas temporadas en pocas (`trae-federacion-servidor.ps1` trae como mucho 4 por pasada), mejor de noche.
  - Antes y después de cada temporada se mide el servidor. El script lo hace solo y **espera o se para** si la memoria disponible baja de 3 GiB, la swap pasa de 1 GiB o la carga pasa de 14.
  - Nada de extracciones en paralelo, ni de `docker cp` o copias grandes en `/tmp` del servidor.
  - Si el servidor va justo, la recolección de las 19 federaciones va primero: lo nuestro espera.
- No tocar la configuración del PC de David (energía, suspensión, servicios, tareas programadas). Solo el servidor está siempre encendido.
- No mover federaciones entre máquinas ni cambiar temporadas asignadas.
- No bajar topes de memoria ni cambiar compose/.env sin que lo pida Claude.
- Scraping respetuoso: cliente identificado, 1 petición cada 5–8 s por sitio, paralelo solo entre dominios distintos, sin falsear Googlebot, sin proxies, sin saltarse bloqueos, captchas ni negativas de robots.
- Nunca DNI, correos, teléfonos ni fechas de nacimiento. Nombres de menores nunca se publican.
- No descompilar ni desensamblar apps de federaciones o plataformas (REA solo con sus herramientas web sobre páginas públicas).
- No tocar migraciones aplicadas. No hacer commits.
- No escribir ni corregir código de recolectores, lectores o importadores: anota el fallo para Claude y sigue.
- Peticiones del enlace: solo lectura. Lo que cambia cosas lo lanza David a mano.
