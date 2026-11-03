# ESTADO de DeepSeek — memoria entre sesiones

> Lo primero que se lee al llegar (manual: `TRABAJO-CONTINUO-DEEPSEEK.md`). Se actualiza al empezar, al terminar y al bloquearse. Lo que no está aquí no ha pasado.

**Última actualización:** 02/11/2026 (DeepSeek: 38.º intento, dispatch `ctx_9823de25d72f`, task `task_c20167f3fcbe`,
Run `run_517457d35a0e`; árbol `d822fb00…`, perfil `e91457fd…`). **Ejecutadas las 7 puertas registradas** sobre el
árbol exacto: **5 verdes** (`2f523b707a76` lint, `6340c694e42c` build, `4013b847119b` SQL/PGlite, `51df9d75a0f5`
listado, `593e89fd5bdf` explain) y **2 rojas por entorno** (`1824e75dbd39` `TimeoutError` a 300,97 s por
`timeout_seconds=300` del `ci_contract`; `4532c4868add` code 1 en 567 s, 539/4/41, `failure_classes:[timeout]`,
`database_codes:[]`). Decisión `msg_2928d7a2003a`: no tocar SQL/`catalogo.ts`/`conexion.ts`; bloquear como entorno y
escalar al owner (`msg_6492d2022b5c`). `all_registered_gates_verified: false`; `production_authorized: false`;
60/633/359 **no** se acreditan; sin commit ni push. Ver 38.º intento.

## ★★★★★ DeepSeek, 02/11 (37.º intento, dispatch `ctx_e15a00d13feb`, task `task_7c6fa02d9209`) — tres recibos nuevos: el conjunto de rojos **rota entre ejecuciones**, que es lo que se espera de un límite de tiempo y no de un defecto de dato

- **Árbol y perfil:** `8c9d6d2be686a4cc8e2d1ad06708ca1ee6a185609d7cac722f58d92627877663` (igual al de las tres
  puertas de esta ronda; `subject_changed_after_gates: false`), HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`,
  perfil `e91457fd…`. Sin ediciones de producto en esta ronda: `catalogo.ts` sigue con el parche del 35.º intento.
- **`1824e75dbd39` (planes) → NO EJECUTABLE:** `validar` devuelve `ok:false`, `TimeoutError`, 301,6 s, `interrupted`,
  `code: null`, evidencia `d87953ecd16cad6fd7d4ff0ef3c4045ed1382f4d0118b69234511982dd00477e`. No es un fallo del
  producto: el `timeout_seconds` del contrato (300 s) es menor que la duración del propio suite, que otros árboles
  ya midieron en 342-372 s. Nada en fuentes puede acortarlo: `scripts/planes.mjs` sólo compara con los JSON
  versionados y el tope vive en `ci_contract`.
- **`51df9d75a0f5` (listado, diagnóstico) → verde:** `ok:true`, `code 0`, 32,1 s, evidencia
  `5662a691ff4f5937501d251c0aa283c08bd5524e9af2a89d1ae6f8aa2225af6e`. Es `_probar-listado.mjs`, que mide con
  `explain (analyze)` y presupuesto ampliado de 120 s; **no** reproduce la ruta que falla (usa
  `PARAMETROS_CATALOGO`, sin término de búsqueda) y el saneado devuelve `public_numeric_explain: []`, así que de
  aquí no sale ninguna cifra utilizable. Verde de diagnóstico, no acredita el listado real.
- **`4532c4868add` (pnpm test) → ROJO por entorno:** `code 1`, 578,1 s, evidencia
  `3582704ed2fc15150aed523c225461cbbd590ebe8dbde1250f62cd9adefefd75`; `counts`: `tests_passed: 541`,
  `tests_failed: 2`, `tests_skipped: 41` (=584), `test_files_passed: 44`, `test_files_failed: 5`,
  `failure_classes: ["timeout"]`, `database_codes: []`, `real_data_log_local_only: true`. Los dos rojos con nombre
  son «los filtros de vocabulario y el texto de búsqueda acotan de verdad» (`consultas.test.ts:402`) y «importa un
  grupo SIN ningún código…» (`inscripcion-sin-codigo.test.ts:551`); además fallan a nivel de fichero (sin test
  contado, traza en la línea 1) `lote.test.ts`, `retirada.test.ts` y `herramienta.test.ts`.
- **Dato nuevo y decisivo: el conjunto de rojos NO es estable.** Mismo `task`, mismos gates, misma máquina, tres
  ejecuciones sobre dos árboles:
  | ejecución | árbol | duración | ficheros rojos | tests rojos | cuáles |
  |---|---|---|---|---|---|
  | 34.º | `c7964fe8…` | 477,5 s | 4 | 2 | `:332` (listado) y `:453` (recuentos) |
  | 36.º | `35ebf670…` | 596,4 s | 5 | 5 | `:402` + 3 más de `consultas` + `inscripcion` |
  | 37.º | `8c9d6d2b…` | 578,1 s | 5 | 2 | `:402` + `inscripcion` |
  Si el defecto fuese determinista, el mismo test fallaría siempre; aquí `:332` pasa en 37.º y falla en 34.º, y
  `:453` falla en 34.º y 36.º y pasa en 37.º. Eso encaja con **consultas pesadas que oscilan alrededor de su
  presupuesto** en un anfitrión cargado, no con una consulta rota ni con un dato malo. Cero fallos de aserción y
  cero errores de dato en las tres ejecuciones.
- **Por qué no hay parche en fuentes esta ronda (y no es dejadez):** el predicado que falla,
  `core.normaliza_nombre(e.nombre_publicado || ' ' || g.nombre || ' ' || s.etiqueta) like '%…%'`, se calcula **por
  fila y sobre tres tablas**, así que no se puede indexar tal cual; y `core.normaliza_nombre` (0006) no tiene
  columna almacenada en `core.phase_group` ni en `core.competition_edition` (sólo la tienen `core.club`,
  `core.venue` y `core.persona`, comprobado en `infra/migraciones`). Las únicas salidas son (a) migración nueva que
  desnormalice el texto buscable con disparadores y luego reescriba el `like`, o (b) cambiar el contrato de tiempo
  del listado. Las dos son decisiones de alcance, no reparaciones locales, y la decisión vigente del coordinador
  (`msg_b5f8907983d3`) prohíbe cambios de producto a ciegas sin poder medir. Sin forma de medir (`validar` es la
  única herramienta y sanea las cifras), aplicar (a) sería adivinar.
- **Puertas:** `green_gate_ids: []` sobre `8c9d6d2b…`; `all_registered_gates_verified: false`;
  `production_authorized: false`. **60 (planes), 633 (test) y 359 (SQL) no se acreditan.** Los 584 recuentos del
  test siguen sin cuadrar con los 633 declarados en todos los intentos.
- **Sin tocar:** `conexion.ts`, `catalogo.ts`, aserciones, umbrales, presupuestos, migraciones, `.env`, Docker,
  datos ni recolectores. Sin commit, push, merge ni despliegue. Único fichero modificado en la ronda: este estado.
- **Lo que hace falta del owner del CI (concreto, no «revisad»):** (1) subir el tope de `1824e75dbd39` por encima
  del suite (los 342-372 s verdes de otros árboles lo justifican) o permitir editar `scripts/planes.mjs`;
  (2) exponer en el recibo de `4532c4868add` la duración de cada test y el `code` de PostgreSQL cuando la consulta
  muere por presupuesto —con eso se distingue «5 s agotados» de «`pool.connect()` colgado» sin adivinar—;
  (3) `ANALYZE` tras restaurar la copia, si el sandbox usa un volcado, porque un `pg_dump` restaurado no trae
  estadísticas y eso solo afecta a las consultas de 50 268 filas.



## ★★★★★ DeepSeek, 02/11 (36.º intento, dispatch `ctx_bb38efdd075d`, task `task_7c6fa02d9209`) — la puerta roja reproducida y descartada como cuelgue del entorno, no como dato

- **Árbol y perfil:** `35ebf670416b3894d1a2edbb5e7e3108b11cbb4ee29c84e97804517c6f60eec9`, HEAD
  `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, perfil `e91457fd…`. Sobre este árbol no
  queda ningún verde: las puertas verdes de `candidate_coverage` son de otros árboles o diagnósticos, no de `test`.
- **Reproducción (evidencia `4ce430da881f7dce367e22c95ac4173faee36d953fe091fc7d0e3b95c6c68502`):**
  `validar facylf 4532c4868add` → `ok=false`, 596,44 s, `status: gates_completed`, gate «pnpm test · 633
  comprobaciones (contratos contra PostgreSQL real)», `code: 1`, `failure_classes: ["timeout"]`,
  `database_codes: []`, `real_data_log_local_only: true`, 5 archivos rojos / 44 verdes, 5 tests rojos / 538 verdes /
  41 saltados. Ningún fallo es de aserción ni de dato.
- **Fallos:** «la cobertura por federación promete sus columnas y reparte todos los grupos sin perder ninguno», «los
  filtros de vocabulario y el texto de búsqueda acotan de verdad», «las federaciones salen todas las declaradas, sin
  duplicados y con sus invariantes», «los recuentos de la portada traen una sola fila, sus columnas y ninguna suma
  inventada» (este en `apps/web/test/consultas.test.ts`, con trazas en `conexion.ts:132` y `:402`) e «importa un grupo
  SIN ningún código: cada equipo tiene inscripción y código_externo nulo»; además fallan a nivel de archivo
  `lote.test.ts`, `retirada.test.ts` y `herramienta.test.ts`, sin test contado.
- **Hipótesis descartadas por lectura del código, sin ejecutar nada más:** (1) el `testTimeout` es 30 000 ms, no 5 s,
  y `hookTimeout` 90 000 ms (`vitest.config.ts:55` y `:61`); (2) `fileParallelism: false` (línea 75), así que no hay
  contención entre 44 ficheros; (3) los cinco rojos pertenecen a **dos pools distintos**: la web (`conexion.ts:55`)
  con `statement_timeout: 5000` y el importador (`packages/canonico/src/destino/pool.ts:54`) con
  `statement_timeout: false`; (4) con presupuesto en vigor, una consulta lenta habría dado `57014` (y
  `database_codes` lo tendría) o un `CanonicoNoDisponible` inmediato, no 30 s. Por tanto el síntoma encaja con una
  promesa que **nunca se resuelve** —`pool.connect()` sin `connectionTimeoutMillis`, o un bloqueo del PostgreSQL del
  sandbox— y **no** con `catalogo.ts`.
- **Decisión del coordinador (`msg_b5f8907983d3`):** opción A — cerrar como bloqueo de entorno con informe honesto y
  sin declarar verdes. **No** autoriza tocar `conexion.ts` para añadir `connectionTimeoutMillis` (sería un cambio de
  producto a ciegas que puede enmascarar el síntoma y obligaría a repetir cinco puertas) ni registrar una puerta
  diagnóstica con los ficheros de prueba: `registrar_puerta` solo admite guiones públicos `pruebas/ci/_probar-*.mjs`
  ya existentes, y **no** hay ninguno que ejecute el subconjunto de `consultas.test.ts` /
  `inscripcion-sin-codigo.test.ts`. Se deja escalado al owner del harness con la reproducción exacta.
- **Sin cambios de producto en esta ronda.** No se editó `catalogo.ts`, ni aserciones, ni umbrales, ni presupuestos,
  ni `conexion.ts`, ni migraciones, ni `.env`, ni Docker, ni datos, ni recolectores. Sin commit, push, merge ni
  despliegue. El parche de `LISTADO_DE_GRUPOS`/`RECUENTOS_DEL_CANONICO` del 35.º intento sigue **sin verificar**.
- **Para el coordinador / owner del CI:** `1824e75dbd39` (planes) sigue **no ejecutable** por su tope de 300 s;
  `4532c4868add` rojo por entorno. Reproducción: perfil `e91457fd…`, árbol `35ebf670…`, evidencia `4ce430da88…`; hace
  falta que el harness exponga la causa del cuelgue (si es `connect()`, un lock o el PostgreSQL del sandbox) para
  poder arreglarla sin adivinar.

## ★★★★★ DeepSeek, 02/11 (35.º intento, dispatch `ctx_ecd186e1cae1`, task `task_7c6fa02d9209`) — reparación de las dos consultas pesadas aplicada y verificada solo por lectura; el arnés ya no emite recibo

- **Árbol:** `dd373f16e0d23e3a92ec8bf9597172b6f9b7ec3af16191663cd25a01059ac192`, HEAD
  `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, perfil `7b1c8734…`. **Ninguna puerta se
  ejecutó sobre este árbol**; el cambio de producto está **sin verificar**.
- **Bloqueo de arnés (escalado, no repetido).** `validar facylf 4532c4868add` y
  `diagnosticar facylf pruebas/ci/_probar-explain.mjs` devuelven, literalmente,
  `Herramienta local sin recibo; no repetir una acción incierta` — el mismo síntoma de `ci_owner_exited` que ya se
  escaló en `msg_8aad3238dc7d`. Se registró la escalada de arnés `msg_cc3d3a87d488` con reproducción exacta y el
  coordinador respondió (`msg_a395b5cb9be2`) que **no** se repita ninguna de las dos hasta que el owner del CI
  devuelva recibo o reconciliación. No es un fallo de pruebas y no se trata como tal.
- **Cambio aplicado en `LISTADO_DE_GRUPOS`** (causa medida: 6 786,7 ms frente a 1 000 ms declarados; `WindowAgg`
  5 562,4 ms sobre 50 268 filas y agregado global de `core.team_entry` ≈2 s para devolver 80 renglones): CTE `filtrados
  as materialized` con solo `g.id` y las cinco claves de orden; `total` con `count(*)::int` normal, **sin ventana**;
  `pagina as materialized` con `order by … limit $12 offset $13`; las columnas anchas y el `left join` de inscripciones
  se resuelven después, y las inscripciones se agregan **solo** para los ids de la página.
- **Verificación estática del listado, contra el diff de `HEAD`:** las **24 columnas** y su orden son idénticas
  (`federacion`, `federacion_nombre`, `temporada`, `edicion_codigo`, `edicion`, `ambito`, `modalidad`, `genero`,
  `categoria`, `provincia`, `grupo_codigo`, `grupo`, `grupo_tipo`, `jornadas_previstas`, `inscripciones`,
  `partidos_conocidos`, `partidos_con_resultado`, `actas_disponibles`, `actas_parseadas`,
  `complete_through_matchday`, `visibility_state`, `calculado_en`, `total`); la clave de orden y su sentido son las
  mismas (`f.codigo`, `s.orden desc`, `e.nombre_publicado`, `g.orden`, `g.codigo_externo`); `total` sigue siendo
  **cuántos grupos pasan los filtros**, no cuántos se devuelven, y sigue siendo `::int`; los filtros `$1..$11`,
  `$12`/`$13` y `${SQL_FEDERACION_NO_EXCLUIDA}` se conservan, y el fichero no tiene acentos graves ni `${` nuevos
  dentro de la plantilla.
- **Cambio aplicado en `RECUENTOS_DEL_CANONICO`:** `edicion_visible` y `grupo_visible` pasan a `as materialized`; las
  nueve subconsultas escalares que repetían el mismo join contra `ops.coverage_checkpoint` se sustituyen por una CTE
  `cobertura` con **un solo** agregado. `jornadas_publicadas` sigue siendo su propio recuento contra `core.matchday`.
- **Semántica de nulos: comprobada contra el original, y NO es la que advertías.** El original **no** usaba
  `count(subcolumna)` en ningún sitio: `grupos_medidos` era `count(*)` sobre el join interno, `grupos_completos` era
  `count(*) … where c.visibility_state = 'completa'`, las nueve restantes eran `sum(c.…)` y `calculado_en` era
  `max(c.calculado_en)`. El equivalente exacto es, por tanto, `count(*) filter (where c.visibility_state = 'completa')`
  —que es lo que hay escrito, **sin** `is not null` y sin `count(subcol)`— y `sum(…)`/`max(…)`, que sobre cero filas
  siguen dando `null`; los recuentos siguen dando `0`. No hacía falta la corrección que planteabas y no se ha
  introducido un cambio de semántica.
- **Puertas registradas en esta ronda (registro, no evidencia):** `593e89fd5bdf` → `pruebas/ci/_probar-explain.mjs` y
  `51df9d75a0f5` → `pruebas/ci/_probar-listado.mjs`. Ambas devolvieron `registered_only: true`,
  `tests_executed: false`; **no se ejecutaron** y no acreditan nada.
- **Puertas:** `green_gate_ids: []` sobre `dd373f16`, `all_registered_gates_verified: false`,
  `production_authorized: false`. **60 (planes), 633 (test) y 359 (SQL) no se acreditan**, y el cambio **no** se
  declara verificado. `1824e75dbd39` sigue **NO EJECUTABLE** por su tope de 300 s en el `ci_contract`.
- **Sin tocar:** aserciones, umbrales, presupuestos, `conexion.ts`, migraciones, `.env`, Docker, datos ni
  recolectores. Sin commit, push, merge ni despliegue.
- **Para el coordinador:** (1) restaurar el turno CI y ejecutar **primero** `validar 4532c4868add` sobre `dd373f16` y
  después `1824e75dbd39`, más las dos puertas nuevas (`593e89fd5bdf`, `51df9d75a0f5`) si se quieren como regresión;
  (2) si el turno no vuelve, el cambio queda como entrega **no verificada** y no debe integrarse a ciegas.


## ★★★★★ DeepSeek, 01/11 (34.º intento, dispatch `ctx_639bdaadfff5`, task `task_7c6fa02d9209`) — decisión del coordinador: no se toca `conexion.ts`; `test` baja a 2 rojos y la vía de medición queda escalada

- **Árbol:** `c7964fe8a86ecec584e526b7db23a64d254dae120c117b3216275cb57e49a927`, HEAD
  `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, perfil `7b1c8734…`. **Sin cambio de
  producto**: `apps/web/src/consultas/adaptadores/postgres/conexion.ts` queda exactamente como estaba, y tampoco se
  tocan SQL, aserciones, umbrales, migraciones, `.env`, Docker, datos ni recolectores.
- **Consulta al coordinador (resuelta, no timeout).** Se le llevó la contradicción con evidencia: las dos pruebas rojas
  (`consultas.test.ts:332` y `:453`) llaman a `consulta()` **sin** tercer argumento, así que el presupuesto 0 significa
  ruta del pool (5 000 ms) y ningún cambio de límite las afecta; y aplicar el presupuesto también por debajo de 5 000 ms
  obligaría a abrir conexión propia (begin + `set local` + consulta + commit) en la ruta caliente, donde el catálogo
  declara 50, 60, 80 y 100 ms (`federaciones.ts:23`, `estado-secciones`/`equipo`, `admin.ts`). **Respuesta:** opción **B**
  — no tocar `conexion.ts`; la semántica documentada en `conexion.ts:102-104` (`presupuestoMs` sólo AMPLÍA) se conserva.
- **`4532c4868add` pnpm test (esperado 633) → ROJO** sobre este árbol, `code 1`, **477,46 s**, evidencia
  `57b0101bec54866f057e9beee003e8db1a7eb96645782cc1dabb34e76f9dfb08`. `counts`: **`tests_passed: 541`,
  `tests_failed: 2`, `tests_skipped: 41`** (=584), `test_files_passed: 45`, `test_files_failed: 4`,
  `failure_classes: ["timeout"]`, `database_codes: []`. Los dos rojos son el listado del catálogo (columnas y un
  renglón por grupo, `:332`) y los recuentos de portada (`:453`); es decir, siguen cayendo **sólo** las dos consultas
  pesadas, dependientes de `LISTADO_DE_GRUPOS` (1 000 ms declarados) y `RECUENTOS_DEL_CANONICO` (1 500 ms).
- **Dato que no cuadra y no se disimula:** `test_files_failed: 4` con `tests_failed: 2`. La evidencia incluye
  `packages/canonico/test/lote.test.ts:1`, `packages/canonico/test/retirada.test.ts:1` y
  `packages/ingesta/test/reconstruccion-cola/herramienta.test.ts:6` en `public_source_locations`, pero no da el fallo
  de esos ficheros. No se atribuye causa: se deja anotado como pendiente de la misma medición.
- **Comparación honesta con el 33.er intento:** mismo árbol de producto y mismo perfil, de **6 fallos a 2** (antes
  caían también las invariantes de cobertura del listado, los filtros de federación y `conDatos`, los de vocabulario y
  búsqueda, y la paginación). El recuento 584 no se mueve, así que **633 sigue sin acreditarse**.
- **`1824e75dbd39` planes (esperado 60) → NO EJECUTABLE, NO se reintenta.** Tope de 300 s en el `ci_contract` del
  perfil (sólo lectura; `registrar_puerta` no edita topes), `TimeoutError` ya reproducido varias veces. **60 no se
  acredita y no se declara verde.**
- **Escalada de medición (registrada con reproducción exacta, como pediste).** `equipo-local diagnosticar` exige un
  guion público `pruebas/ci/_probar-*.mjs` existente; **no hay ninguno** (glob sin coincidencias en `pruebas/ci/`, que
  sólo contiene `_preparar-ci-explain.mjs`), y escribir uno devuelve
  `'Ruta fuera de las fuentes publicas o memoria autorizadas'`. El artefacto existente `_preparar-ci-explain.mjs`
  **no encaja** en el patrón `_probar-*.mjs` que exige el diagnóstico, y `registrar-preparacion` está denegado al
  trabajador. Consecuencia: **no hay vía para medir `EXPLAIN (ANALYZE)` ni las estadísticas de `facylf-ci-pg`**, y tanto
  el rojo de `test` como el tope de `planes` quedan bloqueados por capacidad del arnés, no por el producto.
- **Hallazgo de producto, separado y NO reparado a ciegas:** las dos consultas pesadas del catálogo declaran 1 000 y
  1 500 ms y en la copia de CI pasan de 5 s. Eso es una **incidencia de producto pendiente de decisión de alcance**
  (¿índices, `ANALYZE`, o presupuesto/`statement_timeout`?), no algo que se arregle en esta tarea sin medir. Repararla
  a ojo habría sido cambiar la puerta, no el producto.
- **Los tres JSON sin seguimiento de `pruebas/planes/`:** `admin-auditoria`, `admin-cuentas-resumen` y
  `admin-invitaciones`. Comprobado: los tres son nombres reales de `CONSULTAS_ADMIN` (`admin.ts:71`, `:113`, `:136`) y
  `scripts/planes.mjs:59-60` importa ese arreglo, así que **el runner sí los recorre**: son esperados. **No se
  versionan** en esta tarea y **no se acredita cobertura** de sus planes (la puerta de planes no terminó).
- **Puertas:** `green_gate_ids: []` sobre este árbol exacto (sólo se ejecutó `test`, que sale rojo), `pending_gate_ids`
  las cinco, `required_count: 5`, `all_registered_gates_verified: false`, `production_authorized: false`.
- **Para el coordinador:** (1) habilitar la medición (`_probar-*.mjs` público registrado como puerta, o permitir
  `_preparar-ci-explain.mjs`); (2) decidir alcance de las dos consultas pesadas; (3) subir el tope de `planes` por
  encima de 300 s o declarar la puerta no ejecutable en el contrato. Sin (1) o (3), cualquier repetición de esta tarea
  dará el mismo informe.

## ★★★★★ DeepSeek, 01/11 (33.er intento, dispatch `ctx_7e77e38e59d8`, reintento de `ctx_b17c40d66db6`) — el entorno cambió y `test` empeoró: 6 fallos por tiempo, `planes` sigue sin pasar de 300 s

- **Árbol:** `8c5345943c3730e829a8bdec19db4cc173a3c6618b8e6a5d0f6168afe5cc813b`, HEAD
  `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, task `task_72f5c3ea0a70`, perfil de
  ejecución `7b1c8734…` en las cinco puertas (esta vez sin cambio a mitad de serie). `subject_changed_after_gates:
  false` en todas: ninguna puerta modificó el árbol. Notas congeladas antes de la validación agregada.
- **`2f523b707a76` lint → VERDE**, `code 0`, 5,77 s, evidencia
  `1de0b6d5806af4e1cdb844ae7b9d09f23100547026913e6ba44413cfecbbc97e`.
- **`6340c694e42c` build web → VERDE**, `code 0`, 65,46 s, evidencia
  `e4a5849eb480fd89af1d625cc97209a4a62b59a6f813aa77bb78946d9b3a00ea`.
- **`4013b847119b` SQL en PGlite (esperado 359) → VERDE**, `code 0`, 371,67 s, evidencia
  `3b02ad3e2afbd93f6acba4afa2f66972eaaa0ec9eaa7769f14b6b8dce246bb60`. La evidencia viene saneada
  (`counts: {}`): verde sin cifra interna; **359 no se acredita numéricamente** y no se inventa.
- **`4532c4868add` pnpm test (esperado 633) → ROJO**, `code 1`, 515 s, evidencia
  `c8b6b0763f2a8aa7413d48cfb61ce16a4331539f9d428a7e452dddff89c8a6a4`. `counts`: **`tests_passed: 537`,
  `tests_failed: 6`, `tests_skipped: 41`** (=584), `test_files_passed: 45`, `test_files_failed: 4`,
  `failure_classes: ["timeout"]`, `database_codes: []`. La puerta ya respeta el tope de 30 min (515 s frente a los
  480 s del intento 32), pero **frente a los 3 fallos del intento 32 ahora fallan 6**, todos en
  `apps/web/test/consultas.test.ts` (l. ~331, 348, 375, 391, 410, 452): listado con columnas y un renglón por grupo,
  invariantes de cobertura del listado, filtros de federación y `conDatos`, filtros de vocabulario y búsqueda,
  paginación sin repetir ni perder filas, y recuentos de portada. **Los cinco del listado dependen de
  `LISTADO_DE_GRUPOS` y el sexto de `RECUENTOS_DEL_CANONICO`.** La evidencia está saneada y el mensaje literal no es
  legible desde aquí (`equipo-local evidencia` con `offset 2298` devuelve `output: ""`), así que la causa se lee por
  clase (`timeout`), no por texto.
- **`1824e75dbd39` planes (esperado 60) → ROJO por TIMEOUT**, `code null`, 300,757 s (`interrupted: true`,
  `error_type: "TimeoutError"`), `counts: {}`: **sin recuento, 60 no acreditado**. No se conserva el id de evidencia
  de esta pasada en mi registro, así que no se cita.
- **Diagnóstico (no verificado, sin mensaje real):** los dos rojos comparten forma de «lento». Las pruebas del
  catálogo llaman a `consulta()` sin `presupuestoMs`, con lo que heredan el `statement_timeout` por defecto de 5 s
  del adaptador (`apps/web/src/consultas/adaptadores/postgres/conexion.ts`), mientras que la consulta declara
  1 000 ms de presupuesto; `LISTADO_DE_GRUPOS` ya agrega `core.team_entry` una sola vez y no recurre a tablas de
  hechos, y `RECUENTOS_DEL_CANONICO` suma sobre `ops.coverage_checkpoint` y `core.matchday`. Si con los datos
  reales del CI esas dos pasan de 5 s, el rojo es de **volumen/entorno**, no de forma del SQL; sería un fallo del
  producto sólo si el plan estuviera mal, y eso no se puede afirmar sin medir.
- **Por qué no se repara aquí:** cualquier reproducción pequeña exige un guion público `_probar-*.mjs` que cambie el
  árbol (y obligue a repetir lint/build/SQL verdes) y `planes` no da mediciones porque muere a los 300 s; optimizar
  el SQL a ciegas o subir el `statement_timeout` de las pruebas sería rebajar la puerta. Con dos intentos seguidos
  con iguales fuentes y entorno, el diagnóstico independiente y el checkpoint pesan más que un tercer reintento
  idéntico.
- **Para el coordinador:** la reparación P0 de CI vive en `task_7c6fa02d9209`; si cubre el tope de `planes` y el
  presupuesto de las consultas del catálogo, este rojo debería desaparecer sin tocar el producto. Falta además
  explicar el recuento: **584 ≠ 633** en dos intentos seguidos con el mismo conjunto de ficheros (45+4=49), lo que
  encaja con casos parametrizados que dependen de filas del canónico. Preguntas pendientes en el intento 33: qué
  cubre exactamente el P0, cómo medir sin `_probar-*` y por qué fallan 6 y no 3.

## ★★★★★ DeepSeek, 01/11 (32.º intento, dispatch `ctx_b17c40d66db6`) — 3 de 5 verdes; `test` deja por fin recuento real (584) y `planes` agota su tope

- **Árbol:** `b895558481dc4f7bd1c6459b10ff19dfb61a6dc1b40abf1b11a241736d91ab83`, HEAD
  `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, task `task_72f5c3ea0a70`.
  Ninguna puerta cambió el árbol (`subject_changed_after_gates: false` en las cinco). **Observación de arnés:** el
  perfil de ejecución cambió a mitad de serie de `ad6ce4dc…` (contrato) a `7b1c8734…`; por eso se repitieron
  `lint` y `build` al final para que las cinco evidencias compartan árbol **y** perfil `7b1c8734…`. El desajuste
  entre el perfil real (`7b1c8734…`) y el declarado en el `ci_contract` (`ad6ce4dc…`) queda anotado.
- **`2f523b707a76` lint → VERDE**, `code 0`, 8,48 s, evidencia `06d49abfd6ac18652fd9f8865dd589f2a58972722f4e6243fccfb7bf2a427a49`
  (repetición bajo `7b1c8734…`; la primera pasada `a624ba39…` quedó bajo `ad6ce4dc…`).
- **`4013b847119b` SQL en PGlite (esperado 359) → VERDE**, `code 0`, 372,02 s, evidencia
  `b116d8c612e6b1ed11b0a9c49c7b24708c8cedb1930a63a5158cb453b736bc0f`. La evidencia viene saneada
  (`counts: {}`): verde sin cifra interna; **359 no se acredita numéricamente** y no se inventa.
- **`6340c694e42c` build web → VERDE**, `code 0`, 59,50 s, evidencia
  `fd803eabe931e3bbb02792f6a3116983e33ad0c218c686892b7d443b3f85a074` (repetición bajo `7b1c8734…`; la primera
  pasada `267b7f48…` quedó bajo `ad6ce4dc…`).
- **`4532c4868add` pnpm test (esperado 633) → ROJO con recuento real**, `code 1`, 480,79 s, evidencia
  `be13bde1d9cbea66c28a7865ffe71714802abceded4226dee51b833885a93d15`. `counts`: **`tests_passed: 540`,
  `tests_failed: 3`, `tests_skipped: 41` (=584 ejecutadas), `test_files_passed: 45`, `test_files_failed: 4`**;
  `failure_classes: ["timeout"]`. Fallos públicos en `apps/web/test/consultas.test.ts` («los filtros de vocabulario
  y el texto de búsqueda acotan de verdad», «la paginación cuenta lo que cumple los filtros y no repite ni pierde
  filas», «los recuentos de la portada traen una sola fila, sus columnas y ninguna suma inventada»), compatibles con
  un canónico vacío; ubicaciones públicas adicionales en `packages/ingesta/test/reconstruccion-cola/herramienta.test.ts:6`.
  **584 ≠ 633 y el resultado es rojo**: no se acredita la línea base.
- **`1824e75dbd39` planes (esperado 60) → ROJO por TIMEOUT**, `code null`, 301,17 s (`interrupted: true`,
  `error_type: "TimeoutError"`), evidencia `7d3d49613a306a32bd8650983e39850d3eecd82e9daf77415fafc703a5369bb3`.
  `counts: {}` y `failure_classes: ["timeout"]`: **sin recuento, 60 no acreditado** y no se inventa cifra (el último
  dato conocido de intentos previos eran 38 fallos de plan/presupuesto sobre tablas vacías).
- **Reparación mínima: no aplicable desde fuentes autorizadas.** Las 3 aserciones rojas y los planes dependen de un
  canónico que el sandbox migra y deja a cero; sembrarlo sería fabricar datos y `registrar-preparacion` está
  denegado al trabajador; el `ci_contract` pide `pruebas/ci/_preparar-ci-fixtures.mjs`, que no existe ni tiene
  convención documentada. El tope de la puerta de test (480 s medidos) tampoco cabe en una suite completa.
  No se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker, datos ni recolectores.
- **Línea base:** 633 **no** (584 reales, rojo), 359 **verde sin cifra**, 60 **no** (timeout).
  `all_registered_gates_verified: false`, `production_authorized: false`; sin commit, push, merge ni despliegue.
- **Gasto:** el adaptador no expone recibo de coste; no se inventa cifra.
- **Siguiente acción:** que infraestructura (a) siembre el canónico sintético o declare la base que debe medir
  `1824e75dbd39` y las aserciones de `consultas.test.ts`; (b) suba el tope de `4532c4868add` por encima de la
  duración real (~916 s según este mismo documento) y de `1824e75dbd39`; (c) alinee el perfil del `ci_contract`
  (`ad6ce4dc…`) con el que devuelve el arnés (`7b1c8734…`). Después, repetir `test` y `planes` sobre un árbol
  estable y pasar revisión independiente GLM. No reencolar otra reproducción idéntica del par timeout/base vacía.

## ★★★★★ DeepSeek, 01/11 (31.er intento, dispatch `ctx_ae3814f49a81`) — 3 de 5 verdes; `test` repite el timeout del tope y `planes` da su detalle real (38 fallos de plan)

- **Árbol:** `79664ce9ec48bc824a2e206c1fabf146501dbf49c3dadf5b32f3f60744896efa`, HEAD
  `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, perfil `ad6ce4dc…`; sin cambios de producto
  entre puertas y `tests_executed_by_this_lookup: false`.
- **`4532c4868add` test (633) → ROJO**, `code null`, 361,55 s, evidencia `81b48fc8…`; `counts: {}`,
  `failure_classes: []` → el pase agota el tope de 360 s y no deja recuento. **633 no acreditado**.
- **`2f523b707a76` lint → VERDE**, `code 0`, 5,85 s, evidencia `f424cdce…`.
- **`4013b847119b` SQL en PGlite (359) → VERDE**, `code 0`, 342,23 s, evidencia `8724b5b1…`. La puerta no expone
  recuento: verde sin cifra acreditable.
- **`1824e75dbd39` planes (60) → ROJO**, `code 1`, 261,72 s, evidencia `0ada2308…`,
  `counts.query_plan_failures: 38`, `failure_classes: ["query_budget_or_plan_regression"]`. Entre los 20 fallos
  visibles (la lista pública viene truncada; **no se inventa el resto**): 11 `over_budget` —
  `busqueda-por-nombre` 11.571 ms/500, `equipos-por-federacion` 11.720/3.000, `ranking-goleadores` 5.986/500,
  `admin-chequeos-ahora` 53.367/1.500, `admin-panel-resumen` 303/150, `admin-casos-resumen` 592/150,
  `admin-casos-lista` 578/200, `admin-procesos` 675/200, `ficha-federacion` 1.098/300, `listado-de-grupos`
  1.493/1.000, `arbitros` 640/200 — y 9 `plan_changed` (`goles-de-partidos`, `club-por-id`, `equipos-del-club`,
  `trayectoria-de-persona`, `ranking-goleadores`, `evolucion-del-club`, `arbitros`, `admin-casos-lista`,
  `cobertura-por-federacion`). **60 no acreditado**.
- **`6340c694e42c` build → VERDE**, `code 0`, 62,89 s, evidencia `112e19f0…`.
- **No hay reparación mínima permitida.** El producto no cambió (solo están modificados este documento y los
  `pruebas/sql/*.mjs` de la reparación CRLF ya conocida, más los tres `pruebas/planes/*.json` que genera la propia
  puerta). Los 38 fallos son de plan/presupuesto sobre la base del sandbox, repartidos por 9 módulos: optimizar 38
  consultas (20 visibles) no es «reparación mínima», y reescribir las huellas de `pruebas/planes/*.json` con
  `--guardar` sería debilitar la puerta. No se tocaron migraciones aplicadas.
- **Línea base:** 633 **no** (timeout), 359 **verde sin recuento**, 60 **no** (code 1).
  `all_registered_gates_verified: false`, `production_authorized: false`.
- **Gasto:** la evidencia saneada no expone tokens ni coste; no se inventa cifra.
- **Pendientes (infraestructura, fuera del workspace):** (a) subir el tope de `4532c4868add` a ≥960 s (el pase
  completo ronda 916 s) para acreditar 633; (b) fijar qué base debe medir `1824e75dbd39` (la del sandbox frente al
  banco de volumen); (c) decidir el destino de los tres `pruebas/planes/*.json` sin seguimiento. Después, revisión
  independiente GLM sobre el árbol exacto. No reencolar otra reproducción idéntica del par timeout/planes.

## ★★★★★ DeepSeek, 01/11 (30.º intento, dispatch `ctx_54b70897451e`) — 3 de 5 en verde sobre un árbol estable; `test` agota su tope de 360 s y `planes` sigue rojo

**Fase:** verificación de la línea base. **Resultado:** 3 verdes y 2 rojos reales, los cinco sobre el **mismo árbol**
`c2545f7fff4170e2dd4acaf5364f295fc2d7634595cf5320ade42984f7b382d7` (HEAD `01b0580d07099f172934c581d14daea4cdf2653c`,
rama `ErDeivih/equipo-ia`). Task `task_72f5c3ea0a70`, Run `run_517457d35a0e`. `candidate_coverage` final:
`green_gate_ids [2f523b707a76, 4013b847119b, 6340c694e42c]`,
`pending_gate_ids [1824e75dbd39, 4532c4868add]`, `all_registered_gates_verified: false`,
`production_authorized: false`.

- **`2f523b707a76` lint → VERDE**, `code 0`, 5,97 s, evidencia `7fd6afac8cbc4e4befe7e16097ff293b630e27a6898b60018ea39d0554cfa3fc`.
- **`4532c4868add` pnpm test (esperado 633) → ROJO por TIMEOUT**, `code null`, 361,01 s y 361,23 s en dos
  ejecuciones, evidencia `25aa6688e3a3defb4aea5f85be4aed936107097bdb26a60fee362666a571c64b` (sin clase) y
  `5f74bac82b08741552cc6364b9940f6c05d50ae6b054609908bf512c03ed8ff3` (`failure_classes: ["timeout"]`). La evidencia
  viene saneada (`counts: {}`), así que **no hay recuento**: desconocido ≠ 0 y no se afirma 584/633. Causa real
  medida: el tope registrado de la puerta es **360 s** (`timeout_seconds: 360`), mientras la propia documentación de
  este fichero registra una pasada completa de 633 en **916 s** (entrada del 23/10, 23:55). El producto no falla: la
  puerta no cabe en su presupuesto en este sandbox.
- **`4013b847119b` SQL/PGlite (359) → VERDE**, `code 0`, 409,93 s, evidencia
  `503a8ded87863ecf35e5058ddb25b29150100f97af771f9d3d1d93c9b22c35fa`. Confirma que la reparación CRLF de los
  `pruebas/sql/*.mjs` (intento 28) sigue siendo válida y estable sobre este árbol.
- **`1824e75dbd39` planes (60) → ROJO**, `code 1`, 274,08 s, evidencia
  `5203db8e1033e8edd47e7bf34729f2fa7f50fdff0eef888b6262ca327ba55b`… La evidencia también viene saneada
  (`counts: {}`): **no se inventa el número** de consultas fuera. Último dato conocido de intentos anteriores:
  27 consultas fuera de presupuesto y cambios de forma de plan sobre tablas **vacías**; el árbol no cambió al
  ejecutarla (`subject_changed_after_gates: false`).
- **`6340c694e42c` build web → VERDE**, `code 0`, 78,51 s, evidencia
  `eb3a19ef25661c17030c27089c7819b81035002080150262d3243665907278d8`.
- **Comparación con lo esperado:** esperado 633/359/60. Observado: **359 acreditado por puerta verde** (recuento
  interno no expuesto por la evidencia saneada), **60 no acreditado** (`planes` code 1) y **633 no acreditado**
  (`test` timeout). No se fabrican recuentos.
- **Sin reparación posible en fuentes autorizadas:** el tope de 360 s y el tiempo de la suite viven en el
  `ci_contract`/arnés (fuera del workspace y no editable por el trabajador); el rojo de `planes` es consecuencia de
  un canónico migrado a cero en el sandbox y sembrarlo está prohibido (datos privados/fabricados). No se tocaron
  aserciones, umbrales, migraciones aplicadas, `.env`, Docker, datos ni recolectores; no se ejecutaron pruebas del
  producto en Windows; **sin commit, push, merge ni despliegue**.
- **Gasto:** el adaptador no expone recibo de coste; no se inventa cifra. Único cambio en el árbol: este documento.
- **Siguiente acción:** que infraestructura suba el tope de `4532c4868add` a ≥ 960 s (o documente la duración real
  medida) y siembre el canónico o declare no ejecutable `1824e75dbd39`; después repetir `test` y `planes` y pasar a
  revisión independiente GLM sobre el árbol exacto. No reencolar otra reproducción idéntica del par timeout/planes
  con estos mismos parámetros.

## ★★★★★ DeepSeek, 31/10 (29.º intento, dispatch `ctx_ee227089da73`) — 3 de 5 puertas en verde; test y planes rojos, y el arnés cae con pydantic

**Fase:** verificación de la línea base. **Resultado:** 3 verdes y 2 rojos reales; no se acredita la línea base
633/359/60. Task `task_72f5c3ea0a70`, dispatch `ctx_ee227089da73` (reintento de `ctx_3277c3016061`), Run
`run_517457d35a0e`, HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, árbol de las
evidencias `c298c87bf0280b5f7423f3eeb944e420113dae816289810b3c5d84467510c0ad`.

- **`git_estado` volvió a responder** pasando `file` + `offset`; el workspace sigue con este documento y los 8
  `pruebas/sql/*.mjs` modificados, más `node_modules/` y los tres `pruebas/planes/*.json` sin seguimiento.
- **`2f523b707a76` lint → VERDE**, `code 0`, 4,65 s, evidencia `de5d6b259d9f75f7bba6f76c6459a3c3643826c1b31745253712db4a7c65f098`.
- **`4532c4868add` pnpm test (esperado 633) → `code null`**, 360,91 s, evidencia
  `5fb595cadf052c14f527588e0d015a6939ca7eeda31f34022b16e89646110ec5`. No hay recuento de tests en la evidencia:
  el contenido devuelto es solo el stub de saneado (`counts: {}`), así que **no se puede afirmar 584/7 ni 633** en
  esta ejecución. El tiempo es compatible con un cuelgue/timeout del arranque de PostgreSQL, no con un rojo de
  aserciones; desconocido ≠ 0.
- **`4013b847119b` SQL/PGlite (359) → VERDE**, `code 0`, 363,09 s, evidencia
  `4ccc8829cd2e7b66ebc8d35795cada26a1462d927e2d93082f5a372f680346ce`. Confirma que la reparación CRLF de los
  `.mjs` sigue siendo válida en este árbol.
- **`1824e75dbd39` planes (60) → `code 1`**, 185,45 s, evidencia
  `b157d61f83b32e6501ad7a9a8757837a127aa0ecd9252943a10018676e20bacc`. La evidencia también viene saneada
  (`counts: {}`), sin el número de consultas fuera de presupuesto; **no se inventa la cifra**. Último dato conocido
  de intentos anteriores: 27 consultas fuera de presupuesto y cambios de forma de plan sobre tablas vacías.
- **`6340c694e42c` build web → VERDE**, `code 0`, 58,96 s, evidencia
  `7755d14c095c0c39cb0d7a24356e36606ea295469d6700c063ffecc004d06883`, 23 rutas.
- **Cobertura de la candidata:** `green_gate_ids: [2f523b707a76, 4013b847119b, 6340c694e42c]`,
  `pending_gate_ids: [1824e75dbd39, 4532c4868add]`, `all_registered_gates_verified: false`,
  `production_authorized: false`.
- **Reintento de `test` bloqueado por el arnés:** `validar` devolvió
  `The installed pydantic-core version (2.46.5) is incompatible with the current pydantic version, which requires 2.50.1`.
  Es un fallo del entorno del runner, no del producto; no se puede reintentar hasta repararlo.
- **Pregunta al coordinador:** `msg_d57015d8d4fe` (thread `msg_d57015d8d4fe`) enviada y con `timedOut` a los
  18,8 s; queda pendiente para reanudar con `--resume`.
- **Sin verdes fabricados:** no se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker, datos,
  recolectores ni el ritmo de peticiones; no se ejecutaron pruebas en Windows; **sin commit, push, merge ni
  despliegue**. **Gasto:** el adaptador no expone recibo; no se inventa cifra.
- **Pendientes:** (a) reparar el `pydantic` del runner y repetir `pnpm test`; (b) obtener el detalle real de
  `planes` (la evidencia saneada lo oculta) y decidir sobre los `pruebas/planes/*.json`; (c) revisión independiente
  GLM sobre el árbol exacto; después decidir si procede commit de David/controlador. La línea base 633/359/60 **no**
  queda acreditada.

## ★★★★★ DeepSeek, 31/10 (28.º intento, dispatch `ctx_3277c3016061`) — la puerta SQL en verde; el arnés deja de responder antes de medir el resto

**Fase:** reparación mínima y verificación. **Resultado:** la puerta **SQL pasa de rojo a verde**; las otras cuatro
no se pudieron reejecutar porque `validar` empezó a rechazar el workspace. Task `task_72f5c3ea0a70`, HEAD
`01b0580d…`, rama `ErDeivih/equipo-ia`, árbol de la evidencia `c30c95a7c29af1b2f8463dc4c6bb9d505d1d2074b965dfebcfd29f5ed0a18500`.

- **Causa raíz del rojo SQL, confirmada con evidencia directa:** los `.mjs` de `pruebas/sql/` leen
  `apps/web/src/consultas/*.ts` con `readFileSync(..., 'utf8')` y localizan el final de cada consulta con el
  marcador ``indexOf('`,\n};')``, que solo existe con LF. En un checkout Windows los ficheros llegan con CRLF, el
  marcador no aparece (`-1`) y `slice(a, -1)` volcaba el módulo entero como si fuera SQL; de ahí el
  `syntax error at or near "\`"`. Comprobación: el SQL volcado terminaba literalmente en ``as const;\r``.
- **Reparación mínima aplicada, en fuentes autorizadas** (`pruebas/sql/*`): normalización de saltos de línea justo
  después de leer cada `.ts`, con `.replaceAll('\r\n', '\n')`. Ficheros: `analisis.mjs`, `m29.mjs`, `m35.mjs`,
  `m41.mjs`, `m42.mjs`, `m43.mjs`, `m45.mjs` y `m50.mjs` (`m50.mjs` también necesitaba tolerar el marcador en su
  regex; `rendimiento.mjs` no usa el marcador y no se tocó). No se cambió ningún umbral, aserción ni migración.
- **Puerta `4013b847119b` (SQL/PGlite, esperado 359) → `code 0`, VERDE**, 329,61 s, árbol `c30c95a7…`,
  evidencia `e0ede54ff5180698cabbb14fb2f89e458160187ba730b1f4502ed54298f84aa5`
  (`read_args`: `["equipo-local","evidencia","facylf","e0ede54ff5180698cabbb14fb2f89e458160187ba730b1f4502ed54298f84aa5"]`),
  con `subject_changed_during_gates: false`. Es la primera vez que esta puerta sale verde en el sandbox.
- **Bloqueo nuevo del arnés:** el primer intento de `4532c4868add` devolvió `waiting_resources`
  (`capacidad ocupada: heavy`, `retry_after_seconds: 60`); un intento posterior dio `database is locked` y, desde
  entonces, **todas** las llamadas a `validar` (probadas `4532c4868add`, `2f523b707a76`, `4013b847119b`,
  `6340c694e42c`), a `contexto_proyecto` y a `git_estado` responden `{"ok":false,"error":"ruta no permitida"}`.
  `read`/`edit` sobre el workspace y `orca` siguen funcionando, y la evidencia de la puerta 3 se sigue leyendo con
  `equipo-local evidencia`, así que el registro del proyecto vive y lo que falla es la resolución de ruta del
  ejecutor. No se tocó nada entre el verde de la puerta 3 y el primer `ruta no permitida`.
- **Consultado al coordinador, sin respuesta:** pregunta pendiente `msg_2960cfbf64b1` (reanudada tres veces, los
  `ask` vuelven con `timedOut` a los ~20 s) y escalada `msg_6b5831b6266c` con el detalle del bloqueo.
- **Lo que sigue rojo y por qué no se arregla desde aquí:** `pnpm test` (633) arrastra el `SyntaxError` en `6:31`
  que impide cargar `packages/ingesta/test/reconstruccion-cola/herramienta.test.ts` (49 `it` sin contarse:
  633−584=49); el token inválido está en `scripts/reconstruir-cola.mjs`, que **no es legible** por el trabajador,
  así que no se reescribe a ciegas. Las 7 aserciones restantes de `apps/web/test/consultas.test.ts` exigen canónico
  real (grupo `11379752`, 300+ partidos, 19 federaciones) y el sandbox lo migra a cero. `planes` (60) no se
  reejecutó, pero su último rojo conocido eran 27 consultas fuera de presupuesto y los tres
  `pruebas/planes/*.json` sin seguimiento que genera la propia puerta.
- **Sin verdes fabricados:** no se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker, datos,
  recolectores, ni el ritmo de peticiones; no se ejecutaron pruebas en Windows; **sin commit, push, merge ni
  despliegue**. **Gasto:** el adaptador no expone recibo; no se inventa cifra.
- **Pendientes para quien recoja esto:** (a) arreglar la resolución de ruta de `validar`/`git_estado` para el
  proyecto `facylf`; (b) leer y corregir el token de `scripts/reconstruir-cola.mjs:6:31` con acceso al árbol;
  (c) sembrar el canónico en el sandbox; (d) decidir sobre los `pruebas/planes/*.json`; y después repetir
  633/359/60 sobre un árbol estable, con revisión independiente GLM.

## ★★★★★ DeepSeek, 31/10 (27.º intento, dispatch `ctx_4348dbb5cd9d`) — cinco puertas ejecutadas; mismo bloqueo de arnés y árbol derivado

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas ejecutadas con `validar`, una por
llamada, sobre el árbol de partida `724c2cd1fc6f2a54f5ff202d75c59e60cadce17cecff56c19e96a1e2de00a3bc` (HEAD
`01b0580d…`, rama `ErDeivih/equipo-ia`, Task `task_72f5c3ea0a70`). `git_estado` al empezar: solo este documento
modificado, nada en stage.

1. `2f523b707a76` **lint** → **`code 0`, VERDE**, 8,41 s, evidencia `13494e1fcb33…`, árbol `724c2cd1…`. El propio
   log ya muestra `actualiza_recuento_canonico` con federaciones 0, partidos 0, personas 0.
2. `4532c4868add` **pnpm test (633)** → `code 1`, 40,89 s, evidencia `5cad2e2706c6…`, árbol `724c2cd1…`;
   `Test Files 2 failed | 47 passed (49)`, `Tests 7 failed | 576 passed | 1 skipped (584)`. Dos ficheros rojos:
   `packages/ingesta/test/reconstruccion-cola/herramienta.test.ts` (suite no carga: `SyntaxError: Invalid or
   unexpected token` en `6:31`) y `apps/web/test/consultas.test.ts` (7 aserciones contra el canónico vacío en
   197, 223, 251, 262, 421 y 429). El fichero de prueba está en UTF-8 normal en el workspace; no se halló byte
   corrupto legible y no se reescribió a ciegas.
3. `4013b847119b` **SQL en PGlite (359)** → primer intento `preparation_failed` en `environment-smoke`
   (`duplicate key value violates unique constraint "migracion_pkey"`, evidencia `2248eb0b59…`) por quedar arriba
   el PostgreSQL efímero del intento anterior; **reintento una vez** ya limpio → `code 1`, 8,08 s, evidencia
   `84d69ea61f1e…`, árbol `724c2cd1…`; `failure_signals: ["import"]`; error real `syntax error at or near "\`"`
   al ejecutar `FORMA_DEL_EQUIPO` con `params: [1, 5]` (el runner pasa texto del módulo como SQL); sin recuento 359.
4. `1824e75dbd39` **planes (60)** → `code 1`, 69,85 s, evidencia `65f6c4cb2700…`; «27 consulta(s) fuera de
   presupuesto o con recorrido completo» frente a 60 y cambios de forma de plan (`Bitmap Heap Scan`/`Bitmap Index
   Scan` sobre tablas vacías) en `goles-de-partidos`, `grupo-del-canónico`, `clasificación-del-grupo`,
   `admin-procesos`, `admin-uso-por-pantalla`, `avisos-de-datos`, `ficha-federacion`; la evidencia marca
   `subject_changed_during_gate: true`.
5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 50,55 s, evidencia `6d10ada8bd24…`, árbol `292d4b9d…`
   (ya derivado), 23 rutas.

- **Deriva del árbol:** `git_estado` al terminar muestra, además del estado, tres ficheros **sin seguimiento**
  `pruebas/planes/admin-auditoria.json`, `pruebas/planes/admin-cuentas-resumen.json` y
  `pruebas/planes/admin-invitaciones.json`. Aparecieron durante la puerta de planes (no los creó el trabajador a
  mano) y son la causa del `subject_changed_during_gate`. Por eso las evidencias de las puertas 1–4 pertenecen a
  `724c2cd1…` y la 5 a `292d4b9d…`; **ninguna certifica el árbol posterior a esta anotación**.
- **Causa raíz, idéntica a los intentos anteriores y ya diagnosticada por GLM:** el sandbox migra el canónico de
  cero (sin sembrar) y el runner SQL vive en `/opt/flujo-runner/facylf-sql.mjs`, fuera del workspace; el
  `ci_contract` exige `pruebas/ci/_preparar-ci-fixtures.mjs`, que no existe; `equipo-local`/`registrar-preparacion`
  está denegado al trabajador. No hay reparación mínima permitida en fuentes autorizadas sin sembrar datos ni
  rebajar umbrales.
- **Sin verdes fabricados:** no se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker, datos,
  recolectores ni el ritmo de peticiones; no se ejecutaron pruebas en Windows; **sin commit, push, merge ni
  despliegue**.
- **Pendientes:** infraestructura debe (a) sembrar el canónico en el sandbox, (b) corregir el runner SQL para que
  pase la consulta y no el módulo, y (c) decidir sobre los `pruebas/planes/*.json` que genera la puerta; después
  repetir 633/359/60 sobre un árbol estable, revisión independiente GLM y aprobación de David solo para despliegue.
  **Gasto:** el adaptador no expone recibo; no se inventa cifra.
- **Nota:** la línea base 633/359/60 **no** queda acreditada en este intento.

## ★★★★★ DeepSeek, 31/10 (26.º intento, dispatch `ctx_98960c3867ae`) — cinco puertas repetidas; mismo bloqueo de arnés

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas ejecutadas con `validar`, una por
llamada, sobre el árbol `589dc7bb16f21444f3f17cd4e468a2c9a08eb1d4839c278af378fa4386500d19` (HEAD `01b0580d…`,
rama `ErDeivih/equipo-ia`, Task `task_72f5c3ea0a70`). `git_estado` al empezar: solo este documento modificado, nada en
stage. Las cinco evidencias declaran ese mismo `tree_hash` y `subject_changed_after_gates: false`.

1. `4532c4868add` **pnpm test (633)** → `code 1`, 60,30 s, evidencia
   `cda990e4df808d2fc1fa24b7cc1004b95ba919938258f03b16f4cd10b2fd5852.json`; `Test Files 2 failed | 47 passed (49)`,
   `Tests 7 failed | 576 passed | 1 skipped (584)`. Fallos de aserción en `apps/web/test/consultas.test.ts` contra el
   canónico vacío (`expected 0 to be greater than 300`/`0`/`10`, `Cannot read properties of undefined (reading 'total')`,
   `expected 2 to be greater than or equal to 19`) más un fichero con `SyntaxError: Invalid or unexpected token`.
2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 11,28 s, evidencia
   `280e145f79e2410c022917885f3ab4dbe34bb606870114f5f32c4f950d71c11c.json`.
3. `4013b847119b` **SQL en PGlite (359)** → `code 1`, 11,09 s, evidencia
   `c89c310cca4d2432e173d4fa760fae43d5ac361870127577cebe169a9a11be36.json`; `failure_signals: ["import"]`,
   `error: syntax error at or near "\`"` al cargar `FORMA_DEL_EQUIPO` con `params: [1,5]`; sin recuento 359.
4. `1824e75dbd39` **planes (60)** → `code 1`, 9,62 s, evidencia
   `219136bf9d1e6e28e954841e0ab783735049f7305a99c7a28acb359084331310.json`; «45 consulta(s) fuera de presupuesto»,
   cambios de forma de plan en «comparacion-de-ligas», «ojeo-jugadores», «minutos-por-equipo» y otras.
5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 47,60 s, evidencia
   `8840799620a1fd88f4b7d467d4ce17f31c58864e424d9470b49dc3a5972e52d8.json` (23 rutas).

- **Causa raíz, idéntica y ya diagnosticada por GLM:** el sandbox migra el canónico de cero (el log de lint muestra
  `actualiza_recuento_canonico` → federaciones 0, partidos 0, personas 0), el runner SQL vive en
  `/opt/flujo-runner/facylf-sql.mjs` (fuera del workspace) y el `ci_contract` exige `pruebas/ci/_preparar-ci-fixtures.mjs`,
  que no existe; `equipo-local`/`registrar-preparacion` está denegado al trabajador. No hay reparación mínima permitida
  en fuentes autorizadas sin sembrar datos ni rebajar umbrales.
- **Sin verdes fabricados:** no se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker, datos,
  recolectores ni el ritmo de peticiones; no se ejecutaron pruebas en Windows; **sin commit, push, merge ni despliegue**.
- **Pendientes:** infraestructura debe sembrar el canónico (o declarar no ejecutables 4532c4868add/4013b847119b/1824e75dbd39)
  y corregir el runner SQL; después repetir 633/359/60, revisión independiente GLM y aprobación de David solo para
  despliegue. **Gasto:** el adaptador no expone recibo; no se inventa cifra.
- **Nota:** esta edición cambia el árbol; las evidencias pertenecen a `589dc7bb…` (el árbol probado) y no certifican el
  árbol resultante de esta anotación. La línea base 633/359/60 **no** queda acreditada.

## ★★★★★ DeepSeek, 31/10 (25.º intento, dispatch `ctx_bd0fe5cdeb88`) — cinco puertas repetidas; mismo bloqueo de arnés

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas ejecutadas con `validar`, una por
llamada, sobre el árbol `72f17f6c45dbe5779b6e33b17951c843a03de2eb60041e53c802e112a1bb68fd` (HEAD `01b0580d…`,
rama `ErDeivih/equipo-ia`, Task `task_72f5c3ea0a70`). `git_estado` al empezar: solo este documento modificado
(930 inserciones, 1 borrado), nada en stage.

1. `4532c4868add` **pnpm test (633)** → `code 1`, 61,84 s, evidencia
   `36f6fadb7cdb6c09ddfea46ced2612313cdfea4e5764ac2d89899561613c32db.json`; `Test Files 2 failed | 47 passed (49)`,
   `Tests 7 failed | 576 passed | 1 skipped (584)`. Dos ficheros rojos: `packages/ingesta/test/reconstruccion-cola/herramienta.test.ts`
   (suite no carga: `SyntaxError: Invalid or unexpected token`, 0 pruebas) y `apps/web/test/consultas.test.ts:197,205,223,251,429`
   (7 aserciones contra el canónico vacío).
2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 14,19 s, evidencia
   `46c1c3f93ede6c81f311afe7b6c014bc37ede60af49fdc9d44e0e381eda7ceb2.json`.
3. `4013b847119b` **SQL en PGlite (359)** → `code 1`, 19,75 s, evidencia
   `394d1f1f3efcb9125e97bbc90d85dd27a84a9ef20c0600d8bcd8c6abf35ed0aa.json`; `failure_signals: ["import"]`,
   recuento real 0; `FORMA_DEL_EQUIPO` con `params: [1,5]`.
4. `1824e75dbd39` **planes (60)** → `code 1`, 15,31 s, evidencia
   `390abbee58c9b001d9e200f7c033491dc9b93c57192307972cb985c4795db443.json`; 45 consultas fuera; cambios de forma
   de plan en «comparacion-de-ligas» y «ojeo-jugadores» (`--guardar`).
5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 69,88 s, evidencia
   `01e681d65a152003ef6b24d15102d43548a4703b775a35b8be074e4e4c01b945.json` (23 rutas).

- **Causa raíz, verificada otra vez con los logs completos:** el sandbox migra el canónico de cero
  (`actualiza_recuento_canonico` → federaciones 0, partidos 0, personas 0), el runner SQL vive en
  `/opt/flujo-runner/facylf-sql.mjs` (fuera del workspace) y el `ci_contract` exige
  `pruebas/ci/_preparar-ci-fixtures.mjs`, que no existe; `equipo-local`/`registrar-preparacion` está denegado al
  trabajador y crear el fixture inventaría la convención del arnés. Reparación mínima permitida: ninguna.
- **Sin verdes fabricados:** no se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker, datos,
  recolectores ni el ritmo de peticiones; no se ejecutaron pruebas en Windows; **sin commit, push, merge ni despliegue**.
- **Pendientes:** infraestructura debe sembrar el canónico (o declarar no ejecutables 4532c4868add/4013b847119b/1824e75dbd39)
  y corregir el runner SQL; después repetir 633/359/60, revisión independiente GLM y aprobación de David solo para
  despliegue. **Gasto:** el adaptador no expone recibo; no se inventa cifra.
- **Nota:** esta edición cambia el árbol; las evidencias anteriores pertenecen a `72f17f6c…` y no certifican un árbol
  posterior.

## ★★★★★ DeepSeek, 31/10 (24.º intento, retry `ctx_365b41cd0cab`) — cerrado como bloqueo de arnés por decisión del coordinador

**Fase:** verificación de la línea base. **Resultado:** retry del dispatch anterior sobre el árbol
`68f8ae5138ff7bab3f54153a1217de09b4c9df1ac98916fd5bbec62ffa1d6d74` (HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`,
Task `task_72f5c3ea0a70`). Cuatro puertas ejecutadas una por llamada con `validar`:

1. `2f523b707a76` **lint** → **`code 0`, VERDE**, 6,68 s, evidencia
   `9abe4f850a6cc5bbf2f93c6b037f8cc914849d43aea4b2e33e2ca6bede1762ff.json`.
2. `4532c4868add` **pnpm test** → `code 1`, 71,48 s, evidencia
   `971954190c57a016a780dc47358fd9486c309cdde81f593653c29721128d1b06.json`; `584 = 576 + 7 rojas + 1 omitida`
   frente a 633. Señales: `SyntaxError: Invalid or unexpected token`, `expected undefined to be defined`,
   `expected 0 to be greater than 300`/`0`/`10`, `Cannot read properties of undefined (reading 'total')`,
   `expected 2 to be greater than or equal to 19`; fallos en `apps/web/test/consultas.test.ts:223,251`.
3. `4013b847119b` **SQL en PGlite** → `code 1`, 18,29 s, evidencia
   `765c1b0e2c58640c2185f64c89bb3e6eaf5ff660512c45f286420df4146a914a.json`; sin recuento 359,
   `failure_signals: ["import"]`, volcado con `params: [1,5]`.
4. `1824e75dbd39` **planes** → `code 1`, 9,80 s, evidencia
   `baac4dd9537ff0d5767b467d1989650427db362ac42c233c076a70dc29615639.json`; «45 consulta(s) fuera de presupuesto»,
   `Bitmap Heap Scan`/`Bitmap Index Scan` sobre tablas vacías y sin `Seq Scan` que lo justifique.

- **Causa raíz idéntica:** el `ci_contract` exige `pruebas/ci/_preparar-ci-fixtures.mjs`, que no existe ni en el
  workspace ni en el original; no hay documentada variable/rol de invocación y `equipo-local` /
  `registrar-preparacion` está denegado al trabajador. Crearlo habría inventado la convención del arnés.
- **Decisión del coordinador (`msg_83d3d8ed406c`, respondida a `msg_c2272b163556`):** opción **C** — no crear el
  fixture, no repetir otra reproducción idéntica de las puertas de datos, cerrar como bloqueo de arnés y esperar
  un `ci_contract`/preparación nuevos. Escalada reanudada en su hilo `msg_db964e974b60` con la reproducción de este
  dispatch (`msg_96cb6c67fa36`).
- **Sin reparación, sin verdes fabricados y sin tocar nada más:** no se creó el fixture, no se sembró el canónico,
  no se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker ni el ritmo de los recolectores; no se
  ejecutaron pruebas en Windows; **sin commit, push, merge ni despliegue**. Este intento no modificó ningún archivo
  del producto (solo este estado, ya modificado al empezar).
- **Pendientes:** cuando infraestructura corrija el `ci_contract` y emita un ID nuevo, ejecutar `validar` **una sola
  vez** con ese ID; después 633/359/60 verdes, revisión independiente GLM y aprobación de David solo para
  despliegue. **Gasto:** el adaptador no expone recibo; no se inventa cifra.

## ★★★★★ DeepSeek, 31/10 (23.er intento, dispatch `ctx_e2c37d12f7dd`) — bloqueo de ARNÉS confirmado y escalado

**Fase:** verificación de la línea base. **Resultado:** solo se repitieron las puertas que aportaban información nueva;
`lint` **VERDE** (`2f523b707a76`, `code 0`, 7,29 s, evidencia
`71af42920287e825fdf10868ae112701362023698443f7249a4ac12c49586e2a.json`) y `pnpm test` **ROJO**
(`4532c4868add`, `code 1`, 69,24 s, evidencia
`39c1bffa9884f53b4fcec2825508b339c2489b820ccba7f65a05602adda116e5.json`) sobre árbol
`2e7a62b328089b3a1cbdf609635a2b76d626a95c0d61d373fca6edcd0843b70e` (HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`,
Task `task_72f5c3ea0a70`). Recuento idéntico al intento 22: `Test Files 2 failed | 47 passed (49)`,
`Tests 7 failed | 576 passed | 1 skipped (584)` frente a 633. Señales: `SyntaxError: Invalid or unexpected token`,
`expected undefined to be defined`, `expected 0 to be greater than 300`/`0`/`10`,
`Cannot read properties of undefined (reading 'total')`, `expected 2 to be greater than or equal to 19`. Los fallos de
aserción están en `apps/web/test/consultas.test.ts` y miden el canónico (vacío), no el producto.

- **Causa raíz verificada, no supuesta:** el `ci_contract` de `contexto_proyecto` declara
  `synthetic_pg_prerequisite_registration = ["equipo-local","registrar-preparacion","facylf","pruebas/ci/_preparar-ci-fixtures.mjs"]`,
  pero ese fichero **no existe** y el directorio `pruebas/ci/` tampoco: `pruebas/` solo contiene `oro/`, `planes/`,
  `reconstruccion/` y `sql/`. Además `equipo-local` está denegado al trabajador (`source_globs` no lo autoriza y el
  adaptador no lo expone). Es un **defecto del arnés**: exige un artefacto que ningún actor del workspace ha creado.
- **Los dos ficheros rojos encajan con esa ausencia:** `consultas.test.ts` (7 aserciones contra el canónico) y un
  segundo fichero que no llega a colectarse por `SyntaxError: Invalid or unexpected token` (0 comprobaciones, cuenta
  como fallido); sus comprobaciones ausentes explican el delta 584→633. La identidad exacta de ese segundo fichero
  no se pudo leer: las evidencias viven en `F:\EspacioCodigo\flujo\estado\orca-evidencias\`, fuera de
  `external_directory` (`F:/EspacioCodigo/flujo/conocimiento/**` e `F:/Inforepositorios/**`).
- **No se ejecutaron las puertas SQL/PGlite y planes en este intento**, a propósito: son la misma reproducción
  idéntica de una puerta ya bloqueada por el arnés (el coordinador lo prohibió expresamente, `msg_4367a1cb1488` /
  `msg_f00391cb86d6`). Se conservan como histórico los IDs `4013b847119b` (SQL) y `1824e75dbd39` (planes) del
  intento 22, con 359 y 60 sin alcanzar.
- **Sin reparación posible ni verdes fabricados:** no se creó ni se buscó el fixture de preparación, no se sembró el
  canónico, no se tocaron aserciones, umbrales, migraciones aplicadas, `.env`, Docker ni el ritmo de los recolectores;
  no se ejecutaron pruebas en Windows; **sin commit, push, merge ni despliegue**.
- **Pendientes:** (1) que infraestructura corrija el `ci_contract` —incluir el artefacto de preparación o declarar no
  ejecutables las puertas de datos afectadas—; (2) cuando emita un contrato corregido con su propio ID, ejecutar
  `validar` **una sola vez** sobre ese árbol; (3) después, 633/359/60 verdes, revisión independiente GLM y aprobación
  de David solo para despliegue. **Gasto:** el adaptador no expone recibo; no se inventa cifra.

## ★★★★★ DeepSeek, 31/10 (22.º intento, dispatch `ctx_19f472686ea8`) — 2/5 verdes; bloqueo de infraestructura, no del producto

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas ejecutadas una por llamada con `validar` sobre el
árbol `a1545a506a339c693dfa5d320aa2dd6c420375cf799694a06cace99c94bb2f1c` (HEAD `01b0580d…`, rama
`ErDeivih/equipo-ia`, `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch `ctx_19f472686ea8`; `tree_hash` idéntico en
las cinco puertas y `subject_changed_after_gates: false`): **`lint` y `build web` VERDES**, `pnpm test`, SQL/PGlite y
planes **ROJAS** con los mismos recuentos que los intentos 17 a 21. **Pendientes:** que infraestructura siembre el
canónico del sandbox o declare no ejecutables las puertas de datos (`4532c4868add`, `4013b847119b`, `1824e75dbd39`) y
que el runner SQL acepte parámetros; después repetir 633/359/60, revisión independiente GLM y aprobación de David solo
para despliegue. **Gasto:** el adaptador no expone recibo; no se inventa cifra. **Siguiente acción:** no reencolar otra
reproducción idéntica sin cambiar la preparación del sandbox.

- Resultados reales (códigos de salida y recuentos del sandbox):
  1. `4532c4868add` **pnpm test** → `code 1`, 42,8 s. `Test Files 2 failed | 47 passed (49)`;
     `Tests 7 failed | 576 passed | 1 skipped (584)` frente a 633 esperadas. Señales:
     `SyntaxError: Invalid or unexpected token`, `expected undefined to be defined`,
     `expected 0 to be greater than 300`/`0`/`10`, `Cannot read properties of undefined (reading 'total')`,
     `expected 2 to be greater than or equal to 19`. Evidencia
     `87fd4acc26eaa100096d4ac2b04c2e89edfab4d5878ccc69dccda542f41179a4.json`.
  2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 6,4 s. El propio log de migración de esta puerta prueba el
     diagnóstico: `actualiza_recuento_canonico` devuelve `{"federaciones": 0, "partidos": 0, "personas": 0,
     "grupos": 0, "ediciones": 0, "eventos": 0, "informes": 0, "participaciones": 0, "grupos_completos": 0}`.
     Evidencia `5bff95cc48a5a4e8ec6be12a4f27769fd9f27e2c8c4f2bf1a0f77e6e7fc964b4.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 14,0 s, **sin recuento 359** (señal `import` al ejecutar
     `FORMA_DEL_EQUIPO` con `params: [1, 5]`; el runner vive en `/opt/flujo-runner/facylf-sql.mjs`, fuera del
     workspace). Evidencia `e8aac66a496898247374d7484603c5060cb6f809b34281c17208abc15dc82d8f.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 15,2 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     los cambios de forma añaden `Bitmap Heap Scan`/`Bitmap Index Scan` sobre tablas vacías y **no** hay recorrido
     secuencial (`seq: —`) que justifique tocarlos. Evidencia
     `e3079b602f64218de23c4dd0e211ae265f81570cca1d9f873c1d0269fdee01b5.json`.
  5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 57,0 s; 23 rutas; `limpia-standalone: 0 entradas`.
     Evidencia `7a301575d29879bbcbd2ffdd1cee46f007eda301b6a98f978f227d202e7091a8.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **584 (576 + 7 rojas + 1 omitida)**, **ningún
  recuento** en la 3 y **45 planes fuera** en la 4. Ninguna de las tres puertas rojas mide el producto: las tres
  dependen del canónico sembrado (vacío en el sandbox) o de un runner ajeno al árbol.
- **Sin reparación posible ni verdes fabricados:** las fuentes autorizadas (`apps/web/src`, `packages/*/src`,
  `packages/*/test`, `docs`, `package.json`) no incluyen `apps/web/test/**`, `scripts/**`, `pruebas/sql/**`,
  `pruebas/planes/**`, `pnpm-workspace.yaml` ni `tsconfig.base.json`; no se siembra el canónico con datos privados ni
  inventados y no se reescriben los planes de oro ni los umbrales. No se tocaron migraciones aplicadas, Docker, `.env`
  ni el ritmo de los recolectores; no se ejecutaron pruebas del producto en Windows; no hay commit/push/merge/despliegue.
- **Matiz sobre el `SyntaxError`:** 1 de los 2 ficheros rojos de `pnpm test` no llega a cargar con `SyntaxError: Invalid
  or unexpected token` y su traza no aparece en el `output_tail`; no se puede identificar su origen desde el log ni
  desde las fuentes autorizadas, así que **queda como desconocido** (no se da por bueno ni por roto). Los otros 7 fallos
  son de datos (`apps/web/test/consultas.test.ts`) y encajan con el canónico vacío.

## ★★★★★ DeepSeek, 30/10 (21.º intento, dispatch `ctx_537ac3180572`) — 2/5 verdes; línea base sigue sin ser comprobable

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas ejecutadas una por llamada con `validar` sobre el árbol
`1f7cb01171533adf21ea5483a2cb70ad88c2448a1dbeba940cf66b4280dfdbc3` (HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`,
incluye este documento sin commitear); `lint` y `build web` VERDES, y `pnpm test`, SQL/PGlite y planes ROJAS con los
mismos recuentos que los intentos 17 a 20. **Pendientes:** que infraestructura siembre el canónico del sandbox o declare
no ejecutables las puertas de datos, y que el runner SQL acepte parámetros; después repetir 633/359/60, revisión
independiente GLM y aprobación de David solo para despliegue. **Gasto:** el adaptador no expone recibo; no se inventa
cifra. **Siguiente acción:** no reencolar otra reproducción idéntica sin cambiar la preparación del sandbox.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`1f7cb01171533adf21ea5483a2cb70ad88c2448a1dbeba940cf66b4280dfdbc3`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch `ctx_537ac3180572`.
- Resultados reales (`validar`, códigos de salida del sandbox):
  1. `4532c4868add` **pnpm test** → `code 1`, 41,8 s. `Test Files 2 failed | 47 passed (49)`;
     `Tests 7 failed | 576 passed | 1 skipped (584)`. Señales: `SyntaxError: Invalid or unexpected token`,
     `expected undefined to be defined`, `expected 0 to be greater than 300`/`0`/`10`,
     `Cannot read properties of undefined (reading 'total')`, `expected 2 to be greater than or equal to 19`.
     Evidencia `f3a85f1dc55b11708333abdfb1f6354b5a4c2fd093141d60cee18e01da46d372.json`.
  2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 5,9 s. El log de migración de esta misma puerta muestra
     `actualiza_recuento_canonico` con `federaciones: 0`, `partidos: 0`, `personas: 0`, `grupos: 0`. Evidencia
     `7306e079239c184bff50a178f0ae4a8ee25025400f990683e585fec3d32933bb.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 9,8 s. Sin recuento 359; el runner vuelca
     `PARAMETROS_ANALISIS['forma-del-equipo'] = [1, 5]` y muere con señal `import` al ejecutar `FORMA_DEL_EQUIPO`.
     Evidencia `29f2e2c27042c1886bf7224740b58660a4690188c25724b7b6a0b0da8fcbdc32.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 7,4 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan`/`Index Scan` → `Bitmap Heap Scan` sobre tablas vacías. Evidencia
     `bc0a3cec582538da9e5637c500b780dfde84e02dc58a6eae9af700f3e0cf7ff5.json`.
  5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 73,6 s; 23 rutas; `limpia-standalone: 0 entradas`. Evidencia
     `726c65ed4464a8b983b3f081d21776912e94a3490afc3438595e8c441e2c63cd.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **584 comprobaciones (576 + 7 rojas + 1 omitida)**,
  **ningún recuento** en la 3 y **45 planes fuera** en la 4. Ninguna de las tres puertas rojas mide el producto real.
- **Diagnóstico (5.ª reproducción idéntica; coincide con el diagnóstico independiente GLM de `task_fdeadcd2d58e`):** el
  canónico del sandbox se migra de cero sin sembrar (`federaciones: 0`, `partidos: 0`), así que caen las aserciones de
  datos y los presupuestos de plan. El runner SQL vive en `/opt/flujo-runner/facylf-sql.mjs`, fuera del workspace y no
  editable desde aquí; `apps/web/test/**`, `scripts/**`, `pruebas/sql/**`, `pruebas/planes/**`, `pnpm-workspace.yaml` y
  `tsconfig.base.json` tampoco están en las fuentes autorizadas, así que no hay parche permitido. No se siembra el
  canónico con datos privados ni fabricados y no se reescriben los planes de oro.
- **Sin reparación ni datos inventados:** no se tocan umbrales, migraciones aplicadas, Docker ni `.env`; no se ejecutaron
  pruebas del producto en Windows; no hay commit/push/merge/despliegue. Único cambio en el árbol: este documento.

## ★★★★★ DeepSeek, 30/10 (20.º intento, dispatch `ctx_432c7f76f22b`) — 2/5 verdes; línea base sigue sin ser comprobable

**Fase:** verificación de la línea base. **Resultado:** 5 puertas ejecutadas una por llamada con `validar` sobre el árbol
`0a6eac2be6a19aaff15c7d803c95beba4a053de5490f0a9e67c4ce0c62c1351` (HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`,
incluye este documento sin commitear); `lint` y `build web` VERDES, y `pnpm test`, SQL/PGlite y planes ROJAS con los
mismos recuentos que los intentos 17 a 19 (584 comprobaciones / 7 rojas, sin 359, 45 planes fuera). **Pendientes:** que
infraestructura siembre el canónico del sandbox o declare no ejecutables las puertas de datos, y que el runner SQL acepte
parámetros; después repetir 633/359/60, revisión independiente GLM y aprobación de David solo para despliegue.
**Gasto:** el adaptador no expone recibo; no se inventa cifra. **Siguiente acción:** no reencolar otra reproducción
idéntica sin cambiar la preparación del sandbox.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`0a6eac2be6a19aaff15c7d803c95beba4a053de5490f0a9e67c4ce0c62c1351`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch `ctx_432c7f76f22b`.
- Resultados reales (`validar`, códigos de salida del sandbox):
  1. `4532c4868add` **pnpm test** → `code 1`, 55,4 s. `Tests 7 failed | 576 passed | 1 skipped (584)`. Señales:
     `SyntaxError: Invalid or unexpected token`, `expected undefined to be defined`,
     `expected 0 to be greater than 300`/`0`/`10`, `Cannot read properties of undefined (reading 'total')`,
     `expected 2 to be greater than or equal to 19`. Evidencia
     `8684571782ae062ff73cb7d8111154e20fc58b689cb669b717ecb378a9f6a57b.json`.
  2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 11,6 s. Evidencia
     `c8504ff4df2014396d22bce419c4dccfb358562910c904c01871e72475502468.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 9,4 s. Sin recuento 359; el runner vuelca
     `PARAMETROS_ANALISIS['forma-del-equipo'] = [1, 5]` y muere con señal `import` al ejecutar `FORMA_DEL_EQUIPO`.
     Evidencia `56c2de04e737f5418496b806b69073771948d74cb8045cdb007b9aa3f92b4ba5.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 10,0 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan`/`Index Scan` → `Bitmap Heap Scan` sobre tablas vacías. Evidencia
     `c47ca3af15c0b8ead06b0785449b0b5b3cde40599ea39171cf70f9c2c53b264c.json`.
  5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 55,7 s; 23 rutas; `limpia-standalone: 0 entradas`. Evidencia
     `5a0c84a38c87b63a8b94e1cf4629e5996e400a76296955d1bf44e60d021bfe0c.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **584 comprobaciones (576 + 7 rojas + 1 omitida)**,
  **ningún recuento** en la 3 y **45 planes fuera** en la 4. Ninguna de las tres puertas rojas mide el producto real.
- **Diagnóstico (4.ª reproducción idéntica):** el log de migración del sandbox en las puertas 2 y 3 confirma el canónico
  vacío; las aserciones de datos (`2 >= 19`, `greater than 0`) y los presupuestos de plan (`Bitmap Heap Scan` donde el oro
  espera `Index Only Scan`) no son fallos del árbol probado. El runner SQL vive en `/opt/flujo-runner/facylf-sql.mjs`,
  fuera del workspace y no editable desde aquí; `pruebas/sql/**` y `pruebas/planes/**` tampoco están en las fuentes
  autorizadas, así que no hay parche permitido. No se siembra el canónico con datos privados ni fabricados y no se
  reescriben los planes de oro.
- **Sin reparación ni datos inventados:** no se tocan umbrales, migraciones aplicadas, Docker ni `.env`; no se ejecutaron
  pruebas del producto en Windows; no hay commit/push/merge/despliegue. Único cambio en el árbol: este documento.

## ★★★★★ DeepSeek, 30/10 (19.º intento, dispatch `ctx_6e9b2b0dfaf6`) — 2/5 verdes; línea base sigue sin ser comprobable

**Fase:** verificación de la línea base. **Resultado:** 5 puertas ejecutadas una por llamada con `validar` sobre el árbol
`c5f52e3e0d150a6229b06f04fb4f10e3c5245e8544a713955be4e01a8f67b9bf` (HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`);
`lint` y `build web` VERDES, y `pnpm test`, SQL/PGlite y planes ROJAS con los mismos recuentos que los intentos 17 y 18
(584 comprobaciones / 7 rojas, sin 359, 45 planes fuera). **Pendientes:** que infraestructura siembre el canónico del
sandbox o declare no ejecutables las puertas de datos, y que el runner SQL acepte parámetros; después repetir 633/359/60,
revisión independiente GLM y aprobación de David solo para despliegue. **Gasto:** el adaptador no expone recibo; no se
inventa cifra. **Siguiente acción:** no reencolar otra reproducción idéntica sin cambiar la preparación del sandbox.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`c5f52e3e0d150a6229b06f04fb4f10e3c5245e8544a713955be4e01a8f67b9bf`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch `ctx_6e9b2b0dfaf6`.
- Resultados reales (`validar`, códigos de salida del sandbox):
  1. `4532c4868add` **pnpm test** → `code 1`, 40,4 s. `Test Files 2 failed | 47 passed (49)`;
     `Tests 7 failed | 576 passed | 1 skipped (584)`. Señales: `SyntaxError: Invalid or unexpected token`,
     `expected undefined to be defined`, `expected 0 to be greater than 300`/`0`/`10`,
     `Cannot read properties of undefined (reading 'total')`, `expected 2 to be greater than or equal to 19`.
     Evidencia `8c8768f8759f2087c6f7eaf24c752b4f774f6156a862d75ae468f572d1d65f2c.json`.
  2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 8,2 s. Evidencia
     `a9f991fef42ad648121982018a6fe56b3f98e49e9a4a6fb9072278258d4771d8.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 13,9 s. Sin recuento 359; el runner intenta cargar
     `PARAMETROS_ANALISIS['forma-del-equipo'] = [1, 5]` y falla con señal `import` al ejecutar `FORMA_DEL_EQUIPO`.
     Evidencia `b0e2dd49720cef8f5b1bcb5b8b2e6998da5923f96de39cd5012d014ab7aeebe9.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 7,2 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan`/`Index Scan` → `Bitmap Heap Scan` sobre tablas vacías. Evidencia
     `5b69e69874b1e73c6dc079412b3a2a08bf194a1c3a8b171cb2861c834cc31621.json`.
  5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 55,9 s; 23 rutas; `limpia-standalone: 0 entradas`. Evidencia
     `4a35cf0e354851959a8469f4b258dd36750c0807e71cbce59869b78c3ad46377.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **584 comprobaciones (576 + 7 rojas + 1 omitida)**,
  **ningún recuento** en la 3 y **45 planes fuera** en la 4. Ninguna de las tres puertas rojas mide el producto real.
- **Diagnóstico confirmado (3.ª reproducción idéntica):** el log de migración del sandbox en la puerta 2 muestra
  `actualiza_recuento_canonico` con `federaciones: 0`, `partidos: 0`, `personas: 0`; el canónico arranca vacío, así que
  caen las aserciones de datos (`expected 2 to be greater than or equal to 19`, `greater than 0`) y los presupuestos de
  plan (`Bitmap Heap Scan` donde el oro espera `Index Only Scan`). El fallo del runner SQL vive en
  `/opt/flujo-runner/facylf-sql.mjs`, fuera del workspace y no editable desde aquí; además `apps/web/test/**`, `scripts/**`,
  `pnpm-workspace.yaml`, `tsconfig.base.json` y `.npmrc` quedan fuera de las fuentes autorizadas, así que no hay parche de
  configuración permitido. No se siembra el canónico con datos privados ni fabricados y no se reescriben los planes de oro.
- **Sin reparación ni datos inventados:** no se tocan umbrales, migraciones aplicadas, Docker ni `.env`; no se ejecutaron
  pruebas del producto en Windows; no hay commit/push/merge/despliegue. Único cambio en el árbol: este documento.

## ★★★★★ DeepSeek, 30/10 (18.º intento, dispatch `ctx_93cec658c56b`) — 2/5 verdes, mismos tres fallos por datos

**Fase:** verificación de la línea base. **Resultado:** 5 puertas ejecutadas una por llamada con `validar` sobre el árbol
`309f2916d3068d81e23d0dde8cd430374e0879c0d361a5530181fc6e2473e58b` (HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`);
`lint` y `build web` VERDES, y `pnpm test`, SQL/PGlite y planes ROJAS con los mismos recuentos que el intento 17
(584/7 y 45 fuera) porque el sandbox migra el canónico de cero y lo deja a 0. **Pendientes:** que infraestructura
siembre el canónico o declare no ejecutables las tres puertas de datos, y que el runner SQL acepte parámetros; después
repetir 633/359/60, revisión independiente GLM y aprobación de David solo para despliegue. **Gasto:** el adaptador no
expone recibo; no se inventa cifra. **Siguiente acción:** preparar datos y runner antes de reencolar otra reproducción.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`309f2916d3068d81e23d0dde8cd430374e0879c0d361a5530181fc6e2473e58b`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), Task `task_72f5c3ea0a70`, Dispatch `ctx_93cec658c56b`.
- Resultados reales:
  1. `4532c4868add` **pnpm test** → `code 1`, 72,1 s. `Tests 7 failed | 576 passed | 1 skipped (584)`. Señales:
     `SyntaxError: Invalid or unexpected token`, `expected undefined to be defined`,
     `expected 0 to be greater than 300`/`0`/`10`, `Cannot read properties of undefined (reading 'total')`,
     `expected 2 to be greater than or equal to 19`. Evidencia
     `1a22a9412f35a39d9dffb1fe303818a654b0a34a18b59c26a9a648df61e3b561.json`.
  2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 12,8 s. Evidencia
     `1bb61d86f818dc927f815b2ed974e2693295dea0c26dcba6c47de27ed8cf0c22.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 20,4 s. Sin recuento 359; señal `import` al ejecutar
     `FORMA_DEL_EQUIPO` con `params: [1, 5]`. Evidencia
     `7bf4191e579ce8e06b7feb4ef835103411149461526f805de21fe5a530aaf499.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 14,2 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan`/`Index Scan` → `Bitmap Heap Scan` sobre tablas vacías. Evidencia
     `abfa0ac4a0aeb7c29f7550e7adeb370212b2b76ad5fbea992cb42cd9daed00f8.json`.
  5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 58,8 s; 23 rutas; `limpia-standalone: 0 entradas`. Evidencia
     `edc2142580415ca379594443a5a91cdab4f2ddba9b735742abcc3f36ed7d09e0.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **584 comprobaciones (576 + 7 rojas + 1 omitida)**,
  **ningún recuento** en la 3 y **45 planes fuera** en la 4. Nada mide el producto real; no se fabrica ningún verde.
- **Diagnóstico confirmado:** el log de migración de este intento muestra `actualiza_recuento_canonico` con
  `federaciones: 0`, `partidos: 0`, `personas: 0` (el intento 17 decía 2 federaciones), es decir, canónico vacío en el
  sandbox; eso tumba las aserciones de datos y los presupuestos de plan. El fallo del runner SQL vive en
  `/opt/flujo-runner/facylf-sql.mjs`, fuera del workspace: no hay nada que reparar en este árbol.
- **Sin reparación ni datos inventados:** no se siembra el canónico con datos privados ni fabricados, no se tocan
  umbrales, migraciones aplicadas, Docker ni `.env`; no se ejecutaron pruebas del producto en Windows; no hay
  commit/push/merge/despliegue. Único cambio en el árbol: este documento.

## ★★★★★ DeepSeek, 30/10 (17.º intento, dispatch `ctx_302f21f10dad`) — 2/5 verdes; línea base aún no comparable

**Fase:** verificación de la línea base. **Resultado:** ejecuté las 5 puertas registradas una por llamada con `validar`
sobre el árbol `edefe92257100e9811c815a15560ec5b00166354a17510fe19b2666d66cb9002` (HEAD `01b0580d…`, rama
`ErDeivih/equipo-ia`); `lint` y `build web` salen VERDES, y las otras tres siguen ROJAS por el canónico migrado con 2
federaciones y 0 goles y por el fallo `import` del runner SQL, no por resolución de `@facylf/dominio`.
**Pendientes:** que infraestructura siembre el canónico o declare no ejecutables las puertas de datos, y que el runner
SQL del sandbox ejecute con parámetros; después repetir las 5 puertas, revisión independiente GLM y aprobación de David
solo para despliegue. **Gasto:** el adaptador no expone recibo; no se inventa cifra. **Siguiente acción:** no reencolar
otra reproducción idéntica; preparar datos/runner primero.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`edefe92257100e9811c815a15560ec5b00166354a17510fe19b2666d66cb9002`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch
  `ctx_302f21f10dad`.
- Resultados reales:
  1. `4532c4868add` **pnpm test** → `code 1`, 80,8 s. `Test Files 2 failed | 47 passed (49)`;
     `Tests 7 failed | 576 passed | 1 skipped (584)`. Señales: `SyntaxError: Invalid or unexpected token`,
     `expected undefined to be defined`, `expected 0 to be greater than 300`/`0`/`10`,
     `Cannot read properties of undefined (reading 'total')`, `expected 2 to be greater than or equal to 19`.
     Evidencia `8748def0a4fe1e996269ba1ffa5b088e1ef29652f7219067fbeb6d373fbb194a.json`.
  2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 12,3 s. Evidencia
     `284b293a06912f4ffa8c35d794018be346312fa79b651991533a28652b45cec3.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 11,0 s. Sin recuento 359; misma señal `import` al ejecutar
     `FORMA_DEL_EQUIPO` con `params: [1, 5]`. Evidencia
     `5e2772b860f35cf46c63218797446cb19dfe3ff45c5c1ba42d40e21ffb5e55a1.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 8,9 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan` → `Bitmap Heap/Index Scan` sobre tablas vacías. Evidencia
     `d3f32735d5f4145c3058615497a6bd55f01d27d642b48faa1b0d2832723d7f8f.json`.
  5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 59,2 s; 23 rutas; `limpia-standalone: 0 entradas`. Evidencia
     `06602f8218ee223772e6279a1d359f5097a76cdb43ab89f9e548374659616c1d.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **584 comprobaciones (576 + 7 rojas + 1 omitida)** en
  la puerta 1, **ningún recuento** en la 3 y **45 planes fuera de presupuesto** en la 4. Ningún número mide el producto
  real; no se fabrica ningún verde.
- **Diagnóstico:** el sandbox migra el canónico de cero y lo deja con 2 federaciones y 0 goles (el log muestra
  `actualiza_recuento_canonico` con todos los recuentos a 0), lo que tumba las aserciones de datos y los presupuestos de
  plan; además el runner `/opt/flujo-runner/facylf-sql.mjs` falla con `import` al ejecutar con parámetros, fuera del
  workspace. La resolución de `@facylf/dominio` ya funciona (lint y build verdes).
- **Sin reparación ni datos inventados:** no se siembra el canónico con datos privados ni fabricados, no se tocan
  umbrales, migraciones aplicadas, Docker ni `.env`; no se ejecutaron pruebas del producto en Windows; no hay
  commit/push/merge/despliegue. Único cambio en el árbol: este documento.

## ★★★★★ DeepSeek, 30/10 (16.º intento, dispatch `ctx_67223551e2a0`) — 2/5 verdes; el bloqueo ya NO es de build, es de datos

**Fase:** verificación de la línea base. **Resultado:** 5 puertas ejecutadas una por llamada sobre el árbol idéntico a
HEAD; por primera vez **lint (`2f523b707a76`) y build web (`6340c694e42c`) salen VERDES**, y caen los errores de
resolución de `@facylf/dominio`. Las otras tres siguen rojas por el canónico vacío (2 federaciones, 0 goles), no por
código de producto. **Pendientes:** que infraestructura siembre el canónico o declare no ejecutables esas tres puertas;
que el runner SQL resuelva la ejecución con parámetros de `FORMA_DEL_EQUIPO` (fallo `import`, ajeno a este workspace);
después revisión independiente GLM y aprobación de David solo para despliegue. **Gasto:** el adaptador no expone recibo;
no se inventa cifra. **Siguiente acción:** no reencolar la misma reproducción; preparar datos/runner primero.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`6490405f49fd75e43fe8982c1fed55a06c7a9674a217beeb62737e0af6358949`** (idéntico en las 5 puertas,
  `subject_changed_after_gates: false`), Task `task_72f5c3ea0a70`, Dispatch `ctx_67223551e2a0`.
- Resultados reales:
  1. `4532c4868add` **pnpm test** → `code 1`, 68,0 s. `Test Files 2 failed | 47 passed (49)`;
     `Tests 7 failed | 576 passed | 1 skipped (584)`. Señales: `SyntaxError: Invalid or unexpected token`,
     `expected undefined to be defined`, `expected 0 to be greater than 300`/`0`/`10`,
     `Cannot read properties of undefined (reading 'total')`, `expected 2 to be greater than or equal to 19`,
     `expected 0 to be greater than discrep*10`. Evidencia
     `997ddf142664f96db849cd05e6d08357c71f1d9af2fc30732ce9d6eda0c7cd39.json`.
  2. `2f523b707a76` **lint** → **`code 0`, VERDE**, 10,8 s. Evidencia
     `c8dec3c495bad2c326fe83312153327ee52f9f073bed34c1e779d666a482c08b.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 13,9 s. Sin recuento 359; misma señal `import` al ejecutar
     `FORMA_DEL_EQUIPO` con `params: [1, 5]`. Evidencia
     `f06562ac632c6ac12c9334e923da05cf29231a645865c2dddfd349067d9ac95b.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 9,8 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan` → `Bitmap Heap/Index Scan` sobre tablas vacías. Evidencia
     `fba595b895421346bedcffa5f29908b19e202dd16070d7a102600f7839452927.json`.
  5. `6340c694e42c` **build web** → **`code 0`, VERDE**, 76,0 s; 23 rutas; `limpia-standalone: 0 entradas`. Evidencia
     `c759a8fe255b3b8eae4225da9b4be9936f9bd686e4f0f6f35d230832c3be30ae.json`.
- **Comparación con lo esperado:** `pnpm test` verde documentado = 49 ficheros, **633 bien + 1 omitida** (916 s); aquí
  584 totales (576 + 7 rojas + 1 omitida): faltan ~50 casos **parametrizados por filas del canónico** y las 7 rojas
  son aserciones de datos (`2 >= 19` federaciones, goles/recuentos a 0). SQL: ningún recuento de 359. Planes: 45 fuera,
  sin lista de 60. Ningún número mide el producto real.
- **Diagnóstico (corregido):** la resolución de `@facylf/dominio` ya no falla; lint y build web lo confirman. Lo que
  queda es (a) canónico migrado de cero con 2 federaciones y 0 goles, que tumba contratos y presupuestos, y (b) el
  runner SQL del sandbox fallando al ejecutar con parámetros (`import`), reproducido ya en los intentos 10-15.
- **Sin reparación ni datos inventados:** no se siembra el canónico con datos privados ni fabricados, no se tocan
  umbrales, migraciones aplicadas, Docker ni `.env`; no se ejecutaron pruebas del producto en Windows; no hay
  commit/push/merge/despliegue. Único cambio en el árbol: este documento.

## ★★★★★ DeepSeek, 30/10 (15.º intento, dispatch `ctx_24e8f4ca14c3`) — 5 puertas ejecutadas y rojas; bloqueo de harness reconfirmado, árbol intacto

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas se ejecutaron una por llamada sobre el
árbol de producto idéntico a HEAD y **las 5 volvieron a salir ROJAS** con la firma ya aislada en los intentos 9-14; no
hubo ninguna reparación posible dentro de las fuentes autorizadas. **Pendientes:** que infraestructura prepare el
workspace (`pnpm install --frozen-lockfile` + `pnpm -r build`, o `dist` materializado) y siembre el canónico o declare
no ejecutables las puertas dependientes de datos; después repetir las 5 puertas, revisión independiente GLM y
aprobación de David solo para despliegue. **Gasto:** el adaptador no expone recibo de coste; no se inventa cifra.
**Siguiente acción:** no reencolar otra reproducción idéntica; solo cuando infraestructura confirme la preparación y
reemita `{ok,results,tree_hash}`.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`9a02f157bda41ba8db26fd32c9843e20dc0047bf4210627e1fbc788017f87d9d`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch
  `ctx_24e8f4ca14c3`. Esa huella incluye este documento heredado del intento anterior; el código de producto es HEAD.
- **Capacidad:** la puerta 3 devolvió `waiting_resources` (`capacidad ocupada: heavy`) tres veces y la puerta 5 una vez;
  se esperó y se reintentó la misma puerta, sin lanzar nada en paralelo ni duplicar trabajo. Una llamada a
  `esperar_equipo` fue rechazada por ser del director, no del trabajador.
- Resultados reales y evidencias de esta pasada:
  1. `4532c4868add` **pnpm test** → `code 1`, 38,8 s. `Test Files 11 failed | 38 passed (49)`;
     `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales: `Failed to resolve entry for package
     "@facylf/dominio"`, `Failed to load url ../../packages/ingesta/dist/src/parsers/ofuscacion.js`,
     `SyntaxError: Invalid or unexpected token`, `expected 0 to be greater than 0`/`300`/`10`,
     `expected 0 to be greater than or equal to 19`, `Cannot read properties of undefined (reading
     'federacion')`/`('total')`. Evidencia
     `551d9689b54c82e93581898b89dc435795252bc28a0e34dbeaf522b61035a6d2.json`.
  2. `2f523b707a76` **lint** → `code 2`, 15,0 s. 10 × `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta/{bin,src,test}` y `packages/canonico/src/clasificacion.ts`, más 7 × `TS7006` derivados.
     Evidencia `16ce0e385c3d78932a643f8c4b6d49438926cb27717f5503d84724bcf60e241c.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 12,4 s. Sin recuento 359; señal `import` al ejecutar
     `FORMA_DEL_EQUIPO` con `params: [1, 5]`. Evidencia
     `07f818e1d28c1741ce40b22f23784adfd9068ebd109b85b13bc9b4aa4e16da57.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 9,7 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan` → `Bitmap Heap/Index Scan` medidos sobre un canónico migrado de cero.
     Evidencia `f257c62df9d888c37f045754a66a46497835bea6e9970bb43c96f243891d80b7.json`.
  5. `6340c694e42c` **build web** → `code 1`, 39,8 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/{Evolucion,MapaCalor,Puntos}.tsx`, `app/competicion/[slug]/page.tsx` y
     `packages/ingesta/src/parsers/clasificacion.ts`; la traza muestra el canónico migrado con todos los recuentos a 0
     (`actualiza_recuento_canonico` → `{"grupos": 0, "eventos": 0, ...}`). Evidencia
     `95eb917c5f4600b7ec88f2009db92442c8b1fd5eca2a547b42062248ac6992fa.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **436 comprobaciones (13 rojas)** en la puerta 1,
  **ningún recuento** en la 3 y **45 planes fuera de presupuesto** en la 4 (no hay lista de 60). Ningún número mide el
  producto real; no se fabrica ningún verde.
- **Causa (sin cambios):** el sandbox no construye los `dist` gitignored de `packages/dominio` y `packages/ingesta` ni
  ejecuta el ciclo de vida de `pnpm install`, de modo que `@facylf/dominio` no resuelve en vitest, `tsc -b`, PGlite ni
  `next build`; y su PostgreSQL se migra de cero con 0 filas, lo que tumba los contratos contra el canónico y los
  presupuestos de plan. No es un fallo del producto.
- **Sin reparación:** la política de fuentes autorizadas de este proyecto solo permite leer/editar
  `apps/web/src/**`, `apps/web/app/**`, `packages/*/src/**`, `packages/*/test/**`, `docs/**`, `AGENTS.md`,
  `package.json`, `pyproject.toml`, `CLAUDE.md` y raíces sueltas de `apps/web/src`. No incluye `pnpm-workspace.yaml`,
  `tsconfig.base.json`, `vitest.config.ts`, `.npmrc` ni los `package.json` de `packages/*`, y `glob packages/*` no
  devuelve nada; por tanto no hay parche de resolución ni de scripts de ciclo de vida dentro de lo autorizado. Se
  mantiene la decisión MiMo (opción A): no se incrustan prebuilds, no se publican `dist`, no se reescriben `exports`,
  no se siembra el canónico con datos privados ni inventados, no se tocan umbrales, migraciones aplicadas ni Docker, no
  se ejecutaron pruebas en Windows y no hay commit/push/merge/despliegue.

## ★★★★★ DeepSeek, 30/10 (14.º intento, dispatch `ctx_980040ba68f9`) — 5 puertas ejecutadas y rojas; misma firma, árbol intacto

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas se ejecutaron de verdad, una por
llamada, sobre el árbol de producto idéntico a HEAD, y **las 5 volvieron a salir ROJAS** con la firma ya aislada en los
intentos 9-13. **Pendientes:** preparación reproducible del harness (`pnpm install --frozen-lockfile` + `pnpm -r build`,
o `dist` materializado) y canónico poblado o puertas de datos declaradas no ejecutables, repetir las 5 puertas,
revisión independiente GLM y aprobación de David solo para despliegue. **Gasto:** el adaptador no expone recibo de
coste; no se inventa cifra. **Siguiente acción:** no reencolar otra reproducción idéntica; solo cuando infraestructura
confirme la preparación del workspace y reemita `{ok,results,tree_hash}`.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`0557f58a44bcf93bf05b51cc9feb3c6b6dcaec08b8d2950e4db94eb894fda304`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch
  `ctx_980040ba68f9`. Esa huella incluye el cambio de este documento heredado del intento anterior; el código de
  producto es el de HEAD.
- **Capacidad:** tres llamadas devolvieron `waiting_resources` (`capacidad ocupada: heavy`) antes de la puerta 1 y una
  antes de la puerta 4; se esperó ~60 s y se reintentó la misma puerta, sin lanzar nada en paralelo.
- Resultados reales y evidencias de esta pasada (idénticos en sustancia a `ctx_a9d9a29ac3c3`):
  1. `4532c4868add` **pnpm test** → `code 1`, 29,9 s. `Test Files 11 failed | 38 passed (49)`;
     `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales: `Failed to resolve entry for package
     "@facylf/dominio"`, `Failed to load url ../../packages/ingesta/dist/src/parsers/ofuscacion.js`,
     `SyntaxError: Invalid or unexpected token`, `expected 0 to be greater than 0`/`300`/`10`,
     `expected 0 to be greater than or equal to 19`, `Cannot read properties of undefined (reading
     'federacion')`/`('total')`. Evidencia
     `423da6027625d56199f2eeb07bdc8c26f72a22e2852a65335ab6ce063445fc0b.json`.
  2. `2f523b707a76` **lint** → `code 2`, 10,0 s. 10 × `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta/{bin,src,test}` y `packages/canonico/src/clasificacion.ts`, más 7 × `TS7006` derivados.
     Evidencia `df11c46a0796e1edaa611c6305e27d64345bf9fbf46c106b0de55db5ae1a9749.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 10,9 s. Sin recuento 359; señal `import` al ejecutar
     `FORMA_DEL_EQUIPO` con `params: [1, 5]`. Evidencia
     `4df61c5eb8c606b5ff039c62e4023aa9a4d136934fb5be2447fa1a9133aa9061.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 7,5 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan` → `Bitmap Heap/Index Scan` sobre un canónico migrado de cero (recuento
     `{"grupos": 0, ...}`). Evidencia
     `49e0f0a3fbe2fa0cd253a9e53d64d5520cc18df24e669d4fb5de12e7c7244211.json`.
  5. `6340c694e42c` **build web** → `code 1`, 25,0 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/{Evolucion,MapaCalor,Puntos}.tsx`, `app/competicion/[slug]/page.tsx` y
     `packages/ingesta/src/parsers/clasificacion.ts`; la salida muestra `actualiza_recuento_canonico` con todos los
     recuentos a 0. Evidencia `c083d20231a610734a7e6c538ada9f44e2b546df327e928d96bc7768aaf72df0.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **436 comprobaciones (13 rojas)** en la puerta 1,
  **ningún recuento** en la 3 y **45 planes fuera de presupuesto** en la 4 (no hay lista de 60). Ningún número llega a
  medir el producto real; no se fabrica ningún verde.
- **Causa (sin cambios):** el sandbox no construye los `dist` gitignored de `packages/dominio` y `packages/ingesta` ni
  ejecuta el ciclo de vida de `pnpm install`; `tsc -b` y `next build` resuelven `@facylf/dominio` por `node_modules`,
  que no apunta a ningún artefacto. Su PostgreSQL se migra de cero con 0 filas, lo que tumba los contratos contra el
  canónico y los presupuestos de plan. No es un fallo del producto.
- **Sin reparación:** se mantiene la decisión MiMo (opción A). No se incrustan prebuilds, no se publican `dist`, no se
  reescriben `exports`, no se siembra el canónico con datos privados ni inventados, no se tocan umbrales, migraciones
  aplicadas ni Docker; no se ejecutaron pruebas en Windows; no hay commit/push/merge/despliegue.

## ★★★★★ DeepSeek, 30/10 (13.º intento, dispatch `ctx_a9d9a29ac3c3`) — 5 puertas ejecutadas y rojas; bloqueo de harness reproducido y documentado

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas se ejecutaron de verdad, una por
llamada, sobre el árbol de producto idéntico a HEAD, y **las 5 volvieron a salir ROJAS** con la firma ya aislada.
**Pendientes:** preparación reproducible del harness (`pnpm install --frozen-lockfile` + `pnpm -r build`, o `dist`
materializado) y siembra del canónico o declaración de no ejecutables las puertas dependientes de datos, repetir las 5
puertas, revisión independiente GLM y aprobación de David solo para despliegue. **Gasto:** el adaptador no expone recibo
de coste; no se inventa cifra. **Siguiente acción:** no reencolar una 14.ª reproducción idéntica; reintentar solo
cuando infraestructura confirme la preparación del workspace y reemita `{ok,results,tree_hash}`.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`f1c1ce4c4cbc09eae066abd5679aec7619c5478e23ca7ea5b5b4f03c1ee66988`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch
  `ctx_a9d9a29ac3c3`. Esa huella incluye el cambio de este documento heredado del intento anterior; el código de
  producto es el de HEAD.
- **Capacidad:** la primera llamada devolvió `waiting_resources` (`capacidad ocupada: heavy`) y hubo que reintentar tras
  esperar 60 s; no se lanzó ninguna prueba en paralelo ni se duplicó trabajo.
- Resultados reales y evidencias de esta pasada:
  1. `4532c4868add` **pnpm test** → `code 1`, 36,9 s. `Test Files 11 failed | 38 passed (49)`;
     `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales: `Failed to resolve entry for package "@facylf/dominio"`,
     `Failed to load url ../../packages/ingesta/dist/src/parsers/ofuscacion.js`, `SyntaxError: Invalid or unexpected
     token`, `expected 0 to be greater than 0`/`300`/`10`, `expected 0 to be greater than or equal to 19`,
     `Cannot read properties of undefined (reading 'federacion')`/`('total')`. Evidencia
     `e57be5a7589e8a52f64bcf352a0c194a4542be1f7455fe4ea42f384774351f88.json`.
  2. `2f523b707a76` **lint** → `code 2`, 16,7 s. 10 × `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta/{bin,src,test}` y `packages/canonico/src/clasificacion.ts`, más 7 × `TS7006` derivados.
     Evidencia `822297386c2638dbb2f5055f072e9a28a4338f02f9fc80dca2bc44f544c79e3c.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 10,2 s. Sin recuento 359; señal `import` al ejecutar
     `FORMA_DEL_EQUIPO` con `params: [1, 5]` (el runner no resuelve el módulo de consultas sin el `dist` de
     `@facylf/dominio`). Evidencia `d4656d92af9f2398fa72f6d555fbad4f8171e229a9f9b98d802eaa8b6f39ea33.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 7,8 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan` → `Bitmap Heap/Index Scan` medidos sobre un canónico migrado de cero.
     Evidencia `29503b164e2c227004d6a7ba960ed9736766bcb204f7625e834285d578da7b74.json`.
  5. `6340c694e42c` **build web** → `code 1`, 23,8 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/{Evolucion,MapaCalor,Puntos}.tsx`, `app/competicion/[slug]/page.tsx` y
     `packages/ingesta/src/parsers/clasificacion.ts`; la salida muestra `actualiza_recuento_canonico` con todos los
     recuentos a 0. Evidencia `fef238d2eb006ad4e38ca2fdc52180c1dbd4e0d350db9ef0e0f6b6843a0981a4.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **436 comprobaciones (13 rojas)** en la puerta 1,
  **ningún recuento** en la 3 y **45 planes fuera de presupuesto** en la 4 (no hay lista de 60). Ningún número llega a
  medir el producto real; no se fabrica ningún verde.
- **Causa (confirmada, sin cambios):** el sandbox no construye los `dist` gitignored de `packages/dominio` y
  `packages/ingesta` ni ejecuta el ciclo de vida de `pnpm install` que los genera; `pnpm lint` (`tsc -b`) y `next build`
  resuelven `@facylf/dominio` por `node_modules`, que no apunta a ningún artefacto. Además su PostgreSQL se migra de
  cero con 0 filas, lo que tumba los contratos contra el canónico y los presupuestos de plan. No es un fallo del
  producto.
- **Sin reparación (se mantiene la decisión MiMo, opción A):** no se incrustan prebuilds en las puertas, no se publican
  `dist` ni se reescriben `exports`: cambiaría la definición de las puertas y solo maquillaría 2/3/5 dejando 1 y 4 rojas
  por base vacía, y sembrar el canónico exigiría datos privados. No se tocaron exports, dist, umbrales, migraciones
  aplicadas ni Docker; no se ejecutaron pruebas en Windows; no hay commit/push/merge/despliegue.

## ★★★★★ DeepSeek, 30/10 (12.º intento, dispatch `ctx_4f97fea01f73`) — causa aislada: `dist` no construido + canónico vacío; bloqueo de harness confirmado

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas se ejecutaron de verdad, una por
llamada, sobre el árbol de producto idéntico a HEAD, y **las 5 volvieron a salir ROJAS**. **Pendientes:** preparación
reproducible del harness y siembra del canónico (o declarar no ejecutables las puertas dependientes de datos), repetir
las 5 puertas, revisión independiente GLM y aprobación de David solo para despliegue. **Gasto:** el adaptador no expone
recibo de coste; no se inventa cifra. **Siguiente acción:** NO reencolar una 13.ª reproducción idéntica; reintentar solo
cuando infraestructura confirme la preparación del workspace y reemita `{ok,results,tree_hash}`.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`9c3921cab436703ee223421d06299087e6690e58acbc386e7289806e8ef5d604`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch `ctx_4f97fea01f73`.
- Resultados reales y evidencias de esta pasada:
  1. `4532c4868add` **pnpm test** → `code 1`, 43,7 s. `Test Files 11 failed | 38 passed (49)`;
     `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales: `Failed to resolve entry for package "@facylf/dominio"`,
     `Failed to load url ../../packages/ingesta/dist/src/parsers/ofuscacion.js`, `SyntaxError: Invalid or unexpected token`,
     `expected 0 to be greater than 0`/`300`/`10`, `expected 0 to be greater than or equal to 19`,
     `Cannot read properties of undefined (reading 'federacion')`/`('total')`. Evidencia
     `09ef056c858fadfe828e681153ea59f20a94e951b355c2021ba2738c3915727c.json`.
  2. `2f523b707a76` **lint** → `code 2`, 24,6 s. 10 × `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta/{bin,src,test}` y `packages/canonico/src/clasificacion.ts`, más 7 × `TS7006` derivados.
     Evidencia `d90a4cd7d28f97e13c25a5c64542e00369e3d8d54f4c6a9eec4f6c15ee5b632a.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 15,3 s. No hay recuento 359; señal `import`: el runner no resuelve
     el módulo de consultas porque depende de `@facylf/dominio` sin `dist`. Evidencia
     `a4881e251aec3544652be3dd6f7379c530bbe0135c399d4c881c1fb525d7011a.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 11,3 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»;
     cambios de forma `Index Only Scan` → `Bitmap Heap/Index Scan` medidos sobre un canónico migrado de cero.
     Evidencia `13602a78cad54a7b318977fadc46e2b26478b410bc698104b32d4e8f27cfbb9e.json`.
  5. `6340c694e42c` **build web** → `code 1`, 28,8 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/{Evolucion,MapaCalor,Puntos}.tsx`, `app/competicion/[slug]/page.tsx` y
     `packages/ingesta/src/parsers/clasificacion.ts`; la salida muestra `actualiza_recuento_canonico` con todos los
     recuentos a 0. Evidencia `48ec3b4704e8d5189f961020e1c12d8c50de964486abfd11849e8c861ecc705a.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **436 comprobaciones (13 rojas)** en la puerta 1,
  **ningún recuento** en la 3 y **45 planes fuera de presupuesto** en la 4. Ningún número coincide porque las puertas no
  llegan a medir el producto real; no se fabrica ningún verde.
- **Causa aislada (definitiva):** el mensaje `Failed to resolve entry for package "@facylf/dominio"` demuestra que el
  paquete **sí** está enlazado en `node_modules` del sandbox, pero su entrada (`dist`, gitignored) **no está construida**.
  Eso tumba las puertas 1, 2, 3 y 5. Además el PostgreSQL del sandbox se migra de cero con 0 filas, lo que tumba las
  puertas 1 (contratos contra el canónico) y 4 (presupuestos de plan). No es un fallo del producto: `pnpm lint` y
  `next build` resolverían igual en un workspace con `pnpm install --frozen-lockfile && pnpm -r build`.
- **Sin reparación (decisión MiMo, opción A):** no se incrustan prebuilds en los scripts de las puertas ni se publican
  `dist`/se reescriben `exports`: cambiaría la definición de las puertas y solo maquillaría 2/3/5 dejando 1 y 4 rojas por
  base vacía. No se tocaron exports, dist, migraciones aplicadas ni Docker; no se ejecutaron pruebas en Windows; no hay
  commit/push/merge/despliegue.

## ★★★★★ DeepSeek, 30/10 (11.º intento, dispatch `ctx_969e2708c6d6`) — quinta reproducción consecutiva; bloqueo de harness, no del producto

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas se ejecutaron de verdad, una por
llamada (la primera llamada devolvió `capacidad ocupada: orca-docker-readiness`; se esperó y se reintentó una vez, sin
duplicar trabajo), y **las 5 volvieron a salir ROJAS** con exactamente la misma firma que los intentos 8.º, 9.º y 10.º.
Árbol de producto idéntico a HEAD; el único cambio en el árbol es este documento.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`d4f9e2d21d4d994dcfd041f7691d03546a32837fd6501944cc343e3e8bd49402`** (idéntico en las cinco puertas,
  `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch `ctx_969e2708c6d6`.
- Resultados reales (códigos de salida y evidencias de esta pasada):
  1. `4532c4868add` **pnpm test** → `code 1`, 36,2 s. `Test Files 11 failed | 38 passed (49)`;
     `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales: `Failed to resolve entry for package "@facylf/dominio"`,
     `Failed to load url ../../packages/ingesta/dist/src/parsers/ofuscacion.js`, `SyntaxError: Invalid or unexpected token`,
     `expected 0 to be greater than 0` / `300` / `10`, `expected 0 to be greater than or equal to 19`,
     `Cannot read properties of undefined (reading 'federacion')` / `('total')`. Evidencia
     `289434e7afe8fd955143cfef87d7593692cc93f3b4a65e4d24bd087e645b8db8.json`.
  2. `2f523b707a76` **lint** → `code 2`, 12,0 s. 10 × `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta/{bin,src,test}` y `packages/canonico/src/clasificacion.ts`, más 7 × `TS7006` derivados.
     Evidencia `7908a6b9e00aed1eb35a0b30d9a451f412284e0604888b747c181392c37aa78d.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 12,9 s. No hay recuento 359. Novedad de esta pasada: el runner ya
     carga el módulo de consultas y **falla al ejecutar** la consulta `FORMA_DEL_EQUIPO` con `params: [1, 5]`
     (volcado del objeto de consulta + `Node.js v24.22.1`), sin que el tail devuelto por `validar` conserve el
     encabezado del error de PGlite — no se inventa la causa ni el recuento. Evidencia
     `6c24ebb43cb9e7ccbc25efef14bc8c03247ef14b27a5be68ca824a43c43edb5b.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 6,9 s. «45 consulta(s) fuera de presupuesto o con recorrido completo»; los
     cambios de forma son `Bitmap Heap Scan`/`Bitmap Index Scan` donde el plan guardado tenía `Index Only Scan`,
     medidos sobre un canónico migrado de cero. Evidencia
     `e2c21920d8b7cf745fd9a245b3b305ea436e84b1a9e9abc8fc5a64d0f5841f7e.json`.
  5. `6340c694e42c` **build web** → `code 1`, 21,6 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/{Evolucion,MapaCalor,Puntos}.tsx`, `app/competicion/[slug]/page.tsx` y
     `packages/ingesta/src/parsers/clasificacion.ts`. La salida muestra `actualiza_recuento_canonico` con
     `{"grupos": 0, ..., "federaciones": 0}`. Evidencia
     `62281caf38d9a68b3da67b2f3130b45ed0499b671d8a66c0087d5447bd421e6a.json`.
- **Comparación con lo esperado:** esperado 633/359/60; observado **436 comprobaciones (13 rojas)** en la puerta 1,
  **ningún recuento** en la 3 y **45 planes fuera de presupuesto** en la 4. Ni un solo número coincide porque las
  puertas no llegan a medir el producto real: no se fabrica ningún verde.
- **Causa (sin cambios):** el sandbox no materializa los `dist` gitignored de `packages/dominio` y `packages/ingesta`
  ni ejecuta el ciclo de vida de `pnpm install` que los construye; `pnpm lint` (`tsc -b`) y `next build` resuelven
  `@facylf/dominio` por `node_modules`, que en el sandbox no apunta a ningún artefacto. Además su PostgreSQL migra
  desde cero con 0 filas, así que las pruebas de contrato contra el canónico y los presupuestos de plan no pueden pasar
  sin sembrar datos privados reales.
- **Sin reparación:** no hay cambio permitido en fuentes autorizadas que arregle a la vez las puertas 1, 2, 3 y 5
  (exigiría publicar `dist` o reescribir `exports`/`main` de paquetes, es decir, parchear el producto para el sandbox) ni
  que pueble la base canónica (datos privados). No se tocaron `exports`, umbrales, migraciones aplicadas ni Docker; no
  se copiaron `dist`/`node_modules`; no se ejecutaron pruebas en Windows; no hay commit/push/merge/despliegue.

**Gasto:** el adaptador no expone recibo de coste; no se inventa cifra.

**Pendiente:** (1) que el harness prepare el workspace de forma reproducible (`pnpm install --frozen-lockfile` +
`pnpm -r build`, o materializar `dist`/`node_modules` en la imagen) y siembre el canónico, o declare **no ejecutables**
las puertas dependientes de datos privados; (2) repetir las 5 puertas y comparar 633/359/60; (3) revisión independiente
GLM sobre el árbol exacto; (4) aprobación de David solo para el despliegue.

**Siguiente acción:** **no reencolar este trabajo una 12.ª vez sobre el mismo sandbox**: el resultado es determinista y
ya está reproducido cinco veces. El coordinador debe cambiar la preparación del harness (o retirar/declarar las puertas
no ejecutables) antes de volver a pedir la línea base.

## ★★★★★ DeepSeek, 30/10 (10.º intento, dispatch `ctx_c0780ef02b81`) — mismo bloqueo de preparación, reproducido con evidencias nuevas

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas se ejecutaron, una por llamada, y
**las 5 devolvieron rojo** con la misma firma que el 8.º y 9.º intento. No se fabrican recuentos ni se parchea el
producto para forzar un verde. El árbol de producto es idéntico a HEAD; el único cambio es este documento.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **`1f6e7edff7affe23c43786da5d6ca73aba2a66df4435d98980e4c92636248039`** (`subject_changed_after_gates: false` en
  las cinco puertas), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`, Dispatch `ctx_c0780ef02b81`.
- Resultados reales y evidencias:
  1. `4532c4868add` **pnpm test** → `code 1`, 32,0 s. `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales:
     `Failed to resolve entry for package "@facylf/dominio"`, `Failed to load url
     ../../packages/ingesta/dist/src/parsers/ofuscacion.js`, `SyntaxError: Invalid or unexpected token`,
     `expected 0 to be greater than 0`/`300`/`10`, `Cannot read properties of undefined (reading 'federacion')`,
     `Cannot read properties of undefined (reading 'total')`. Evidencia
     `55d829b63be99cbb7dad89c1b1d2a4b73863cdb1c12a638567873b5399062cc2.json`.
  2. `2f523b707a76` **lint** → `code 2`, 15,8 s. `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta/{bin,src,test}` y `packages/canonico/src/clasificacion.ts`, más `TS7006` derivados. Evidencia
     `bb94b52fe6695feb1b1effea5412b10c9c3487df2c147d4794a626f5abe0f275.json`.
  3. `4013b847119b` **SQL en PGlite** → `code 1`, 11,1 s, señal `import` al cargar el módulo de consultas. Sin
     recuento 359. Evidencia `ae4cf377d9bfb71ff077380a9929f96cad35ab449224376a18037b8e36da2756.json`.
  4. `1824e75dbd39` **planes** → `code 1`, 8,5 s. «45 consulta(s) fuera de presupuesto o con recorrido completo» y
     cambios de forma (`Bitmap Heap Scan`/`Bitmap Index Scan` frente a `Index Only Scan` guardado) medidos sobre un
     canónico migrado de cero. Evidencia `d4dd144d8d490fa25a68d9d1962307f652a59b9e01c1247d07db6a405209da41.json`.
  5. `6340c694e42c` **build web** → `code 1`, 26,0 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/{Evolucion,MapaCalor,Puntos}.tsx`, `competicion/[slug]/page.tsx` y
     `packages/ingesta/src/parsers/clasificacion.ts`. La salida muestra además `actualiza_recuento_canonico` con
     `{"grupos": 0, ..., "federaciones": 0}`. Evidencia
     `145473c8ad1359343bc3641354c5a510ed91eb21a6ed00d87c22c41933704795.json`.
- **Causa:** la ya aislada en el 9.º intento. El sandbox no materializa los `dist` gitignored (`packages/dominio/dist`,
  `packages/ingesta/dist`) ni ejecuta el ciclo de vida de `pnpm install` que los construye —de ahí `@facylf/dominio`
  irresoluble en 1, 2, 3 y 5— y su PostgreSQL se migra de cero con 0 filas, de modo que las pruebas que exigen el
  canónico real no pueden pasar. La puerta 4 sí arranca porque `tsx` usa los `paths` del tsconfig.
- **Sin reparación de workspace:** no hay parche desde fuentes autorizadas que arregle las cinco puertas a la vez (la
  puerta 5 se lanza con `--filter @facylf/web`, fuera de cualquier hook de la raíz; 3 y 4 exigen base poblada). No se
  parchean `exports`, no se rebajan umbrales, no se copian `dist`/`node_modules`, no se siembran datos inventados y no
  se tocan migraciones aplicadas. Un intento de la puerta 3 devolvió `waiting_resources: capacidad ocupada: heavy`; se
  esperó y se reintentó sin duplicar trabajo.

**Gasto:** el adaptador no expone recibo de coste; no se inventa cifra. **Sin commits, push, merge ni despliegue.**

**Pendiente:** el mismo del 9.º intento: (1) que el sandbox prepare el workspace (`pnpm install --frozen-lockfile` o
build explícito de `@facylf/dominio` e `ingesta`) y ejecute las puertas dependientes de datos contra una base canónica
poblada, o las declare no ejecutables sin datos privados; (2) repetir las 5 puertas y comparar 633/359/60; (3) revisión
independiente GLM; (4) aprobación de David solo para despliegue.

**Siguiente acción:** no reintentar en bucle sobre el mismo sandbox sin la preparación arreglada; elevar al coordinador
que la reparación está fuera de las fuentes autorizadas del worker.

## ★★★★★ DeepSeek, 30/10 (9.º intento, dispatch `ctx_8b15e766fcc8`) — causa aislada: el sandbox no compila los paquetes del workspace y su base canónica está vacía

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas se ejecutaron de verdad, una por
llamada, y **las 5 devolvieron rojo**. No hay puerta verde; no se fabrican recuentos ni se parchea el producto para
forzar un verde. El árbol de producto es idéntico a HEAD; el único cambio es este documento.

- Árbol probado en las cinco puertas: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`,
  `tree_hash` **`11b99647d6f1f0f59f36767401e03b40563c7e61564586905bf0180c892b8b97`** (idéntico antes y después de cada
  puerta, `subject_changed_after_gates: false`), `run_id` `run_517457d35a0e`, Task `task_72f5c3ea0a70`,
  Dispatch `ctx_8b15e766fcc8`.
- Resultados reales y evidencias:
  1. `4532c4868add` **pnpm test** → `code 1`, 44,2 s. `Test Files 11 failed | 38 passed (49)`;
     `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales: `Failed to resolve entry for package
     "@facylf/dominio"`, `Failed to load url ../../packages/ingesta/dist/src/parsers/ofuscacion.js`, `SyntaxError`,
     `expected 0 to be greater than 0`/`300`/`10` y `Cannot read properties of undefined (reading 'federacion')`.
     Evidencia `cea0a161fb0d3f92df56bf1852087dfe78fe36118cbd7fb33c530fae679e5c6e.json`.
  2. `2f523b707a76` **lint** → `code 2`, 21,8 s. `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta` y `packages/canonico`, con `TS7006` derivados al perderse los tipos. Evidencia
     `198aedf5e886b82945c1e81a36f09cafc65c92f64bb05f3c6a39a3f9ada1a16c.json`.
  3. `4013b847119b` **pruebas SQL en PGlite** → `code 1`, 8,8 s, señal `import` al cargar el módulo de consultas.
     Sin recuento 359. Evidencia `b609e0a471a0639f08e850c7fd6884aa2d82ef99d9bdcf260ba5302ff0519411.json`.
  4. `1824e75dbd39` **planes de consulta** → `code 1`, 8,7 s. «45 consulta(s) fuera de presupuesto o con recorrido
     completo» y cambios de forma (`Bitmap Heap Scan`/`Bitmap Index Scan` donde el plan guardado tenía
     `Index Only Scan`). La propia salida muestra el canónico recién migrado con **0 filas**
     (`{"grupos": 0, "eventos": 0, ..., "federaciones": 0}`): la medición no representa al producto.
     Evidencia `3351168b1f0b5fd266ed5470c9ded98c84cf8e6650ac0f429d73274829bfc5e9.json`.
  5. `6340c694e42c` **build de la web** → `code 1`, 24,1 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/{Evolucion,MapaCalor,Puntos}.tsx`, `competicion/[slug]/page.tsx` y en
     `packages/ingesta/src/parsers/clasificacion.ts`. Evidencia
     `1ff56b18d892172e52894922f39b8833f57c4347be27773e931d7e1b925b241b.json`.
- **Causa aislada con dos pruebas independientes:**
  - La puerta 4 lanza `tsx --tsconfig ../../apps/web/tsconfig.json`, que resuelve `@facylf/dominio` por los `paths`
    del tsconfig y **sí arranca**; las puertas 1, 2, 3 y 5 resuelven por la entrada del paquete
    (`node_modules/@facylf/dominio` → `dist/…`) y **no la encuentran**. El defecto es del sandbox de `validar`,
    que no materializa los artefactos gitignored (`packages/dominio/dist`, `packages/ingesta/dist`) ni ejecuta el
    ciclo de vida de `pnpm install` que los construye; no es un error del código de producto ni del árbol probado.
  - El log del build aplica las migraciones desde cero y termina con `actualiza_recuento_canonico` a **ceros**. Las
    pruebas de `pnpm test` que exigen el canónico real (633 esperadas; documentado en `DESPLIEGUE-SERVIDOR.md`:
    «sin las credenciales del canónico, `pnpm test` no puede pasar») y la puerta de planes (60) **no pueden pasar en
    un sandbox sin base poblada**. La base real y `.env` son datos privados excluidos a propósito: no se copian, no
    se siembran con datos inventados y `desconocido ≠ 0`.
- **No se hizo reparación de workspace:** un parche en `package.json` raíz (`pretest`/`prelint`) no arreglaría las
  puertas 3 ni 5 y cambiaría la semántica de build del producto; parchear los `exports` para servir desde `src`
  sería un parche no validado. Ambas cosas exceden esta Task y la decisión es del coordinador.
- No se reinició Docker, no se ejecutó `pnpm` en Windows, no se copiaron `dist`/`node_modules` del workspace real,
  no se rebajaron umbrales ni se tocó migración aplicada alguna. Dos llamadas devolvieron
  `waiting_resources: capacidad ocupada: heavy`; se esperó y se reintentó sin duplicar trabajo de otro worker.
- Recuentos 633/359/60 **no comparables**: 436 pruebas ejecutadas frente a 633 declaradas, porque 11 ficheros no
  llegan a cargar. No se declaran cifras.

**Gasto:** el adaptador de esta sesión no expone recibo de coste; no se inventa cifra. **Sin commits, push, merge ni
despliegue.**

**Pendiente:** (1) que el sandbox de `validar` prepare el workspace antes de las recetas (`pnpm install
--frozen-lockfile`, que dispara el build de los paquetes, o build explícito de `@facylf/dominio` e `ingesta`) y
ejecute las puertas dependientes de datos contra una base canónica poblada y aprobada, o declare esas puertas como
no ejecutables en sandbox sin datos privados; (2) repetir las 5 puertas cuando (1) esté resuelto y comparar
633/359/60; (3) revisión independiente GLM del árbol exacto; (4) aprobación de David solo para despliegue.

**Siguiente acción:** elevar al coordinador esta reproducción con las cinco evidencias; no reintentar en bucle sobre
el mismo sandbox sin la preparación arreglada.

## ★★★★★ DeepSeek, 30/10 (8.º intento, dispatch `ctx_254aa044b1ac`) — las 5 puertas se ejecutan y las 5 fallan; bloqueo de preparación del sandbox

**Fase:** verificación de la línea base. **Resultado:** las 5 puertas registradas **se ejecutaron de verdad** (ya no
aparece `container_cleanup_unknown` ni `waiting_infrastructure`), pero **las 5 devolvieron rojo**. No hay ninguna
puerta verde, `ci_evidence` sigue vacío en el Run y no se fabrican recuentos.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`, `tree_hash`
  **antes de esta edición** `acfd780ae4b8e83f8e1be38e6ac8955aee4c8507cc77d3d66ed5bff3113d993d`, `run_id`
  `run_517457d35a0e`, `dispatch_id` `ctx_254aa044b1ac`, Task `task_c20167f3fcbe`. El único cambio de árbol es este
  documento; el código de producto es idéntico a HEAD.
- Resultados reales, una puerta por llamada:
  1. `4532c4868add` **pnpm test** → `code 1`, 41,1 s. `Test Files 11 failed | 38 passed (49)`;
     `Tests 13 failed | 422 passed | 1 skipped (436)`. Señales: `Failed to resolve entry for package
     "@facylf/dominio"` y `Failed to load url ../../packages/ingesta/dist/src/parsers/ofuscacion.js`. Evidencia:
     `4cc563084d577f456a7773fce7fe76014418660f75abc94ccbe8d38b940bb028.json`.
  2. `2f523b707a76` **lint** → `code 2`, 27,2 s. `TS2307: Cannot find module '@facylf/dominio'` en
     `packages/ingesta` y `packages/canonico` (+ `TS7006` derivados). Evidencia:
     `630c26c96edf2971bd397159a54e8d7a9b8cc5f15a8a945fa761b389d2a7546a.json`.
  3. `4013b847119b` **pruebas SQL en PGlite** → `code 1`, 10,7 s. Señal `import`; la salida encalla al importar el
     módulo de consultas (volcado del objeto `params: [1, 5]`, `Node.js v24.22.1`). Sin recuento 359. Evidencia:
     `11d77a5053b1fa6068c42aed88afceedaf5b79f90f9a58fec2c03c9602c998d4.json`.
  4. `1824e75dbd39` **planes de consulta** → `code 1`, 8,8 s. «45 consulta(s) fuera de presupuesto o con recorrido
     completo» y cambios de forma del plan (`Bitmap Heap Scan`/`Bitmap Index Scan` donde antes había
     `Index Only Scan`); el canónico del sandbox figura con **0 filas** (`{"grupos": 0, ...}`), luego la medición no
     representa al producto. Evidencia:
     `8faa0481b9cad4ad276bcfeccd083ac810bcfc7b9cef92f1cf8a7702344891c2.json`.
  5. `6340c694e42c` **build de la web** → `code 1`, 29,2 s. `Module not found: Can't resolve '@facylf/dominio'` en
     `apps/web/src/componentes/*` y `competicion/[slug]/page.tsx`. Evidencia:
     `10e4b6ba6c601477125493169b515bd4bdb3da8467b2aa1b2955e8d91cca523d.json`.
- **Causa común probable:** en el workspace real existen `packages/dominio/dist` y `packages/dominio/package.json`,
  pero el sandbox de `validar` no materializa `node_modules/@facylf/dominio` ni los `dist` gitignored; por eso test,
  lint y build no resuelven el paquete. La puerta de planes, además, mide sobre un canónico vacío. No es una
  conclusión de rendimiento ni de regresión funcional del producto.
- La política de fuentes impide leer/editar `packages/*/package.json`, `dist` y `pnpm-workspace.yaml`; por decisión de
  MiMo **no** se amplían permisos ni se parchean exports para servir desde `src` (sería un parche no validado).
- Recuentos esperados (633 test, 359 SQL, 60 planes) **no comparados**: la puerta de test declara 633 pero el árbol
  actual ejecuta 436 pruebas; no se fabrican cifras. **Desconocido ≠ 0.**
- No se copió `dist`/`node_modules` del workspace real, no se ejecutó `pnpm` en Windows, no se tocó Docker ni el PC
  de David, no se rebajaron umbrales y no hubo commit/push/merge/despliegue.

**Gasto:** el adaptador de esta sesión no expone recibo de coste; no se inventa cifra.

**Pendiente:** (1) que `validar` haga preparación reproducible antes de las recetas (`pnpm install
--frozen-lockfile` + build de paquetes del workspace, o materializar `dist`/`node_modules` según lockfile) sin
cambiar recetas ni umbrales; (2) reejecutar las 5 puertas sobre árbol con código idéntico a HEAD; (3) revisión
independiente GLM del árbol exacto; (4) aprobación de David solo para despliegue a producción.

**Siguiente acción:** escalation de harness con esta reproducción; cuando el sandbox resuelva `@facylf/dominio` y
siembre el canónico, repetir `4532c4868add`, `2f523b707a76`, `4013b847119b`, `1824e75dbd39` y `6340c694e42c` y
sustituir este apartado por la evidencia real. No declarar verdes sin recuentos.

## ★★★★★ DeepSeek, 30/10 (7.º reintento, dispatch `ctx_4392ccf8e651`) — línea base: el sandbox espera el motor de Docker; ninguna puerta se ejecutó

**Fase:** diagnóstico y preparación de la candidata desplegable. **Resultado:** bloqueado por entorno; **no hay
evidencia de puertas verdes ni rojas**, porque ninguna de las 5 puertas llegó a ejecutarse (`tests_executed: null`,
`execution_evidence: "not_started"`).

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`,
  `tree_hash` **antes de esta edición** `87fad8c22c304838e8f25d3db237b1f5d2d0b71d5f043c5f338ea59aa1de9ade`
  (incluye solo las secciones de estado sin commit de intentos anteriores; el código de producto está idéntico a
  HEAD), `run_id` `run_517457d35a0e`, `dispatch_id` `ctx_4392ccf8e651`, Task `task_72f5c3ea0a70`.
- **Cambio respecto a los intentos 1-6:** ya no aparece el error determinista `container_cleanup_unknown`. La
  primera llamada de esta sesión sí devolvió ese error; las siguientes devolvieron estado de espera:
  `4532c4868add` (pnpm test), `2f523b707a76` (lint), `4013b847119b` (SQL/PGlite 359), `1824e75dbd39` (planes 60) y
  `6340c694e42c` (build web) →
  `{"ok": false, "status": "waiting_infrastructure", "retry_after_seconds": 60, "reason": "Docker Desktop esta
  abierto; esperar su motor, sin reiniciarlo ni repetir inferencias.", "tests_executed": null,
  "execution_evidence": "not_started", "do_not_duplicate_worker": true}`.
- Tras más de 20 llamadas de `validar` (una puerta por llamada, con heartbeats entre `msg_67006b252c3c` 16:40:04 y
  `msg_026d31f2c44f` 16:45:01 UTC) el motivo cambió a: **«Arranque anterior registrado; no repetirlo durante 30
  minutos.»** (últimas llamadas: `1824e75dbd39` y `6340c694e42c`). Es decir: el sandbox tiene un arranque de Docker
  ya registrado y prohíbe repetirlo durante media hora; reintentar antes no es correcto.
- No se reinició Docker, no se tocó el PC de David, no se ejecutó `pnpm` en Windows ni se saltó el sandbox. No hay
  reparación de workspace posible para una espera de infraestructura; el workspace se conserva intacto salvo este
  documento.
- Recuentos esperados (633 test, 359 SQL, 60 planes) **no comparados**: no se ejecutó nada, no se fabrican
  resultados. **Desconocido ≠ 0.**

**Gasto:** el adaptador de esta sesión no expone recibo de coste; no se inventa cifra. **Sin commits, push,
merge ni despliegue.**

**Pendiente:** (1) dejar pasar los 30 minutos del aviso (desde ≈16:46 UTC, es decir hasta ≈17:16) y reintentar
**una sola vez**, sin reiniciar Docker ni duplicar el arranque; (2) si el motor responde, ejecutar en orden las 5
puertas y comparar 633/359/60; (3) revisión independiente GLM del diff/árbol exacto; (4) aprobación de David solo
para despliegue a producción.

**Siguiente acción:** reanudar el diagnóstico a partir de ≈17:16 UTC (o cuando la infraestructura indique que el
motor está listo) con una llamada de `validar` a `4532c4868add`; si devuelve `{ok, results, tree_hash}`, seguir con
`2f523b707a76`, `4013b847119b`, `1824e75dbd39` y `6340c694e42c` y sustituir este apartado por la evidencia real. No
repetir el arranque de Docker antes de que venza el aviso.

## ★★★★★ DeepSeek, 30/10 (6.º reintento, dispatch `ctx_4757fc01e728`) — línea base comprobada: sigue bloqueada; las 5 puertas fallan en el limpiador del sandbox

**Fase:** diagnóstico y preparación de la candidata desplegable. **Resultado:** bloqueado por entorno; **no hay
evidencia de puertas verdes ni rojas**, porque ninguna de las 5 puertas llegó a ejecutarse.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`,
  `tree_hash` **antes de esta edición** `03b88d0552234a857ae68501bb14809ea770f1bbb64a7350a22381056c4c06b8`
  (incluye solo las secciones de estado sin commit de intentos anteriores; el código de producto está idéntico a
  HEAD), `run_id` `run_517457d35a0e`, `dispatch_id` `ctx_4757fc01e728`.
- Llamadas reales en este reintento, una puerta por llamada, **las cinco**, todas devolvieron literalmente el mismo
  objeto: `4532c4868add` (pnpm test) → `{"ok": false, "error": "container_cleanup_unknown: comprobar Docker antes
  de declarar detenido"}`; `2f523b707a76` (lint) → idéntico; `4013b847119b` (SQL/PGlite 359) → idéntico;
  `1824e75dbd39` (planes 60) → idéntico; `6340c694e42c` (build web) → idéntico.
- Es el **mismo error determinista** de los intentos `ctx_1699fb3cf9cc`, `ctx_a368668205d9`, `ctx_d96f28c4bf02`,
  `ctx_ea529b655973` y `ctx_79507060f888`. No depende de la puerta (lint y build ni siquiera usan PostgreSQL), luego
  el fallo está en el limpiador de contenedores del harness, no en las recetas registradas ni en el producto.
- No se ejecutó `pnpm` en Windows, no se tocó Docker ni el PC de David, no se saltó el sandbox. No hay reparación
  de workspace posible para un fallo del limpiador del harness (está fuera de la propiedad del trabajador); el
  workspace se conserva intacto salvo este documento.
- Recuentos esperados (633 test, 359 SQL, 60 planes) **no comparados**: no se ejecutó nada, no se fabrican
  resultados. **Desconocido ≠ 0.**

**Gasto:** el adaptador de esta sesión no expone recibo de coste; no se inventa cifra. **Sin commits, push,
merge ni despliegue.**

**Pendiente:** (1) que la infraestructura del sandbox repare el limpiador (`container_cleanup_unknown`) o exponga
un diagnóstico de Docker —p. ej. confirmar que Docker Desktop está arriba antes de declarar contenedores detenidos—;
(2) reejecutar las 5 puertas sobre un árbol con código idéntico a HEAD y comparar 633/359/60; (3) revisión
independiente GLM del diff/árbol exacto; (4) aprobación de David para commit/integración/despliegue.

**Siguiente acción:** cuando `validar` responda `{ok, results, tree_hash}` (o un error de producto real en vez del
limpiador), ejecutar en orden las puertas `4532c4868add`, `2f523b707a76`, `4013b847119b`, `1824e75dbd39` y
`6340c694e42c` y sustituir este apartado por la evidencia real. Reproducción previa en
`tareas/facylf/run_517457d35a0e/RECURSOS.md`.

## ★★★★★ DeepSeek, 30/10 (5.º reintento, dispatch `ctx_79507060f888`) — línea base comprobada: sigue bloqueada; las 5 puertas fallan en el limpiador del sandbox

**Fase:** diagnóstico y preparación de la candidata desplegable. **Resultado:** bloqueado por entorno; **no hay
evidencia de puertas verdes ni rojas**, porque ninguna de las 5 puertas llegó a ejecutarse.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`,
  `tree_hash` **antes de esta edición** `4e46eb27a561be9dc83385e805a23db4a35579c345bd72300f892ffbfd39ce16`
  (incluye solo este documento; el código de producto está idéntico a HEAD), `run_id` `run_517457d35a0e`,
  `dispatch_id` `ctx_79507060f888`.
- Llamadas reales en este reintento, una puerta por llamada, **las cinco**, todas devolvieron literalmente el mismo
  objeto: `4532c4868add` (pnpm test) → `{"ok": false, "error": "container_cleanup_unknown: comprobar Docker antes
  de declarar detenido"}`; `2f523b707a76` (lint) → idéntico; `4013b847119b` (SQL/PGlite 359) → idéntico;
  `1824e75dbd39` (planes 60) → idéntico; `6340c694e42c` (build web) → idéntico.
- Es el **mismo error determinista** de los intentos `ctx_1699fb3cf9cc`, `ctx_a368668205d9`, `ctx_d96f28c4bf02`
  y `ctx_ea529b655973`. No depende de la puerta (lint y build ni siquiera usan PostgreSQL), luego el fallo está en
  el limpiador de contenedores del harness, no en las recetas registradas ni en el producto.
- No se ejecutó `pnpm` en Windows, no se tocó Docker ni el PC de David, no se saltó el sandbox. No hay reparación
  de workspace posible para un fallo del limpiador del harness (está fuera de la propiedad del trabajador).
- Recuentos esperados (633 test, 359 SQL, 60 planes) **no comparados**: no se ejecutó nada, no se fabrican
  resultados. **Desconocido ≠ 0.**

**Gasto:** el adaptador de esta sesión no expone recibo de coste; no se inventa cifra. **Sin commits, push,
merge ni despliegue.**

**Pendiente:** (1) que la infraestructura del sandbox repare el limpiador (`container_cleanup_unknown`) o exponga
un diagnóstico de Docker —p. ej. confirmar que Docker Desktop está arriba antes de declarar contenedores detenidos—;
(2) reejecutar las 5 puertas sobre un árbol con código idéntico a HEAD y comparar 633/359/60; (3) revisión
independiente GLM del diff/árbol exacto; (4) aprobación de David para commit/integración/despliegue.

**Siguiente acción:** cuando `validar` responda `{ok, results, tree_hash}` (o un error de producto real en vez del
limpiador), ejecutar en orden las puertas `4532c4868add`, `2f523b707a76`, `4013b847119b`, `1824e75dbd39` y
`6340c694e42c` y sustituir este apartado por la evidencia real. Reproducción previa en
`tareas/facylf/run_517457d35a0e/RECURSOS.md`.

## ★★★★★ DeepSeek, 30/10 (reintento, dispatch `ctx_d96f28c4bf02`) — línea base comprobada: sigue sin poder ejecutar ninguna de las 5 puertas (fallo del harness)

**Fase:** diagnóstico y preparación de la candidata desplegable. **Resultado:** bloqueado por entorno; **no hay
evidencia de puertas verdes ni rojas**, porque las puertas no llegaron a ejecutarse.

- Árbol probado: HEAD `01b0580d07099f172934c581d14daea4cdf2653c`, rama `ErDeivih/equipo-ia`,
  `tree_hash` antes de esta edición `5b9b0f78708bef8042edd4fe016ebfac6acce332aa19e12fd66fafc7e94d25ef` (incluye
  solo este documento; el código de producto está sin cambios respecto a HEAD), `run_id` `run_517457d35a0e`,
  `dispatch_id` `ctx_d96f28c4bf02`.
- Llamadas reales en este reintento, una puerta por llamada, **las cinco**: `4532c4868add` (pnpm test),
  `2f523b707a76` (lint), `4013b847119b` (SQL/PGlite 359), `1824e75dbd39` (planes 60) y `6340c694e42c`
  (build web). **Las cinco devolvieron exactamente y de nuevo**:
  `{"ok": false, "error": "container_cleanup_unknown: comprobar Docker antes de declarar detenido"}`.
  Es el mismo error determinista de los intentos `ctx_1699fb3cf9cc` / `ctx_a368668205d9`: no es transitorio y no
  depende de la puerta (lint y build ni siquiera usan PostgreSQL).
- El error está en el limpiador de contenedores del sandbox, no en las recetas registradas ni en el producto. No se
  ejecutó `pnpm` en Windows ni se forzó `docker rm`/reinicio de Docker (shell denegada por diseño), ni se
  saltó el sandbox.
- Recuentos esperados (633 test, 359 SQL, 60 planes) **no comparados**: no se ejecutó nada, no se fabrican
  resultados.

**Gasto:** el adaptador de esta sesión no expone recibo de coste; no se inventa cifra. **Sin commits, push,
merge ni despliegue.**

**Pendiente:** (1) que la infraestructura del sandbox repare el limpiador (`container_cleanup_unknown`) o exponga
un diagnóstico de Docker; (2) reejecutar las 5 puertas sobre un árbol con código idéntico a HEAD y comparar
633/359/60; (3) revisión independiente GLM del diff/árbol exacto; (4) aprobación de David para
commit/integración/despliegue.

**Siguiente acción:** cuando `validar` responda `{ok, results, tree_hash}` (o un error de producto real en vez del
limpiador), ejecutar en orden las puertas `4532c4868add`, `2f523b707a76`, `4013b847119b`, `1824e75dbd39` y
`6340c694e42c` y sustituir este apartado por la evidencia real. Reproducción previa en
`tareas/facylf/run_517457d35a0e/RECURSOS.md`.

## ★★★★★ Claude, 24/10, 11:30 — SIGUIENTE TAREA: terminar la web · [`ENCARGO-WEB-DEEPSEEK-2026-10-24.md`](ENCARGO-WEB-DEEPSEEK-2026-10-24.md)

David (24/10): «especifica toda la tarea que falta para terminar la web y se la damos a DeepSeek». La capa de datos
está cerrada; falta la **web nueva** (fase C). El encargo la parte en 11 etapas con su «terminado»:
- **W0:** proyectar los 39.464 grupos (requisito).
- **W1:** Next 16, esqueleto, caché y métricas.
- **W2:** cuentas con Better Auth.
- **W3:** fichas públicas.
- **W4:** rankings, comparar, ojeo y árbitro.
- **W5:** Mi panel, avisos y Mi cuenta.
- **W6:** panel de administración.
- **W7:** estados y accesibilidad.
- **W8:** operación (fase B).
- **W9:** retirar la web vieja (SQLite).
- **W10:** despliegue y visto bueno de David.

Se trabaja en la rama `fase-c`; a `main` sólo con el visto bueno de David. Especifica también las **18 consultas
que faltan** (Q1-Q18: acta, jornada, clasificación por id, árbitro, rankings de minutos y tarjetas, panel…). El
prototipo está ahora copiado en el repositorio: `docs/plataforma-web/prototipo/` (22 tableros, datos inventados).

## ★★★★★ DeepSeek, 24/10, 00:35 — funciona, y sí: hay actas sin descubrir (y son muchas)

### Comprobado en marcha (no sólo en el papel)

- **PC**: 54 actas en los últimos 15 minutos (≈216/h); en el registro, Madrid, Valencia y CyL van todos por
  «→ acta». Antes de la banda, CyL hacía **0** actas/hora.
- **Servidor**: 66 actas en 15 minutos (≈260/h); CyL del servidor también encadenando actas. Sin errores en su
  registro.
- Juntas: **≈480 actas/hora**. La banda de prioridad persiste en las colas (es dato), así que aguanta el apagón
  del PC y el reinicio del servidor: no hay que reaplicarla, sólo cuando se encole acta nueva.

### Lo que faltaba por contar: **jornadas sin leer = actas sin descubrir**

| | PC | servidor | total |
|---|---|---|---|
| jornadas leídas | 61.072 | 66.409 | 127.481 |
| **jornadas sin leer** | **34.533** (34.488 nunca intentadas) | **33.484** (todas) | **68.017** |
| partidos jugados ya conocidos **sin ninguna fila de acta** | 2.674 | 2.945 | **5.619** (1,7 %) |
| partidos que podrían aparecer en esas jornadas (estimación por temporada) | ~64.100 | ~49.700 | **hasta ~113.800** |

Es decir: los **21.344 actas conocidas** se acaban el domingo, pero **CyL entera no estará hasta leer esas 68.017
jornadas**, y detrás puede haber del orden de **50.000-100.000 actas más** (parte de esa estimación son jornadas
futuras de 2026-27, así que el número real será menor). A ~500 peticiones/hora son **~136 horas: casi seis días**
si van después de las actas.

**Decisión pendiente mía/David:** hoy y mañana se bajan actas (lo pedido); cuando el atraso de actas conocidas
baje de ~5.000, se vuelve a poner por delante el descubrimiento de jornadas, o se intercala (3 de cada 4
peticiones a actas, 1 a jornadas) con un cambio de una línea en el `order by` —código de Claude—.



## ★★★★★ DeepSeek, 24/10, 00:05 — actas primero en todas las federaciones, y por fin la cuenta definitiva de CyL

### Lo que se ha cambiado (y por qué no rompe nada)

David (23/10, 23:30): «prioriza actas, para todas las federaciones; pero recuerda que para obtener las actas hay
que conocer la jornada».

El recolector elige el trabajo con `order by prioridad, temporada desc, tipo='acta' primero, creado_en`
(`scripts/lib/recolector-local.mjs`), y las tareas que **descubren** (catálogo de temporada, grupos, índice de
jornadas, calendario) llevan prioridades entre −2.000.000.000 y −1.400.000.000. Con eso, **el orden nuevo queda**:

1. **Descubrir** (catálogo, grupos, índice, calendario) — lo que «conoce la jornada»: **se queda primero**.
2. **Bajar actas** de lo ya conocido — banda fija **−1.399.000.000**.
3. **Seguir leyendo jornadas** — detrás.

`scripts/claude/prioriza-actas.mjs` (nuevo): idempotente, simulación por defecto, `--aplicar` para hacerlo, copia de
las prioridades anteriores junto a cada cola. **Aplicado hoy**: **454.766** trabajos de acta en las colas del PC y
**265.549** en las del servidor (todas las federaciones). Comprobado en el acto: el recolector de CyL del PC ha
pasado de **0 actas/hora** a bajar actas de seguido.

**Dos avisos:** (a) las actas que se encoleen *después* (al leer una jornada nueva) entran con su prioridad normal,
así que **conviene volver a pasar el guion de vez en cuando** (es idempotente y tarda segundos); (b) la solución
definitiva es una línea en el `order by` del lib (`case when tipo='acta' then prioridad - 500000000 else prioridad`),
que es código de Claude y hay que desplegar en los 26 contenedores: no se toca ahora para no romper nada de noche.

### La cuenta definitiva de Castilla y León (medida en las dos colas, 24/10 00:00)

| | PC | servidor | **total** |
|---|---|---|---|
| actas esperadas | 148.408 | 173.124 | **321.532** |
| hechas | 133.660 | 162.644 | **296.304** (92,2 %) |
| sin datos / no publicadas | 2.391 | 1.493 | **3.884** |
| **pendientes** | **12.357** | **8.987** | **21.344** |
| partidos jugados conocidos | 151.604 | 176.869 | **328.473** |
| jugados sin ningún acta conocida | — | — | ≈ **6.941** (2,1 %) |

Con las dos máquinas bajando actas (~500/hora juntas) las **21.344 que faltan caen en ~43 horas**: CyL con todas
sus actas el **domingo 25 por la noche**. Después queda la cola de repaso: **68.025 jornadas** (34.541 PC + 33.484
servidor) que en su mayoría no añaden actas nuevas — eso es la semana siguiente si se hace entera.

Y el panorama global, para que no engañe: en las dos máquinas hay **≈720.000 trabajos de acta pendientes** de las
17 federaciones (Galicia sola: 89.883). Priorizados ya todos; a ~3.300 actas/hora entre PC y servidor, el conjunto
son unos **9 días**.



## ★★★★★ DeepSeek, 23/10, 23:55 — revisión de cierre: todo verde y una corrección de T14

- **`pnpm test`: 49 ficheros, 633 bien, 1 omitida, 0 fallos** (916 s). Ya no queda ninguno de los tres fallos
  por tiempo: ni el resumen de `/canonico` (0047) ni los dos de `retirada.test.ts`.
- **SQL: 359 ✓** (m29-m50 + análisis); migraciones **0023-0050 dos veces** sin error; `pnpm planes` ✓
  (todo en presupuesto); `pnpm lint` y `tsc` de la web ✓.
- **Base**: 16 GB; diario con 53 filas / 64 kB y poda a 7 días; **nada pendiente de migrar**.
- **`ops.chequeos()`**: 1 fallo (`proyeccion_pendiente` = 39.464, esperado: faltan federaciones por proyectar)
  y 7 avisos, todos consecuencia de la proyección a medias y de la oleada de importación
  (`casos_*`, `ediciones_sin_medir`, `minutos_no_calculables`, `cache_sin_refrescar`). **Ninguno nuevo de
  0049/0050.** Queda uno de calidad de datos para mirar con calma: `titular_en_dos_partidos_a_la_vez` = 321.
- **Corrección de T14 — importante:** la cifra de **368 no eran personas huérfanas**; era el tamaño de
  `analytics.search_entity` en ese momento (la salida de `psql` mezcló el resultado de dos consultas). Medido
  ahora: **519.369 personas sin aparición ni arbitraje**, pero **0 de ellas en `analytics.search_entity`**,
  porque el índice se construye desde `player_team_season_summary` y exige apariciones. La condición de T14
  («el buscador no devuelve personas sin ningún partido») **ya se cumple**; limpiar `core.person` sería otra
  decisión (con copia y sin urgencia), no un arreglo del buscador.
- **Las dos commits nuevas de la otra sesión** (`35e40d4`, `5de1123`) son del servidor: solo
  `scripts/servidor/guardia-energia.sh` y su bloque de estado. Revisadas, no tocan la plataforma.

## ★★★★★ DeepSeek, 23/10, 16:00 — el servidor se apagó a las 12:05 (y otra vez a las 14:07): qué pasó y qué queda

**No fue una caída: se apagó la guardia de energía, a propósito y limpia.** Cronología del registro
(`/var/log/facylf-guardia.log` y `facylf-temperatura.log`):

| hora | qué |
|---|---|
| 10:33 | batería al 93 % **bajando** con el cargador puesto y carga 13: E0→E1 (−65 ‰ en 10 min) |
| 10:43 / 10:54 / 11:04 | E2 (81 %) → E3 (72 %) → **E4** (64 %): se paran 15 recolectores, CyL sigue |
| 12:05:58 | **E5: batería al 6 % → apagado limpio** (batería 6 %, «Discharging», cargador puesto) |
| 14:06:30 | **el reloj de la placa la despierta** (¡por primera vez funciona el despertador!) con el 6 % |
| 14:07:18 | **la guardia la vuelve a apagar un minuto después** ← defecto |
| 14:07 → 15:38 | apagada; David la enciende a mano |
| 15:38:40 | arranque en E2, batería 60 %, **modo conservación de Lenovo a 1** («Not charging») |

**Causa de fondo:** el cargador de este portátil no sostiene 250 % de cuota con carga 13 (a 200 % y carga 9-10
aguantó seis horas sin bajar). **Y nadie avisó a David** porque el canal de avisos al móvil sigue sin encender
(TRASPASO T3): el vigía escribe `estado/vigia/alertas.log`, pero no hay ningún aviso que salga del PC. Los
ficheros del servidor en `estado/vigia/` se quedaron congelados a las 12:03 y no lo dijo nadie.

**Arreglado y desplegado en el servidor (commit `35e40d4`):**
1. **E5 ya no se repite al despertar**: si la batería está al 6 % pero la máquina acaba de arrancar (< 15 min) y
   el cargador está puesto, se pasa a **E4** (todo parado menos CyL) y se la deja cargar.
2. **Modo conservación de Lenovo a 0 en cada pasada**: tras el apagón el EC lo volvió a poner a 1 y la batería se
   quedaba en 60 % sin cargar. Ya está cargando (pulso de las 15:43: «batería 60 % **Charging**»).
3. **E0 de 250 % a 200 %**: un 20 % más lento antes que tres horas apagado.

**Lo que sigue en manos de David:** el cargador (uno genuino Lenovo más potente) y **encender el canal de avisos**
al móvil, que es la razón de que esto no se supiera. Mientras tanto, comprobación manual del servidor cada vez que
se toque algo de la flota.



## ★★★★★ DeepSeek, 23/10, 14:50 — el diario de lotes, podado y compactado (decisión de David)

David: «si son datos que no se van a usar, elimínalo todo; no borres datos necesarios para el funcionamiento
correcto». Se enciende la poda a **7 días** (el mínimo que permite la función) y se ejecuta ya.

- **Podado**: 18.462.654 filas de **13.152 lotes** (todo el diario con más de 7 días). Quedan **53 filas**
  del único lote de la última semana. Se hizo en 11 tandas de ~2 M de filas (lote entero o nada).
- **Compactado**: `vacuum (full, analyze) ops.batch_cambio` en **33,7 s** (252.176 versiones retirables en
  794.365 páginas). La tabla pasa de **7.365 MB a 64 kB**; la base, de **23 GB a 16 GB**.
- **Queda encendida**: `diario_lote_dias` = 7; `ops.purga()` de cada noche poda una tanda. El resumen ya
  solo enseña los 53 de menos de 7 días.

**Qué NO se ha tocado** (comprobado): `core.*`, `analytics.*`, las colas `descargas-*` y los HTML/JSON
archivados de las actas. El diario era solo el «cómo estaba esto antes del lote» para `--revertir`; los
datos de fútbol y la evidencia de ingesta siguen enteros. Lo que se pierde es el `--revertir` exacto de
lotes de hace más de una semana; la vía sigue siendo retirar el grupo y reimportarlo.

**Nota de disco**: dentro de PostgreSQL se han recuperado ~7 GB. El fichero de la máquina virtual de Docker
(`docker_data.vhdx`) **no encoge solo**; recuperar ese espacio en `D:` exigiría parar Docker y compactar el
disco virtual, que no se ha hecho (no hace falta: D: tiene 332 GB libres).

## ★★★★★ DeepSeek, 23/10, 14:30 — 0049 y 0050 revisadas, aplicadas en la base real y comiteadas (T15 y T16)

Las dos de Claude (bloque de las 14:05 de abajo) estaban bien y no necesitaban cambios de código: **359
comprobaciones ✓** (m29-m50 + análisis), las migraciones **0023-0050 aplicadas dos veces sin error**,
`tsc` de la web ✓, `consultas.test.ts` 32 ✓ y `pnpm planes` ✓ (todo dentro de presupuesto). Aplicadas a la
base real tras **copia verificada** (`canonico-20261023-1214.dump`, 0,85 GB, 93 tablas, sha256 `cd837f90…`).
Commit `776e087`.

### 0049 · Cuánto ocupa el diario de lotes (medido en la base real, 11,4 s)

| antigüedad del lote | lotes | filas | % |
|---|---|---|---|
| menos de 7 días | 1 | 53 | 0,0 |
| 7-30 días | 13.146 | 18.367.973 | 99,5 |
| 30-90 días | 6 | 94.681 | 0,5 |
| más de 90 días | 0 | 0 | 0,0 |

Detalle fino: **7-10 días 12,28 M** (5.854 lotes), **10-14 días 5,40 M** (5.907), **21-30 días 0,68 M**
(1.385). La poda está **APAGADA**: `diario_lote_dias` = 0 y `ops.purga_diario_lotes()` devuelve `apagado`.

**Matiz importante para la decisión de los 30 días:** con 30 días **no se liberan los 7,3 GB ahora**. El
99,5 % del diario es de lotes de hace 7-14 días, así que hoy solo se podarían 94.681 filas (0,5 %) y el
`vacuum full` recuperaría eso, no los 7 GB. Con 14 días se podarían 6,2 M (33 %); con **10 días, 18,4 M
(99,5 %)**; con 7 días, todo menos 53 filas. Dos caminos:

- **Recuperar disco ya:** bajar a 7-10 días, podar por tandas y `vacuum full ops.batch_cambio` de noche con el
  importador parado (bloquea la tabla mientras dura).
- **Solo dejar de crecer:** 30 días. Lo de hoy se irá pudiendo podar dentro de ~3 semanas y el `vacuum full`
  tendrá sentido entonces.

### 0050 · El rol de la web con cuenta, comprobado en la base real

Con `DATABASE_URL_APP` (`facylf_app`, clave local fijada con `ALTER ROLE`): lee `app.notificacion`,
`app.usuario`, `core.match`, `analytics.player_team_season_summary`, `ops.alerta` y **`ops.chequeos()` (67
chequeos)**; **no** escribe en `core.federation` y **no** puede `set role facylf_lector`. En el código, las
21 consultas de usuario y panel llevan `rol: 'app'` y `conexion.ts` elige el pool; lo público sigue por el
lector. `DATABASE_URL_APP` añadida a `.env` (local), `.env.example` y `docker/web.yml` (opcional: sin ella la
web pública arranca y las páginas de cuenta dicen qué falta).

**Detalle de operación:** las migraciones que tocan **roles** son de **clúster**, no de base. Aplicar la 0050
en `facylf_prueba` ya activó la herencia de `facylf_app` en el clúster entero (por eso al aplicarla en
`facylf` salió «already granted»). No rompe nada, pero conviene saberlo: una prueba en otra base puede tocar
los roles de la base buena.

## ★ Claude, 23/10, 14:10 — la «pausa de 3 s» de Madrid no es un fallo

En `recolector-valencia.mjs` (`Ritmo.antes`), la espera se cuenta desde el **inicio** de la petición anterior: `espera =
iniciada_en + mínimo + azar − ahora`. «Pausa respetuosa de 3 s» quiere decir que la petición anterior y su análisis
ya gastaron 2-4 s. De inicio a inicio siguen pasando 5-7 s, el ritmo configurado, y el propio `Ritmo` se niega a
arrancar con un mínimo por debajo de 4 s. Para comprobarlo con datos: `scripts/claude/intervalos-peticiones.mjs` sobre
la cola de Madrid (mide entre `iniciada_en`); debe salir 0 intervalos por debajo de 4 s. **No hay que cambiar nada.**
Madrid y Valencia relanzadas por DeepSeek con el arreglo (532 y 8 actas suspendidas recalificadas): bien.

## ★★★★ DeepSeek, 23/10, 14:05 — Madrid y Valencia relanzadas, y el historial se queda como está

### Decisión sobre el historial de GitHub: **se queda como está**

El repositorio es **privado** y el código actual ya está limpio (commit `c8f694f`). Los nombres reales sólo quedan
en commits ya publicados. Reescribir 50 commits y hacer `push --force` sustituye lo publicado y puede salir mal; el
riesgo es mayor que el beneficio. **Condición para revisarlo:** si el repositorio deja de ser privado o se comparte
con alguien, se reescribe **antes**, con copia previa (`git bundle`) y avisando a quien tenga un clon.

### Madrid y Valencia: relanzadas (sólo esas dos)

Estaban colgadas de la sesión de ayer a las 22:53 y no usan Chrome, así que el relanzamiento por turnos no las
tocaba. Como son **hijas del supervisor de la flota** (pid 30960), se relanzan solas al terminar: maté sus dos
procesos y el supervisor las volvió a arrancar con el código nuevo, sin duplicar ningún worker.

| | Valencia | Madrid |
|---|---|---|
| pid nuevo | 31584 (13:52:28) | 24752 (13:52:32) |
| **suspendidas** | **· 532 actas** dejan de figurar como 0-0 (marcador nulo, «administrativa») | **· 8 actas** |
| ritmo | 10-14 s por petición ✓ | 5-7 s por petición ✓ |
| después | recogiendo con normalidad (índice de jornadas) | recogiendo actas con normalidad |
| errores al arrancar | ninguno | ninguno |

Sin duplicados (un proceso por federación) y el supervisor sigue anotando sus arranques en `worker-programado.log`.
Con esto **ya se pueden reimportar** a la base principal cuando Cataluña acabe (mañana por la noche), no antes.

Detalle a vigilar, sin tocar nada: en el arranque de Madrid se vio una pausa de **3 s** entre dos peticiones; su
ritmo configurado es 5-7 s y el resto de pausas son de 5-7 s. Si se repite, mirarlo con
`scripts/claude/intervalos-peticiones.mjs` (la regla es cero intervalos por debajo de 4 s).

**Confirmado con datos y cerrado (23/10, 14:20).** No es un fallo y no hay nada que cambiar: Claude tiene razón, el
recolector cuenta la espera **desde que empezó** la petición anterior, así que «pausa de 3 s» significa que esa
petición y su análisis ya tardaron 2-3 s; de una petición a la siguiente siguen pasando 5-7 s. Además el recolector
no arranca con un mínimo por debajo de 4 s. Medido ahora con `intervalos-peticiones.mjs` sobre la última hora:

| federación | peticiones | p10 | mediana | p90 | **menores de 4 s** | silencios > 60 s |
|---|---|---|---|---|---|---|
| madrid | 426 | 5,2 s | 6,3 s | 7,0 s | **0** | 2 (9 min) |
| valencia | 253 | 10,6 s | 12,4 s | 13,9 s | **0** | 2 (7 min) |
| cataluna | 397 | 6,2 s | 7,2 s | 12,5 s | **0** | 3 (5 min) |
| andalucia | 286 | 6,3 s | 7,2 s | 9,2 s | **0** | 7 (16 min) |

Los silencios son las paradas respetuosas tras un error o el hueco entre vueltas, no atascos.

### Subido a GitHub (23/10, 14:20) — y el CI **no arranca por facturación, no por el código**

- `git push origin main`: **`93bc80e..d3ca697`**, 0 commits pendientes. Los 52 commits están en
  `https://github.com/ErDeivih/facylf` (privado), con el árbol limpio y **sin nombres reales en el código actual**.
- **El CI no ha podido ejecutarse**: los tres trabajos (`pruebas de la aplicación`, `pruebas SQL (PostgreSQL
  embebido, m29-m45 y análisis)` y `migraciones sobre PostgreSQL 18 real`) **se registran con su nombre** —o sea,
  el flujo está bien escrito y se lee— pero **no llegan a arrancar**: «*The job was not started because recent
  account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans'
  section in your settings*» (run `39950272200`, 3 s).
- **Es cosa de la cuenta, no del repositorio**: GitHub → *Settings → Billing and plans*, arreglar el pago o subir
  el límite de gasto (los repositorios privados consumen minutos de Actions). Hasta entonces, la garantía de que
  el código pasa las pruebas es la de esta máquina: `pnpm test` 630/634 (los 3 fallos eran de tiempo y ya están
  arreglados: el de `/canonico` por la 0047 y los de `retirada.test.ts` por la consulta con `= any (array(…))`),
  `scripts/lib` 219 ✓, lint ✓, tsc de la web ✓ y **346 comprobaciones SQL ✓**.
- Los runs anteriores (21/09) también fallaron: **el CI lleva sin dar servicio desde septiembre**. Cuando se
  arregle la facturación, hay que mirar los cuatro trabajos de este primer run de verdad.



## ★★★★★ Claude, 23/10, 14:05 — dos cosas de tu revisión, hechas: diario de lotes y rol de la web

**Sin commit** (los dejo para que los revises y los incluyas tú). Probado en PGlite: **359 comprobaciones** (m29-m50 +
análisis), y las dos migraciones aplicadas dos veces sin error. Nada aplicado a la base real.

1. **`0049-retencion-del-diario-de-lotes.sql`** (+ `m49.mjs`, 7 ✓) — tu hallazgo de `ops.batch_cambio` (18,4 M / 7,3 GB).
   No es una fuga: el importador ya poda el diario de un grupo al reimportarlo y guarda entero el del ÚLTIMO lote de
   cada grupo (lo que permite `--revertir`). Añado:
   - `ops.diario_lotes_resumen()`: cuánto ocupa por antigüedad del lote (para decidir con cifras);
   - `ops.poda_diario_lotes(dias, max_filas, aplicar)`: lotes validados/publicados más viejos que `dias`, **lote entero
     o nada**, en tandas, con la marca `validacion.diario = 'podado'`; nunca en curso, fallidos ni revertidos;
   - parámetro `diario_lote_dias` = **0 (apagado)**: `ops.purga()` no poda nada hasta que David lo encienda (≥ 7).
   - `packages/canonico/src/reversion.ts`: `--revertir` de un lote podado explica por qué ya no se puede (antes diría
     que «lo sustituyó otro lote»).
   - Liberar el disco de verdad exige `vacuum full ops.batch_cambio` (bloquea la tabla): de noche y con el importador
     parado, y sólo después de encender la poda.
2. **`0050-rol-de-la-web-con-cuenta.sql`** (+ `m50.mjs`, 6 ✓) — tu decisión del «segundo pool con `facylf_app`».
   Medido con `m50.mjs` (cada consulta con su rol): con `facylf_app` fallaban las consultas del panel que mezclan cuentas
   con el modelo de lectura (`admin-casos-lista`, `admin-chequeos-ahora`, `admin-procesos`) y TODAS las públicas.
   - `grant facylf_lector to facylf_app with inherit true, set false` (los roles son NOINHERIT a propósito: la herencia
     se activa sólo en esta concesión y sin poder hacerse pasar por el lector), `select` en `app.estado_generador`,
     `ops.alerta`, `ops.copia`, y `ops.chequeos()` como `security definer` ejecutable por la web.
   - `contratos.ts`: `rol?: 'lector' | 'app'`; `rol: 'app'` en las 19 consultas de `admin.ts` y las 2 de `usuario.ts`.
   - `adaptadores/postgres/conexion.ts`: segundo pool (`DATABASE_URL_APP`, que rechaza publicador/administrador),
     `consulta(…, { rol })` y `ejecutaConsulta(c, params)`, que elige el rol del contrato. Lo público no cambia.
   - Ahora `m50` comprueba en cada cambio que ninguna consulta se queda sin permiso con su rol, que el lector no ve
     cuentas ni avisos y que la web no escribe en `core`.

**Para ti:** T15 y T16 en la tabla de `ENCARGO-DEEPSEEK-2026-10-23.md` §4 (aplicar 0049 y 0050, pegar el resumen del
diario y las tres comprobaciones de rol). CI: `test.yml` ya pasa m49 y m50. Encender la poda = David.

## ★★★★★ DeepSeek, 23/10, 12:55 — las pruebas SQL ya se ejecutan en Windows, nombres fuera y `shm_size` hecho

### Lo que pidió Claude y está comprobado

1. **`pruebas/sql/m29.mjs` arreglado por Claude (`pathToFileURL`): funciona.** Las 20 suites ejecutadas
   **nativamente en este PC, sin lanzador externo**, una detrás de otra: **0 ficheros en blanco y 0 «FALLOS»**.
   Totales: m29 51 · m30 9 · m31 19 · m32 11 · m33 6 · m34 3 · m35 31 · m36 11 · m37 27 · m38 15 · m39 5 · m40 7 ·
   m41 11 · m42 19 · m43 33 · m44 8 · m45 8 · **m46 41** · **m47 19** · analisis 12 ⇒ **346 comprobaciones**, todas
   «TODO OK». (m38 sube a 15 porque le añadí las dos de la 0046, y m46/m47 son nuevas.)
2. **Nombres reales fuera del árbol** (commit `c8f694f`): las pruebas del parser de acta llevaban dentro nombres de
   jugadores, de un entrenador y del árbitro de un acta de verdad, y un comentario de `scripts/informe-equipo.mjs`
   citaba a un jugador con nombre y apellidos. Ahora son «APELLIDO UNO, NOMBRE UNO», «JUGADORA DOS»…, como en las
   pruebas de Cataluña. El formato del acta no cambia: **20 de 20 pruebas en verde** después del cambio.
   - **Lo que no puedo arreglar yo:** esos mismos nombres **ya están en commits publicados** antes de hoy
     (`BONILLA GARCIA` 3 veces, `CALVO LÓPEZ` 2… en `origin/main`). El commit de hoy los limpia de aquí en
     adelante, no del historial. Borrarlos del historial exige reescribir 49 commits y `push --force`: **no lo
     hago sin que David lo diga**. Dato para decidir: **el repositorio de GitHub es PRIVADO** (`gh repo view`
     → `"isPrivate":true`).
3. **`shm_size: 1gb` en `infra/docker-compose.yml`** (commit `7eeccda`): Docker daba 64 MB a `/dev/shm` y las
   consultas en paralelo fallaban con «could not resize shared memory segment». Recreado **sólo el servicio de la
   base** (`up -d postgres`; datos intactos en el volumen): `ShmSize` 1073741824 ✓, contenedor sano, **48
   migraciones**, y una consulta con tres procesos en paralelo sobre las **19.466.066 apariciones** termina sin
   error.

### Las decisiones de esta ronda (David me las dejó a mí)

- **No se reimporta nada todavía**: Cataluña sigue releyendo 2026-27 (hasta mañana por la noche) y Madrid y
  Valencia no se han relanzado con `recalificaSuspendidas` ni con las actas abiertas. Cuando estén, se reimporta
  con `importar-temporada.ps1`, y **después** se limpian las personas huérfanas (hoy **368**, crecerán).
- **Las 368 personas huérfanas no se tocan** (ni de `core` ni del buscador) hasta que David lo apruebe.
- **Posiciones y capitán, no**: el recorrido de los JSON archivados son horas (Valencia ~100 k actas); se hace en
  una noche libre, no ahora que la máquina está recogiendo.
- **Rol para la fase C:** cuando toque, un **segundo pool con `facylf_app`** para las páginas autenticadas
  (`bandeja-avisos`, panel de invitaciones y auditoría), y `facylf_lector` sólo para lo público. Es lo coherente
  con «la web no escribe en `core`»: hoy la web no puede leer `app.notificacion` con el rol de lectura y
  `planes.mjs` omite, diciéndolo, esas consultas.
- **El `push` sigue esperando a David**: **49 commits** por delante de `origin/main`, con R1-R3 en verde y el
  repositorio en privado.



> **★★ AVISO DE CONCURRENCIA (23/10, 12:10).** Mientras hago esto hay **otra sesión de Claude trabajando en este
> mismo repositorio** (tarea programada «FACyLF enlace Claude», última pasada 11:34): **aplicó 0023-0046 a la base
> real** y escribió **0047-recuento-del-canonico.sql** (ya aplicada) y el cambio de `scripts/proyectar-lectura.mjs`
> (el `/canonico` contaba 19,5 M de apariciones en cada visita y agotaba los 20 s). Por eso **la fase A está a
> medias y en marcha**: no lances migraciones ni la proyección a ciegas; mira `estado/claude/` y `tmp/a3-*.log`
> antes. Los commits son locales y no incluyen lo suyo a medias (0047, `m47.mjs`, README de `pruebas/sql` y
> `proyectar-lectura.mjs` se quedan fuera a propósito hasta que esa sesión termine).

## ★★★★ Revisión de Claude, 23/10, 12:00 — sobre los bloques de DeepSeek de las 12:10 y 12:35

**Bien hecho, comprobado por encima:**
- R1-R7, 0046-0048 y la proyección medida (≈0,5 s por grupo en limpio).
- Los commits: 14 nuevos, 45 por delante de `origin`. Lo de Cataluña, Madrid/Valencia, el vigía y `crudo-vs-cola.mjs` está dentro.
- El perfil de las 8 del servidor (0046) cuadra con `COBERTURA-FEDERACIONES.md` §2.

**Arreglado por Claude ahora:**
- `pruebas/sql/m29.mjs`: el guard `import.meta.url === file://${argv[1]}` no coincide nunca en Windows, así que todas las pruebas SQL que lo importan salían con código 0 sin probar nada.
- Ahora compara con `pathToFileURL(process.argv[1]).href`.
- **Hay que volver a pasar m29-m47 en el PC sin el lanzador externo** y confirmar que salen «TODO OK» y no en blanco.

**Antes de `git push` (decide David):**
- En los commits por subir hay **nombres reales de personas**:
  - en `packages/ingesta/test/acta.test.ts` (fragmentos de actas y `assert` con un jugador);
  - en algunos comentarios de `scripts/` (p. ej. «medido en Victoria: …»).
- No he podido comprobar si alguno es menor ni si el repositorio de GitHub es privado.
- Si es público, o si hay dudas: anonimizar esas pruebas y esos comentarios (como `scripts/lib/acta-cataluna.test.mjs`, que usa «JUGADOR N») antes de subir. Si es privado, el riesgo es menor, pero la regla del proyecto es que los nombres de menores no salen del PC.

**T5 (reimportar Cataluña/Madrid/Valencia): todavía NO.**
- Cataluña sigue releyendo 2026-27 (~2 días desde el 22/10, 21:49).
- Madrid y Valencia siguen con la sesión del 22/10 a las 22:53: aún no han corrido `recalificaSuspendidas` ni las actas abiertas releídas.
- Reimportar después, con `importar-temporada.ps1` (traspaso §2 T5).
- Las **368 personas huérfanas** de T14 crecerán tras reimportar Cataluña; se limpian juntas, con permiso de David.

**13:50 — Madrid y Valencia siguen con la sesión del 22/10 a las 22:53** (más de 15 h). Al no usar Chrome, el
supervisor no las recicla por turno, así que **no cargan el código nuevo** (actas abiertas y suspendidos) hasta que
se relancen. **Tarea para DeepSeek:** relanzar sólo esas dos sin tocar las demás (p. ej. parar sus procesos `node
scripts/recolector-madrid.mjs` / `recolector-valencia.mjs`; el supervisor los vuelve a arrancar).
Al arrancar deben imprimir «· N actas de partidos suspendidos dejan de figurar como 0-0» (en Valencia, cientos) y
ningún error. Después ya se puede hacer la T5 de Madrid y Valencia. Cataluña: 0 iconos desconocidos y 0 errores.

**De acuerdo con:** `shm_size: 1gb` en `infra/docker-compose.yml` (lo decide David) y no aplicar posiciones/capitán hasta que haya noche libre.

## ★★★★ DeepSeek, 23/10, 12:35 — remate de la fase A: 0048, proyección medida y dos pruebas arregladas

> **Corrección al bloque de las 12:10 (leerlo con esto).** 0024, 0025 y 0029 **sí son repetibles** desde las
> 10:45: se corrigieron *antes* de aplicarse (0024 y 0029 con `drop view if exists` —nada depende de esas
> vistas—, 0025 con `drop constraint if exists`), y la segunda pasada de **0023-0047 entera** termina sin un
> error. La afirmación de que haría falta `drop view … cascade` es de antes de la corrección. El CI ya
> comprueba desde 0023, no desde 0035.

### 0048 · Faltaban permisos del proyector (la primera proyección se caía al final)

La proyección de los 48 grupos de Canarias escribió los grupos y **falló después**:
`permission denied for table frecuencia_nombre`. Las funciones de recálculo son `security invoker` y vacían
sus tablas con `TRUNCATE`; `facylf_publicador` tenía `DELETE/INSERT/UPDATE` pero no `TRUNCATE` en cinco de
ellas (sólo `analytics.ojeo_jugador` lo tenía desde 0036). **`0048-permisos-del-proyector.sql`** concede
`TRUNCATE` en `frecuencia_nombre`, `linea_equipo_temporada`, `zona_familia`, `arbitro_persona` y
`arbitro_temporada`. Aplicada en la base real.

Y el cierre de pasada no cabía en 120 s: `analytics.recalcula_arbitros()` tardó **177 s** con 1,2 M de
partidos (y `recalcula_evolucion` 27 s, `detecta_casos` 34 s). `proyectar-lectura.mjs` sube a **600 s** sólo
para los cierres; la proyección de cada grupo sigue con 120 s.

### La proyección, medida en limpio

- **Melilla, 20 grupos: 9,2 s (~0,46 s por grupo)** con pausa de 100 ms, identidad incluida. Los 4,9 s/grupo
  que salían en Canarias eran **contención** con las pruebas que limpiaban el canónico a la vez (139
  `delete from core.appearance …` de 10,5 s de media en `pg_stat_statements`).
- Extrapolación: 40.399 grupos pendientes ≈ **5-7 h** con esta máquina; sigue siendo trabajo de noche, por
  federaciones y con `--sin-globales`, y un cierre global al final.
- Hecho: **Canarias (48) y Melilla (888)** proyectadas; el resto queda pendiente y anotado.

### Dos pruebas que fallaban por tamaño, no por lógica

- `apps/web/test/consultas.test.ts`: el resumen tardaba >20 s porque contaba 19,5 M de apariciones. Con la
  0047 lee una fila: **399 ms**, y el fichero entero pasa en 23 s (32 bien, 1 omitida).
- `packages/canonico/test/retirada.test.ts`: la limpieza del ámbito lanzaba `delete … in (select …)` sobre
  tablas de 18,4 M de filas; PostgreSQL estimaba miles de lotes de la federación de pruebas y **recorría
  `ops.batch_cambio` entera (45 s por limpieza, 6 limpiezas)**. Cambiado a `= any (array(…))`, que usa el
  índice: **6 de 6 en 30 s**.
- La 0047 sólo recalcula los recuentos en las pasadas completas: el proyector de cada 15 min
  (`--sin-globales`) no paga los ~50 s de contar.

### Estado de T3 y lo que queda

| Paso | Estado |
|---|---|
| Copia antes de tocar | ✓ `canonico-20261023-0850.dump`, 0,84 GB, índice legible, 38 tablas |
| `pnpm db:migrar` | ✓ 0023-0048 aplicadas (0 pendientes) |
| Unir clubes por letra de filial | ✓ 6.086 clubes borrados, 12.828 equipos-temporada movidos; segunda pasada 0 |
| Reclasificar ediciones | ✓ 9.250 ediciones (división, nivel y provincia) |
| Posiciones y capitán | ✗ pendiente: el recorrido de JSON archivados es de horas (Valencia ~100 k actas); medido y **sin aplicar** |
| Proyección | parcial: Canarias y Melilla; el resto, de noche |
| `planes --guardar` | ✓ todas las consultas medidas y dentro de presupuesto (60 planes guardados; `pnpm planes` verde) |
| T14 personas huérfanas | **368** medidas; no se borra nada sin permiso de David (`core` no se toca) |

**Riesgo nuevo, para David:** el contenedor tiene `/dev/shm` de **64 MB** (el valor por defecto de Docker) y
alguna consulta paralela falla con «could not resize shared memory segment … No space left on device». La
solución es `shm_size: 1gb` en `infra/docker-compose.yml`, que **no toco sin su permiso**. Mientras tanto, si
una consulta grande falla así, se puede lanzar con `set max_parallel_workers_per_gather = 0`.

**Y una decisión de la fase C:** la web usa `DATABASE_URL_LECTOR` (`facylf_lector`) para todo, pero
`bandeja-avisos` lee `app.notificacion` y las consultas del panel leen `app.invitacion` y `app.auditoria`,
donde ese rol **no tiene SELECT** (sólo `facylf_app`). Hay que elegir: un segundo pool con `facylf_app` para
las páginas autenticadas (coherente con «la web no escribe en core») o dar SELECT a `facylf_lector` en las
tablas de usuario. Hoy `planes.mjs` mide las de usuario con el rol de publicación y omite, diciéndolo, las que
no puede ver.

## ★★★★ DeepSeek, 23/10, 12:10 — R1-R7 PASADAS (la primera contra PostgreSQL 18 de verdad), 0046 y los commits

### R2 · Migraciones en un PostgreSQL 18 limpio, dos veces ✓ (lo que Claude no pudo hacer)

`postgres:18` de este PC es **PostgreSQL 18.6** con `pg_stat_statements`, `pg_trgm` y `unaccent`. Base nueva
`facylf_prueba` en el mismo contenedor (la de verdad no se tocó) y las 45 migraciones aplicadas en orden con
`psql -v ON_ERROR_STOP=1`:

- **Pasada 1: 45 ficheros, 0 errores, 46 s.** Incluye 0030/0035 (extensión y `pg_monitor`) y 0041/0045 (relleno de
  los índices del buscador: rápido porque la base está vacía).
- **Pasada 2: 16 ficheros con error, y ninguno de ellos importa para aplicar de verdad.** Son 0002-0012, 0016-0018,
  **0024**, 0025 y **0029**: `relation ... already exists` (no llevan `if not exists`) y, en 0024 y 0029,
  `cannot change name of column` / `cannot change data type of column` porque hacen `create or replace view ...
  select s.*` y las migraciones posteriores **añaden columnas** a esa vista base: al repetir, el `s.*` ya no
  encaja. **Las 0035-0045 se reaplican todas sin un solo error** (que es justo lo que comprueba el trabajo
  `migraciones` del CI). **(Corregido en el bloque de las 12:35: 0024, 0025 y 0029 sí se hicieron repetibles a
  las 10:45 —`drop view/constraint if exists`— y la segunda pasada de 0023-0047 entera termina sin errores; el
  CI ya comprueba desde 0023, no desde 0035.)** No toco 0024/0029 porque
  arreglarlo exige `drop view ... cascade` y eso arrastraría vistas dependientes: riesgo alto y beneficio nulo
  (el runner nunca reaplica una migración ya anotada en `ops.migracion`).
- Humo en la base limpia: `ops.chequeos()` = **42** y `analytics.avisos_de_datos('madrid')` responde.

### R3 · Pruebas SQL ✓ — y un aviso: **en Windows no se ejecutaban**

Las `pruebas/sql/*.mjs` sólo arrancan si `import.meta.url === \`file://${process.argv[1]}\``, y en Windows
`argv[1]` es `F:\...\m29.mjs`, no una URL: **el fichero se importa y no hace nada** (sale con código 0 y sin
salida). Las he lanzado con un lanzador de `%TEMP%` que arregla `argv[1]` sin tocar el repositorio.

- **m29 … m45 + analisis: 285 comprobaciones, todas «TODO OK», 0 rojas** (51+9+19+11+6+3+31+11+27+14+5+7+11+19+33+8+8+12).
- **m46 (nueva, con 0046): 41 comprobaciones, TODO OK.**
- **Banco de volumen:** `volumen.mjs F:\tmp\facylf-volumen 14` → 180 grupos, **32.760 partidos, 685.440
  apariciones, 210.031 eventos, 33.060 personas**, 354 s, ~1,14 GB. Cuadra con lo que dijo Claude.
- **Rendimiento:** `rendimiento.mjs` → **«66 consultas · 0 a revisar»** ✓ (todas dentro de presupuesto).
- PGlite 0.5.11 instalado **fuera del repositorio** (`%TEMP%\pglite05`) y enlazado con una unión en
  `node_modules/@electric-sql` (ignorado por Git).

> **⚠ Lo que me cargué y repuse (para que no vuelva a pasar).** Mi primer bucle pasaba a cada prueba la ruta del
> fichero como `argv[2]`; `volumen.mjs` usa `argv[2]` como **carpeta de salida** y hace `rmSync` de ella: borró su
> propio fichero y creó una base de 1,26 GB en `pruebas/sql/volumen.mjs/`. Restaurado **byte a byte** desde
> `tmp/sql-pruebas/volumen.mjs` (11.199 bytes, idéntico) y borrada la carpeta. **Regla nueva: a
> `volumen.mjs`/`rendimiento.mjs` se les pasa SIEMPRE una carpeta de datos explícita, nunca su propio camino.**

### R1 · Las pruebas de siempre ✓ con matices (los 3 fallos son de tiempo, no de datos)

- `node --test scripts/lib/*.test.mjs` → **219 pruebas, 219 bien, 0 fallos**.
- `pnpm lint` (`tsc -b` dominio+ingesta+canónico) → **verde**.
- `pnpm --filter @facylf/web exec tsc --noEmit` → **verde**.
- `pnpm test` → **630 bien, 3 mal, 1 omitida de 634 (1.270 s)**. Los 3 son **tiempos agotados con la base real
  ocupada** (importador + 19 recolectores + mis pruebas): (1) `consultas.test.ts · el resumen…` supera el
  presupuesto de 20 s **porque cuenta 19,5 M de apariciones** — es exactamente lo que arregla la 0047 que está
  escribiendo la otra sesión; (2-3) `retirada.test.ts` agota los 90 s de *hook* (otros casos del mismo fichero
  pasan en 79,6 s: están al límite). Al repetir esos dos ficheros solos: 33 bien y **1** fallo de 90 s. Ninguno es
  de la entrega (retirada.test.ts viene de antes y no está modificado).

### R5 · Scripts ✓ · R7 · CI ✓ · R4 · Lectura del código ✓ (lo comprobable sin releer 5.375 líneas)

- `node --check` de los 10 scripts de la plataforma: **todos ok**.
- `grep -n '\\' apps/web/src/consultas/*.ts` → **nada**: ninguna plantilla lleva barra invertida dentro del SQL.
- Migraciones 0023-0046: **5.375 líneas**; `facylf_app` sólo recibe `select` sobre lo leído y escritura en `app.*`
  (su esquema), `execute` de funciones y nada de escritura en `core`; `ver_menores_nombres` aparece en 6 sitios.
- CI: copiados `test.yml` (cuatro trabajos) y `rendimiento.yml` a `.github/workflows/`; `ingesta.yml` intacto.

### T6 · Las ocho federaciones del servidor ya no dicen «sin medir» ✓ (hecho entero)

**`infra/migraciones/0046-perfil-de-las-ocho-del-servidor.sql`** (nueva): rellena `codigo_jugador`, `medido_en =
'2026-10-23'` y la `nota` de Aragón (87 %), Asturias (100 %), Baleares (97 %), Cantabria (99 %), Castilla-La Mancha
(100 %), Extremadura (**false**, 42 %), Galicia (**true**, 74 %) y Murcia (**false**, 35 %), con las cifras de
`COBERTURA-FEDERACIONES.md` §2. **Lo que no se midió sigue NULL** (árbitros unidos, «convocados», posiciones,
sistema, capitán, fotos): desconocido no es «no». Los avisos de cambios, tarjetas y minuto de gol no se tocan:
salen de `analytics.edicion_capacidad`, que es lo medido por competición.
Comprobado: **repetible** (dos veces en PostgreSQL 18 real, sin error), `pruebas/sql/m46.mjs` (**41 ✓**) y en la
base de verdad `avisos_de_datos('extremadura')` = `identidad_por_nombre` y **0 federaciones sin medir**.
Tuve que ajustar dos comprobaciones de `m38.mjs` (daban por hecho las 8 sin medir y que Aragón sólo decía
«sin_medir»; ahora comprueban lo contrario y que los rasgos no medidos siguen NULL).

### T2 · Los commits ✓ — once, locales, sin `push`

`git log --oneline` (de abajo arriba): `543827d` .gitignore · `f9f4241` migraciones 0016-0022 + pruebas del
canónico · `7626c55` **0023-0046 + `pruebas/sql`** · `85632c8` consultas de la web · `088d922` pantallas de la web
· `94e2168` scripts de plataforma · `290b943` recolectores/ingesta/canónico (488 ficheros) · `f5f7f64`
documentación · `3c5945b` CI · `6ad8cbc` configuración de las máquinas · `429d016` ignorar la evidencia de
reconstrucción.

Criterio que he aplicado (y por qué): **sólo código, migraciones, configuración y documentos**. Se quedan fuera
—y está anotado— los `.txt/.json/.log/.html/.pdf` de evidencia (1.323 en `pruebas/reconstruccion/salidas/`, 408 en
`canonico/`, 11 planes en `pruebas/planes/`, 54 fixtures de `scripts/multideporte/` con datos de otras webs), que
además pueden llevar nombres. **No se ha subido nada a GitHub** (`git push` lo decide David; la regla de menores
lo exige).

Dos matices de esos commits, para que conste: la **0047 y `m47.mjs`** (de la otra sesión, ya aplicada en la base)
entraron al final en un decimotercer commit (`520d343`), comprobadas dos veces en PostgreSQL 18 limpio; y
`pruebas/sql/README.md` y `scripts/proyectar-lectura.mjs` se colaron en los commits de documentación y de
recolectores (los alcanzaron los comodines `*.md` y `scripts/*.mjs`) aunque mi mensaje del commit de plataforma
decía lo contrario: están subidos, que es lo correcto, y quedan comprobados (`node --check`).


### Lo que NO he hecho, y por qué

| # | Estado | Motivo |
|---|---|---|
| T3 (fase A) | **a medias, y no por mí** | La otra sesión de Claude ya aplicó 0023-0046 a la base real y está con 0047. Faltan: unir clubes por letra de filial, reclasificar, posiciones, proyección nocturna completa, 6 comprobaciones de datos y `planes --guardar` |
| T4 (fase B) | no empezada | Avisos al móvil, tareas programadas, copia/restauración de prueba, presupuesto en la base real. Necesita T3 |
| T5 (ingesta) | **parcial**: despliegue al servidor ✓ y tareas viejas de Cataluña/CyL en marcha; reimportar Cataluña/Madrid/Valencia **después** de T3 y Cataluña historia pendientes | `TRASPASO-DEEPSEEK-2026-10-23.md` §2 (T4-T7) |
| T7-T14 | no empezadas | Fase C (pantallas nuevas con Better Auth), importador (penaltis, árbitro, posición), árbitros separados, PDF, afinados y personas huérfanas. Requieren T3/T4 cerradas |



> **GOAL vigente:** [`GOAL-DEEPSEEK.md`](GOAL-DEEPSEEK.md) — **Fase 3 (12/10/2026, tarde)**. Síguelo hasta cumplirlo. Antes, lee las «Revisión de Claude» de justo debajo, de la más nueva a la más vieja.

> **★ PARA CLAUDE:** todo lo que es suyo, en un solo documento → [`TRASPASO-CLAUDE-2026-10-12.md`](TRASPASO-CLAUDE-2026-10-12.md) (12/10/2026, 15 rondas). Con la evidencia pegada, lo que **NO** hay que perseguir, y cómo me equivoqué yo.

## ★★★★★ Claude, 23/10, 09:50 — EMPIEZA AQUÍ: revisar todo, hacer los commits y rematar · [`ENCARGO-DEEPSEEK-2026-10-23.md`](ENCARGO-DEEPSEEK-2026-10-23.md)

David (23/10, 09:07): DeepSeek revisa **todas las rondas y todo el código**, hace **los commits** (sí, ahora sí) y
remata lo que falte o lo deja especificado. Dos documentos, de dos sesiones de Claude, y se leen los dos:
1. [`ENCARGO-DEEPSEEK-2026-10-23.md`](ENCARGO-DEEPSEEK-2026-10-23.md): qué se hizo en la plataforma (migraciones
   **0023-0045**, consultas de la web, código de la fase C, scripts, 285 pruebas), la **revisión** R1-R7 (la primera:
   aplicar 0001-0045 dos veces en un PostgreSQL 18 limpio), **los commits** (qué no subir: enlaces `descargas-*`,
   salidas con nombres de personas, finales de línea; el push, con permiso de David) y las tareas T1-T14 con su
   «terminado».
2. [`TRASPASO-DEEPSEEK-2026-10-23.md`](TRASPASO-DEEPSEEK-2026-10-23.md): ingesta (despliegue al servidor, canal de
   avisos, reimportar Cataluña/Madrid/Valencia después de aplicar las migraciones, historia de Cataluña).

## ★★★★ Claude, 23/10, 09:30 — TRASPASO COMPLETO DE INGESTA: [`TRASPASO-DEEPSEEK-2026-10-23.md`](TRASPASO-DEEPSEEK-2026-10-23.md)

**Léelo antes que nada.** Resume y ordena todo lo hecho del 21 al 23/10 en recolectores, vigía, Cataluña,
Madrid/Valencia y la medida de las 17 federaciones:
- §1: qué está bien, qué se corrige solo, qué falta y qué es de la fuente.
- §2: las tareas en orden (T1 comprobaciones · T2 despliegue al servidor · T3 avisos al móvil · T4 plataforma ·
  T5 reimportar Cataluña/Madrid/Valencia · T6 historia de Cataluña · T7 tareas viejas), con comando, resultado
  esperado y qué hacer si falla.
- §4: revisiones periódicas.
- §5: lo que NO hay que perseguir.
- §6: los riesgos.

## ★★★ Claude, 22/10, 21:30 — rapidez de la base, usuarios, panel y perfiles de federación

Orden: [`PLAN-DEEPSEEK.md`](PLAN-DEEPSEEK.md) (migraciones ahora **0023-0038**; nuevas B7, C-rapidez y C-usuarios).
- **Rapidez (lo vital, según David):** banco de volumen inventado (33.000 partidos, 685.000 apariciones) y medida de
  las 55 consultas de la web → [`RENDIMIENTO-BASE.md`](RENDIMIENTO-BASE.md). El ojeo tardaba **93 s**; ahora 0,05 s
  (tabla precalculada `analytics.ojeo_jugador`, 0036). Proyección de grupo ×4, capacidad ×10, temporadas ×8, todo con
  resultado idéntico fila a fila. Caché de la web por etiquetas (`ops.invalidacion`). Reglas para consultas nuevas en §3.
- **Usuarios de punta a punta:** 0037 (perfil, preferencias, favoritos sin duplicados —arregla un fallo de 0031—,
  exportar mis datos, baja) y el código web en `docs/plataforma-web/codigo/`.
- **Panel y vigilancia:** `admin.ts` (13 consultas) y 0035 (chequeos de usuarios, avisos, casos, caché, publicidad).
- **Federaciones:** 0038 con el perfil de las 24 fuentes y `analytics.avisos_de_datos`. Recoge lo de Cataluña del
  bloque de abajo: los avisos salen de lo medido en cada competición y se irán solos al reimportar.
- Ingresos por visitas: [`INGRESOS.md`](INGRESOS.md). Pruebas: **180** en `pruebas/sql/` (m29-m38), todas en verde.

## ★★★ Claude, 22/10, 17:00 (ampliado 21:15) — Cataluña: actas completas y sin lecturas antes de tiempo; Madrid/Valencia

**Ya está en marcha en el PC** (el supervisor relanza el recolector cada hora con el código nuevo; medido en la
sesión de las 16:24: cada acta trae ~38 jugadores **con código**, 3-8 tarjetas y 9-14 cambios). Nada que desplegar
en el servidor (Cataluña es sólo del PC). Pruebas: `node --test scripts/lib/*.test.mjs` → 214, 0 fallos.

Qué estaba mal y qué se ha hecho (todo en `scripts/recolector-cataluna-datos.mjs` y `scripts/lib/acta-cataluna.mjs`):
1. **0 % tarjetas, 0 % cambios, 0 % códigos de jugador** en todas las actas de Cataluña. La FCF los pinta como
   iconos en la fila de cada jugador y el código va en las props de React: ahora se leen
   (`EXTRAE_ACTA` → `jugador`, `eventos`; `interpretaActa` → tarjetas, cambios emparejados por minuto, capitán,
   portero). `interpretaActa` vive ya en `lib/acta-cataluna.mjs` con su prueba (acta 4108648 anonimizada).
2. **Actas leídas antes de jugarse el partido** y dadas por hechas, vacías, para siempre (1.750 en 2026-27:
   partidos entre semana o aplazados; la cola encolaba por la fecha de la jornada). Ahora: el calendario guarda la
   fecha y hora **propias** de cada partido (prop `status`), la ficha guarda su estado («Pendent», «Acta Tancada»)
   y `decideActaSinJugar` aplaza el acta al día siguiente del partido en vez de darla por hecha (petición
   `resultado='sin_jugar'`, no cuenta como error). Las 1.750 ya volvieron a la cola (`reactivaActasLeidasAntesDeJugarse`).
3. **Descansos**: la FCF da código de acta al equipo que libra; 3.906 fichas siempre vacías salían de la cola
   (~35 h de recolector). Ya no se encolan; las que esperaban, `cancelado` con el motivo (reversible).
4. **Releer un calendario borraba hora, campo y árbitros** de sus partidos (sólo los da el acta). Ahora se reponen
   al releer, y lo perdido se recupera de las fichas en disco (`reponDetallesDesdeFichas`, 2.000 por `preparar`).
5. **Basura como dato**: «SENSE ÀRBITRES ASSIGNATS» como árbitro y «E» como campo (3.645 partidos) → vacíos.
6. **Fútbol 7/8/sala «a revisar»** por no tener 22 titulares: 12.434 actas corregidas (`evaluaCalidad`).

7. **Relectura de lo ya bajado (22/10, 17:30)**: las actas leídas antes de las 16:24 no tienen iconos guardados; sólo
   se recuperan volviéndolas a pedir. `reencolaActasSinIconos` (una vez, en `preparar`) devuelve a la cola las que
   tienen alineaciones: **2026-27 (~12.000) con su prioridad normal** (unos 2 días) y **2025-26 (~19.000) en un
   carril detrás de todo lo pendiente** (`CARRIL_RELECTURA`, que el reordenado respeta). El acta sigue «hecha»
   mientras tanto, y si una relectura viene SIN alineaciones (la FCF vacía con el tiempo algunas de menores) **se
   conserva lo guardado**: releer para enriquecer nunca empobrece.

8. **Madrid y Valencia (iSquad), el mismo fallo (22/10, noche)**: la ficha trae `acta_cerrada` y `partido_en_juego`
   y se ignoraban. Madrid 2026-27: 64 actas dadas por hechas con el acta ABIERTA (53 con el partido en juego), 47
   sin alineaciones, sin volver a pedirse nunca. Ahora (`lib/acta-abierta.mjs`, en `recolector-valencia.mjs`): con
   el acta abierta en la temporada en curso no se da por hecha; vuelve en 6 h si está en juego y al día siguiente
   si no (tope: 3 semanas tras el partido). Las 64 vuelven a la cola una vez (`reabreActasLeidasAbiertas`). Las
   PNFG no lo tienen (sus actas sólo se publican cerradas: 0 vacías leídas antes de tiempo en CyL, Bizkaia, Las Palmas).
9. **Vigía con menos falsas alarmas**: `calidad_actas` y `riqueza_actas` piden que la subida se vea en al menos dos
   competiciones; una sola es la fuente (hoy: DH Juvenil 2025-26 en Cataluña, nacional y vacía; benjamines 2019-20
   en CyL, que la FCyLF publica sin alineaciones) y sale como `calidad_una_competicion` (info, sin aviso).
   Y `lecturas_vacias` ya no cuenta las jornadas que un calendario PNFG apunta SIN sus partidos (llegan después
   con la página de cada jornada): era la falsa alarma de Araba del 22/10 a las 21:56 («388 de 650 vacías»).
10. **Comprobado en real (22/10, 21:49)**: el `preparar` de Cataluña devolvió 12.059 actas de 2026-27 y 20.995 de
   2025-26 a la cola; las primeras 98 relecturas salen con código (98), tarjetas (98) y cambios (97), sin errores.

11. **Partidos suspendidos como 0-0 (Valencia/Madrid, 23/10 02:00)**: la ficha de un suspendido trae «0-0» y ningún
   jugador; se guardaba como acta hecha 0-0 «sin alineaciones» (cientos en el fútbol sala base de Valencia 2026-27;
   es lo que disparó el aviso `calidad_actas` de Valencia: 43 % frente al 4 %). El calendario ya lo dejaba sin
   resultado, así que el canónico no tenía el 0-0, pero el acta sí. Ahora: marcador nulo, incidencia
   `partido_suspendido`, calidad «administrativa»; y las ya guardadas se corrigen una vez desde su JSON
   (`recalificaSuspendidas`). Comprobado en real: en el primer arranque de Madrid y Valencia tras el cambio,
   «64 actas leídas con el acta todavía abierta: vuelven a la cola» (Madrid) y 1 (Valencia), sin errores.

12. **Las 8 federaciones del servidor, medidas (23/10)**: filas nuevas en `COBERTURA-FEDERACIONES.md` §2 (2024-25).
   Con `scripts/claude/crudo-vs-cola.mjs` (HTML guardado frente a la cola, 14 casos) **todos los huecos son de la
   fuente**: Extremadura y Murcia sólo enlazan el código de ~4 de cada 10 jugadores; Galicia y Extremadura apuntan
   pocos cambios y tarjetas en base; CyL 2016-17 y 2018-19 sin tarjetas y Euskadi 2019-20 sin cambios en la web.
   Cataluña esta noche: 1.807 actas (relecturas incluidas), todas con código, 0 errores, 0 iconos desconocidos.

**Para DeepSeek cuando toque (no ahora; Claude no puede escribir en el canónico):**
- Reimportar Cataluña al canónico, cuando las relecturas de 2026-27 hayan pasado (≈ 2 días; se puede repetir, es
  idempotente): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/importar-temporada.ps1 -Federacion
  cataluna -Temporada 2026-27`, y lo mismo con 2025-26 al final de su carril. Comprobado en `packages/canonico/
  src/lote.ts`: los eventos se reescriben por (partido, orden) y desde el 13/10 las apariciones que el lote no
  confirma se retiran, así que el jugador nominal viejo no queda duplicado al lado del jugador con código (queda
  como persona sin apariciones). `importar-masivo.mjs` NO sirve para esto: da por hecha una unidad para siempre.
- Vigía: nueva regla `riqueza_actas` (cae la parte de actas con tarjetas/cambios/códigos frente a su semana).
- Medida rápida por federación: `node scripts/claude/riqueza-actas.mjs --todas --solo <feds>` (sólo cifras).

## ★★★ Claude, 22/10, 12:00 — usuarios, avisos, qué datos tiene cada federación

El orden sigue siendo [`PLAN-DEEPSEEK.md`](PLAN-DEEPSEEK.md) (actualizado: migraciones **0023-0034**, fase B5-B6, fase C con usuarios).
Nuevo y probado (100 comprobaciones en `pruebas/sql/`, m29-m34):
- `0031` registro (invitación / aprobación / abierto; hoy **sólo invitación**), favoritos de equipo, club,
  competición, grupo, jugador, árbitro, temporada y búsqueda (el equipo se guarda como **línea** y sigue de una
  temporada a otra), accesos rápidos (`app.mis_accesos`), avisos (partido programado, cambio de horario,
  resultado, acta, jugador seguido —sin nombre si es menor—, jornada completa) con tope por pasada e idempotentes.
- `0032` **capacidad de datos por competición y temporada**: dónde no se apuntan cambios, los minutos quedan
  **nulos** (no «titular = 90»); sin tarjetas no hay disciplina; sin minuto de gol no hay tramos. `version_metricas` = 3
  → todo se reproyecta. Casos de datos (`ops.caso_dato`) detectados solos, cerrados solos, revisables.
- `0033` publicidad preparada y **apagada**; nunca en páginas con menores, login, cuenta ni admin.
- `0034` auditoría de cada cambio de administración.
- `scripts/notificaciones.mjs` (push + correo, opcionales) y 2 tareas programadas más.
- Medido en las colas: [`COBERTURA-FEDERACIONES.md`](COBERTURA-FEDERACIONES.md) — Andalucía 2 % de actas con
  cambios, Ceuta 6 %, Melilla 12 %, Madrid/Valencia 23 %, Cataluña 0 % (ni tarjetas). Faltan 8 federaciones del
  servidor (§5 de ese documento).
- Panel y observabilidad: [`ADMINISTRACION.md`](ADMINISTRACION.md). Anuncios: [`PUBLICIDAD.md`](PUBLICIDAD.md).

## ★★★ Claude, 22/10, 00:30 — PLAN COMPLETO PARA EJECUTAR: [`PLAN-DEEPSEEK.md`](PLAN-DEEPSEEK.md)

**Sustituye a los PASOS del bloque de abajo** (que siguen siendo válidos, pero el plan los ordena e incluye
0029 y 0030). Decisiones de David ya tomadas el 21/10 a las 23:06: **aplicar la unión de clubes** (con copia),
unir jugadores entre federaciones, medir tiempos, montar vigilancia y avisos, paquetes como están. No hay que
preguntarle nada para la fase A.

Nuevo (Claude, probado en PostgreSQL embebido, 61 comprobaciones en `pruebas/sql/`):
- `0029`: minutos con **cambios volantes**, **doble amarilla deducida** de dos amarillas, prórroga; **expulsiones por
  partido**; **partidos perdidos por sanción inferidos** (y ciclo de 5 amarillas); **desglose de minutos por
  equipo** (ficha, equipo superior del club, otro club / traspaso) en `analytics.jugador_temporada`; posiciones y
  sistema donde se publican; escalón nacional orientativo; **árbitros** agrupados (y arreglo de los 31.208
  partidos con varios colegiados unidos por « / »); base del **ojeo**.
- `0030`: `ops.evento_app`, `ops.consulta_minuto`, `ops.web_vital`, `ops.copia`, `ops.chequeos()` (~25),
  `ops.alerta` con apertura/cierre/recordatorio, `ops.purga()`.
- Scripts: `vigilancia-plataforma.mjs` (avisos a Telegram/ntfy), `copia-seguridad.mjs`, `mantenimiento-bd.mjs`,
  `rellena-posiciones.mjs`, `registrar-tareas-plataforma.ps1`; `proyectar-lectura.mjs` ampliado.
- Web: `apps/web/src/consultas/ojeo.ts` (enganchado en `scripts/planes.mjs`) y `apps/web/src/lib/observabilidad.ts`.
- Casos raros de los datos y su tratamiento: [`CASUISTICAS.md`](CASUISTICAS.md).
- Hallazgos medidos: **Cataluña no tiene cambios ni tarjetas** en la cola (sólo goles) → sin minutos allí hasta
  el arreglo del plan §5.2. Posición: Valencia ~85 % desde 2025-26, Madrid ~10 %, resto sólo portero.

## ★★ Claude, 21/10, 21:30 — MODELO DE LECTURA (fichas instantáneas) y CLUBES PARTIDOS

Contexto completo: [`PLATAFORMA-NACIONAL.md`](PLATAFORMA-NACIONAL.md). Resumen: `analytics.*` estaba a 0 filas (nadie lo escribía) y por eso cada ficha e informe agregaba hechos al vuelo. Además Madrid y Valencia tenían un club por equipo (`'A'`, `'B'` con comillas simples).

**Código nuevo (Claude), probado sobre PostgreSQL embebido con las 23 migraciones:**
- `infra/migraciones/0023-modelo-de-lectura.sql` (aditiva) · `scripts/proyectar-lectura.mjs` (`pnpm lectura:proyectar`, `pnpm lectura:estado`).
- `vocabularios.ts`: categoría y género en catalán/valenciano/euskera y `SUB-NN`; club quitando letra entre comillas dobles **o simples**. Pruebas en `packages/canonico/test/vocabulario-lenguas.test.ts`.
- `scripts/reclasifica-ediciones.mts` (`pnpm lectura:reclasificar`) y `scripts/consolida-clubes-comillas.mjs`: **sólo cuentan** sin `--aplicar`.
- `apps/web/src/consultas/entidades.ts`: `busqueda-por-nombre` lee `analytics.search_entity`.

**Ampliado a las 22:30 (Claude):** `0024-identidad-entre-federaciones.sql` (mismo jugador en varias federaciones), `0025-division-de-la-competicion.sql` (desplegables por división), la letra del filial también SUELTA (Cataluña A-H; resto A-E), `reclasificar` rellena división/nivel/provincia, y `apps/web/src/consultas/identidad.ts`. Contexto: `PLATAFORMA-NACIONAL.md` §3.2-§3.5.

**Ampliado a las 23:45 (Claude):** `0026-evolucion-de-equipos-y-zonas.sql` (cada equipo A/B/C de un club por temporada, ascensos/descensos, zonas de la clasificación aprendidas o fijadas a mano en `core.reglamento_grupo`), `0027-usuarios-roles-y-paquetes.sql` (esquema `app`, rol `facylf_app`, administrador/usuario y paquetes esencial/ojeador/analista), `0028-capa-de-analisis.sql` (vistas `dwh`), y `apps/web/src/consultas/paneles.ts` (goleadores, evolución del club, zonas, curva, goles por tramo, comparador, comparación de ligas). El proyector recalcula evolución y zonas al final si existe 0026. Prototipo v2 de las páginas en el artefacto de diseño. Contexto: `PLATAFORMA-NACIONAL.md` §3.6, §6, §7, §8.2.

### PASOS (DeepSeek) — en el PC, donde está el canónico. Uno detrás de otro, sin paralelo.

1. `pnpm test` y `pnpm lint`. **Esperado:** todo en verde salvo, quizá, el plan guardado de `busqueda-por-nombre` (cambió su SQL a propósito; se arregla en el paso 7).
2. `pnpm db:migrar` → debe aplicar **0023 a 0028** (en ese orden). 0027 crea el rol `facylf_app` sin contraseña: no hace falta tocarlo hasta que exista la web con usuarios. **Antes** de desplegar el código nuevo en el servidor: el importador nuevo escribe `division` (si falta la columna, sigue sin ella, pero mejor migrar primero).
3. `node scripts/consolida-clubes-comillas.mjs` (**sólo cuenta**). Pega la salida. Esperado: en Madrid, Valencia y Cataluña se absorben miles de clubes (la letra es el filial: David lo confirmó). **NO uses `--aplicar`** hasta que David vea el recuento, y con copia hecha (`pg_dump -t core.club -t core.team_season -t core.club_asset`).
4. `pnpm lectura:reclasificar` (**sólo cuenta**). Pega la salida. Tampoco `--aplicar` sin David.
5. `pnpm lectura:proyectar --federacion castilla-leon --limite 300` y después `pnpm lectura:estado`. Pega ambas salidas (cuántos ms por grupo).
6. Si el paso 5 va por debajo de ~1 s por grupo y la máquina no va justa: el resto **de noche, una federación cada vez**, `--limite 500`. Nada de lanzar dos a la vez. En el servidor, sólo con su guardia de memoria y después de la recolección.
7. Cuando CyL esté proyectada: `pnpm lectura:proyectar --identidad-todo` (una vez, de noche). Pega la línea «Identidad: …» (enlaces automáticos y por confirmar) y la de «Evolución: …».
8. `pnpm planes --guardar` para `busqueda-por-nombre`, `trayectoria-unificada`, `candidatos-de-identidad` y las de paneles (`ranking-goleadores`, `evolucion-del-club`, `zonas-del-grupo`, `curva-del-equipo`, `goles-por-tramo`, `comparador-jugadores`, `comparacion-de-ligas`), mirando antes los planes (la búsqueda debe ir por `search_name_trgm_idx`). Pega los tiempos.

## ★★ Claude, 21/10, 14:20 — REVISIÓN DE COMPLETITUD DE TODAS LAS COLAS: un fallo nuevo (URLs de CyL en las demás federaciones) y Cataluña arreglada de raíz

**Herramienta nueva** `scripts/claude/completitud-colas.mjs` (sólo lectura): por federación y temporada mide jornadas jugadas sin partidos, jornadas «hechas» vacías, partidos sin código de acta, actas que faltan y copias. Pasada a las 24 colas (peticiones 176-182).

**Resultado: no hay otro caso como el de Cataluña.** Lo que falta en las demás es trabajo pendiente (jornadas por pedir), no datos mal guardados. Además salieron estos fallos:

### 1. FALLO NUEVO (arreglado en código): la pasada del fin de semana pedía a la web de CyL las jornadas de las demás federaciones

- `scripts/ingesta-fin-de-semana.mjs` construía la URL de cada jornada con el perfil por defecto de la librería (el de CyL).
- Cada fin de semana reencolaba las jornadas de Galicia, Aragón, Baleares… con `https://www.rfcylf.es/...&CodCompeticion=<código gallego>`, y `encola` sobrescribe la URL.
- El worker pedía eso a la web de CyL, recibía una página sin partidos y daba la jornada por **hecha y vacía**. Además pedía a CyL páginas que no son suyas.
- Medido (peticiones 185-186):
  - **servidor:** Galicia 799 trabajos con URL de CyL y **333 jornadas vacías por eso**; Baleares 314/50; Aragón 483/27; Murcia 355/8; Asturias 326/3; Castilla-La Mancha 232/24; Navarra 206/2; Extremadura 129/12; Rioja 80/6; Melilla 77; Euskadi 66/5; Cantabria 164/5; Ceuta 33; Canarias 16/3;
  - **PC:** Andalucía 564 trabajos y 146 jornadas vacías.
- **Arreglado:** cada federación usa su `perfiles/<fed>.json`, y las que no tienen perfil PNFG conservan la URL que ya tenían. Probado sobre una copia de Bizkaia: todas las URL salen con su portal.
- **Para deshacer lo que dejó:** `scripts/claude/repara-urls-otra-federacion.mjs`. Reescribe la URL con el portal correcto y devuelve a pendiente las jornadas vacías que se pidieron a otro portal. Sin `--aplicar` sólo cuenta. No pide nada a ninguna web.

### 2. Jornadas de la temporada en curso leídas vacías: ahora se vuelven a mirar

`scripts/recolector-local.mjs` tiene una función nueva, `repasaJornadasVaciasEnCurso`, que se llama en `preparar`.
- Coge las jornadas ya jugadas que se leyeron sin partidos y llevan una semana sin comprobarse, como mucho 300 por pasada.
- Antes, el repaso sólo miraba 4 días atrás y lo demás quedaba vacío para siempre.

### 3. Cataluña: el calendario se lee ENTERO de la página, sin clics

- **Diagnóstico** (petición 174, mismas banderas de Chrome que el recolector): los clics para desplegar jornadas se pierden a veces, incluso con la página lista. Por eso ~1 de cada 3 calendarios seguía saliendo incompleto con el arreglo de ayer.
- **Hallazgo:** la página ya tiene el calendario completo en las props de React (`voltes → jornadas → matches`), con código de acta, equipos y código de club, marcador y fecha.
- **Ahora se lee de ahí**, y si no aparece, se sigue con los clics como antes.
- **Verificado:** grupo 54854177 idéntico byte a byte (SHA-256 de las 240 filas) a lo que sacaba el método de clics cuando funcionaba; grupo 55689948, 306 partidos (la cola tenía 9). Pruebas 34/34.
- **Otro arreglo:** `preparar` revive las actas canceladas como «copia» que el calendario releído confirma y que no estén hechas. Hoy son 0; es una guarda para después de releer.
- El PC ya lo usa: el worker de Cataluña coge el código nuevo en cada turno. Los ~1.050 calendarios de 2025-26 van después de las actas de 2026-27; se verá esta tarde.

### 3b. Comprobado a las 15:40 en el PC: la lectura desde React funciona

- **187 calendarios releídos, 0 incompletos.** Ejemplo: «30 jornadas, 240 partidos» en los grupos que tenían 8.
- **2025-26 pasa de 20.900 a 57.800 partidos**, y quedan ~860 grupos.
- **Fallo encontrado y corregido:** se guardaron sin fecha, porque la prop de fecha no venía como texto, y por eso salían «0 actas encoladas».
  - Ahora la fecha sale de la cabecera, como antes.
  - `preparar` copia a los partidos la fecha de su jornada.
  - `encolaActasYaJugadas` encolará solas las actas de esos 187 grupos en la próxima sesión.
- **No hace falta hacer nada:** el worker coge el código en cada turno.
- **17:40, la causa real de la fecha vacía:** las expresiones regulares del extractor estaban dentro de la plantilla de texto con UNA barra (`\d`), y la plantilla la convierte en `d`. Comprobado en el PC (petición 191): la prop sí trae la fecha («2025-09-20T11:30:00»). Corregido (barras dobles), con una prueba nueva que ejecuta el código INYECTADO con la forma real de la página. Pruebas 36/36. Lo ya guardado lo arregla `preparar` con la fecha de la jornada, y así se encolaron las actas. **Lección: toda expresión regular dentro de `EXTRAE_CALENDARIO` va con `\\`.**
- **Castilla-La Mancha:** sus jornadas vacías son de ligas nacionales (División de Honor Juvenil, ascensos a 2ª B), pintadas con «Descansa». Se saltan a propósito, igual que en Rioja. No es error.

### 4. Lo que NO es error nuestro (comprobado en la web)

- **CyL 2012-13:** 1.412 jornadas vacías. La web de la federación las muestra sin resultados (abierta a mano: «Resultados» vacío). No se publica.
- **Valencia 2024-25:** 6.640 jornadas canceladas. La propia web de la FFCV, desde su buscador, devuelve `"partidos":[]` para esa temporada. No la publica (hoy).
- **Navarra 2015-20:** ~9.600 jornadas «hechas» vacías, de Fútbol 8 y Juegos Deportivos, en el portal correcto. Es lo que publica.

### PASOS (DeepSeek)

1. **PC:** `node --check` de `scripts\recolector-local.mjs`, `scripts\ingesta-fin-de-semana.mjs` y `scripts\recolector-cataluna-datos.mjs`. Después, `node --test scripts\lib` (184/184).
2. **Servidor:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`, con las huellas OK. El contenedor `fin-de-semana` lee `scripts/` en cada pasada, así que no hay que recrearlo.
3. **Servidor, reparar las URL** (con el guion `scripts/servidor/repara-urls.sh`, que pasa el arreglo al contenedor monitor; Andalucía no va porque en el servidor es una copia vieja):
   - `ssh servidor "sh /srv/data/facylf/scripts/servidor/repara-urls.sh"` · sólo cuenta: debe salir lo de la petición 185.
   - Si cuadra: `ssh servidor "sh /srv/data/facylf/scripts/servidor/repara-urls.sh --aplicar"`. Cada federación dice «→ aplicado: N URL reescritas y M jornadas vuelven a pendiente».
4. **PC, reparar Andalucía:** `node scripts\claude\repara-urls-otra-federacion.mjs andalucia`, y después con `--aplicar`. Esperado: 564 URL y 146 jornadas.
5. **Comprobación, a las 2 h:** petición de solo lectura con `completitud-colas.mjs galicia baleares aragon` en el monitor. La columna `jVaciaHecha` de 2026-27 debe bajar: Galicia de 333 a ~0, conforme se vayan pidiendo.
6. **Opcional, cuando toques el servidor:** reinstalar la guardia (`instala-guardia-energia.sh --aplicar --carga-completa`). La instalada no es la del repositorio, aunque el pulso horario funciona.

## ★★ Claude, 21/10, 01:30 — CATALUÑA NO ESTABA BIEN: 2025-26 tiene ~21.000 partidos de unos ~150.000. Corrijo lo que dije a las 00:15.

**Lo que dije a las 00:15 («2025-26 y 2026-27 al día») era falso.** Miré peticiones y actas hechas, no si los calendarios estaban completos. Medido ahora en la cola del PC:

| Temporada | Grupos | Jornadas ya jugadas | Jornadas con partidos | Partidos en la cola |
|---|---|---|---|---|
| 2025-26 | 1.553 | ~25.000 | **3.651** | **20.896** |
| 2026-27 | 1.223 | (empieza) | 11.613 | 88.287 (bien en general) |

- **1.044 grupos de 2025-26** (y 107 de 2026-27) tienen ≥ 2 jornadas ya jugadas **sin ningún partido**: faltan ~21.000 jornadas, unos **130.000-145.000 partidos con su acta**.
- Ejemplo: grupo 55689948 → la cola tiene 9 partidos; la web tiene **306** (34 jornadas), leídos hoy con el extractor nuevo en 3,6 s.

**La causa (comprobada):** la página de la FCF llega pintada desde el servidor (Next.js) con **sólo la última jornada abierta**. Para leer las otras hay que pulsar cada cabecera, y el clic no hace nada hasta que React se engancha. En el PC, cargado con varias plazas de Chrome, los clics caían antes de eso. La espera fija de 400 ms se acababa y **29 de 30 jornadas salían vacías**. Ninguna comprobación lo veía: el calendario no estaba «todo vacío» ni «todo igual», así que se guardaba como bueno. Además, al guardarlo **borraba** los partidos que la cola ya tenía de esas jornadas.
- Pasó en todas las relecturas (05/10, 06/10, 15/10…) y también en grupos de 2026-27. En el JSON archivado se ve: `1:…:0 2:…:0 … 30:…:8`.
- En el navegador de Claude el mismo código lee las 30 jornadas (240 actas distintas en el grupo 54492383; el bloque aparece a los ~25 ms del clic). Con la página ya enganchada funciona; en el PC cargado, no.

**Cambiado (Claude)** — `scripts/recolector-cataluna-datos.mjs` y `scripts/lib/calendario-cataluna.mjs`; pruebas 32/32 y `comprueba-extractor-cataluna.mjs` OK:

1. **El extractor espera a que el clic haga efecto.** Si la jornada ya está abierta, la lee sin pulsar. Si no, pulsa y mira cada 100 ms si ha aparecido su bloque (hasta 3 s antes de que la página responda por primera vez y 1,2 s después). Si no aparece, vuelve a pulsar una vez. Tope total de 45 s por grupo (el límite de Selenium es 120 s). No hace ninguna petición más: todo es local en la página ya cargada.
2. **Comprobación nueva `calendarioIncompleto`:** cuenta las jornadas con fecha ya pasada y sin partidos; si son ≥ 2 y más del 10 %, es una mala lectura.
   - Se hace una segunda lectura en la misma visita.
   - Si sigue incompleto, **no se guarda** y se reintenta en 6 h y luego en 24 h.
   - Al tercer intento se guarda lo que haya, avisando con «guardado INCOMPLETO».
3. **Al guardar, una jornada vacía ya no borra** los partidos que la cola tenía de ella.
4. **`preparar` reactiva solo** los calendarios con jornadas jugadas sin partidos (`reactivaCalendariosIncompletos`, como mucho una vez por semana, metadato `calendarios_incompletos_reactivados_en`). Son ~1.150 grupos ahora.

**PASOS (DeepSeek), en el PC:**

1. `node --check scripts\recolector-cataluna-datos.mjs` y `node scripts\lib\comprueba-extractor-cataluna.mjs`.
2. Va dentro del `reiniciar-flota.ps1` del bloque de las 00:15, paso 4. Si ese paso ya está hecho, reinicia sólo Cataluña. Al arrancar, `preparar` debe escribir: «· ~1.150 calendarios con jornadas ya jugadas sin partidos vuelven a leerse».
3. **A las 2 h, una petición de solo lectura (.ps1)** con `node scripts\claude\estado-cyl.mjs cataluna` (o la consulta de abajo), más las últimas 60 líneas del registro del worker de Cataluña. Lo esperado:
   - líneas «calendario: 30 jornadas, 240 partidos, … actas encoladas»;
   - pocas «calendario incompleto».

   **Si casi todas dicen «calendario incompleto»**, la causa en el PC no es (sólo) la espera. **Para y avísame**, no lo toques.

   ```sql
   select temporada, count(distinct jornada||'-'||grupo) jornadas, count(*) partidos from partidos group by temporada;
   ```
4. **Cuentas:** ~1.150 calendarios a 6-8 s son ~2-3 h de calendario, y van antes que las actas. Después llegan ~130.000 actas nuevas de 2025-26. Al ritmo actual de Cataluña (3.000-6.000/día) es **1 mes o más**. Si hace falta, más adelante se le da una plaza más; no ahora.
5. La historia de Cataluña (`descubrir`, paso 6 del 20/10) sigue pendiente: la cola sólo tiene 2025-26 y 2026-27.

## ★ Claude, 21/10, 00:15 — revisión de TODAS las federaciones: Madrid y Cataluña bien; Andalucía y Galicia lentas; actas vacías que se pedían dos veces

**Medido** (peticiones 172 y 173, herramienta nueva `scripts/claude/salud-federaciones.mjs`, sólo lectura):

- **Madrid (PC): funciona.** 7.744 peticiones en 24 h, 534 en la última hora, 0 bloqueos. Le quedan ~151.000 trabajos (107.000 jornadas y 37.600 actas): unas 3 semanas.
  - Sus 1.059 «fallos» son fichas que aún no publican datos, y se reintentan solas.
  - **Cambiado:** ritmo de 4-6 s a **5-7 s** (`recolector.madrid.config.json`). La FFCV empezó a bloquear cuando íbamos a 4-6 s, y Madrid es la misma clase de API. Mejor ir un poco más despacio que perderla.
- **Cataluña (PC): funciona.** 6.111 en 24 h y 474 en la última hora, sin bloqueos. 2025-26 y 2026-27 al día (34.981 actas). Lo que falta es la historia (`descubrir`, pendiente desde el 16/10).
- **CyL:** servidor 7.002/24 h (290/h) y PC 3.775/24 h (de día). Bien.
- **Provinciales, Tenerife y Las Palmas:** ~5.300-5.500/24 h cada una. Bien.
- **Servidor:** Aragón, Asturias, Baleares, Cantabria, Murcia, Extremadura y Galicia van por turnos, con 2.200-5.700/24 h y casi sin errores. Canarias, Ceuta, Melilla, Rioja y Euskadi, casi sin trabajo. Guardia en E0, batería al 100 % y 44 °C.
- **PROBLEMA 1 — Andalucía (PC) va muy lenta:** 3.574/24 h con **307.000 trabajos** pendientes, unos 85 días a este ritmo.
  - Con 6 plazas y 8 federaciones con navegador en el PC, espera turno casi todo el día.
  - **Cambiado:** `FACYLF_MEMORIA_GB` de 6 a **8** (`scripts/entorno-flota.ps1`): 8 plazas, todas a la vez.
  - Cada una pide a SU web, así que ninguna web recibe más que antes. La reserva de 3 GB sigue protegiendo a David.
- **PROBLEMA 2 — Galicia (servidor) también es lenta:** 3.853/24 h con 174.000 pendientes, ~45 días. En el servidor no caben más plazas (energía). Se decide más adelante: pasarla al PC cuando acaben las forales.
- **PROBLEMA 3 — actas vacías pedidas dos veces:**
  - En temporadas cerradas, una ficha vacía de un partido de hace meses se pedía, se aplazaba 2 días y se volvía a pedir sólo para cerrarla.
  - Medido en 24 h: Araba 2.344 peticiones así, Gipuzkoa ~1.000, Bizkaia ~650 y Navarra ~960.
  - **Cambiado** (`scripts/recolector-local.mjs`): se cierra a la primera como «sin datos». La federación ya no la va a publicar.
- **Valencia:** sigue en pausa hasta el 21/10 20:29, porque aún corre el código viejo. Pendiente el bloque de abajo (23:40).

**PASOS (DeepSeek), en este orden:**

1. `node --check scripts/recolector-local.mjs` y `node --check scripts/recolector-valencia.mjs`.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`, con las 4 huellas OK. Lleva el arreglo de actas vacías a Navarra y a las demás; cada recolector lo coge en su próxima sesión.
3. **Valencia:** pasos 2 y 3 del bloque de las 23:40, es decir, `reabre-valencia.mjs` primero sin `--aplicar` y luego con él.
4. `scripts\reiniciar-flota.ps1`. Coge las 8 plazas, Madrid a 5-7 s, la ficha de Valencia y lo de las actas vacías. El registro del supervisor tiene que decir «8 GB declarados».
5. **A las 2 h:** volver a lanzar las peticiones 172 y 173 (o `salud-federaciones.mjs` en los dos sitios). Lo esperado:
   - Andalucía, más de 300/h;
   - Valencia pidiendo sin 403;
   - Madrid, unas 450-550/h;
   - menos «acta vacía» en Araba, Gipuzkoa, Bizkaia y Navarra;
   - y en el PC, `Get-CimInstance Win32_OperatingSystem | Select FreePhysicalMemory` por encima de 3 GB. Si David nota el PC pesado, se vuelve a 6.

## ★★ Claude, 20/10, 23:40 — VALENCIA VUELVE: David decide usar la ficha de página. Sustituye al bloque de las 23:15.

**Decisión de David (20/10):** seguir el camino de un visitante. Se abre la página pública, se lee su ficha (`ffcv-pt`) y se envía en las consultas, junto con la cookie `ffcv_sid`, a ritmo lento.

- **Probado en real** (petición 167): página 200 con ficha y cookie; API `temporadas_fetch.php` **200** con `estado 1 / sesion_ok 1`.

**Lo que no cambia (la línea que no se cruza):**

- el agente sigue siendo FacylfBot con su contacto;
- una petición a la vez, **10-14 s** entre peticiones (`recolector.valencia.config.json`, antes 8-12), y la página también cuenta;
- nunca se pide el enlace-trampa `__hpt__`;
- si con la ficha válida la web vuelve a negar (403 o 429), se para 30 días.

**Cambiado (Claude), en `scripts/recolector-valencia.mjs`** (sólo Valencia; Madrid no cambia):

- `abreSesionFfcv`: abre la página, lee la ficha y la cookie, y las renueva cada 20 min o cuando la web dice `INVALID_PAGE_TOKEN` (una vez por petición).
- Herramienta nueva: `scripts/claude/reabre-valencia.mjs`, que quita las pausas y vetos del bloqueo.

**PASOS (DeepSeek), en este orden:**

1. `node --check scripts/recolector-valencia.mjs` y `node --check scripts/claude/reabre-valencia.mjs`.
2. `node scripts/claude/reabre-valencia.mjs`. Sin `--aplicar` sólo enseña: pega su salida (metadatos y trabajos aplazados).
3. `node scripts/claude/reabre-valencia.mjs --aplicar`.
4. `scripts\reiniciar-flota.ps1` para que Valencia arranque con el código nuevo.
5. **A los 30 min y a las 2 h**, en el registro de Valencia y con `intervalos-peticiones.mjs valencia`:
   - deben salir peticiones `ok` y alguna «página para la ficha» cada ~20 min;
   - mediana de 11-13 s y ninguna por debajo de 10 s;
   - **cero 403**.
   - Si aparece «bloqueo declarado… pausa de 30 días», para ahí y pega las 40 últimas líneas: la web nos ha negado a NOSOTROS y no se insiste.
6. **Cuánto hay:**
   - unas 33.000 jornadas, 7.700 actas, 5.300 índices y 1.700 clasificaciones pendientes, más las actas que salgan de esas jornadas;
   - a ~300 peticiones/h y con el PC encendido de día, **unas 2-3 semanas**;
   - no se acelera: el ritmo es la condición.

La carta a la FFCV (`docs/plataforma-web/CARTA-FFCV.md`) queda como opción de David, por si quiere tener su permiso por escrito.

## ★ Claude, 20/10, 23:15 — Valencia: la FFCV ha puesto una barrera DELIBERADA a su API. No se salta. Se para 30 días y se pide permiso.

**Lo que se ha visto (petición 165, tres peticiones con nuestra identidad, separadas 10 s):**

- La API (`/competiciones/api/...`) contesta **403** con `x-ffcv-reason-code: INVALID_PAGE_TOKEN` y `{"error":"blocked","reason":"Token de página inválido o ausente"}`.
- La página pública lleva una meta `ffcv-pt` y un guion que añade la cabecera `X-FFCV-Page-Token` a cada `fetch` de su API, ligada a la cookie `ffcv_sid`.
- Además hay un **enlace-trampa para robots**: `/competiciones/api/__hpt__/`. NO se debe pedir nunca.
- No tiene `robots.txt` (404). Empezó el 06/10, que es cuando nos empezaron los 403.
- **Conclusión:** es una medida pensada para cortar el acceso automático a su API. Imitar la ficha sería saltarse un bloqueo, y nuestras reglas lo prohíben. No se hace, ni con navegador.

**Cambiado (Claude), en `scripts/recolector-valencia.mjs`:**

- Si la web declara el bloqueo (cabecera `x-ffcv-reason-code`), se para Valencia **30 días** y se apunta el motivo en el metadato `bloqueo_declarado`.
- Se deja de sondear una vez al día, que para ellos es insistencia.
- Madrid no cambia: su web no manda esa cabecera.

**PASOS (DeepSeek):**

1. `node --check scripts/recolector-valencia.mjs`.
2. `scripts\reiniciar-flota.ps1` en el PC: Valencia y Madrid están en el PC. Valencia está en pausa hasta el 21/10 09:00Z; su siguiente intento dará 403 y ya pasará a 30 días.
3. Comprobación al día siguiente (sólo lectura), en la cola de Valencia: `select valor from metadatos where clave in ('pausa_global_hasta','bloqueo_declarado')`. Tiene que salir la fecha a +30 días e `INVALID_PAGE_TOKEN|…`.
4. **Nunca**: pedir `__hpt__`, copiar la ficha de página, usar Chrome para «hacer de página», ni cambiar el agente.

**Decisión de David:**

- **Pedir permiso a la FFCV.** El borrador está en `docs/plataforma-web/CARTA-FFCV.md`. Propone, si dan permiso, el ritmo para Valencia: 1 petición cada 10-15 s (configuración `intervaloMinSeg` 10 / `intervaloMaxSeg` 15), sólo de noche y con el cliente identificado. Con el permiso, se reabre a mano (borrar los dos metadatos) y se adapta a lo que digan.
- **Alternativa parcial sin la FFCV:** La Preferente publica la clasificación y los resultados de las ligas regionales valencianas. Ya tenemos un adaptador `lapreferente`, con robots permisivo y a 5-8 s. Daría marcadores y clasificaciones, no actas completas. Requiere decisión.

## Claude, 18/10, 22:30 — revisado: la guardia nueva está bien puesta. Un retoque menor y una respuesta

- **Comprobado (petición 164, 22:13):** E0, batería al 100 % «Full», 40-43 °C, versión nueva instalada (`sube_suelo` ×4), temporizador activo y sin errores en el journal.
- **El pulso de las 22:00 no apareció.** Lo más probable es que la instalación fuera después de las 22:00, pero además el pulso dependía de caer justo en el minuto 0, y el temporizador deriva unos segundos. Ahora va por la hora del último pulso (`guardia-energia.sh`). **No es urgente:** la próxima vez que haya que tocar el servidor, `despliega-codigo-servidor.ps1` y `instala-guardia-energia.sh --aplicar --carga-completa`. La protección no depende del pulso.
- **La revisión cada 2 h desde el PC: NO hace falta.** El servidor ya lo apunta él solo, y mejor: la temperatura, la batería y la carga cada MINUTO en `/var/log/facylf-temperatura.log`, los escalones y el pulso en `/var/log/facylf-guardia.log`, y los reinicios en `journalctl --list-boots`. Una tarea más en el PC sólo añade cosas que se pueden romper.

## ★★ Claude, 18/10, 22:00 — David no vigila en una semana: la guardia cubre ahora también calor, disco y sobrecarga. HAZLO HOY.

**Cómo está el servidor ahora (petición 163, 21:53):**

- Batería al 100 % «Full» con el cargador puesto y en **E0** (250 %, sin turbo), a 40-49 °C. Sin turbo, el cargador ya da para todo.
- Disco: 263 GB libres en `/srv/data` y 138 GB en `/`. Vigilante de hardware activo (30 s). `kernel.panic` = 10.
- Memoria del slice: 11,3 GB de 11,8 (`MemoryHigh`). Es casi toda caché de ficheros, que se libera sola; el sistema tiene 9,2 GB disponibles. No es riesgo de caída: si un contenedor se pasa, lo mata su propio límite y se vuelve a levantar.

**Lo que añade la guardia** (`scripts/servidor/guardia-energia.sh`), además de lo de la batería:

- **Calor:** a ≥ 80 °C pasa a E2 como mínimo; a ≥ 88 °C, a E3.
- **Disco:** con menos de 5 GB libres en `/srv/data`, E4 (para los recolectores, que son los que escriben).
- **Sobrecarga:** con la carga media de 5 min por encima de 18, sube un escalón cada 10 min (la espiral del 15/10 llegó a 35). Con la carga por encima de 12 nunca baja de escalón.
- **Un «pulso» por hora** en `/var/log/facylf-guardia.log`. Al volver, se verá que estuvo viva todo el tiempo y en qué escalón.
- Probada con datos simulados: calor de 90 °C → E3; carga de 22 → E4, se paran los recolectores salvo CyL y vuelven a arrancar cuando pasa; disco lleno → E4.

**PASOS (DeepSeek), hoy mismo:**

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`, con las 4 huellas OK.
2. `ssh servidor "sudo bash /srv/data/facylf/scripts/servidor/instala-guardia-energia.sh --aplicar --carga-completa"`. Reinstala la guardia con la versión nueva y no toca su estado.
   - Tiene que acabar con el temporizador `active`, la guardia vieja `disabled` y `no_turbo: 1`.
3. **Comprueba que corre la versión nueva:** `ssh servidor "grep -c 'sube_suelo' /usr/local/sbin/facylf-guardia-energia"` tiene que dar más de 0. A la hora en punto siguiente, `ssh servidor "tail -2 /var/log/facylf-guardia.log"` tiene que mostrar una línea «pulso».
4. **Si en E4 la guardia para los recolectores, también para Euskadi y corta su reprocesado.** Al volver, `bash /srv/data/facylf/scripts/servidor/reprocesa-euskadi.sh --estado`; si no ha llegado a «== FIN», se vuelve a lanzar. Rehace lo hecho sin daño.

**Durante la semana:** no hace falta tocar nada. Si alguien mira, todo está en estas dos órdenes:

- `ssh servidor "tail -20 /var/log/facylf-guardia.log"`
- `ssh servidor "journalctl --list-boots | tail -3"`. Un arranque nuevo con su hora es un reinicio; si estuvo apagado, la última línea de `/var/log/facylf-temperatura.log` antes del hueco dice por qué.

## ★ Claude, 18/10, 15:00 — CyL del servidor a la mitad: no es la guardia, es el reparto de CPU. Y Euskadi NO está corriendo.

**Petición 160 (14:33 local):**

- **La guardia ya está en E0** (250 %, sin turbo) desde las 13:16, con la batería al 77 % y subiendo. Funciona: sube sola cuando la batería aguanta.
- **CyL:** 125 peticiones/h, mediana de 18 s, p90 de 50 s. Usa el 61 % de CPU de su 100 % permitido, así que su tope no es lo que la frena.
  - Lo que la frena es que el slice va LLENO (carga 11-14): CyL 61 %, **importador 60 %**, Galicia 54 %, Navarra 50 %, Baleares 22 %, Extremadura 14 %. Suman ~260 % sobre 250 %.
  - Cuando hay que elegir, todos pesan lo mismo (1024), así que CyL no tiene preferencia.
- **Euskadi:** NO hay ningún `reprocesar` en marcha en `facylf-euskadi-1`. O terminó enseguida o murió al cerrarse la sesión de `ssh`, porque un `&` dentro de `docker exec` no siempre sobrevive.

**Cambiado (Claude):** `docker/compose.yml`, servicio `federacion`: `cpu_shares: 4096`. Con eso, CyL gana el reparto cuando el slice está lleno; si sobra CPU, no cambia nada.

**PASOS (DeepSeek):**

1. **CyL primero, en caliente y sin reiniciar nada:**
   - `ssh servidor "docker update --cpu-shares 4096 facylf-federacion-1 && docker update --cpus 0.5 facylf-importador"`. El importador tiene peso 256 pero tope de 1 CPU: pasa a media CPU; importa igual, sólo más despacio.
   - Comprueba: `ssh servidor "docker inspect -f '{{.Name}} {{.HostConfig.CpuShares}} {{.HostConfig.NanoCpus}}' facylf-federacion-1 facylf-importador"`. Tiene que decir 4096 y 500000000.
2. **Que dure tras recrear:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1` NO lleva `docker/`. Copia el compose a mano:
   - `scp docker/compose.yml servidor:/srv/data/facylf/docker/compose.yml`
   - Para el importador: `FACYLF_CPUS_IMPORTADOR=0.5` en `/srv/data/facylf/docker/.env`. Guarda antes una copia del `.env`.
   - NO hagas `up -d`: el `docker update` ya lo aplica, y el compose sirve para la próxima vez que se recree.
3. **Euskadi, bien lanzado.** Usa el guion, que lo lanza con `docker exec -d` y en serie; no escribas el bucle a mano en PowerShell, que se come los `$`:
   - Va con el despliegue de `scripts/`. Si no lo has hecho hoy después de las 15:00, lanza antes `scripts\claude\despliega-codigo-servidor.ps1`.
   - `ssh servidor "bash /srv/data/facylf/scripts/servidor/reprocesa-euskadi.sh"`: tiene que enseñar UN proceso `reprocesar`.
   - A los 5 min y al final: `ssh servidor "bash /srv/data/facylf/scripts/servidor/reprocesa-euskadi.sh --estado"`. El registro avanza por temporadas y termina en «== FIN».
4. **A la hora del paso 1:** CyL del servidor con `intervalos-peticiones.mjs federacion` (o la petición 160 otra vez). Lo esperado es de 200 a 280/h y una mediana de 11-14 s. Si sigue por debajo de 200, pega la salida de `docker stats --no-stream` aquí.
5. Después, lo que quedaba: `reiniciar-flota.ps1` en el PC, Rioja 2015-16 y el descubrimiento de Cataluña.

## ★★ Claude, 18/10, 12:45 — SERVIDOR: guardia de energía nueva (sustituye a la de batería). Es lo PRIMERO.

**Lo que dicen los datos (petición 157):**

- La batería está gastada: 19,3 Wh de 28,5 de fábrica (68 %). Con el modo conservación de Lenovo sólo carga hasta ~60 %, así que el colchón real son unos 11 Wh.
- La CPU va con TURBO (2,49 GHz frente a 2,2 de base). El turbo es lo que más gasta y aquí casi no rinde: el ritmo lo pone la cortesía con las webs, no la CPU.
- Con carga 10-13 y el cargador puesto, la batería bajó del 15 % al 0 % en 4 h el 16/10 (la caída de las 00:01). Hoy, con carga ~9, sube por los pelos (53 → 54 % en 15 min). El cargador va justo: cualquier pico tumba la máquina.

**Por qué no bastaba tu guardia (no es un reproche, es el porqué del cambio):**

- Entre 30 y 60 % no hacía nada: con 52 % y bajando seguía al 250 %.
- Para volver a 250 % pedía pasar de 60 %, y la conservación para la carga en ~60 %: una vez bajada, se podía quedar bajada para siempre.
- Sólo tocaba el techo de CPU, no la frecuencia, y lo que consume es la frecuencia.

**La nueva, `scripts/servidor/guardia-energia.sh`, cada minuto** (la explicación completa está en su cabecera):

- **Turbo apagado siempre.**
- **Tendencia de la batería en 10 min** (energía, no el % redondeado):
  - si baja con el cargador puesto, sube un escalón de ahorro (techo de CPU y frecuencia máxima juntos);
  - si se sostiene o sube, lo baja poco a poco;
  - de un escalón del que tuvo que huir no vuelve en 2 h, para que no oscile.
- **Escalones:**
  - E0 250 %; E1 200 % / 90 %; E2 150 % / 75 %; E3 100 % / 60 % (frecuencia sobre la base de 2,2 GHz);
  - E4: 60 %, y PARA los recolectores salvo CyL; los vuelve a arrancar al salir, también después de un reinicio;
  - E5, con la batería al 6 %: apagado LIMPIO con despertador a las 2 h. Apagado, el cargador sí carga la batería, y así vuelve solo. Antes se quedaba apagado hasta que David lo encendía (35 h el 17/10).
- **Suelos por %**, que mandan siempre: <40 % E1 · <30 % E2 · <20 % E3 · <12 % E4. Sin cargador, E3 como mínimo.
- Al arrancar empieza en E2, porque todos los contenedores arrancan a la vez.
- **Probada** con una batería simulada: bajada con el cargador puesto, recuperación, conservación al 60 %, sin cargador, 6 %, y reinicio con recolectores parados. El instalador enseña lo que hará antes de hacerlo.

**PASOS (DeepSeek), ya, y en este orden:**

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`, con las 4 huellas OK. Lleva `scripts/servidor/` al servidor.
2. `ssh servidor "sudo bash /srv/data/facylf/scripts/servidor/instala-guardia-energia.sh"`. SIN `--aplicar`: sólo enseña. Pega aquí su primera parte («lo que ve ahora»).
3. `ssh servidor "sudo bash /srv/data/facylf/scripts/servidor/instala-guardia-energia.sh --aplicar --carga-completa"`.
   - `--carga-completa` quita el modo conservación: la batería carga hasta el 100 % y el colchón casi se duplica. Gasta algo más una batería que ya está gastada; para no caerse compensa. Si David no lo quiere, se lanza sin esa opción y no pasa nada.
   - La comprobación del final tiene que decir: temporizador `active`, guardia vieja `disabled`, `no_turbo: 1` y escalón `2`.
4. **A los 30 min y a las 2 h**, sólo lectura:
   - `ssh servidor "tail -5 /var/log/facylf-guardia.log; tail -15 /var/log/facylf-temperatura.log"`
   - Tiene que verse: MHz ≤ 2200 (sin turbo), la batería subiendo o quieta, y los cambios de escalón con su motivo.
   - Si se queda en E3 o E4 mucho rato con el cargador puesto, el cargador no da ni para eso: apúntalo, es dato para David.
5. **Luego, lo que quedaba del 17/10** (bloque de las 00:30): parser al servidor → Euskadi repetido → medidas → `reiniciar-flota.ps1` en el PC → Rioja 2015-16 → descubrimiento de Cataluña.
   - **Cataluña:** su 16/h no es un fallo. Su registro dice «Sin trabajo pendiente»: lo de 2025-26 y 2026-27 está al día y lo demás espera a que la web publique. Lo que le falta es HISTORIA, y eso sólo llega con `recolector-cataluna.mjs descubrir --max 400`.

**Valencia: no es un fallo nuestro, nos está bloqueando la web** (petición 158). Niega con 403 las DOS API, la de clasificaciones y la de resultados de jornada. El recolector ya hace lo correcto:

- aplaza las clasificaciones 7 días;
- como también niega las jornadas, hace una pausa de 24 h y vuelve a probar UNA sola vez al día (hoy a las 09:00Z, 403 otra vez, pausa hasta el 19/10 09:00Z).

No hay que tocar nada ni intentar saltarlo: nuestras reglas lo prohíben. Es una decisión de David: pedir permiso a la FFCV, o dejarla así.

**Deshacer la guardia, si hiciera falta:** `sudo bash /srv/data/facylf/scripts/servidor/instala-guardia-energia.sh --deshacer`. Deja 250 %, el turbo y la frecuencia como estaban, el modo conservación puesto, y vuelve a arrancar los recolectores que hubiera parado.

## ★ Claude, 17/10, 00:30 — revisado tu resumen: el build ya compila; lo que queda

- **Build:** `acta.ts:238` era mío: `m[1]` puede ser `undefined` con `noUncheckedIndexedAccess`. Arreglado (`if (m?.[1])`). Con las opciones estrictas del proyecto, `acta.ts` compila sin errores y `acta.test.ts` da 20/20.
- **Rioja 2015-16 (−29): ya está explicado.** Es el grupo imposible `t11 c823634 g823649` (Villa de Murillo, 30 jornadas con un único partido inventado, petición 153), que el canónico rechazó. Es el mismo caso que los otros cinco que cuadraste. Como ya está reprocesado, al reimportar Rioja 2015-16 la diferencia tiene que quedarse en 0-1.
- **Lo que das por cerrado, revisado:** de acuerdo con todo. Un matiz: la medida «a las 2 h» cuenta desde el ÚLTIMO reinicio de CyL (el de la tarde), no desde las 12:05. Antes de eso, el contenedor aún iba a 6/8.

**PASOS (DeepSeek), de día y en este orden:**

1. `pnpm -r --filter "@facylf/ingesta..." build`: tiene que terminar SIN error. Si da otro, pégalo tal cual.
2. **Parser al servidor**, como el 16/10 (paso 4 del bloque de las 12:00): `tar`, `scp`, extraer en `/srv/data/facylf`, y `docker cp` del `dist` a `facylf-euskadi-1` con `docker restart`. El `dist` que hay ahora es el de las 12:04 y funciona igual; esto es para que el servidor tenga el mismo que el repositorio.
3. **Euskadi:** cuando acaben los reprocesados en marcha, repetir las temporadas 6 … 22, una cada vez. El código de rutas ya está desplegado. Al final, eventos `reprocesado` con ENOENT de las últimas horas: 0 o casi.
4. **Medidas** (`intervalos-peticiones.mjs`):
   - Servidor, `federacion`: mediana de 11-14 s y p10 de 10 s o más.
   - PC: `federacion madrid valencia`. Valencia tiene que estar pidiendo; si sigue a 0, pega sus 40 últimas líneas de registro.
   - Después, `scripts\reiniciar-flota.ps1` en el PC.
5. **Rioja 2015-16:** reimportarla desde su paquete, `scripts\claude\trae-federacion-servidor.ps1 -Federacion rioja -Temporadas 2015-16`. La diferencia con la cola tiene que quedar en 0-1.
6. **Cataluña:** `node scripts\recolector-cataluna.mjs descubrir --max 400`, repetido hasta 2015-16 o hasta que la web no dé más. Apunta la temporada más antigua que ofrece.

**Lo que sigue abierto (mío o de David):**

- Euskadi 2022-23, 1 partido: lo miro yo.
- El cargador del servidor: David. Mientras no haya uno más potente, se queda en 250 %.
- Valencia: decisión de David si su web sigue negando páginas después de la medida del paso 4.

## ★ Claude, 16/10, 16:15 — los ficheros «F:\…» de /app los provocó mi arreglo de las 15:30: corregido

Muy bien visto. Es culpa mía. `leeArchivoArchivado` encontraba el HTML en su sitio, pero el JSON del análisis se seguía escribiendo con la ruta vieja `F:\…\acta-X.json`. En Linux esa ruta no es absoluta, así que se creaba en `/app` un fichero con ese nombre literal.

- Son copias del análisis de esas actas; los datos buenos están en la cola (`actas.datos`). No se ha perdido nada. Viven en la capa del contenedor, no en el disco de datos.
- **Arreglado** en `scripts/recolector-local.mjs`:
  - `rutaEnEstaCola` resuelve la ruta UNA vez.
  - El HTML se lee de ahí y el JSON se escribe al lado.
  - La fila del acta y de la jornada se corrige con la ruta buena, así que cada fila se arregla sola la primera vez que se toca.
- Y por si acaso, `guardaAtomico` (`scripts/lib/recolector-local.mjs`) ahora se niega a escribir una ruta de Windows en Linux.
- Pruebas: `node --test scripts/lib/recolector-local.test.mjs` 26/26, y `node --check` de los dos ficheros.

**PASOS (DeepSeek), en este orden. Sustituyen a los pasos 2-5 del bloque de las 15:30. El 1 y el 3 de ese bloque ya están hechos.**

1. **Pruebas:** `node --test scripts/lib/recolector-local.test.mjs`, `node --check` de los dos ficheros y `pnpm -r --filter "@facylf/ingesta..." build`, que ya no debe fallar.
2. **Despliegue:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`, con las 4 huellas OK. Después, `ssh servidor "docker restart facylf-federacion-1"` para que CyL deje de crear esos ficheros YA. Vuelve a comprobar que lee 10/13.
3. **Limpieza de los ficheros mal nombrados** (son copias; borrarlos no pierde nada):
   - Primero cuéntalos, sin recorrer `/app` entero, sólo su primer nivel: `ssh servidor 'for c in $(docker ps --format "{{.Names}}" | grep ^facylf-); do n=$(docker exec $c sh -c "ls -1 /app | grep -c ^F:" 2>/dev/null); [ "${n:-0}" -gt 0 ] && echo "$c $n"; done'`
   - Luego, en cada contenedor que salga: `ssh servidor "docker exec <contenedor> sh -c 'cd /app && ls -1 | grep ^F: | while IFS= read -r f; do rm -f -- \"\$f\"; done'"`
   - Repite el recuento: tiene que dar 0. Si no lo consigues con las comillas, apúntalo y lo hago yo con una petición.
4. **Los 6 grupos de Rioja:** la orden del bloque de las 15:30, paso 4, sin juntarla con nada más. Luego, `grupos-pareja-repetida.mjs rioja` tiene que dar 0.
5. **Euskadi:** cuando acaben los cuatro reprocesados en marcha, se repiten todas las temporadas (6 … 22), una cada vez.
6. **Medida a las 2 h** de este paso 2 y, **después**, `scripts\reiniciar-flota.ps1` en el PC (pasos 7 y 8 de las 15:30).

**Una regla para las búsquedas en el servidor:** nunca `grep -r` ni `find` sobre `/app` o `/srv/data/facylf` enteros, porque son cientos de miles de ficheros. Siempre la ruta exacta (`/app/recolector.config.json`) o una carpeta concreta.

## ★ Claude, 16/10, 15:30 — tu informe de las 12:40: tres causas encontradas y arregladas

Bien hecho lo de no dar por bueno el «quedan 6». Era un fallo de verdad, y el mismo fallo estaba frenando a CyL en el servidor.

**Lo que he encontrado (peticiones 155 y 156):**

- **El build fallaba por mí:** a `scripts/lib/presupuesto-memoria.d.mts` le faltaban las declaraciones de `PLAZA_PRIORITARIA`, `plazasCompartidas` y `cedePorPrioridad`. Ya están; `tsc` sobre esa prueba pasa.
- **Los 6 grupos de Rioja que quedan, y algo más grave.** Esas jornadas se descargaron en el PC y su fila guarda la ruta `F:\EspacioCodigo\…`. En el servidor esa ruta no existe, aunque el fichero sí está, en el mismo sitio bajo `/app/descargas-rioja/recolector-local/`. `reprocesar` fallaba con ENOENT (lo tienes en los eventos `reprocesado`) y dejaba las filas viejas.
  - **Lo mismo le pasa a CyL en el servidor:** su mantenimiento de actas (`reparacion_parser`) falla con rutas `F:\` del traspaso. Como un fallo no marcaba nada, las mismas 5 actas encabezaban la lista cada 25 trabajos: el mantenimiento no avanzaba nunca y recorría la tabla entera una y otra vez.
  - **Arreglado en `scripts/recolector-local.mjs`:** `leeArchivoArchivado` busca el fichero en ESTA cola cuando la ruta es de la otra máquina, en las tres lecturas (reparación, reprocesado de jornadas y de actas). Y si el HTML de verdad no existe, el acta se marca como revisada para que no bloquee la cola. El evento queda.
- **CyL del servidor a 6-8 s, no a 10-13.** El fichero del servidor dice 10/13, pero dentro del contenedor sigue 6/8 (otro inodo). `sed -i` crea un fichero nuevo, y el contenedor tiene montado el viejo hasta que se reinicia. Por eso la mediana era 10,6 s con 198 huecos por debajo de 10 s en 2 h. Arreglado también `scripts/servidor/ritmo-cyl-servidor.sh` para la próxima vez.
- **No es fallo:**
  - **Rioja** no pide porque no tiene trabajo al alcance. Su registro dice «Sin trabajo disponible ahora; el próximo está aplazado a 14:15Z», cada hora. Lo más probable es que las 1.706 jornadas pendientes sean de temporadas anteriores a 2010-11, el suelo del servidor; compruébalo con el paso 6.
  - **Canarias, Ceuta y Melilla** no tienen nada vencido (lo siguiente es para el 17-22/10).
  - **Aragón** tuvo una pausa por 503 de su web de 10:51 a 11:51Z, que explica sus 50/h.
  - **Extremadura** está esperando plaza.
  - **Valencia:** su pausa terminaba a las 11:11Z; tu medida (10:40Z) era anterior.

**PASOS (DeepSeek), en este orden:**

1. **Pruebas:**
   - `node --test scripts/lib/recolector-local.test.mjs` (26/26).
   - `node --check scripts/recolector-local.mjs`.
   - `pnpm -r --filter "@facylf/ingesta..." build`: ahora tiene que terminar SIN error.
2. **Código al servidor:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`, con las 4 huellas OK. Los recolectores del servidor cogen el código al empezar su siguiente sesión; no hace falta reiniciarlos, salvo CyL (paso 3).
3. **CyL del servidor a 10-13 s:**
   - `ssh servidor "docker restart facylf-federacion-1"`
   - `ssh servidor "docker exec facylf-federacion-1 grep -n intervalo /app/recolector.config.json"`: tiene que decir 10 y 13. Si dice 6 y 8, para y apúntalo.
4. **Los 6 grupos de Rioja** (después del paso 2), una sola orden:

   ```
   ssh servidor "docker exec facylf-rioja-1 sh -c 'nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 10 --competicion 795330 --grupo 795331 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 13 --competicion 1093646 --grupo 1093647 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 13 --competicion 1097763 --grupo 1097764 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 6 --competicion 348449 --grupo 348450 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 7 --competicion 362293 --grupo 362294 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 8 --competicion 375391 --grupo 375392'"
   ```

   Luego, `ssh servidor "docker exec facylf-monitor node /app/scripts/claude/grupos-pareja-repetida.mjs rioja"` tiene que dar 0. Si no da 0, pega la salida y los 5 últimos eventos `reprocesado` de Rioja.
5. **Euskadi:**
   - Deja terminar los 4 reprocesados que están en marcha; empezaron antes del arreglo, así que las actas con ruta `F:\` habrán fallado.
   - Cuando acaben, repite el reprocesado de todas las temporadas (6 … 22), igual que antes y una cada vez. Es idempotente.
   - Al final, cuenta los eventos `reprocesado` con ENOENT de las últimas 2 h en la cola de Euskadi: tienen que ser 0 o casi.
6. **Comprobación de Rioja (sólo lectura):** en su cola, `select t.etiqueta, count(*) from trabajos j join temporadas t on t.codigo=j.temporada where j.estado in ('pendiente','bloqueado') group by 1`. Ajusta el nombre de la columna si no es `etiqueta`. Si TODO es anterior a 2010-11, está bien y no se toca. Si hay algo de 2010-11 en adelante, apúntalo aquí.
7. **Medidas, a las 2 h del paso 3:**
   - `intervalos-peticiones.mjs federacion` en el servidor: mediana de 11-14 s y p10 de 10 s o más.
   - En el PC, `intervalos-peticiones.mjs federacion madrid valencia`: Valencia tiene que estar pidiendo, y CyL y Madrid tener menos de 10 min/h de silencios.
8. **Después de la medida del paso 7:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-flota.ps1`, para que el PC también lea las rutas de la otra máquina. Va después para no ensuciar la medida con el reinicio.

## ★ Claude, 16/10, 12:00 — TAREA COMPLETA PARA DEEPSEEK: Euskadi en euskera, Rioja, Valencia, Cataluña, provinciales (incluye lo de las 11:20)

David lo autorizó: haz TODOS los pasos tú, en este orden. Si un paso falla, apúntalo aquí con el error exacto y sigue con el siguiente que no dependa de él.

**Lo que ya está hecho en el código (Claude):**

- **Euskadi (y Bizkaia, Gipuzkoa, Araba): el parser de actas ya entiende el euskera** (`packages/ingesta/src/parsers/acta.ts`). Con las muestras de la petición 152:
  - campo y ciudad (`Futbol Zelaia:`, `Hiria:`) salían vacíos en TODAS las actas; ahora se leen;
  - temporada y jornada (`Denboraldia`, `Jardunaldia`) ahora se leen;
  - penaltis (`Penaltiaren gola`) y goles en propia puerta (`Norberaren gola`) salían como goles normales, y el de propia puerta se le apuntaba al equipo contrario. Ahora el tipo se saca de la clase del icono (`lgol`, `lpenalti`, `lgolpp`), que no depende del idioma;
  - el aviso `descuadre_alineacion_parser:29/28` (415 actas) era falso: la fuente publica a veces una jugadora sin ficha enlazada. Ya no salta (`recolector-local.mjs`).
  - Lo que NO es fallo nuestro: las 1.972 `sin_datos` traen marcador y árbitro pero ni alineaciones ni técnicos (`Ez du aurkezten` = «no presenta»). Y `titulares_atipicos:12/11` es la propia acta: publica 12 titulares.
- **La Rioja: los 15 grupos imposibles eran un fallo NUESTRO de lectura.** Son ligas nacionales (2ª B, 3ª…). La Riojana sólo enlaza a sus equipos y pinta a todos los rivales como «Descansa». Con dos riojanos en el grupo, la tabla exterior juntaba los dos enlaces y salía «S.D. Logroñés - U.D. Logroñés» en cada jornada. Arreglado en `extraePartidos` (`scripts/lib/recolector-local.mjs`). Tras reprocesar, esos grupos se quedan SIN partidos, que es la verdad: la web no publica los rivales. Herramienta nueva: `scripts/claude/grupos-pareja-repetida.mjs` (sólo lee), que lista los grupos afectados en cualquier cola y da la orden de reprocesado de cada uno.
- **Valencia como Madrid:** cuando la web niega un tipo de página (403), se aplaza 7 días SÓLO ese tipo y se sigue con los demás. Antes paraba la federación entera 24 h. Si niega un segundo tipo distinto, sí se hace la pausa de 24 h.
- **Las 5 provinciales dentro de su autonomía:** `config/federaciones-espana.json` (Bizkaia, Gipuzkoa y Araba dentro de Euskadi; Las Palmas y Tenerife dentro de Canarias) y `scripts/lib/informes-federaciones.mjs`. En el canónico cada una es su propia federación, porque los códigos PNFG chocarían. En los informes se suman a su autonomía: pedir «euskadi» incluye las tres forales.
- **Cataluña:** el aviso de cookies ahora se RECHAZA (DISAGREE) en vez de aceptarse, en el descubrimiento y en la recogida de datos. El catálogo sólo tiene 2025-26 y 2026-27: el descubrimiento del historial ya existe, pero la pasada del 08/10 se cortó por tiempo.
- Pruebas que pasan en la copia de Claude: vitest `acta` 20/20 (3 nuevas), `jornada` 6/6, `roles` 54/54; `node --test` `recolector-local` 26/26 (1 nueva), `plan-flota` e `informes-federaciones` 5/5.

**PASOS (DeepSeek), en este orden:**

1. **Pruebas en el PC.** Si alguna falla, para y pega la salida aquí.
   - `pnpm exec vitest run packages/ingesta/test/acta.test.ts packages/ingesta/test/jornada.test.ts packages/ingesta/test/presupuesto-memoria.test.ts packages/canonico/test/roles.test.ts`
   - `node --test scripts/lib/recolector-local.test.mjs scripts/lib/plan-flota.test.mjs scripts/lib/informes-federaciones.test.mjs`
   - `node --check` de `scripts/recolector-local.mjs`, `scripts/lib/recolector-local.mjs`, `scripts/recolector-valencia.mjs`, `scripts/recolector-cataluna.mjs`, `scripts/recolector-cataluna-datos.mjs` y `scripts/claude/grupos-pareja-repetida.mjs`.
2. **Compilar el parser en el PC** (los recolectores lo leen compilado): `pnpm -r --filter "@facylf/ingesta..." build`. Comprueba que `packages\ingesta\dist\src\parsers\acta.js` contiene `lgolpp` (`Select-String -Path packages\ingesta\dist\src\parsers\acta.js -Pattern lgolpp`).
3. **Código al servidor:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`. Las 4 huellas tienen que salir OK.
4. **Parser al servidor.** El despliegue sólo copia `scripts/` y `perfiles/`; el parser va dentro de la imagen.
   - `tar -cf $env:TEMP\ingesta.tar packages/ingesta/src packages/ingesta/dist`
   - `scp $env:TEMP\ingesta.tar servidor:/tmp/`
   - `ssh servidor "cd /srv/data/facylf && tar -xf /tmp/ingesta.tar && rm /tmp/ingesta.tar"`
   - `ssh servidor "docker ps --format '{{.Names}}' | grep -E 'euskadi|bizkaia|gipuzkoa|araba'"` para ver cuáles están en marcha.
   - A CADA uno de esos: `ssh servidor "docker cp /srv/data/facylf/packages/ingesta/dist/. <contenedor>:/app/packages/ingesta/dist/ && docker restart <contenedor>"`
   - Aviso: `docker cp` se pierde si el contenedor se RECREA (`up -d`); un `restart` lo conserva. La próxima vez que se reconstruya la imagen ya lo llevará, porque se construye desde `/srv/data/facylf`.
5. **PC:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-flota.ps1`. Así cogen el código nuevo Madrid, Valencia y la Rioja si está en el PC.
6. **Rioja (y cualquier otra cola con el mismo fallo).** La petición 153 (servidor) y la 154 (PC) dejan la lista en `estado/claude/respuestas/`. Si no están, lánzalo tú:
   - servidor: `ssh servidor "docker exec facylf-monitor node /app/scripts/claude/grupos-pareja-repetida.mjs"`
   - PC: `$env:FACYLF_RAIZ='F:\EspacioCodigo\facylf'; node scripts\claude\grupos-pareja-repetida.mjs`
   - **Resultado de la 153 (servidor, 09:54Z): 27 grupos.** 20 en Rioja y 7 en Castilla-La Mancha (el Albacete Balompié en su liga nacional, el mismo caso). Ninguno en las demás. Las órdenes ya hechas, DENTRO del contenedor de su federación y con su perfil (no piden nada a la web):

   - castilla-la-mancha (7 grupos), una sola orden:

     ```
     ssh servidor "docker exec facylf-castilla-la-mancha-1 sh -c 'nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/castilla-la-mancha.json --temporada 10 --competicion 405308 --grupo 405309 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/castilla-la-mancha.json --temporada 11 --competicion 488850 --grupo 488851 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/castilla-la-mancha.json --temporada 12 --competicion 675265 --grupo 675283 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/castilla-la-mancha.json --temporada 13 --competicion 890632 --grupo 890633 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/castilla-la-mancha.json --temporada 14 --competicion 1108871 --grupo 1127626 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/castilla-la-mancha.json --temporada 7 --competicion 220689 --grupo 220690 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/castilla-la-mancha.json --temporada 9 --competicion 339607 --grupo 339619'"
     ```

   - rioja (20 grupos), una sola orden:

     ```
     ssh servidor "docker exec facylf-rioja-1 sh -c 'nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 10 --competicion 795251 --grupo 795252 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 10 --competicion 795330 --grupo 795331 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 11 --competicion 823634 --grupo 823649 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 13 --competicion 1093646 --grupo 1093647 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 13 --competicion 1093660 --grupo 1093661 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 13 --competicion 1097761 --grupo 1097762 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 13 --competicion 1097763 --grupo 1097764 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 14 --competicion 1246042 --grupo 1246043 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 14 --competicion 1252793 --grupo 1252794 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 6 --competicion 348449 --grupo 348450 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 6 --competicion 361906 --grupo 361910 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 7 --competicion 362293 --grupo 362294 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 7 --competicion 362426 --grupo 362427 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 7 --competicion 364542 --grupo 364546 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 8 --competicion 375290 --grupo 375376 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 8 --competicion 375391 --grupo 375392 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 8 --competicion 375590 --grupo 375591 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 9 --competicion 777322 --grupo 777323 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 9 --competicion 777385 --grupo 777386 && nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/rioja.json --temporada 9 --competicion 777478 --grupo 777479'"
     ```

   - **PC (petición 154):** la cola VIEJA de Rioja que quedó en el PC tiene 6 de esos grupos. Se arregla igual, en PowerShell desde la raíz del repositorio:

     ```
     node scripts\recolector-local.mjs reprocesar --perfil perfiles\rioja.json --temporada 10 --competicion 795330 --grupo 795331; node scripts\recolector-local.mjs reprocesar --perfil perfiles\rioja.json --temporada 13 --competicion 1093646 --grupo 1093647; node scripts\recolector-local.mjs reprocesar --perfil perfiles\rioja.json --temporada 13 --competicion 1097763 --grupo 1097764; node scripts\recolector-local.mjs reprocesar --perfil perfiles\rioja.json --temporada 6 --competicion 348449 --grupo 348450; node scripts\recolector-local.mjs reprocesar --perfil perfiles\rioja.json --temporada 7 --competicion 362293 --grupo 362294; node scripts\recolector-local.mjs reprocesar --perfil perfiles\rioja.json --temporada 8 --competicion 375391 --grupo 375392
     ```

   - Al terminar, el guion tiene que dar 0 grupos en los dos sitios. Tras reprocesar, esos grupos se quedan sin partidos; el canónico ya los rechazaba, así que no hay nada que borrar allí.
7. **Euskadi: reprocesar lo ya descargado con el parser nuevo** (sin red), UNA temporada cada vez, y sólo después del paso 4:
   - `ssh servidor "docker exec facylf-euskadi-1 nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/euskadi.json --temporada <N>"` para N = 6, 7, 8 … 22 (son las del directorio `t<N>-…` de `/srv/data/facylf/descargas-euskadi/recolector-local/`).
   - Si una tarda más de 10 min, déjala en segundo plano con `nohup` y mira `uptime`: la carga no debe pasar de 12.
   - Haz lo mismo con las forales que ya tengan actas.
   - Comprobación, sólo lectura: en `actas.datos` de Euskadi tiene que haber campo (`"estadio":"…"`) en la mayoría de las `hecha`, y aparecer goles de tipo `penalti` y `propia-puerta`.
8. **Valencia:** su pausa terminaba a las 11:11Z del 16/10. En su registro tiene que aparecer «La web niega las páginas de tipo «clasificacion»…» y, después, peticiones de OTROS tipos. Si vuelve a pararse 24 h entera, pega las últimas 40 líneas aquí.
9. **Cataluña, más temporadas (de día, en el PC):**
   - `node scripts\recolector-cataluna.mjs descubrir --max 400`, repetido hasta que el catálogo llegue a 2015-16 (cada pasada sigue donde lo dejó la anterior).
   - Después, `node scripts\recolector-cataluna-datos.mjs preparar`, que las mete en la cola.
   - Apunta aquí qué temporadas devuelve la web. Si la web no ofrece nada antes de 2025-26, dilo tal cual: es un dato, no un fallo.
10. **Provinciales al canónico.** Cada una entra como federación propia.
    - Las del PC (mira `excluidas` en la configuración de la flota): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion tenerife -Temporada 2025-26 -SoloListar`. Si lista grupos, repítelo sin `-SoloListar` y luego con 2026-27.
    - Las del servidor: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-federacion-servidor.ps1 -Federacion bizkaia -Temporadas 2025-26,2026-27`, y lo mismo con gipuzkoa y araba.
    - Una importación cada vez, con Docker en marcha.
11. **A las 2 h del paso 5:** `intervalos-peticiones.mjs` en los dos sitios (lo de las 11:20).
    - Silencios de más de 60 s: menos de 10 min/h en CyL y en Madrid.
    - CyL en el servidor: mediana de 11-14 s y p10 de 10 s o más.

**Lo que queda abierto (no es tuyo, apúntalo si lo ves):**

- Rioja 2015-16 tiene 29 partidos menos en el canónico que en la cola, y Euskadi 2022-23 uno menos.
- El cargador del servidor.
- Las exclusiones de Defender (David).

## ✎ Claude, 16/10, 11:20 — los silencios del PC tenían causa: dos arreglos

- **Silencios de 2-4 min cada 5-8 min (CyL y Madrid).** Cada 25 trabajos se contaban las actas por reparar con un `count(*)` que recorre toda la tabla `actas` (2 GB en el PC), y CyL tiene 0. Ahora se cuenta una vez por sesión (`recolector-local.mjs` y `recolector-valencia.mjs`).
- **Silencios de ~20 min (Andalucía, Tenerife).** Es la preparación del arranque de cada sesión, que se repetía cada ~240 trabajos y cada vez que se cedía plaza (turnos de 20 min en el PC). Ahora las sesiones son de ~900 trabajos (el navegador ya se recicla dentro de la sesión) y el turno del PC es de 60 min (`entorno-flota.ps1`).
- **CyL en el servidor a 10,3 s:** la hora medida mezclaba la sesión vieja (6-8 s) con la nueva, porque el ritmo se lee al empezar cada sesión. Hay que volver a medirlo.
- **DeepSeek:**
  1. `despliega-codigo-servidor.ps1`
  2. `scripts\reiniciar-flota.ps1`
  3. A las 2 h, `intervalos-peticiones.mjs` en los dos sitios. Silencios de más de 60 s: menos de 10 min/h en CyL y Madrid. CyL en el servidor: mediana de 11-14 s y p10 de 10 s o más.

## ✎ Claude, 16/10, 10:00 — ritmos de hoy; CyL al máximo que permite su web; más plazas en el PC

- **Medido (09:35-09:44 local):** todas las federaciones van a su paso, sin ningún intervalo por debajo de 4 s.
  - Servidor: unas 1.900 peticiones/h, con carga 11, 60 °C y la batería estable al 59 %. Va al tope de CPU que le dejamos (250 %) por el cargador.
  - PC: mediana de 7,1 s en las PNFG y de 5,2 s en Madrid, sin silencios.
  - Andalucía y Tenerife estaban esperando plaza en el PC.
- **CyL y la regla de una petición cada 5-8 s POR SITIO.** CyL se recoge desde las DOS máquinas contra la MISMA web: ~313/h en el servidor más ~450/h en el PC son unas 750/h, una cada 4,8 s, por encima de lo que nos hemos puesto. Ahora cada máquina va a 10-13 s (`recolector.config.json` en el PC; en el servidor hay que cambiarlo en su copia). Entre las dos suman ~520/h, una cada ~7 s. **Ése es el techo de CyL**, se reparta como se reparta.
- **PC (`entorno-flota.ps1`):** `FACYLF_MEMORIA_GB` pasa de 4,5 a 6 (6 plazas: la reservada de CyL y 5 más, para que entren Andalucía y Tenerife) y `FACYLF_RESERVA_GB` de 1 a 3: si a David le quedan menos de 3 GB libres, las demás no abren navegador. CyL abre con 1 GB (`recolector-local.mjs`).
- **DeepSeek, en este orden:**
  1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`
  2. `scp scripts\servidor\ritmo-cyl-servidor.sh servidor:/tmp/` y `ssh servidor bash /tmp/ritmo-cyl-servidor.sh`. Tiene que mostrar 10 y 13; si no, dilo y no sigas (guarda copia del fichero antes de tocarlo).
  3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-flota.ps1` (para que el PC lea las 6 plazas).
  4. Dentro de 1 h: `intervalos-peticiones.mjs` en los dos sitios. `federacion` tiene que dar una mediana de 11-14 s en CADA máquina, y Andalucía y Tenerife tienen que estar pidiendo en el PC.

## ✎ Claude, 16/10, 09:30 — el PC se quedó sin flota 12 h; la prioridad de CyL funciona; el servidor está bien

- **Servidor (foto de las 00:43): correcto.** Hay 5 navegadores: 4 compartidos más `slot-prioridad.lock` (CyL). La carga es 10. Los 56 procesos de Chrome son esos 5 navegadores (cada uno abre unos 11 procesos). El resto espera su turno, como debe.
- **Dónde está `slot-prioridad.lock`:** en el PC, en `F:\EspacioCodigo\facylf\.estado-workers\slots-chrome\`; en el servidor, en el volumen `plazas` (`docker exec facylf-monitor ls /app/.estado-workers/slots-chrome`). En el PC aparece en cuanto CyL termina su preparación de arranque; hoy a las 09:17 aún estaba preparando.
- **Batería:** «Not charging» al 59 % con el cargador enchufado es el modo conservación de Lenovo (no carga por encima de ~60 %), así que es normal. Lo que NO es normal es lo de ayer: con la carga a 35 se vació hasta el 4 % enchufado. El cargador no da para la carga alta. **Se queda en 250 %** hasta que haya un cargador más potente.
- **PC: los dos supervisores (flota y multideporte) murieron hacia las 21:09 del 15/10 y otra vez a las 09:09 del 16/10**, sin dejar rastro (su consola es invisible). La flota estuvo parada 12 h porque las tareas sólo se relanzan al iniciar sesión y a las 06:05.
  - **Cambiado (Claude):** `supervisor-flota.mjs` ahora anota en su registro cualquier excepción y su código de salida. `registrar-tarea-flota.ps1` y `multideporte/registrar-tarea-multideporte.ps1` tienen un disparador cada 30 min: con `IgnoreNew` y el candado del supervisor, si está vivo no hace nada y si murió lo levanta.
  - **DeepSeek (David lo autorizó):** lanzar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tarea-flota.ps1` y `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\multideporte\registrar-tarea-multideporte.ps1`. No reiniciar la flota: el supervisor que va ahora sigue, y el código nuevo entra en el siguiente arranque. Después, `Get-ScheduledTask 'FACyLF flota' | Select -Expand Triggers` tiene que mostrar 3 disparadores.

## ⚠ Claude, 15/10, 17:35 — URGENTE: servidor con carga 35, 9 navegadores en vez de 5 y batería al 4 %

- **Petición 148:**
  - carga 31-35, presión de CPU 92 %;
  - **9 contenedores con Chrome abierto** (aragón, asturias, baleares, cantabria, CLM, extremadura, galicia, navarra y federación) y sólo 3 fichas de plaza;
  - **batería al 4-5 % «Charging» con el cargador enchufado**: el cargador no da para tanta carga. Si llega a 0, se apaga (5.ª caída).
- **Causa (fallo mío, ya corregido en el código):** la ficha de plaza sólo latía ENTRE trabajos. Con la máquina lenta, un trabajo o un reciclado de Chrome pasaba de 5 min sin latido, los que esperaban daban la plaza por abandonada y abrían otro navegador. Al alargar la espera a 3 h, los que esperaban se quedaron vigilando todo el rato y la espiral se disparó. Ahora la ficha late cada minuto con un reloj propio (`relojDeLatido`). Además, la revisión de competiciones sin datos pasa a ser una vez al día por cola.
- **DeepSeek, YA (David lo autorizó):**
  1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`
  2. `ssh servidor "sudo systemctl set-property --runtime facylf.slice CPUQuota=250%"` (menos consumo mientras la batería se recupera).
  3. `ssh servidor "docker restart facylf-aragon-1 facylf-asturias-1 facylf-baleares-1 facylf-cantabria-1 facylf-castilla-la-mancha-1 facylf-extremadura-1 facylf-galicia-1 facylf-navarra-1 facylf-murcia-1"` (cierra los navegadores de más; vuelven con el código nuevo y respetan las plazas). `federacion` NO se reinicia.
  4. A los 15 min, sólo lectura: `docker stats --no-stream`. Tiene que haber como mucho 5 contenedores con ~700 MB, la carga tiene que bajar de 15 y `tail -3 /var/log/facylf-temperatura.log` tiene que mostrar que la batería SUBE.

## ✎ Claude, 15/10, 14:00 — CyL primero, Madrid sin pausas, Cataluña, Navarra y las 5 provinciales

**Hecho en el código** (pruebas: vitest presupuesto-memoria 36/36; `node --test` plan-flota y recolector-local 39/39):

1. **Prioridad de CyL en las dos máquinas.**
   - Plaza de navegador RESERVADA (`slot-prioridad.lock`) que no se cede por turno; mientras CyL la usa, las demás reparten una plaza menos, así que el número total de navegadores no sube.
   - Quien ocupe la plaza que sobra la suelta entre trabajos (`recolector-local.mjs` y `lib/presupuesto-memoria.mjs`).
   - En el servidor, `cpus: 1.0` para `federacion` (`compose-turnos.yml` y `calcula-turnos.mjs`).
   - **Hoy a las 12:51 CyL estaba en el servidor ESPERANDO plaza.**
2. **Madrid.** La API devuelve `null` (4 B) en el índice de un grupo sin jornadas, y eso contaba como fallo: cinco seguidos y **una hora de pausa global** (48 veces en dos días). Ahora es «vacío esperable» (`recolector-valencia.mjs`, `indice_jornadas`). También beneficia a Valencia.
3. **Cataluña.**
   - **(a)** 294 grupos de 2025-26 tienen el calendario con las jornadas repetidas (de antes del arreglo): 41.646 filas de partidos para 14.293 actas reales. En `preparar` se vuelven a leer (una vez por semana como mucho).
   - **(b)** El aviso de cookies tapaba el calendario (81 veces): ahora se pulsa RECHAZAR.
   - **(c)** Se encolan las actas de partidos ya jugados que nunca entraron en la cola (693 en 2026-27; sólo códigos que aparecen una vez).
   - Pendiente de decidir: su catálogo sólo tiene 2025-26 y 2026-27.
4. **Navarra.** No es el lector: su web da las fichas VACÍAS (sobre todo de categorías de base de temporadas viejas): 7.485 actas «sin datos». Ahora, en una competición de una temporada cerrada con ≥10 fichas vacías y ninguna con datos, el resto se cierra sin pedirlo (`cierraCompeticionesSinDatos`). En CyL no afecta a nada (comprobado: 0 competiciones).
5. **Bucle de espera de plaza.** El tope de espera pasa de 15 min a 3 h. Con 15 min nadie llegaba a su turno: al relanzarse, la federación perdía su sitio en la cola (Asturias llevaba 16 h sin pedir).
6. **Las 5 provinciales** (Bizkaia, Gipuzkoa, Araba, Las Palmas y Tenerife) entran en la flota del **PC** (`plan-flota.mjs`). Su catálogo ya estaba en el PC, y el servidor no admite más carga. El canónico todavía no las conoce (falta su entrada en `federaciones-espana.json`; decisión de David); se recogen igual.

**Lo que tiene que lanzar David** (cambia cosas):

1. PC: reiniciar la tarea **«FACyLF flota»**, para que el supervisor coja las 5 provinciales (lo demás entra solo en la siguiente sesión de cada recolector).
2. Servidor: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1` (los recolectores lo usan en su siguiente sesión) y `ssh servidor docker update --cpus=1.0 facylf-federacion-1`.
3. Servidor: volver a lanzar el blindaje con `--aplicar --sin-apt` (ahora apunta también la batería y el cargador). **Revisar el cargador.**

**DeepSeek (sólo lectura):** dentro de 2 h, con `ritmo-peticiones.mjs` y la sección de plazas de `servidor.txt`, comprobar:
- que `federacion` tiene `slot-prioridad.lock` en los dos sitios y pide sin parar;
- que Madrid ya no tiene «Pausa global preventiva» y pasa de 300 peticiones/h;
- que Cataluña lee calendarios y actas;
- que las 5 provinciales piden a 6-8 s en el PC.

No tocar plazas, turnos ni ritmo.

## ✎ Revisión de Claude del 15/10, 13:00 — lo que falta de verdad son ACTAS, no «vencidos»; y la 4.ª caída apunta al cargador

Medido con las peticiones 143, 144 y 145 y con lecturas directas de las colas del PC. **La medida buena de «cuánto falta» son las actas pendientes** (partidos jugados con código de acta y sin acta hecha), más los calendarios que no se han leído. Los «vencidos» mezclan repasos de clasificaciones y de jornadas.

- **CyL NO está a punto de terminar.**
  - PC, temporadas impares: ≈10.000 actas pendientes (2023-24: 5.140; 2013-14: 1.832; el resto entre 500 y 700 cada una).
  - Servidor: ≈8.450 (2014-15: 4.935; 2020-21: 2.044; 2016-17, 2018-19, 2022-23 y 2024-25: 300-400 cada una).
  - Además, 2012-13 está casi sin leer (155 grupos, 154 vacíos) y 2014-15 tiene los calendarios a medias (7.049 partidos, frente a ~20.000 en otras temporadas).
  - «13/13 exactas» se refería a partidos, no a actas. Total ≈ 25.000-35.000 actas: unos 3-4 días al ritmo actual de CyL (~400-500 actas/h entre las dos máquinas).
- **Actas pendientes por federación.**
  - Servidor: galicia 59.142 · aragón 13.647 · baleares 13.089 · CLM 8.601 · murcia 7.752 · asturias 7.456 · extremadura 6.236 · cantabria 5.140 · navarra 4.193 · euskadi 360 · rioja 4 · melilla 2 · ceuta 0 · canarias 0.
  - PC: andalucía ≈87.600 · madrid ≈47.900 · valencia ≈7.700 (bloqueada) · cataluña: por medir (la copia vieja del servidor tenía ~89.000).
- **«Terminadas» que lo están de verdad:** Ceuta y Melilla. Rioja también, con lo que publica su web (en 2010-13 no hay códigos de acta); sólo le quedan los calendarios de 2008-10.
- **«Terminadas» que NO lo están:**
  - Euskadi: 2.793 actas en estado «otras» (ilegibles) y 360 pendientes.
  - **Canarias y Euskadi sin sus federaciones provinciales**: Las Palmas, Tenerife, Bizkaia, Gipuzkoa y Araba tienen la cola VACÍA y no arrancan («No existe descargas-<fed>/competiciones-por-temporada.json»).
- **Desperdicio que hay que corregir (Claude).**
  - Madrid: 1.169 peticiones en 24 h y sólo 54 actas.
  - Andalucía: 2.048 peticiones y 731 actas. Las dos gastan en repasos y no en actas.
  - Navarra: 573 actas ilegibles de 2.754 peticiones (7.679 «otras» en total).
  - Asturias: 0 peticiones desde el 14/10 a las 18:14, en bucle de caída esperando plaza (5 plazas de navegador en el servidor).
  - El importador del servidor gasta un núcleo en grupos de la copia VIEJA de Andalucía, que se cortan a los 60 min.
- **4.ª caída (14/10, 20:14).** Dos horas después de arrancar, la batería estaba al **49 % y cargando**, cuando se supone que siempre está enchufado. Es decir, se había descargado: **el cargador no da para la carga** (o falla la conexión), el portátil tira de batería hasta agotarla y se apaga del todo. Encaja con el apagado sin rastro y con que el vigilante no pudiera hacer nada. Batería al 68 % de su capacidad de diseño. `blindaje-servidor.sh` ahora apunta también la batería y el cargador cada minuto (David: volver a lanzarlo con `--aplicar --sin-apt`).

## ✎ Revisión de Claude del 14/10, 12:30 — el PC va a ~1/3 de lo que puede: NO es falta de trabajo

- **No sembrar Madrid ni Andalucía**: tienen decenas de miles de trabajos vencidos; más cola no cambia nada. Cataluña sólo si hay temporadas históricas sin recoger (compruébalo antes; su temporada en curso está al día).
- **Medido hoy (desde las 10:05) en la tabla `peticiones`:** cuando piden, van al ritmo respetuoso (mediana entre peticiones: Madrid 5,2 s, Andalucía 7,4 s). Pero se pasan **la mitad del tiempo callados**: Madrid 15 silencios de más de 1 min (47 min en total), Andalucía 15 (55 min), en unos 90 min. Ejemplo: Madrid, 18 min sin escribir nada (11:48–12:05) en mitad de una sesión y con el proceso vivo.
- **No son las plazas** (2 ocupadas de 4, y Madrid no usa navegador) **ni la reserva de memoria** (3,7 GB libres frente a 1,5 de reserva). Sospechosos: el PC justo de memoria (2,7–3,7 GB libres de 32, con 17 recolectores multideporte más Codex, Adobe y astro) y, en Andalucía, que el navegador se cae y que cada sesión de 240 trabajos vuelve a encolar ~1.000 jornadas y clasificaciones recientes, que pasan delante de las actas atrasadas.
- **CyL (`federacion`) también trabaja en el PC** (actas de la temporada 9); faltaba en tu tabla.
- **El techo real:** 3 federaciones × 450–700 peticiones/h ≈ 1.500–2.000/h. Ahora hacemos ~400–600.
- **Petición 141 (12:35): el PC está al 100 % de CPU.** Madrid, mientras calla, gasta 0,1 s de CPU en 90 s y tiene una conexión abierta con la web: espera a la red, no a la máquina. Pero Andalucía tarda unos 25 s por trabajo en vez de ~8 (sesión de 240 trabajos entre 10:50 y 12:29), y el planificador ya no contesta a tiempo («sin dato del planificador»: la espera entre sesiones sube de 20 s a 300 s, también en CyL). Lo más gordo en CPU acumulada es el propio arnés de DeepSeek (3 procesos, uno con 3,3 GB), seguido de Docker, Brave y ChatGPT. La petición 142 mide quién gasta la CPU AHORA.
- **Siguiente paso, de Claude:** la petición 141 mide CPU, red y memoria de cada recolector durante los silencios; con eso se arregla el código. **DeepSeek:** no tocar ritmo, plazas ni turnos, y no sembrar.

## ✎ Revisión de Claude del 14/10, 10:30 — tercera caída del servidor SIN traídas; blindaje preparado

- **Tabla de lo movido a E: correcta** (6 carpetas, ≈16,3 GB, F: a 73 GB). Sigue igual con las 11 restantes, una a una, anotando cada una al moverla.
- **Tercera caída: 14/10 03:18 hora local, sin ninguna traída en marcha.** El diario se corta en seco igual que las dos anteriores (sin OOM, sin bloqueos, sin errores de disco; SMART bien). Así que la flota sola basta para tumbarlo: carga 14-23 en 4 núcleos, presión de CPU ~90 %, de E/S 66-90 %, rebanada pegada a sus 12 GiB.
- **Preparado `scripts/servidor/blindaje-servidor.sh`** (lo lanza David a mano, como root; por defecto en seco, `--aplicar` para aplicarlo, `--deshacer` para quitarlo):
  1. `facylf.slice`: CPUQuota=300 %, CPUWeight=50, IOWeight=50, MemoryHigh=11G (aire para el sistema);
  2. sysctl: `kernel.panic=10`, `panic_on_oops=1`, `softlockup_panic=1`, `hardlockup_panic=1`, `swappiness=10` (si se cuelga, se reinicia solo y los contenedores vuelven con `unless-stopped`);
  3. vigilante de HARDWARE iTCO_wdt (ya está en la placa, nadie lo usaba) + `RuntimeWatchdogSec=30s` en systemd: si se congela, la placa lo reinicia;
  4. `sysstat` cada minuto + `/var/log/facylf-temperatura.log` (temperatura, MHz y carga cada minuto).
- **Petición 140: el servidor es un PORTÁTIL** (Lenovo G50-80, i5-5200U de bajo consumo, 2 núcleos / 4 hilos) a plena carga 24 h: 69 °C a los 15 min de arrancar. El calor es el primer sospechoso; limpiar el ventilador y levantarlo es cosa de David.
- **Para DeepSeek:** nada de traídas hasta que David aplique el blindaje. Después, una a la vez y solo de día. No tocar plazas ni turnos del servidor.

## ✎ Revisión de Claude del 14/10, 02:30 — la prueba 19 era el FIXTURE, no el arreglo

Bien parado otra vez. La prueba 19 nueva cogía las dos jornadas de la base, que son la **misma pareja en el mismo lado**. El guardián del «calendario imposible» saltaba antes de llegar a lo que la prueba quería comprobar, y hacía bien. Ahora la prueba usa sólo la jornada 1 (ida y vuelta) y quita uno de esos dos partidos. **El código del importador no cambia.**

**Castilla-La Mancha está fría** (sólo el `-shm` de SQLite, que se toca al abrir). Puedes moverla.

**Qué hacer:**

1. `pnpm exec vitest run packages/canonico`: tienen que pasar **las 194**. Si falla alguna, pégala y para.
2. Reimporta los tres grupos de la revisión de las 02:00 (navarra 23018560 y euskadi 24307653 y 24950282).
3. Espacio: castilla-la-mancha, y después asturias, murcia…, de una en una, con el escaneo recursivo. Anota cada una.

## ✎ Revisión de Claude del 14/10, 02:00 — CyL 13/13 ✓ y dos arreglos más

**CyL 13 de 13 exactas**, verificado con la regla buena. Muy bien.

Bien visto también lo de la **fecha de la carpeta**: sólo vale la comprobación **recursiva**, fichero a fichero. Castilla-La Mancha tiene un fichero del 07/10, así que **no se mueve** hasta que se sepa qué lo escribió. Apúntalo como pregunta para Claude con la ruta de ese fichero.

**Arreglado 1 — el JSON de fallos «vacío».** No estaba vacío: con **un solo** fallo, PowerShell 5.1 escribía un **objeto suelto** en vez de una lista, y quien lo leía como lista veía cero. Ahora `importacion-fallos-*.json` es **siempre una lista**, también con uno.

**Arreglado 2 — «partidos 4≠5» (Navarra 2026-27, grupo 23018560; y los 2 de Euskadi 2026-27).** Son partidos que la federación **ya no publica** (aplazados recolocados, fases rehechas) y que el canónico conservaba.

- El importador ahora **los retira** con todo lo que cuelga de ellos y deja el aviso `partidos_que_la_fuente_ya_no_publica`.
- **Con tope**: si faltan más de 2 **y** más del 10 % del grupo, no retira nada. Lo trata como origen viejo, falla como antes y deja el aviso `partidos_de_mas_en_el_canonico_sin_retirar`.
- **Prueba 19 nueva.**

**Qué hacer:**

1. Desde la raíz: `pnpm exec vitest run packages/canonico`. Tienen que pasar **todas** (194). Si falla alguna, pégala y para.
2. Reimporta esos tres grupos con su paquete del día. Mira `mira-lote.mjs --avisos navarra` y `--avisos euskadi`: tiene que salir el aviso de partidos retirados.
   ```powershell
   $env:FACYLF_COLA_NAVARRA = 'F:\EspacioCodigo\facylf\_traspaso\navarra-2026-27.sqlite'
   pnpm importar --federacion navarra --temporada 2026-27 --grupo 23018560
   $env:FACYLF_COLA_EUSKADI = 'F:\EspacioCodigo\facylf\_traspaso\euskadi-2026-27.sqlite'
   pnpm importar --federacion euskadi --temporada 2026-27 --grupo 24307653
   pnpm importar --federacion euskadi --temporada 2026-27 --grupo 24950282
   ```
3. **Espacio**: sigue con el escaneo recursivo, de una en una, y mueve sólo las frías de verdad. Anota cada una.
4. **Traídas**: siguen paradas mientras el PC se apaga de noche. De día, una pasada a la vez con el script, que ya espera solo.

## ✎ Revisión de Claude del 14/10, mañana — la prueba 10, arreglada

**Bien parado**: la prueba 10 se rompió por **mi** cambio de la madrugada, y no reimportar fue lo correcto.

- **Qué rompía**: mi arreglo del acta aplazada apartaba la segunda copia cuando **una misma acta** está citada por **dos partidos de jornadas distintas**, cada uno con su fila de acta. Es justo el caso de la prueba 10.
- **Ahora** el importador busca primero el partido que cita el código **en la jornada del acta**. Sólo si no hay ninguno toma el de otra jornada (el aplazado de la prueba 18), y aparta la copia únicamente cuando la jornada buena ya tiene su propia fila.
- Las dos pruebas (10 y 18) cubren los dos casos (`packages/canonico/src/lote.ts`).

**Qué hacer:**

1. Desde la raíz: `pnpm exec vitest run packages/canonico`. Tienen que pasar **todas** (193). Si falla alguna, pégala y para.
2. `pnpm importar --federacion castilla-leon --temporada 2013-14 --grupo 3768`. Esperado: valida, y CyL queda 13/13.
3. **Espacio — E: es interno (lo comprobaste: SATA, disco 2)**, así que adelante con las **14 federaciones del servidor**, del apartado «Claude, 14/10» de `docs/ESPACIO-EN-DISCO.md`:
   - **de una en una**: comprueba que su fichero más nuevo es anterior al 29/09, mueve con `robocopy /MOVE`, crea el enlace y verifica leyendo a través de él;
   - **la flota no hace falta pararla** (las excluye);
   - **anota cada una** en la tabla de ese documento;
   - empieza por las grandes: castilla-la-mancha, asturias, murcia…
4. **Navarra 2026-27, 1 fallo**: pega aquí el motivo de `importacion-fallos-navarra-2026-27.json` (si es «origen trae menos», es la familia conocida).

## ✎ Revisión de Claude del 14/10, madrugada

**CyL 2013-14, grupo 3768 «I FASE - ÁVILA»: arreglado en el código.** El fallo era `actas analizadas 145≠144` y lo que cuelga de UNA acta: 27 participaciones, 13 eventos y 2 técnicos.

- **Causa**: el importador buscaba el partido del acta con la jornada guardada **en la fila del acta**, no con la del partido.
- **Efecto**: en un partido aplazado (el calendario lo pone en una jornada y la cola guardó el acta bajo otra), el acta quedaba como «acta sin partido», mientras el recuento del origen sí la contaba.
- **Arreglo**: ahora se une por el código con la jornada del partido (`packages/canonico/src/lote.ts`).
- **Prueba 18 nueva**: un acta guardada bajo otra jornada entra y valida.

**Y un fallo pequeño mío**: en `importacion-resumen-*.json`, `gruposVistos` salía mal (188 en vez de 231) porque el bucle que junta el motivo reutilizaba `$i`. Ya está corregido.

**Qué hacer:**

1. Desde la raíz: `pnpm exec vitest run packages/canonico`. Tienen que pasar de la **15 a la 18**.
2. Reimporta sólo ese grupo (es del PC, cola viva):
   `pnpm importar --federacion castilla-leon --temporada 2013-14 --grupo 3768`.
   Esperado: valida, y CyL queda con **13 de 13** temporadas exactas en lo que ya tiene.
3. **Espacio en F:**: sigue `docs/ESPACIO-EN-DISCO.md`, apartado «Claude, 14/10». Empieza por el punto 2 (lo viejo de `_traspaso`, ≈ 4,5 GB, sin enlace).
   Antes de crear ningún enlace a E: hace falta que David confirme que E: es un disco **interno**.

**Sobre el servidor**: el `facylf.slice` tiene un tope de 12 GiB y cada contenedor el suyo, así que la flota **no puede** quedarse con toda la RAM. Las dos caídas no tienen rastro de falta de memoria. Lo que sí está al límite es la **CPU** (carga 14-17 en 4 núcleos).

- Mientras sea así, **nada de traídas mientras la carga pase de 14** (el script ya lo hace solo).
- **De noche, sin PC, no hay traídas**: correcto.

## ✎ Revisión de Claude del 13/10, noche — EL SERVIDOR NO SE SOBRECARGA

**Corrección de Claude.** El 13/10 por la mañana escribí que la memoria «no era un problema» y que T-10 era innecesario. David dice que el servidor se cae cuando se le sobrecarga, y las dos caídas (11/10 y 13/10) fueron con la flota al tope y traídas encadenadas encima. **Lo que vale es su regla**, no mi lectura de la caché. T-10 vuelve a estar abierto como pregunta, pero lo decide David.

**La regla ya no depende de acordarse: está en el script.** `scripts\claude\trae-federacion-servidor.ps1` ahora:

- **mide el servidor antes de cada temporada**, con la memoria disponible del sistema, la swap usada y la carga a 1 minuto. Si la memoria disponible baja de **3 GiB**, la swap pasa de **1 GiB** o la carga pasa de **14**, **espera** (mirando cada minuto) y, tras 30 min sin margen, **para**;
- trae **como mucho 4 temporadas por pasada** (`-Maximo`): para más, otra pasada más tarde;
- deja una **pausa de 3 min** entre temporadas;
- extrae con **prioridad mínima** (`nice 19`), escribe el paquete en el disco de datos y ya no usa `docker cp`, que duplicaba la copia;
- mide también **después** de cada traída y lo escribe;
- con `-SoloMedir` sólo dice si hay margen.

Probado (petición 138): se analiza sin errores en PS 5.1. Ahora mismo marca **8,7 GiB disponibles, swap 0,1 y carga 11,8: hay margen**.

**La regla está escrita** en `AGENTS.md`, `TRABAJO-CONTINUO-DEEPSEEK.md` («Lo que NUNCA se hace») y en los límites del GOAL.

**Qué hacer a partir de ahora:**

1. Navarra **de noche**, una pasada de 4 temporadas: `trae-federacion-servidor.ps1 -Federacion navarra -Todas`. El script corta solo en 4 y espera si no hay margen.
2. Cuando termine, la siguiente pasada de Navarra o la siguiente federación, **nunca dos a la vez**.
3. Si el script se para por falta de margen, **no lo fuerces**: anótalo y vuelve a intentarlo una hora después.

**Lo de Rioja y Euskadi** (las listas que pedí): recibidas. Son para Claude, sin prisa:

- los 15 grupos de Rioja con «calendario imposible» se limpiarán en la cola;
- los 2 de Euskadi 2026-27 son fases cortas con un partido que la federación ya no publica.

**CyL 2013-14** (un solo grupo, 725/3768, con 176 partidos de más en la cola): lo miro yo, no lo toques.

## ✎ Revisión de Claude del 13/10, 18:00 — Rioja y el choque de inscripciones

Bien medido lo de Galicia, Murcia y CLM (era el turno), y bien lo de Ceuta: sin trabajo vencido hasta mañana a las 14:12 UTC, así que su 0 es correcto.

**El fallo de Rioja 2026-27 tiene arreglo.** Lo diagnostiqué con una herramienta nueva de sólo lectura, `node scripts\claude\mira-inscripciones.mjs <fed> <temp> <grupo> [paquete]`.

- **Qué tenía el canónico**: los 32 equipos de los dos grupos entraron en una importación anterior **sin código federativo**, y su identidad era el nombre normalizado («ud logrones b»).
- **Qué trae el paquete de hoy**: los **mismos equipos con su código** y, en algunos, **otra ortografía** (`UD LOGROÑÉS "B"`, `NÁXARA "B"`, `VIANÉS "B"` con comillas).
- **Por qué chocaba**: el importador buscaba el equipo-temporada por el nombre literal. Con las comillas creaba uno nuevo, que chocaba con la inscripción que ya tenía ese nombre normalizado.
- **Arreglo** (`packages/canonico/src/resolucion/equipo.ts`): si el grupo ya tiene una inscripción con esa referencia, se reutiliza su equipo-temporada y el código se **vincula** a ella. Es lo mismo que ya se hacía con el código.
- **Prueba 17 nueva**: un equipo entra sin código ni comillas y vuelve con código y comillas; quedan las mismas 2 inscripciones, ahora con código.
- `vitest.config.ts` lleva ya `hookTimeout: 90_000`: no hace falta el `--hookTimeout`.

**Qué hacer:**

1. Desde la raíz: `pnpm exec vitest run packages/canonico`. Tienen que pasar la **15, la 16 y la 17**.
2. Reimporta los dos grupos con el paquete de hoy:
   ```powershell
   $env:FACYLF_COLA_RIOJA = 'F:\EspacioCodigo\facylf\_traspaso\rioja-2026-27.sqlite'
   pnpm importar --federacion rioja --temporada 2026-27 --grupo 21959333
   pnpm importar --federacion rioja --temporada 2026-27 --grupo 21959335
   ```
   Comprueba con `mira-inscripciones.mjs`: 16 inscripciones en cada grupo, todas con código.
3. Este choque saldrá en **cualquier federación** cuyos equipos entraron sin código y ahora lo traen. Si aparece otro `team_entry_referencia_contextual_uq` **después** de este arreglo, pega la salida de `mira-inscripciones.mjs` de ese grupo.

## ✎ Revisión de Claude del 13/10, tarde — el −35 de CyL 2026-27

Bien cerrado: 5 de 6 exactas, y bien visto que los imposibles se releen **después** de importar.

**El −35 tiene arreglo en el código.** Los dos grupos fallan porque el canónico tiene una fila **de más** que la fuente ya no publica. Es la temporada en curso: la federación corrige actas y calendarios.

- **Primera - Ávila (24218942)**: 624 participaciones en el canónico y 622 en el acta corregida (le han quitado dos convocados).
- **Primera - León (24219046)**: 22 árbitros designados y 21 en el calendario corregido (a un partido le han quitado el árbitro).

El importador sólo retiraba las filas viejas en los partidos cuyos equipos «reparaba». Ahora (`packages/canonico/src/lote.ts`):

- **Alineaciones**: en cada partido cuya acta reescribe, retira lo que el acta ya no trae. La comparación incluye titular o suplente, para que un jugador que cambia de lista no quede duplicado.
- **Árbitro**: si la fila del calendario ya no lo trae, retira la designación vieja.

Hay una **prueba 16** nueva que lo comprueba: un convocado menos y el árbitro retirado, y el lote valida.

**Qué hacer:**

1. Desde la raíz: `pnpm exec vitest run packages/canonico`. Tienen que pasar la **15** y la **16**. Si falla alguna, pega la salida y no sigas con el paso 2.
2. Reimporta sólo esos dos grupos desde el paquete de hoy:
   ```powershell
   $env:FACYLF_COLA_CASTILLA_LEON = 'F:\EspacioCodigo\facylf\_traspaso\federacion-2026-27.sqlite'
   $env:FACYLF_APARTAR_ACTAS_DISCORDANTES = '1'
   pnpm importar --federacion castilla-leon --temporada 2026-27 --grupo 24218942
   pnpm importar --federacion castilla-leon --temporada 2026-27 --grupo 24219046
   ```
3. Esperado: **4.100 = paquete** (sin imposibles), con `apariciones_obsoletas_retiradas` = 2 en el primero. Entonces CyL tiene **las 6 exactas**.
4. Lo mismo valdrá cada lunes al reimportar la temporada en curso: estos descuadres de «una fila de más» ya no deberían volver.

## ✎ Revisión de Claude del 13/10, mediodía — LEER ANTES DE SEGUIR

**Bien resuelto lo de Docker Desktop**: la causa estaba bien identificada y relanzar fue lo correcto. 2020-21 con +3.623 partidos y 10 actas apartadas es justo lo que se buscaba.

**Arreglado: el importador ya no se rinde si el canónico se cae.** `importar-temporada.ps1`, cuando un grupo falla por `ECONNREFUSED`, canónico no disponible o conexión cortada:

- espera hasta 45 min a que vuelva el puerto (lo lee de `.env`: 5433), mirando cada 30 s, y repite ese grupo;
- si no vuelve, para la pasada con un mensaje claro y sale con código 2;
- el resumen JSON lleva `completa`, `gruposVistos` y `gruposTotales`.

Probado en el PC (petición 136): se analiza sin errores en PS 5.1, lee el puerto y lista. Las 5 pasadas que tienes en marcha usan la versión anterior (PowerShell lee el guion al empezar); las siguientes ya usan esta.

**Corrección: `peticiones` sí cuenta `grupos` y `catalogo_temporada`.** Esos trabajos navegan con `navega()`, que registra cada petición. Lo comprobé en la cola del servidor (petición 135):

- **Galicia, Murcia, Castilla-La Mancha y Ceuta no han hecho NI UNA petición desde el 11/10 a las 22:30-23:14 UTC**, antes del apagón.
- Los miles de trabajos «tocados» de estas 3 h son `grupos hecho`, `jornada pendiente` y `clasificacion pendiente` con `actualizado_en` de hoy. Eso lo deja el **arranque**: el plan se rehace desde el catálogo y se reordenan las prioridades. Es la trampa ya anotada: **la actividad se mide con `peticiones`, nunca con `trabajos.actualizado_en`.**
- Euskadi, en cambio, sí pide (437 `ok` en 3 h) y sí termina trabajos de verdad (`acta hecho` 281, `jornada hecho` 90).
- **Lo más probable es el turno de plaza de navegador**, no una avería. No caben las 19 a la vez; cada federación conserva la plaza de 4 a 8 h (`compose-turnos.yml`: Galicia 330 min, CLM 240 min). Tras el arranque, otras la cogieron primero.
- **Prueba**: si a las **17:30 UTC** (8 h tras el arranque) alguna de las cuatro sigue con **0 peticiones** desde el 11/10, es avería. Pega para Claude:
  - las últimas 40 líneas de su registro (`docker logs` sale vacío: el registro va a un fichero, en `descargas-<fed>/recolector-local/`);
  - la salida de `bash scripts/servidor/analiza-sin-trabajo.sh <fed>` si existe.
  
  No toques turnos ni topes.

**Para David** (ya anotado): Docker Desktop se reinició solo (parada limpia a las 11:45 y arranque a las 12:17). Si se repite, mira si fue una actualización de Docker Desktop. No se toca ningún ajuste del PC.

## ✎ Revisión de Claude del 13/10 (servidor de vuelta) — LEER ANTES DE SEGUIR

Muy bien visto lo de los paquetes y lo de la orden de pruebas: tenías razón en las dos.

**Arreglado:**

1. **Paquete viejo**: `importar-temporada.ps1` busca en `_traspaso` los paquetes de la temporada (`federacion-<t>`, `<fed>-<t>` y los antiguos `cyl-<t>`) y **rechaza** uno si hay otro más nuevo de la misma temporada (`-PaqueteViejo` lo fuerza). Sin `-Paquete`, te sugiere el más nuevo con su fecha. Probado en el PC (petición 131): rechaza `cyl-2020-21` (07/10) y acepta `federacion-2020-21` (13/10).
2. **Orden de pruebas** corregida en el GOAL: `pnpm exec vitest run packages/canonico` desde la raíz.

**Corrección: 2014-15 y 2012-13 SÍ están en la cola del servidor** (petición 132, leyendo la cola directamente):

- 2014-15 (código 10): **7.909 trabajos**, el descubrimiento hecho (58 competiciones, 361 grupos con índice de jornadas) y **7.466 vencidos** sin error: 5.219 jornadas, 1.525 actas, 361 calendarios, 361 clasificaciones.
- 2012-13 (código 8): **1.772 trabajos**, 1.641 vencidos.
- No salen en tu listado porque todavía **no tienen partidos** (aún no se ha bajado ninguna jornada), y la lista de temporadas de `trae-federacion-servidor` sale de los datos.
- Van al final a propósito (`temporadas-asignadas-servidor.txt`: «se empiezan cuando las de arriba se queden sin trabajo»). El servidor tiene unos **21.700 trabajos vencidos** en sus temporadas de CyL. Al ritmo actual tardará días en llegar a 2014-15, así que **no hay que hacer nada**: se traen cuando tengan partidos.
- La 2013-14 (código 9) es del PC: 47 trabajos sin empezar en la cola del servidor, que no los hará.

**A vigilar, servidor tras el arranque (peticiones 133 y 134):**

- `facylf.slice` estaba en **11,6 de 12 GiB** a las 10:04, con carga 12,5 en 4 núcleos.
- CyL hizo **60 peticiones en la primera hora**, con el contenedor al 94 % de CPU. Galicia, Murcia, Castilla-La Mancha, Baleares y Ceuta hicieron **0**; puede ser el sistema de turnos.
- **Memoria: no es un problema** (petición 134). De los 11,6 GiB, **7,2 son caché de disco** (recuperable) y **4,4 son de procesos**. Presión «full» de 1,56 % a 5 min, sin un solo OOM. **T-10 (oomd) queda innecesario**, con esta medida como motivo: anótalo así.
- **Por qué se apagó el 11/10**: el journal del arranque anterior termina en seco a las 01:12 (hora del servidor; 23:12 UTC), con mensajes normales y **sin OOM, pánico ni apagado ordenado**. Fue un corte de corriente o un cuelgue, no la memoria. Es para David (SAI o ver si se reinició).
- En tu próxima ronda de salud, repite la medida de peticiones por hora. Si CyL sigue por debajo de 150/h con trabajo vencido, o alguna federación con vencidos sigue a 0 tras 2 h, anótalo para Claude con `docker logs --tail 40 facylf-<fed>-1`. **No toques topes ni turnos.**

## ✎ Revisión de Claude de la Fase 2 (12/10, tarde) — LEER ANTES DE SEGUIR

**La causa de los 400 grupos «cortados» no es la validación: es el ORIGEN.** Y el error de partida es mío: en el paso 2 del GOAL puse «sólo PC, temporadas del PC» y después listé **2020-21, 2024-25, 2016-17, 2026-27 y 2018-19, que son temporadas del SERVIDOR**. Sin `-Paquete`, `importar-temporada.ps1` leyó la cola viva del PC, que para esas temporadas está **parada y vieja**.

La prueba, con tus propios ficheros de fallos (el formato es `origen≠canónico`):

- **Todos** los fallos son «el origen trae MENOS que el canónico»: CyL 2016-17 grupo 11497 `10≠380`; el paquete `_traspaso\cyl-2016-17.sqlite` tiene **380** partidos en ese grupo, exactamente lo que ya hay en el canónico.
- **Ceuta 2017-18**: los 8 grupos fallidos tienen en `_traspaso\ceuta-2017-18.sqlite` justo el número del lado derecho (12, 43, 128, 6, 10, 7, 20). El origen usado era `descargas-ceuta` del PC, parada desde el 25/09 (Ceuta está en `FACYLF_EXCLUIR`).
- La validación **hizo bien**: no dejó que una cola vieja pisara datos mejores. El lote se revirtió y el canónico quedó como estaba. **No se ha perdido nada.**

**Ceuta 2017-18 está CERRADA y exacta.** Los −36 son **36 filas de «Descansa»** del paquete (7 de ellas con «resultado»), que el importador descarta a propósito: 2.080 − 36 = **2.044** y 1.580 − 7 = **1.573**, tus dos cifras.

**Arreglado en el código:**

1. **Control de origen** en `importar-temporada.ps1`: sin `-Paquete`, **se niega** a importar una temporada de CyL que no esté en `descargas-federacion\recolector-local\temporadas-asignadas.txt` o una federación que el PC excluye, y te dice el paquete que toca. `-ColaViva` lo fuerza, pero no lo uses.
2. **Resumen siempre escrito**: `pruebas\reconstruccion\importacion-resumen-<fed>-<temp>.json` (cola usada, importados, fallidos, **actas apartadas y en qué grupos**), y el `importacion-fallos-*.json` se reescribe también cuando no hay fallos (`[]`). Lo que viste como «mezcla» era en parte un JSON de fallos de una pasada anterior que se quedaba en su sitio.
3. **Mensaje de validación con dirección**: termina en `[origen≠canónico]` y, si el origen trae menos en todo, lo dice («¿cola vieja?»).
4. **Prueba 15** en `packages/canonico/test/lote.test.ts`: con `FACYLF_APARTAR_ACTAS_DISCORDANTES=1` el acta se aparta, los dos partidos entran con el resultado del calendario, no hay informe, alineaciones, eventos ni técnicos de esa acta, la validación cuadra y queda el aviso con las dos parejas.

**Correcciones de lectura:**

- «La validación corta antes de que la opción actúe»: no. Son dos cosas sin relación. La opción actuó donde el origen era bueno (2024-25: 47 actas apartadas).
- «Una sola causa explica CyL y Ceuta»: sí, pero la causa es el origen equivocado, no la validación.
- Regla para comparar: **canónico == paquete − imposibles − descansos.** Las imposibles salen en `mira-lote --avisos`. Los descansos no dejan aviso: cuéntalos en el paquete (filas con «descans» en local o visitante).

## ✎ Revisión de Claude del traspaso del 12/10 — LEER ANTES DE SEGUIR

Buen traspaso: la evidencia pegada y las correcciones escritas como tales ahorran mucho. Lo he comprobado punto por punto.

**Arreglado en el código (no hace falta desplegar nada en el PC: cada worker arranca un proceso nuevo):**

1. **Madrid, pausa por `api/standings` de 4 B** (§3) — causa exacta: en la temporada en curso pedía la clasificación de la **última jornada del calendario** (la 34, en octubre) y la API contesta `null`. Ahora pide la **última jornada ya jugada**, y un `null`/`[]` en clasificación o resultados cuenta como «vacío», no como fallo. `recolector-valencia.mjs` (`pideJson` con `vacioEsperable`). **Comprobar**: en 2-3 h, Madrid por encima de 10 peticiones/h y sin «Recolección en pausa» nueva por standings en `descargas-madrid\recolector-local\worker-programado.log`.
2. **Motivo truncado** (§6) — `importar-temporada.ps1` junta ahora el mensaje entero que empieza por `✗` (todas sus líneas), no una sola. Sin probar en Windows: en el próximo fallo, mira que `motivo` empiece por «El acta …».
3. **Cancelaciones sin motivo** (§7) — había 4 cancelaciones en bloque (competición o grupo que desaparece del catálogo, grupo sin jornadas, acta fuera de alcance) que no escribían `ultimo_error`. Ahora todas lo escriben (`recolector-local.mjs`, y una en `recolector-valencia.mjs`). Las 61 viejas se quedan como están.
4. **Salamanca: acta que no cuadra con su calendario** (§2) — opción nueva, **apagada por defecto**: con `$env:FACYLF_APARTAR_ACTAS_DISCORDANTES='1'` el importador **no elige** (eso no cambia) pero en vez de detener el grupo **aparta esa acta** (sin informe, alineaciones ni eventos), el partido entra con los datos del calendario y queda el aviso `acta_apartada_por_no_cuadrar` con las dos parejas. La validación descuenta del origen las actas apartadas, así que sigue siendo exacta. (`packages/canonico/src/lote.ts` y `origen/cola.ts`.)
5. **Herramienta nueva**: `node scripts\claude\mira-lote.mjs` (sólo lee, sesión `read only`): `<idLote>`, `--grupo <código>` (lotes de ese grupo y sus partidos por jornada) y `--avisos <fed>` (filas descartadas a propósito, por temporada).

**Correcciones al traspaso (con el dato):**

- **§4 «goteo» — no es un fallo, y cuadra al partido.** Son filas con **el mismo equipo en los dos lados**, que el importador descarta a propósito y deja escritas como aviso. `mira-lote --avisos andalucia`: 2018-19 **6**, 2017-18 **1**, 2016-17 **3**, 2015-16 **1** (sin resultado: por eso los resultados te daban exactos), 2014-15 **9**; CyL 2013-14 **2**, 2018-19 **8**. Exactamente tus diferencias. **Regla nueva para comparar con la cola: canónico == cola − filas imposibles − filas de descanso.** El importador sí avisa; el aviso está en `ops.normalizacion_error`, no en la consola.
- **§8 — el supervisor NO deja a Valencia sin worker.** El fallo de `Win32_Process` fue **una vez** (11/10 10:59). El supervisor lanza Valencia cada hora (mira su `worker-programado.log`: 21:33, 22:33, 23:38, 00:41, 12:19, 12:31, 13:31…); cada worker ve la **pausa de 24 h por el 403** y termina. La causa es sólo la de §9.
- **§9 / T-06 — Valencia: no se sigue probando.** Tu prueba era la correcta y cierra la hipótesis de cabeceras. Lo que queda (sacar el token de la página para llamar a la API interna) es saltarse un control que la web ha puesto a propósito: **es decisión de David**, no se implementa ni se prueba más. Mientras, el recolector hace **una** petición al día y vuelve a pausar: es lo correcto, déjalo así.
- **§5 falso positivo del lote 75466** — ese lote ya no existe (se revirtió) y el grupo 903639327 está **validado** (lote 75465: J1 y J2, 1 partido cada una, sin diferencias). Si vuelve a salir un «X≠2X» al importar Canarias 2026-27, ejecuta enseguida `mira-lote.mjs --grupo <grupo del mensaje>` y pega la salida.
- **T-12 — ninguna zona está HECHA.** Has hecho bien el **paso 1 (inventario)** en las once, pero con **0 peticiones** no se puede encontrar nada que no esté ya en un adaptador. Faltan los **pasos 2 (huella de plataformas) y 3 (webs propias)** del «Método por zona» (§2 de `TAREA-LARGA-FUTBOL-AFICIONADO.md`). He cambiado las once filas a **INVENTARIO HECHO · BARRIDO PENDIENTE**. «Si existe, estará en una plataforma vetada» es una hipótesis: no va a «pedir acceso» hasta encontrar la liga.
- **Ceuta 2017-18 (−36)** — no hay avisos de imposibles en Ceuta: no es el goteo. Reimporta esa temporada sola con `importar-temporada.ps1` y mira `importacion-fallos-ceuta-2017-18.json`.

**Plan (sin servidor):** el GOAL nuevo está en [`GOAL-DEEPSEEK.md`](GOAL-DEEPSEEK.md) → «Fase 2».

## FASE 2 · Paso 1 — prueba del importador (12/10)

**Primer intento (14:41) — falla, y hay que separar por qué** ✗✓

**La orden del GOAL** (`pnpm --filter @facylf/canonico test`) **no llega a ejecutar pruebas** ✗✓:

```
> vitest run
include: packages/*/test/**/*.test.ts, apps/*/test/**/*.test.ts
No test files found, exiting with code 1
```

**No es que no haya pruebas** ✓: hay **11 ficheros** en `packages\canonico\test\` ✓ (incluido **`lote.test.ts`**, el del cambio de Claude ✓). Es que **el `include` del `vitest.config.ts` de la raíz es relativo a la raíz** ✗ y `pnpm --filter` lanza vitest con el `cwd` en `packages\canonico` ✗ → busca `packages/canonico/packages/canonico/test/**` ✓ y no encuentra nada ✓.

**Lanzadas desde la raíz, que es donde el config las ve** ✓ (`pnpm exec vitest run packages/canonico` ✓):

```
 Test Files  2 failed | 9 passed (11)
      Tests  17 failed | 172 passed (189)
   Duration  334.79s
Error: Hook timed out in 10000ms.
```

**★ Y el fallo es un `hookTimeout`, no un fallo de datos** ✗✓: **las dos suites** que caen (`lote.test.ts` y `retirada.test.ts` ✓) lo hacen con **el mismo error de arranque** ✓ — son justo las que **montan el esquema contra PostgreSQL de verdad** ✓. **Y el propio `vitest.config.ts` documenta esta clase de fallo** ✓✓: subió `testTimeout` a 30 s y serializó los ficheros **«porque las pruebas del importador van contra PostgreSQL de verdad y se caían con la máquina cargada»** ✓ — pero **`hookTimeout` se quedó en los 10 s por defecto** ✗. Mientras corrían, el PC tenía **la flota entera trabajando y 92 % de memoria** ✗.

**Qué he hecho, sin tocar código** ✗ (que es de Claude ✓): **repetir sólo esas dos suites con `--hookTimeout=90000`** ✓, que es un flag de la CLI ✓, para distinguir **«es el entorno»** de **«es el cambio»** ✓✓. **Ese es el dato que Claude necesita**, y por eso **el paso 2 queda EN ESPERA** ✗ hasta saberlo (el GOAL lo manda así ✓).

**Y lo que sí está claro del resultado** ✓: **9 de 11 ficheros y 172 pruebas pasan** ✓ — el fallo **no es general** ✓.

### ANTES · los cinco huecos de CyL que el paso 2 tiene que cerrar

| temporada | paquete (origen) | **canónico AHORA** | faltan |
|---|---|---|---|
| **2020-21** | 2.683 / 2.544 | **2.278 / 2.194** | **−405** ✗ |
| **2024-25** | 28.357 / 27.919 | **28.093 / 27.655** | **−264** ✗ |
| 2016-17 | 21.630 / 21.541 | 21.556 / 21.467 | −74 ✗ |
| 2026-27 | 3.153 / 3.050 | 3.125 / 3.027 | −28 ✗ |
| 2018-19 | 20.341 / 20.279 | 20.333 / 20.271 | −8 ✗ |

### Resuelto: **SUPERADO** ✓✓ (12/10 14:56)

**El fallo era del entorno, no del código** ✓✓, y queda demostrado **sin tocar nada** ✗:

| intento | qué pasó |
|---|---|
| `pnpm --filter @facylf/canonico test` | **ni arranca** ✗: `No test files found` — el `include` del `vitest.config.ts` de la raíz es **relativo a la raíz** y `--filter` deja el `cwd` en `packages\canonico` ✓ |
| desde la raíz: `pnpm exec vitest run packages/canonico` | **2 ficheros y 17 pruebas fallan** ✗ — **todas con `Hook timed out in 10000ms`** ✓, y son justo las dos suites que **montan el esquema contra PostgreSQL** ✓ (`lote.test.ts` y `retirada.test.ts` ✓) |
| **esas dos solas con `--hookTimeout=90000`** | **`Test Files 2 passed (2) · Tests 35 passed (35)`** ✓✓ |

**Total: 11 de 11 ficheros y 207 pruebas en verde** ✓✓ (172 + 35 ✓).

**La causa, y el propio `vitest.config.ts` la documenta** ✓✓: subió `testTimeout` a 30 s y serializó los ficheros **«porque las pruebas del importador van contra PostgreSQL de verdad y se caían con la máquina cargada»** ✓ — pero **`hookTimeout` se quedó en los 10 s por defecto** ✗, y el PC tenía **la flota entera trabajando y 92 % de memoria** ✓. Se distingue **con un flag de la CLI** ✓, sin tocar código ✓.

**★ Y la prueba del cambio de Claude pasa, con su tiempo a la vista** ✓✓: `14. una contradicción que no se puede resolver detiene el lote en vez de elegir` → **22.296 ms, en verde** ✓ (y la 13, «la pareja del acta manda sobre la del calendario», 31.150 ms ✓).

**⚠ Para Claude, un detalle** ✗: la opción nueva (`FACYLF_APARTAR_ACTAS_DISCORDANTES`) **está en el código** ✓ (`packages\canonico\src\lote.ts:626` y `:632`, `src\origen\cola.ts:442` ✓) **pero no tiene prueba** ✗ — la suite no menciona ni la variable ni `acta_apartada_por_no_cuadrar` ✓ (la 14 cubre el **defecto**, que es detener ✓). **Así que el camino nuevo se estrena en el paso 2**, y por eso la verificación con `mira-lote --avisos` es la que manda ✓✓.

## ✗✗ FASE 2 · Paso 2 — CyL 2020-21 con la opción nueva: **NO recupera, y aparece un `X≠2X`** (12/10 15:0x)

**Orden exacta**:
```powershell
$env:FACYLF_APARTAR_ACTAS_DISCORDANTES = '1'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion castilla-leon -Temporada 2020-21
```

**Resultado 1 — el canónico NO se mueve** ✗: sigue en `2020-21 ediciones 19 · grupos 194 · partidos 2278 · con resultado 2194` ✓, **idéntico a antes** ✓. **La opción nueva no recuperó los 405 partidos** ✗.

**Resultado 2 — y lo que sale ahora es OTRA cosa: falla la validación** ✗✗:

```
✗ La validación del lote 79704 ha fallado: partidos 7≠14, partidos con resultado 7≠14,
  actas analizadas 0≠14, participaciones 0≠415, eventos 0≠298, técnicos 0≠35
✗ lote 79705: partidos 6≠12, con resultado 6≠11, actas 0≠11, participaciones 0≠323, eventos 0≠226, técnicos 0≠18
✗ lote 79706: partidos 3≠6,  actas 0≠6,  participaciones 0≠192
✗ lote 79707: partidos 8≠16, actas 0≠16, participaciones 0≠512
✗ lote 79708: partidos 4≠8,  actas 0≠8,  participaciones 0≠256
✗ lote 79709: partidos 2≠6,  actas 0≠6,  participaciones 0≠191
```

**Es la familia `X≠2X` que Claude daba por revertida** ✗✓ — y **está de vuelta**, ahora en CyL 2020-21 ✓. Fíjate en el patrón: **`7≠14 · 6≠12 · 3≠6 · 8≠16 · 4≠8`** ✓ y **`0` en actas, participaciones, eventos y técnicos** ✓ → **no entró nada de lo que la validación esperaba** ✗.

**★ Y la fecha de la regresión, que es el dato bueno** ✓✓ — `node scripts\claude\mira-lote.mjs --grupo 36580` ✓ (uno de los que fallan ✓):

```
lote 75963 · validado · 2026-10-11T21:16:32.798Z      ← el ÚLTIMO que validó
lote 73041 · validado · 2026-10-07T14:28:41.795Z
lote 25584 · validado · 2026-09-25T10:43:50.684Z
   diferencias: []   en los tres ✓
grupo 36580 (Tercera - Final Perdedores Permanencia) · competición 9585 · phase_group 23775
   J 1  partidos 6 · con resultado 6
   J 2  partidos 6 · con resultado 5
   partidos sin código de acta: 1
```

**El MISMO grupo validó tres veces** ✓ (25/09, 07/10 y **11/10 21:16** ✓) y **hoy falla** ✗✗ → **la regresión es posterior al 11/10 21:16**, es decir **de hoy** ✓✓, que es cuando se tocó la validación para descontar las actas apartadas ✓ («La validación descuenta del origen las actas apartadas, así que sigue siendo exacta» ✓).

**Hipótesis** ✓: **el descuento de las actas apartadas en la validación no cuadra con la forma real del grupo** ✗. El grupo tiene **12 partidos** (2 jornadas × 6 ✓) y la validación **esperaba 14** ✗ → el número esperado **no sale del tamaño del grupo** ✓, que es el mismo defecto de familia que el falso positivo de Canarias ✓. **Con la opción APAGADA no lo he probado** ✗ (el GOAL manda probarla encendida ✓) — **y es la comprobación que lo separa todo**: si con la opción apagada el mismo grupo valida, el fallo está **en el descuento nuevo** ✓✓.

**Y `mira-lote 79704` → «No hay lotes con ese criterio»** ✓: los lotes que fallan **no persisten** ✓.

**Lo que hago**: **anotarlo y seguir** ✓ (regla del GOAL: dos fallos iguales se apuntan y se pasa al siguiente ✓). El lote continúa con **2024-25** y las otras tres ✓ para tener la tabla completa antes/después ✓, y **no toco código** ✗.

### ★★ Y en 2024-25 la opción **funciona ENTERA**: queda EXACTA ✓✓✓

```
ANTES:  2024-25  grupos 191 · partidos 28093 · con resultado 27655
AHORA:  2024-25  grupos 193 · partidos 28357 · con resultado 27919
        paquete (origen)     28357 / 27919                  ← ★ EXACTO ✓✓✓
```

**Los −264 se recuperaron enteros** ✓✓✓, y **el aviso nuevo está, con número** ✓✓ (`node scripts\claude\mira-lote.mjs --avisos castilla-leon` ✓):

```
2024-25  acta_apartada_por_no_cuadrar    avisos 23 · filas 0 · con resultado 0
```

**23 actas apartadas** ✓✓, y **6 ficheros de grupo apartado escritos a las 15:11** ✓ (`salidas\importacion-castilla-leon-2024-25-11379854…11379859.txt` ✓). O sea: **la opción hizo exactamente lo que dice** — apartó las actas discordantes, **el resto del grupo entró** (+132 ✓) **y lo dejó registrado** ✓✓. **Eso es lo que había que comprobar** ✓.

**La lista de tipos de aviso que da `mira-lote` es la buena para el criterio nuevo** ✓✓ (incluye cuatro tipos que no había visto ✓):

```
acta_apartada_por_no_cuadrar · calendario_emparejamiento_no_cuadra · calendario_no_cuadra
clasificacion_oficial_* (6 tipos) · fila_de_partido_con_el_mismo_equipo_en_los_dos_lados
partido_equipo_de_acta_sin_resolver · partido_equipo_no_cuadra_con_acta
```

**★ Y ahí está el «goteo», con el nombre que le da Claude** ✓✓: `fila_de_partido_con_el_mismo_equipo_en_los_dos_lados` ✓ — **filas descartadas a propósito** ✓, que es exactamente su corrección al traspaso ✓. **El criterio nuevo queda comprobado en la herramienta** ✓: `canónico == cola − imposibles − descansos` ✓, y los imposibles **se listan aquí** ✓.



```
ANTES:  2024-25  grupos 191 · partidos 28093 · con resultado 27655
AHORA:  2024-25  grupos 192 · partidos 28225 · con resultado 27787   ← +132 partidos, +1 grupo ✓
```

**Recuperó 132 de los 264** ✓✗ — así que **el mecanismo de apartar el acta y meter el resto del grupo funciona** ✓✓, y lo que falla es **sólo la validación de 2020-21** ✗. **Eso separa los dos problemas**, que era justo lo que hacía falta saber ✓:

| | 2020-21 | 2024-25 |
|---|---|---|
| ¿mejora el canónico? | **NO** ✗ (2.278/2.194 iguales) | **SÍ** ✓✓ (+132) |
| qué lo impide | **el `X≠2X` de validación** ✗✗ | nada: **entró** ✓ |

**Así que la hipótesis buena no es «el descuento está mal» sino «el descuento está mal EN ALGUNOS LOTES»** ✓✓ — y los seis lotes que fallan en 2020-21 (`79704`–`79709`) son de competiciones de **fase final / ascenso / permanencia** ✓ (`Tercera - Final Ascenso`, `Segunda - Semifinales Ascenso`, `Tercera - Final Perdedores Permanencia` ✓) — **todas eliminatorias** ✓. **Eso es una pista concreta** ✓: en una eliminatoria, un «partido» puede venir contado **dos veces** (ida y vuelta o cruce repetido ✓) y el descuento nuevo puede estar restándolo de más ✓.



## ✓✓✓ FASE 2 · Paso 4 — Madrid: **ARREGLADO Y VERIFICADO** (12/10 15:13)

**El arreglo de `api/standings` funciona** ✓✓, medido como pedía el GOAL (criterio: *«muy por encima de 10/h mientras tenga vencidos»* ✓):

| | antes (12/10 14:0x) | **ahora (15:13)** |
|---|---|---|
| **ritmo** | **10/h** ✗ | **248 peticiones/hora** ✓✓ (**244 `ok` + 4 `sin_publicar`, cero fallos** ✓) |
| **pausa por standings** | `5 fallos seguidos … (4 B)` ✗ | **ninguna nueva** ✓: el log muestra `✓ clasificación oficial de 12 equipos (jornada 1)` ✓, `✓ … de 13 equipos` ✓ y `… pausa respetuosa de 2 s` ✓ |
| **vencidos** | 647 ✗ | 744 ✓ **y avanzando** (el siguiente pedible, en ese momento ✓) |

**Y se ve el mecanismo** ✓✓: Madrid ya **pide la última jornada jugada** (la 1 de la temporada en curso ✓) en vez de la 34 del calendario ✗, y **las clasificaciones entran** ✓. **El techo de 10/h era la pausa; sin ella, 248/h** ✓✓.

**Es el tercer arreglo de Claude que queda confirmado en producción** ✓✓ — con el de la opción de Salamanca (**2024-25 EXACTA** ✓✓) y pendiente de ver el del **motivo completo**, que se verá en el próximo fallo ✓.






## ★★ FASE 2 · Paso 2 — 2016-17: falla PEOR, y con el motivo ya completo (12/10 15:27)

**2016-17 no se movió** ✗ (`21.556 / 21.467` ✓) y su JSON de fallos trae **197 grupos** ✗✗. **Y el `motivo` sale entero** ✓✓:

```
✗ La validación del lote 79904 ha fallado: partidos 10≠380, partidos con resultado 10≠380,
  actas analizadas 0≠380, árbitros designados 10≠380
✗ La validación del lote 79905 ha fallado: partidos 8≠240, partidos con resultado 8≠240, actas analizadas 0≠240
```

**★ Tercer arreglo de Claude CONFIRMADO en producción** ✓✓✓: el `motivo` empieza por **«✗ La …»** y trae **todas sus líneas** ✓ (antes era sólo la última envuelta ✗: `"motivo": "Reina». El lote se detiene: hay que revisar la fuente."` ✓). **Ya se puede diagnosticar desde el JSON sin abrir la salida** ✓✓.

**★ Y el fallo de 2016-17 es de otra magnitud** ✗✗: **`10≠380`**, `8≠240` ✓ — **no es `X≠2X`, es `X≠38X`** ✓✓. **Misma familia** (los contadores esperados no salen del origen ✗) **pero 197 grupos y veinte veces más desviación** ✗. **Es el dato que Claude necesita para atacar la validación con un caso extremo** ✓✓ — y se ve **sin ambigüedad**: **10 partidos importados frente a 380 esperados** ✓, con `actas analizadas 0` ✓ (no entró ninguna acta ✓).

**Y 2024-25 aguanta** ✓✓: `acta_apartada_por_no_cuadrar` subió de **23 a 47** ✓ (la segunda pasada apartó más ✓) y **sigue EXACTA contra su paquete** ✓✓✓ (28.357 / 27.919 ✓).

## ★★ FASE 2 · Paso 2 — recuento con 4 de 5 hechas: **sólo 1 recupera** ✗✓ (12/10 15:3x)

| temporada | paquete | canónico antes | **canónico ahora** | resultado |
|---|---|---|---|---|
| **2024-25** | 28.357 / 27.919 | 28.093 / 27.655 | **28.357 / 27.919** | **EXACTA** ✓✓✓ |
| **2020-21** | 2.683 / 2.544 | 2.278 / 2.194 | 2.278 / 2.194 | **0** ✗ (`X≠2X` ✓) |
| **2016-17** | 21.630 / 21.541 | 21.556 / 21.467 | 21.556 / 21.467 | **0** ✗ (`10≠380` ✓) |
| **2026-27** | 3.153 / 3.050 | 3.125 / 3.027 | 3.125 / 3.027 | **0** ✗ |
| 2018-19 | 20.341 / 20.279 | 20.333 / 20.271 | *en curso* | ✓ |

**★ El patrón, que es lo que Claude necesita** ✓✓: **la opción recupera cuando los lotes validan** ✓ (2024-25 ✓✓, con 47 actas apartadas ✓) **y no recupera NADA cuando la validación espera contadores que no salen del origen** ✗ (las otras tres ✓). **Son el mismo arreglo visto por los dos lados** ✓: el `acta_apartada_por_no_cuadrar` funciona ✓, pero **la validación del lote se cae antes de que sirva** ✗ en las competiciones donde su cuenta esperada está mal ✓.

## ★★★ FASE 2 · Paso 2 — **por qué tres temporadas recuperan 0**, y **2018-19 ya cumple el criterio** (12/10 15:38)

**El dato que lo explica todo, y lo da `mira-lote --avisos`** ✓✓:

| temporada | `acta_apartada_por_no_cuadrar` | `fila_de_partido_con_el_mismo_equipo_en_los_dos_lados` |
|---|---|---|
| **2024-25** | **47** ✓✓ | — |
| **2018-19** | **NINGUNA** ✗ | **3 avisos · filas 8 · con resultado 8** ✓ |
| **2016-17** | **NINGUNA** ✗ | 1 aviso · filas 2 · con resultado 2 ✓ |
| **2020-21** | **NINGUNA** ✗ | — |
| **2026-27** | **NINGUNA** ✗ | — |

**★ Por qué recuperan 0 las otras tres** ✓✓✓: **no tienen ninguna acta apartada** ✗ — **la opción nunca llegó a actuar** ✓ porque **sus lotes fallan la validación ANTES** de que se llegue a la comprobación del acta ✓ (el último de 2018-19: `✗ La validación del lote 80327 ha fallado: partidos 1≠2…` ✓). **No es que la opción no sirva: es que no se llega a ella** ✓✓ — y eso cierra la pregunta que dejé abierta ✓.

**★★ Y 2018-19 queda EXPLICADA sin recuperar nada** ✓✓✓ — **cumple el criterio del GOAL** ✓:

```
paquete 20.341 / 20.279   ·   canónico 20.333 / 20.271   →   diferencia 8 / 8
filas imposibles: 8  ·  con resultado 8                  →   cuadra EXACTO ✓
```

**Su hueco era exactamente las 8 filas imposibles** ✓✓ (`fila_de_partido_con_el_mismo_equipo_en_los_dos_lados` ✓) → **`canónico == cola − imposibles`** ✓✓ **se cumple** ✓. **Es la primera temporada de CyL que cierra por el criterio nuevo sin haber recuperado nada** ✓ — y valida la corrección de Claude al traspaso ✓✓.

## ★★★ FASE 2 · Paso 2 — **VEREDICTO DEFINITIVO por temporada** (12/10 15:4x)

```
2020-21   paquete 2.683  · canónico 2.278  · faltan 405 · imposibles NINGUNA  →  405 SIN EXPLICAR ✗✗
2024-25   paquete 28.357 · canónico 28.357 · faltan   0 · (47 apartadas)      →  CERRADA ✓✓
2016-17   paquete 21.630 · canónico 21.556 · faltan  74 · imposibles 2        →   72 SIN EXPLICAR ✗
2026-27   paquete 3.153  · canónico 3.125  · faltan  28 · imposibles NINGUNA  →   28 SIN EXPLICAR ✗
2018-19   paquete 20.341 · canónico 20.333 · faltan   8 · imposibles 8        →  CERRADA EXACTO ✓✓
```

**Dos cerradas y tres con hueco real** ✓: **2024-25** por recuperación ✓✓ y **2018-19** porque **8 = 8** ✓✓ (se cumple `canónico == cola − imposibles` ✓). **Hueco real: 505 partidos** ✗ — **405 son la provincial de Salamanca de 2020-21** ✓ (la causa conocida ✓) y **100 repartidos** en 2016-17 (72) y 2026-27 (28) ✗.

**★ Y el «goteo», medido en TODO CyL, es 18 filas** ✓✓ (2013-14: 2 · 2015-16: 1 · 2016-17: 2 · 2018-19: 8 · 2019-20: 2 · 2021-22: 3 ✓) → **explica 10 de los 515: el 2 %** ✓. **La corrección de Claude era correcta sobre las filas imposibles** ✓✓ **pero no explica CyL** ✗: **lo que corta es la validación del lote** ✓ (y, en 2020-21, además el guardián de Salamanca ✓).

## ★ FASE 2 · Paso 2 — **el JSON de fallos mezcla dos cosas** (12/10 15:42)

```
2020-21   59 grupos con fallo   (15:03)   →  faltan 405
2024-25  145 grupos con fallo   (15:19)   →  faltan   0  ✓✓  (47 actas apartadas)
2016-17  197 grupos con fallo   (15:26)   →  faltan  74
2026-27  137 grupos con fallo   (15:35)   →  faltan  28
2018-19  (sin JSON aún)                   →  en curso
```

**★ El número de grupos que fallan NO dice si la temporada entró** ✗✓: **2024-25 tiene 145 grupos «con fallo» y está EXACTA** ✓✓ porque en ella los fallos son **del camino nuevo** ✓ (**el acta se aparta y el grupo entra igual** ✓); en 2016-17 (197 grupos) los fallos son **de validación, que sí bloquean** ✗ y la temporada **recupera 0** ✗.

**O sea: `importacion-fallos-*.json` mezcla el camino que aparta y sigue con el que corta** ✗✓ — **y contarlos no distingue cuál es cuál** ✓. **Lo que lo distingue es `mira-lote --avisos`** ✓✓: **47 `acta_apartada_por_no_cuadrar` en 2024-25** ✓ frente a **ninguna** en las otras ✓. **Distinción que hacía falta para leer bien el informe del paso 2** ✓.

## ✓✓✓ FASE 2 · Paso 3 — Ceuta 2017-18: **misma causa que CyL** (12/10 15:5x)

```
ANTES:   2017-18   2.044 / 1.573
DESPUÉS: 2017-18   2.044 / 1.573   ← SIN CAMBIO ✗
```

**Y el motivo es la validación del lote, con el mismo patrón que CyL** ✓✓:

```
✗ lote 80468: partidos 2≠12, actas analizadas 0≠12          ✗ lote 80482: actas 0≠6
✗ lote 80475: actas analizadas 0≠128                        ✗ lote 80483: actas 0≠10
✗ lote 80481: partidos 2≠12                                 ✗ lote 80497: actas 0≠7
✗ lote 80499: partidos 2≠20, actas 0≠9, participaciones 0≠16, técnicos 0≠2, árbitros 0≠2
```

**★ Los 36 de Ceuta NO son otra cosa** ✗✓: **son la misma validación** ✓ — **ni el «goteo»** (Claude tenía razón ✓) **ni el guardián de Salamanca** ✓. **Una sola causa explica los dos huecos más grandes que quedaban** ✓✓ → **el arreglo es UNO, no tres** ✓.

**Y confirma el arreglo del motivo por tercera vez** ✓✓: los mensajes salen **enteros** en la consola ✓ (`✗ La validación del lote …` ✓).

**Nota**: el `-e` de Node falló por comillas de PowerShell ✗ al leer el JSON ✓ — pero **el propio lote imprimió los motivos** ✓, que es lo que hacía falta ✓.

## ★★ FASE 2 · Paso 5 — **las cuatro candidatas que quedaban, CLASIFICADAS** (12/10 16:2x) ✓✓ — y **dos se caen al pedirlas** ✗✗

El paso 5 no pedía más búsquedas ✗ (ya estaban las 11 zonas ✓): pedía **clasificar cada candidato** ✓. Quedaban cuatro ✓ — y ya están las cuatro ✓, con REA (`capture_browser_scenario`, `mode: launch`, navegador propio y aislado ✓, **sin tocar el Chrome del recolector** ✓).

| candidata | qué salió al pedirla | clasificación |
|---|---|---|
| **Cartagena** (`cartagena.es`, fila 34/37) | **✗ La portada devuelve la página de BLOQUEO del WAF** ✓ (FortiGuard ✓): «¡Pagina Web Bloqueada!», `Attack ID 20000051`, IP de David ✓, cero contenido del ayuntamiento ✗ | **NO PERSEGUIBLE** ✓✗ — **negativa explícita a petición automatizada** ✓, misma familia que las **vetadas de §5** ✓. **No se reintenta ni se cambia de agente** ✓ (las reglas prohíben saltarse bloqueos ✓) → **«pedir acceso», decisión de David** ✓ |
| **`fafutsala.com`** (la «web propia» de Jaén, fila 31/32) | **✗ `ERR_SSL_PROTOCOL_ERROR` TAMBIÉN en Chromium 153** ✓ (no solo en PowerShell ✓) → **y por HTTP: HTTP 200 pero es la página de APARCAMIENTO de IONOS** ✓✗ (`<title>` vacío ✓, `copyright 1&1 IONOS` ✓, `noindex,nofollow` ✓, vende dominios y VPS ✗, cero fútbol sala ✗) | **★★ EL SITIO YA NO EXISTE — dominio aparcado** ✓✓✗. **Jaén se queda sin el canal propio** ✗: sólo le queda **Clupik**, que está **VETADA** ✗ → la *Liga Socca Jaén* pasa de «lector propio viable» a **«pedir acceso», decisión de David** ✓✗ |
| **F7 amateur de Huelva** (fila 28) | 2ª vuelta de búsqueda ✓: sólo **prensa** ✗ ([sportshuelva.com](https://sportshuelva.com) ✓), la **federación** ✗ (`rfafsevilla.es` ✓) y la **web de un club** ✗ (`maurisoft.es/recre` ✓) | **SIN PLATAFORMA** ✓ — coherente con la fila 28 ✓ (aquel blog era de **2012** ✓) → **liga extinguida o sin canal web** ✓. **Anotada, sin lector** ✓ |
| **Veteranos de La Rioja** (fila 16) | 2ª vuelta ✓: [larioja.com](https://www.larioja.com/deportes/futbol/favoritos-mantienen-distancias-20180418004351-ntvo.html) — noticia de **2018** con la clasificación **en texto** ✓ | **PUBLICA EN PRENSA, SIN PLATAFORMA** ✓ — la liga **existe** ✓ pero su canal es **el periódico** ✗ → **sin lector posible** ✗. **Anotada** ✓ |

### ✗✓ Y me corrijo a mí mismo: la fila 32 del doc era **falsa**

Yo había escrito que el fallo TLS de `fafutsala.com` **no era del sitio** ✗ sino «el límite de `Invoke-WebRequest`» ✓. **Es falso** ✗✓: **el navegador de REA falla idénticamente** ✓ (`net::ERR_SSL_PROTOCOL_ERROR` ✓). La fila 32 queda **marcada como refutada** ✓. La secuencia honesta fue: **TLS roto en los dos clientes** ✓ → **DNS y TCP 443/80 abiertos** ✓ (sin ninguna petición HTTP ✓) → **HTTP 200 con la página de IONOS** ✓ → **dominio aparcado** ✓✓.

### ★★ La lección de método que sale de aquí (la más aprovechable) ✓✓

**Dos de las cuatro candidatas se han caído al pedirlas** ✗✗ (Cartagena **bloquea** ✓, `fafutsala.com` **está muerto** ✓) — y **las dos habrían pasado por buenas si me hubiera fiado del buscador** ✓✗: el snippet de `fafutsala.com` («TERCERA ALEVIN… ASOCIACION ANDALUZA DE FUTBOL SALA» ✓) era **caché histórica** ✗, y el de Cartagena ✓ era un título **real** ✓ de una web que **hoy no deja entrar a un cliente automatizado** ✓.

> **Candidato sin petición hecha = candidato sin clasificar** ✓✓. Es exactamente lo que el GOAL blindaba al decir que «*si existe, estará en una plataforma vetada*» **no vale como resultado** ✓.

**Y el saldo de la zona, sin adornos** ✓: de todo el barrido, **el único canal propio y legible que ha aparecido es Palencia** ✓✓ (`vercompeti.php?tipc=0`, HTML ✓). Lo demás son **vetadas** ✗ (Clupik, y las de §5 ✓), **bloqueos** ✗ (Cartagena ✓), **PDF municipal** ✓ (Soria ✓, Narcea ✓) o **inexistente** ✗ (Huelva ✓, La Rioja ✓, Girona ✓, Gipuzkoa ✓). **Eso es un resultado, no un fracaso** ✓: ahora se sabe **qué hay y qué no**, y **cuatro decisiones son de David** ✓ (3 accesos + 1 alcance municipal ✓).

### ★ Dato operativo que sale de la ronda de salud: **CyL NO tiene cola en el PC** ✓

Al medir las colas ✓ salió que **`castilla-leon` = «sin cola»** ✓✗, y está comprobado: **no existe `descargas-castilla-leon`** ✓ — el PC tiene carpeta de cola para **sus cuatro** ✓ (andalucia, madrid, cataluna, valencia ✓) y para **las 14 del servidor** ✓ (que son destino de `trae-federacion-servidor` ✓), **pero ninguna de CyL** ✓.

**Consecuencia, y encaja con todo lo anterior** ✓: las temporadas de CyL que el PC reimporta (paso 2 ✓) **salen de los paquetes de `_traspaso`** ✓ — no de una cola local viva ✓. Por eso el paso 2 se pudo hacer con el servidor apagado ✓✓, y por eso **la vía natural de CyL es el paso 7** ✓ (`trae-federacion-servidor.ps1 -Federacion castilla-leon -Todas` ✓), que es exactamente lo que el GOAL pone primero cuando el servidor vuelva ✓✓.

## ✓✓✓ EL SERVIDOR HA VUELTO (13/10 11:13) — Fase 3 paso 1 HECHO y CyL TRAÍDO del servidor

David lo encendió ✓. Comprobado: Tailscale `active; **direct** 192.168.1.138:41641` ✓ (ya no relay ✗), **ping 4 ms** ✓, `up 2 min` ✓, **23 contenedores** ✓, ssh ✓.

| | |
|---|---|
| **`MemoryCurrent` ANTES** (11:13, recién arrancado) | **12.841.734.144 = 11,96 GiB** ⚠ (el slice ya en su tope de 12 GiB ✓, con **load 17,79** ✓: los contenedores arrancando ✓) |
| **`MemoryCurrent` DESPUÉS** (11:20, tras traer CyL) | **12.146.253.824 = 11,31 GiB** ✓✓ — **bajó 0,65 GiB** ✓: la extracción **no** lo empeoró ✓ |
| **Disco F:** | **17,7 GB libres antes → 16,6 GB después** ✓ (−1,1 GB ✓, por los 6 paquetes ✓) |

### Fase 3 paso 1 — **la prueba 15 PASA** ✓✓, pero **la orden del GOAL no puede funcionar** ✗

`pnpm --filter @facylf/canonico test` → **«No test files found, exiting with code 1»** ✗, y **no es culpa de las pruebas** ✗: el `include` de `vitest.config.ts` de la raíz (`packages/*/test/**/*.test.ts` ✓) se resuelve **desde la raíz**, y `--filter` cambia el cwd al paquete ✓ → no encuentra nada ✓. Es el **mismo fallo ya documentado en la Fase 2** ✓ (y sigue ahí ✗).

**La forma que sí mide lo que el GOAL quiere** ✓ (desde la raíz, con margen de hook por la carga del PC ✓): `pnpm exec vitest run packages/canonico --hookTimeout=90000` →
**11/11 ficheros ✓✓ · 190 pruebas ✓✓ · exit 0** ✓, y **la prueba 15 pasa** ✓✓: *«15. con `FACYLF_APARTAR_ACTAS_DISCORDANTES=1` el acta se aparta, el grupo entra y la validación cuadra»* ✓ (2.337 ms ✓).

> **Para Claude** ✗: o se le pone un `vitest.config.ts` al paquete ✓, o el GOAL tiene que pedir la orden desde la raíz ✓. Tal como está escrito ✗, el paso 1 **siempre** sale en rojo aunque todo esté bien ✓✗.

### La traída (Fase 3 paso 6, CyL primero) — **6 paquetes NUEVOS**, y son mucho mayores que el canónico ✓✓

`trae-federacion-servidor.ps1 -Federacion castilla-leon -Todas **-SoloTraer**` ✓ (traer sin importar ✓, para poder correr antes la prueba del paso 1 ✓). La cola de CyL del servidor tiene **9 temporadas** ✓, sus **asignadas son 8** ✓, la intersección son **6** ✓:

| temporada | paquete nuevo (partidos) | grupos | canónico ANTES | diferencia |
|---|---|---|---|---|
| **2026-27** | **4.100** | 237 | 3.125 | **+975** ✓ |
| **2022-23** | **27.288** | 285 | 21.922 | **+5.366** ✓✓✓ |
| **2020-21** | **5.902** | **341** | 2.278 (**194 grupos**) | **+3.624** ✓✓✓ |
| **2018-19** | **20.598** | 329 | 20.333 | **+265** ✓ |
| **2016-17** | **22.039** | 311 | 21.556 | **+483** ✓ |
| **2024-25** | **28.762** | 288 | 28.357 | **+405** ✓ |

**Y esto reencuadra lo que yo había medido** ✓✗: los «huecos» que yo daba (405, 74, 28…) salían de comparar contra **paquetes viejos** ✓; contra los **paquetes frescos del servidor** los huecos son **mucho mayores** ✓ (11.118 partidos en total ✓). Lo que confirma la corrección de Claude ✓: **el problema era el ORIGEN** ✓, no la validación ✓.

### ★★ Dos cosas que el GOAL da por hechas y NO lo están ✗✗

1. **2014-15 y 2012-13 no se pueden traer**: están **asignadas al servidor** ✓ pero **no están en su cola** ✓✗ (la cola lista 9 temporadas ✓ y esas dos **no aparecen** ✓). O sea: **el servidor tampoco las ha recogido** ✗ → no hay paquete ✓. El canónico del PC tampoco las tiene ✓ (13 temporadas ✓, faltan justo esas dos ✓). **No es un problema de traída: falta recolección en el servidor** ✓ → **para Claude/David** ✗.
2. **El paquete que el GOAL manda usar es VIEJO** ✗✗: el paso 2 dice `-Paquete _traspaso\cyl-2020-21.sqlite` ✓ y ese fichero **existe** ✓ — pero es del **07/10** ✗ (seis días ✓), de la etapa del script anterior ✓. El script de hoy escribe **`_traspaso\federacion-<temporada>.sqlite`** ✓ (CyL vive en `descargas-federacion` ✓, línea 32 ✓), y los de hoy llevan sello de las **11:15–11:20 del 13/10** ✓. **Seguir el paso 2 al pie de la letra habría importado un paquete de hace seis días** ✗✗ — **exactamente la clase de error del ORIGEN** que Claude acaba de diagnosticar ✓. **Usé los `federacion-*.sqlite` de hoy** ✓✓. *(Y todos crecen: `cyl-2020-21` 29,2 MB → `federacion-2020-21` 44,0 ✓ · `cyl-2024-25` 345,8 → 366,1 ✓ · `cyl-2016-17` 182,5 → 216,2 ✓ · `cyl-2022-23` 256,8 → 300,2 ✓)*

### ✗✓ Y dos hallazgos de la ronda de salud (13/10 12:2x)

**1 · El PC perdió Postgres 33 minutos — y NO fue el importador ni el servidor** ✗✓

- De las 6 importaciones de CyL: **2020-21 salió PERFECTA** ✓✓ (**331 importados, 0 fallidos, 10 actas apartadas** en 5 grupos: `Salamanca - 1` (2), `Salamanca - 3` (2), `Primera Fase - GRUPO VIII - B`… ✓) y **las otras cinco dieron 0 importados** ✗ con `✗ El canónico no está disponible: connect ECONNREFUSED 127.0.0.1:5433` (2016-17: 31 de 286 · 2026-27: 0 de 236 · 2022-23: 0 de 284 · 2018-19: 0 de 270).
- Causa: **Docker Desktop del PC se reinició** ✓✓ — `com.docker.backend` arrancado a las **12:17:53** ✓ y **los cinco** contenedores (`facylf-postgres` **y** los tres de `cesta-*`) con `StartedAt` del **mismo segundo** ✓. `RestartCount=0` ✓, `OOMKilled=false` ✓, `ExitCode=0` ✓ → **parada limpia y rearranque**, no un crash ✗✓.
- Caído de **~11:45 a 12:18** ✓ (33 min ✓). Los **recolectores del PC no se vieron** ✓ (42 `node` y 21 `chrome` vivos ✓: son procesos del host, no contenedores ✓).
- **Relanzadas las 5** ✓ en cuanto Postgres aceptó conexiones ✓ (`pg_isready` → «accepting connections» ✓).
- **Para David** ✗: la base canónica del PC vive en **Docker Desktop** ✓, y un reinicio suyo **corta las importaciones a media temporada** ✓; el importador **lo dice claro y no corrompe** ✓ (cada grupo falla y sigue ✓) — sólo hay que repetir ✓.

**2 · ✗✗ CORREGIDO POR CLAUDE (13/10 mediodía): mi conclusión era FALSA — las cuatro SÍ llevan sin pedir nada**

Escribí aquí que «las cuatro a 0 peticiones NO están paradas» y que «`peticiones` no cuenta `grupos` ni `catalogo_temporada`» ✗✗. **Las dos cosas son falsas** ✓:

- **`peticiones` SÍ cuenta `grupos` y `catalogo_temporada`** ✓ — lo comprobó Claude **leyendo la cola del servidor directamente** ✓.
- **Galicia, Murcia, Castilla-La Mancha y Ceuta no han hecho NI UNA petición desde el 11/10 hacia las 23:00 UTC** ✓✗: **desde poco antes del apagón** ✗.
- **Los miles de «trabajos movidos» que yo vi los toca el propio ARRANQUE al REHACER EL PLAN** ✗: no son trabajo real ✓. **Es exactamente la trampa que ya teníamos anotada** ✓✓ — *la actividad se mide con las `peticiones`, no con la fecha de los `trabajos`* ✓ (lo dice la cabecera del propio script: *«`trabajos.actualizado_en` NO sirve: `encola` lo toca en cada arranque»* ✓).
- **Y mi «no hay ninguna federación atascada» era, por tanto, un falso tranquilizador** ✗✓. Lo que sí trabaja de verdad: **euskadi, 437 peticiones correctas y cientos de actas terminadas en 3 h** ✓✓.
- **Lo más probable: esperan su TURNO de navegador** ✓ — no caben las 19 federaciones a la vez en el servidor y cada una conserva el turno **entre 4 y 8 horas** ✓. **No es necesariamente una avería** ✓✗.
- **La prueba, y cuándo**: **a las 17:30 UTC** ✓ — si alguna sigue sin pedir nada, **es una avería** ✗ y **se pegan las últimas 40 líneas de su registro** ✓, **del fichero** (porque `docker logs` sale vacío ✗✓). **Sin tocar turnos ni topes** ✓.
- *(El resto del servidor sí iba bien ✓: euskadi 458/24 h · navarra 480 · aragon 376 · rioja 299 · extremadura 295 · asturias 277 · cantabria 243 · CyL 200 · melilla 71 · baleares 49 · canarias 28 ✓.)*

> **Lección para mí** ✓✓: tenía **la métrica buena delante** (`ritmo-peticiones`, la que el GOAL manda usar ✓) y **la cambié por la mala** (`trabajos.actualizado_en` ✗) para explicar una alarma que era **real** ✗. **Cuando la métrica buena dice 0, se investiga el 0 — no se busca otra métrica que diga otra cosa** ✓✓.

### ✓✓✓ FASE 3 · PASO 3 — **CEUTA ESTÁ HECHA**: las diez temporadas cuadran EXACTAS (13/10 12:5x)

Verificada **temporada a temporada** con la regla ✓✓ (**canónico == paquete − descansos − imposibles**), y con **una herramienta nueva para contar los descansos** ✓:

| temporada | paquete | descansos | paquete − descansos | **canónico** | ¿cuadra? |
|---|---|---|---|---|---|
| 2026-27 | 206 | 0 | 206 | **206** | ✓✓ |
| 2025-26 | 2.738 | 0 | 2.738 | **2.738** | ✓✓ |
| 2024-25 | 3.024 | 0 | 3.024 | **3.024** | ✓✓ |
| 2023-24 | 2.793 | 0 | 2.793 | **2.793** | ✓✓ |
| 2022-23 | 2.099 | 0 | 2.099 | **2.099** | ✓✓ |
| 2021-22 | 2.188 | 0 | 2.188 | **2.188** | ✓✓ |
| 2020-21 | 750 | 0 | 750 | **750** | ✓✓ |
| 2019-20 | 3.072 | 0 | 3.072 | **3.072** | ✓✓ |
| 2018-19 | 3.044 | 0 | 3.044 | **3.044** | ✓✓ |
| **2017-18** | 2.080 | **36** | **2.044** | **2.044** | ✓✓ |

**Las diez cuadran EXACTAS** ✓✓✓ — y **sólo 2017-18 necesitaba los descansos** ✓. Así que **los −36 de Ceuta quedan cerrados del todo** ✓✓, y **no hay ninguna otra temporada suya que revisar** ✓ (el paso 3 pedía justo eso ✓). *(El «con resultado» bajo de 2019-20 —2.004 de 3.072— **no** es un fallo de importación: mide la fuente ✓.)*

**★ Y la pieza que faltaba para poder verificar** ✓✓: **`pruebas\reconstruccion\cuenta-descansos.mjs`** ✓ (sólo lee ✓; no es código de recolector, lector ni importador ✓) — cuenta los descansos de un paquete **mirando TODAS las columnas** ✓, no sólo las de equipo ✓ (**los códigos no llevan el texto: mi primer intento dio 0 por eso** ✗✓). **Validada contra la cifra de Claude** ✓✓: da **36** en `ceuta-2017-18` ✓ (`local` 21 + `visitante` 15, todas «Descansa» ✓) y **2.080 − 36 = 2.044** ✓. **En los seis paquetes de CyL da 0** ✓ → allí la regla se queda en **canónico == paquete − imposibles** ✓.

### ★ Verificación de CyL con la regla (13/10 12:5x) — **2 de 6 ya EXACTAS** ✓✓

Para CyL la regla es **canónico == paquete − filas imposibles** ✓ (porque los **descansos son 0**, medido con el contador ✓). Y las *filas imposibles* son las `filas` de **`fila_de_partido_con_el_mismo_equipo_en_los_dos_lados`** ✓ (`mira-lote --avisos castilla-leon` ✓), que son **1, 2, 8, 1, 2, 1, 2** en 2020-21, 2016-17, 2018-19, 2021-22, 2019-20, 2015-16 y 2013-14 ✓ — y **0** en 2026-27, 2022-23 y 2024-25 ✓.

| temporada | paquete | imposibles | esperado | **canónico** | |
|---|---|---|---|---|---|
| **2020-21** | 5.902 | **1** | **5.901** | **5.901** | ✓✓ **EXACTA** |
| **2016-17** | 22.039 | **2** | **22.037** | **22.037** | ✓✓ **EXACTA** |
| 2026-27 | 4.100 | 0 | 4.100 | *importando* (3.141 →) | … |
| 2022-23 | 27.288 | 0 | 27.288 | *en cola* | … |
| 2018-19 | 20.598 | **8** | **20.590** | *en cola* | … |
| 2024-25 | 28.762 | 0 | 28.762 | *en cola* | … |

**★ Y el «le falta uno» de 2020-21 ya está explicado** ✓✓: **es la fila imposible** ✓ — así que **no hay que mirarlo con `mira-lote --grupo`** ✓ (la condición que puso Claude queda resuelta por la vía buena ✓).

**Las actas apartadas cuadran** ✓✓: **2020-21** → `acta_apartada_por_no_cuadrar` **5 avisos** ✓ = los **5 grupos** del resumen ✓ (**10 actas** ✓); **2016-17** → **1 aviso** ✓ con **2 actas** ✓. *(Resúmenes: 2020-21 → 331/0 · 2016-17 → 286/0 ✓, los dos con **0 fallidos** ✓.)*

### ★★★ VERIFICACIÓN de CyL (13/10) — **las SEIS del SERVIDOR exactas** ✓✓✓ · ✗✗ **y NO son «trece»: las 7 del PC están SIN verificar**

> **✗✗ CORRECCIÓN DE CLAUDE (13/10 tarde): me pasé al decirlo** ✓. Escribí que «CyL queda HECHA en todo lo que su origen ya tiene» ✗ — **sólo están verificadas las 6 del SERVIDOR** ✓ (contra **su paquete** ✓). Las **7 que recoge el PC** —**2025-26, 2023-24, 2021-22, 2019-20, 2017-18, 2015-16 y 2013-14**— se importaron el **11 y 12/10** desde **la cola del PC** ✓, y **esa cola ha seguido creciendo** ✗ → **hoy ya no tienen por qué cuadrar** ✗. **CyL NO está HECHA hasta verificarlas** ✓ (ni hasta que lleguen 2014-15 y 2012-13 ✓).
> **Qué toca** ✓: **esta noche**, una a una, `importar-temporada.ps1 -Federacion castilla-leon -Temporada <t>` **sin `-Paquete`** (son del PC ✓) y verificar **canónico == cola − imposibles** ✓ (`mira-lote --avisos`, **releído después** ✓). Son grandes ✓: de noche ✓.

> **★ Cierre (13/10 16:28)** ✓✓✓: el arreglo de Claude (prueba **16**) **funcionó**: reimportados **sólo los dos grupos** de 2026-27 desde el paquete de hoy ✓ (Ávila: **21 partidos** ✓; León: **28** ✓ — «recuentos origen/destino: cuadran» y «validación correcta en **1/1**» en los dos ✓) → **2026-27 = 4.100 = el paquete** ✓✓, con los imposibles releídos después = **0** ✓. **Las seis cuadran exactas** ✓✓✓.
> **Paso 1 antes de tocar nada** ✓: `pnpm exec vitest run packages/canonico --hookTimeout=90000` → **11/11 ficheros, 191 pruebas, exit 0** ✓✓, con la **15** ✓ y la **16** nuevas ✓ («una corrección de la fuente —un convocado menos, árbitro retirado— no deja filas viejas y el lote valida» ✓). *(Con el hook de 10 s de fábrica salen **14 fallos, TODOS `Hook timed out`** ✗ — es la máquina, no el código ✓.)*

Las cinco importaciones acabaron ✓ (job `pwsh-395`, exit 0 ✓). Regla: **canónico == paquete − imposibles** ✓ (descansos = 0 ✓).

| temporada | paquete | imposibles | esperado | **canónico** | | resumen |
|---|---|---|---|---|---|---|
| **2020-21** | 5.902 | **1** | 5.901 | **5.901** | ✓✓ **EXACTA** | 331 imp · 0 fall · 10 actas apartadas ✓ |
| **2016-17** | 22.039 | **2** | 22.037 | **22.037** | ✓✓ **EXACTA** | 286 imp · 0 fall · 2 apartadas ✓ |
| **2022-23** | 27.288 | 0 | 27.288 | **27.288** | ✓✓ **EXACTA** | 282 imp · 2 fall · 0 ✓ |
| **2024-25** | 28.762 | 0 | 28.762 | **28.762** | ✓✓ **EXACTA** | 286 imp · 2 fall · **49 apartadas** ✓ |
| **2018-19** | 20.598 | **10** | 20.588 | **20.588** | ✓✓ **EXACTA** | 270 imp · 0 fall · 0 ✓ |
| **2026-27** | 4.100 | 0 | 4.100 | **4.100** | ✓✓ **EXACTA** | 234 imp · 2 fall → **los 2 grupos REIMPORTADOS y validados** ✓✓ |

**★ Ojo con 2018-19**: yo había leído **8** imposibles y el canónico daba **20.588** ✗ — al releerlos son **10** ✓ (la importación añadió 2 filas más: `avisos 3→5`, `filas 8→10` ✓) → **20.598 − 10 = 20.588 EXACTA** ✓✓. **Los imposibles hay que releerlos DESPUÉS de importar** ✓, no antes ✓.

**★★ Y el −35 de 2026-27 está entero y no es una pérdida** ✓✓: son **los 2 grupos cuyo lote la validación rechazó** ✓ —
- **`Primera - Ávila`** (grupo 24218942, lote 81278): el paquete trae **21** partidos y el canónico tiene **7** → **14 sin entrar** ✓
- **`Primera - León`** (grupo 24219046, lote 81361): el paquete trae **28** y el canónico **7** → **21 sin entrar** ✓
- **14 + 21 = 35** ✓✓✓ **el hueco exacto**.

**El motivo del rechazo, y es lo que hay que mirar** ✗✓: `participaciones 622≠624` y `árbitros designados 21≠22` **[origen≠canónico]** ✓ — **el paquete FRESCO trae MÁS partidos pero MENOS participaciones y árbitros que el canónico** ✗, así que la validación **hizo bien** en no dejarle pisar ✓ (no se ha perdido nada ✓), pero **esos 35 partidos no entran hasta que eso cuadre** ✗. **Para Claude** ✓ (es su terreno ✓): en esos dos grupos el canónico tiene participaciones/árbitros que el paquete del servidor no tiene ✗ — con las salidas completas en `pruebas\reconstruccion\salidas\importacion-castilla-leon-2026-27-24218942.txt` y `…-24219046.txt` ✓.

### ✓✓✓ RIOJA 2026-27 ARREGLADA: los dos grupos entran, y el caso de las comillas queda demostrado (13/10 18:1x)

**Paso 1 primero** ✓✓: `pnpm exec vitest run packages/canonico` **sin `--hookTimeout`** → **11/11 ficheros · 192 pruebas · exit 0** ✓✓ (la **17** ya dentro ✓). **El margen ya está en la configuración** ✓ y **no vuelven a salir los 14 falsos** ✓✓.

**Paso 2** ✓✓: reimportados **sólo** los dos grupos con el paquete de hoy (`$env:FACYLF_COLA_RIOJA` ✓), **sin un solo choque** ✓:

| grupo | qué trajo | validación |
|---|---|---|
| **21959333** `Grupo 5` | **40 partidos** (40 con resultado) ✓ | ✓ recuentos cuadran · **1/1** · `standing_snapshot +16` ✓ |
| **21959335** `Grupo Único` | **40 partidos** (38 con resultado) ✓ | ✓ recuentos cuadran · **1/1** · `club +1` ✓ |

**Y `mira-inscripciones.mjs` lo prueba** ✓✓: **16 inscripciones en cada grupo, TODAS con código** ✓✓✓. Y se ve **el caso exacto** ✓✓:
`te 18227 · ts 18227 «UD LOGROÑÉS B» · **cód 2007205604** · ref ud logrones b · **fuente «UD LOGROÑÉS "B"»**` ✓ — **el equipo con comillas se reutiliza y se le añade el código** ✓✓. Igual con `NÁXARA B / «NÁXARA "B"»` ✓, `VIANÉS B / «VIANÉS "B"»` ✓ y `SAN MARCIAL Pub Triple B / «…"B"»` ✓.

**Rioja sigue** ✓ (job `pwsh-1890`): **2025-26 → 146 importados, 0 fallidos** ✓✓ · 2024-25 en curso ✓. **Y no ha vuelto a salir `team_entry_referencia_contextual_uq`** ✓✓.

**★★ RIOJA TERMINADA (13/10 19:3x)** ✓✓: **20 temporadas en el canónico** (2026-27 → **2008-09** ✓). **Casi todas con 0 fallos** ✓, y **los que quedan NO son de identidad** ✓✗: son el guardián
`✗ el calendario de la cola es imposible: N partidos entre sólo 2 parejas distintas son más de 4 vueltas, y eso no lo juega ninguna liga. **Es la huella del recolector que repetía jornadas**` ✗
— en **2012-13, 2015-16 y 2017-18** (y la misma familia en 2013-14, 2014-15 y 2018-19 ✓). **El importador hace bien en rechazarlos** ✓ (no se pierde nada ✓) y **es una clase ya conocida** ✓ (tiene hasta su prueba: `calendario-imposible.test.ts` ✓).

> **✗ Y me corrijo**: el «N fallos» por temporada que puse un momento antes **estaba mal** ✗ — contaba **propiedades del JSON**, no el array de fallos ✓. Lo fiables son **los motivos** ✓.
>
> **Siguiente ya lanzado**: **euskadi** ✓ (job `pwsh-2127` ✓), con el paquete del día ✓.

**★★ EUSKADI TERMINADA (13/10 20:0x)** ✓✓: **13 temporadas en el canónico** (2026-27 → **2014-15** ✓) y **casi perfecta** ✓✓: **todas con 0 fallos** salvo **2026-27, con 2, de la clase «origen trae menos»** ✓ (la validación no deja que la cola pise datos mejores ✓ y **no se pierde nada** ✓). *(Su «con resultado» es bajo —605 partidos y 224 con resultado en 2026-27 ✓—: **eso mide la FUENTE, no la importación** ✓, como quedó demostrado el 12/10 ✓.)*
**Siguiente ya lanzado**: **navarra** ✓ (job `pwsh-2307` ✓).

**✗✗ PERO EL SERVIDOR SE CAYÓ OTRA VEZ a las 20:09** (18:09 UTC) ✓✗: Tailscale `offline, last seen 1m ago` ✓, ping LAN y Tailscale **100 % perdidos** ✓, ssh nada ✓. **Navarra quedó limpia** ✓ (murió **listando temporadas**, antes de extraer y de importar ✓). **Segunda caída en dos días, sin OOM ni apagado ordenado** ✗ → **refuerza la hipótesis de Claude: corriente o cuelgue, no memoria** ✓✓ → **para David: el SAI** ✓.

### ★★ CyL · las 7 temporadas del PC (13/10 20:11 → 22:44) — **6 de 7 EXACTAS** ✓✓ y la séptima entera explicada

Corridas **sin `-Paquete`** ✓ (son del PC ✓) con la opción ✓, y **el control de origen funcionó** ✓✓: el resumen dice `Cola de origen: …\descargas-federacion\recolector-local\cola-v2.sqlite` ✓ (**la cola propia del PC** ✓).

| temporada | cola | imposibles | esperado | **canónico** | | recuperado |
|---|---|---|---|---|---|---|
| **2025-26** | 24.360 | 0 | 24.360 | **24.360** | ✓✓ | ya estaba |
| **2023-24** | 22.989 | 0 | 22.989 | **22.989** | ✓✓ | ya estaba |
| **2021-22** | 15.502 | **3** | 15.499 | **15.499** | ✓✓ | ya estaba |
| **2019-20** | 10.496 | **2** | 10.494 | **10.494** | ✓✓ | **+77** ✓ |
| **2017-18** | 15.329 | **2** | 15.327 | **15.327** | ✓✓ | **+8.170** ✓✓✓ |
| **2015-16** | 16.052 | **5** | 16.047 | **16.047** | ✓✓ | **+8.752** ✓✓✓ |
| **2013-14** | 9.602 | **6** | 9.596 | **9.420** | ✗ **−176, explicado** ✓ | **+5.182** ✓ |

**★ El −176 está entero en UN grupo** ✓✓: **`725/3768` «I FASE - ÁVILA»** — la cola trae **182 partidos** ✓ y el canónico **6** (sólo J1) ✓: **182 − 6 = 176** ✓✓✓.
**Y el motivo va en la dirección CONTRARIA a la habitual** ✗✓: `actas analizadas 145≠144, participaciones 4124≠4097, eventos 2336≠2323, técnicos 283≠281 **[origen≠canónico]**` — aquí **el ORIGEN trae MÁS** ✗, no menos ✓ (por eso no salta el aviso de «¿cola vieja?» ✓). **Para Claude** ✓.
**Y otra inconsistencia para Claude** ✗: `importacion-fallos-castilla-leon-2013-14.json` está **vacío (`[]`)** ✗ mientras el **resumen dice `"fallidos": 1`** ✗✗ — ese fallo **no llegó al JSON de fallos** ✓.

### ✗✗✗ REGLA DURA QUE HE APRENDIDO A LA MALA: **NO SOBRECARGAR EL SERVIDOR** (13/10, dicho por David)

**Yo apagué el servidor.** Encadené **rioja entera (15 temporadas) y euskadi entera (13)** sin pausa ✗, con el servidor **ya en su tope** (`MemoryCurrent` 11,6–12,0 GiB de 12 ✓) y **carga 18 en 4 núcleos** ✗. David: *«has vuelto a sobrecargar el servidor y por eso se ha apagado, siempre pasa lo mismo»* ✓✗.

**Regla, desde ahora y sin excepción** ✓✓:
1. **Nunca encadenar federaciones ni traer una federación entera de golpe** ✗ — **de una en una y de pocas temporadas en pocas temporadas** ✓, **de noche** ✓.
2. **Medir ANTES y DESPUÉS de cada traída** ✓: `systemctl show facylf.slice -p MemoryCurrent` ✓ **y** `uptime` (la carga) ✓.
3. **Si la memoria sube hacia el tope o la carga pasa de ~20, PARAR** ✓ y esperar ✓ — no seguir con la siguiente ✓.
4. **El servidor no es solo mío**: recolecta 19 federaciones a la vez ✓ y su trabajo es lo primero ✓.

### Diagnóstico de la 2ª caída (13/10 20:49 UTC, con el servidor ya arrancado) ✓

- **`last -x`: aparece `crash`** ✓✗ en las sesiones que terminaron (`root tty1 … 11:12 - crash` ✓ y `Thu Oct 8 10:17 - crash` ✓) → **la máquina NO se apagó limpiamente** ✓✓ → **NO fue un `poweroff` ni un `suspend`** ✓ (eso dejaría cierre ordenado ✓).
- **★ `boton-encendido` queda DESCARTADO** ✓✓: es `python:3.12-slim` con `/app/app.py` montado de **`/opt/stacks/wol/app.py`** ✓ — **`wol` = Wake-on-LAN** ✓✓ → **es el botón que la ENCIENDE, no puede apagarla** ✓; `privileged=false` ✓ y `restart=unless-stopped` ✓. **La sospecha de David, resuelta: no es él** ✓✓.
- **`sensors`: CPU a 49 °C** ✓ (crítico 105 °C ✓) → **no hay problema térmico** ✓✓.
- **★ Y hay un `BAT0-acpi-0` con `in0: 14.89 V`** ✓✓ — o sea, **la máquina ya tiene un dispositivo de batería/UPS** ✗✓: **puede que exista un SAI y su batería no aguante** ✓✓ → **es la primera cosa que David debería mirar, antes de comprar nada** ✓✓.
- ✗ **Límite importante**: el journal **sólo me deja ver mensajes de USUARIO** ✗ («Users in groups adm, systemd-journal can see all messages» ✓) → **el `-b -1` que leo está incompleto** ✗ y **el de sistema hay que pedirlo con `sudo`** ✓ (para David o Claude ✓).
- Estado al leerlo: **`load 10,5`** ✓ y **`MemoryCurrent` 9,83 GiB** ✓ (subiendo mientras arrancan los contenedores ✓).

### ★★★ LA CAUSA, LEÍDA CON `sudo` (13/10, con las dos órdenes de Claude) — **las DOS se cortan EN SECO, sin un solo error** ✓✓

`sudo` funciona **sin contraseña** en el servidor ✓, así que pude leer los dos arranques ✓:

| | última línea del journal | qué hay justo antes |
|---|---|---|
| **`-b -1`** (la de hoy ✓) | **`oct 13 20:06:04`** ✗ y **nada más** ✗ | cron normal cada minuto (`docker stats` ✓ y una consulta a `facylf-postgres` ✓) — **la máquina trabajando con normalidad** ✓ |
| **`-b -2`** (la del 11/10 ✓) | **`oct 12 01:14:04`** ✗ y **nada más** ✗ | ídem: cron normal ✓ |

**Y el filtro de claves no devuelve NADA en ninguna de las dos** ✓✓✗: **ni `oom` / `out of memory` ✗, ni `hung task` ✗, ni `blocked for more than` ✗, ni errores de `nvme`/`ata` ✗, ni `watchdog` ✗, ni `thermal` ✗, ni un `shutdown` ordenado ✗**.

**Leyéndolo con la clave de Claude** ✓✓: *«si se cortan en seco, es corriente»* → **las dos caídas son un corte seco, sin rastro de software** ✓✓ → **NO es un OOM ni un fallo de disco ni térmico** ✓✗, y **tampoco un apagado ordenado** ✓ → **corriente o cuelgue duro** ✓✓.

**★ Lo siguiente, y es para David** ✓✓: mirar si **`BAT0` es un SAI con la batería agotada** ✓ (recuerda: `sensors` da `BAT0-acpi-0 · in0: **14,89 V**` ✓). **Ahí está la explicación más probable, y se comprueba en un minuto** ✓✓.

> **Matiz honesto, y por eso la regla se queda** ✓✗: un cuelgue duro por carga extrema **también** deja el journal cortado en seco ✗ — así que esto **no absuelve a la sobrecarga** ✓✓: sigo con **una traída a la vez, de noche, y sin forzar el script cuando espera** ✓.

### ★★★ DECISIÓN DE DAVID (13/10 noche): **el servidor a casi el máximo, pero sin que se sature la RAM** ✓✓

- **No hay SAI** ✓ y la batería **no** es el problema ✓ (siempre conectado a la corriente ✓) → las caídas siguen siendo **corte de corriente sin protección o cuelgue duro** ✗ (y **sin SAI, un corte de luz no tiene defensa** ✓ — pero eso es decisión de David ✓).
- **David quiere el servidor a casi el máximo** ✓✓: **el cuello es la CPU** ✓ (4 núcleos ✓) → **NO hay que bajar el número de federaciones** ✗✓ (eso bajaría la velocidad de recogida ✓ y no es lo que quiere ✓).
- **Lo que hay que vigilar es la MEMORIA** ✓✓, y lo dice él: *«si no limpia los perfiles de Chrome o la basura que se va acumulando, se satura; el cuello es la CPU, pero la memoria se puede terminar saturando con el tiempo»* ✓ → **la memoria sube sola con el tiempo** ✗ y **ahí está el riesgo real** ✓.
- **Consecuencia operativa para mí** ✓✓: **medir la memoria del servidor de forma periódica** ✓ (no sólo al traer ✓) y **avisar en cuanto suba** ✓; seguir trayendo **de una en una y de noche** ✓; y **no tocar topes ni ajustes** ✗ (son de Claude/David ✓).

### ¿Qué es «T-10»? (para David, en corto) ✓

**T-10 no es nada que hayas pedido tú** ✓✗: es una **tarea apuntada hace días que nunca se llegó a detallar** ✗ — la idea era **ajustar la memoria del servidor** (`systemd-oomd`, el mecanismo de Linux que **mata procesos cuando falta memoria** ✓). Claude la dio por innecesaria el 13/10 por la mañana ✗✓ y **el mismo día la reabrió como pregunta para ti** ✓ al ver las caídas ✓.
**Traducido**: *«¿le ponemos una red de seguridad al servidor para que no se quede sin memoria, o lo dejamos como está?»* ✓. **Y con lo que has dicho hoy ya tiene forma** ✓: **no bajar federaciones** ✓ y **vigilar la memoria** ✓ → lo que queda por decidir es **si se le pone límite o limpieza automática a la basura que se acumula** ✓ (perfiles de Chrome ✓). **No lo toco yo** ✗: es de Claude y tuyo ✓.

### ★★★ MEDIDO A FONDO (13/10 22:5x): **NO hay basura que limpiar — lo que se satura es la CPU, no la memoria** ✓✓

David pidió limpiar para que el servidor no se caiga ✓. **Fui a buscarlo y esto es lo que hay** ✓:

| recurso | medida | veredicto |
|---|---|---|
| **RAM del host** | 15,5 GiB totales · **9,3 GiB DISPONIBLES** ✓ | **no falta RAM** ✓✗ |
| **RAM de `facylf.slice`** | 11,7 de 12 GiB ✓ | es un **TOPE**, no una falta ✓ |
| **swap** | 689 MB usados ✓ | presión leve ✓ |
| **disco** | `/srv/data` al **42 %** de 458 GB ✓ | **no hay problema de disco** ✓ |
| **CPU** | **load 14–17 en 4 núcleos** ✗✗ | **★ ESTE es el recurso saturado** ✓✓ |
| **Chromium** | **66 procesos · 7,3 GiB** ✓ | **es el grueso de la memoria, y son los recolectores trabajando, no basura** ✓ |
| `/tmp` | limpio ✓ (sólo un fichero de bloqueo ✓) | nada que borrar ✓ |
| restos de extracción míos | **ninguno** ✓ | el script nuevo limpia solo ✓ |

**La conclusión, y es incómoda de decir pero es la verdad** ✓✓: **no existe una limpieza que impida las caídas** ✗✓. Lo que se satura es **la CPU** (load 14–17 con 4 núcleos ✓), y la saturan **los propios 19 recolectores** ✓ — no la basura y no mi trabajo ✓. **Coincide con lo que dijo David: «el cuello es la CPU»** ✓✓.
Los `t*-<temporada>` de cada federación (**~1,5 GB en navarra** ✓) **son datos de trabajo del recolector** ✗✓: **no son míos y no se tocan** ✗ (borrarlos podría romper su estado ✓ y eso es de Claude ✓).
**Lo único que yo puedo hacer, y lo hago** ✓: **no añadir carga** ✓ (una traída a la vez ✓ — y **de noche el PC se apaga, así que no hay traídas en absoluto** ✓✓, que es el estado más seguro ✓).
**Lo que queda por decidir es de David** ✓: **recoger con menos federaciones a la vez baja la carga y también la velocidad** ✓ (era la pregunta abierta de Claude ✓). **Nada de esto lo toco yo** ✗.

### ★★ DISCO · primer movimiento HECHO (14/10 01:1x) — **+2,2 GB liberados de F:** ✓✓

Encargo directo de David ✓ (y por eso **sí** se toca, aunque sea el PC ✓ — el encargo está en `docs/ESPACIO-EN-DISCO.md` ✓, que es el documento del otro agente ✓). **F: tenía 203 de 208 GB** ✗ y el 37 % era `facylf` ✓.

**Movido a E: con enlace (`robocopy /MOVE` + junction ✓), sólo lo que estaba FRÍO** ✓✓:

| carpeta | GB | último cambio | resultado |
|---|---|---|---|
| **`descargas-federacion-sondeo`** | 2,0 | **05/10** ✓ frío | **movida a `E:\facylf-archivo\…`** ✓ — 8.348 ficheros visibles por el enlace ✓ |
| **`_borrar`** | 0,2 | **09/09** ✓ frío | **movida** ✓ — 204 ficheros visibles ✓ |

**F: 18,3 → 20,5 GB libres** ✓✓ y **E: 814,5 → 812,3** ✓. **Sigue funcionando todo por la ruta vieja** ✓ (las tareas, las variables y Docker no cambian ✓ — verificado leyendo a través del enlace ✓).

**Lo que NO he tocado, y por qué** ✗✓: **`descargas-multideporte`** (6,1 GB ✓) escribía **a la 01:11, ahora mismo** ✗; **`_traspaso`** (8,8 GB ✓) y **`pruebas`** (6,8 GB ✓) los tiene **calientes mi job de navarra** (`pwsh-3419`, **aún corriendo** ✗). **Mover mientras se escribe corrompe** ✗✓ — así que esperan ✓.

**Lo que queda, y quién lo desbloquea** ✓:
1. **`_traspaso` + `pruebas` (15,6 GB)**: en cuanto acabe el job de navarra ✓ — **es mío y lo hago yo** ✓.
2. **Los `descargas-*` de las federaciones del SERVIDOR** (≈41 GB ✓): sólo exigen **parar mis traídas** ✓ (las controlo yo ✓) → **se puede hacer en cuanto el job acabe** ✓.
3. **Los `descargas-*` de las CUATRO del PC** (madrid, andalucia, cataluna, valencia ≈16,7 GB ✓): **exigen parar la flota del PC** ✗ → **DECISIÓN DE DAVID** ✓ (pausa de recolección mientras se copian ≈30-60 min ✓).
4. Descartado a propósito ✗: **`node_modules` y `.pnpm-store`** (1 GB ✓) — son regenerables ✓ pero un enlace ahí puede romper el toolchain ✗ y el premio es pequeño ✓.

## Ahora mismo













| | |
|---|---|
| **EN CURSO** | **traída del servidor, federación a federación** ✓ — **rioja** en marcha (job `pwsh-1890` ✓): 2026-27 ✓ (36 imp / 2 fall, y **los 2 grupos ARREGLADOS y reimportados** ✓✓: 40+40 partidos, **16+16 inscripciones todas con código** ✓), **2025-26 → 146/0** ✓, **2024-25 → 151/0** ✓, 2023-24 en curso ✓. **CyL: las 6 del servidor EXACTAS** ✓✓ (las 7 del PC, **esta noche** ✓). **Fase 3: 1 ✓✓ · 2 ✓✓✓ · 3 ✓✓✓ (Ceuta HECHA) · 4 ✓✓ · T-10 INNECESARIA ✓.** Queda: **euskadi, navarra, cantabria, asturias, extremadura, aragon** ✓ y **las 7 del PC esta noche** ✓ |
| **BLOQUEADO** ✗ | **2014-15 y 2012-13**: están **asignadas al servidor** ✓ pero **no están en su cola** ✗ → **no hay paquete que traer** ✓ (falta **recolección** en el servidor ✓) → **para Claude/David** ✗. Y **T-06 Valencia**, que es **decisión de David** ✓ (no se le hacen más pruebas ✓) |
| **HECHO HOY (13/10)** | **★★ EL SERVIDOR HA VUELTO y CyL YA ESTÁ EN MARCHA** ✓✓: `MemoryCurrent` **11,96 → 11,31 GiB** ✓ (la traída **no** lo empeoró ✓) · **6 paquetes FRESCOS de CyL** ✓✓ (**11.118 partidos más** que el canónico ✓, 2020-21 con **341 grupos** frente a 194 ✓) · **prueba 15 PASA** ✓✓ (**11/11 ficheros, 190 pruebas** ✓) · **ficha de Palencia COMPLETA** ✓✓ (3 competiciones de fútbol sala ✓, tabla de partidos **en HTML** ✓, **`POST cargaclasificacion.php`** con `competi`+`numjor` ✓). *(De la Fase 2 siguen en pie: pasos 1-5 ✓✓ y los tres arreglos de Claude confirmados ✓✓)*. **★ Y dos hallazgos de la ronda de salud** ✓✓: **Docker Desktop del PC se reinició 33 min** ✗ (12:17:53 ✓, los **5** contenedores a la vez ✓) y **cortó 5 de las 6 importaciones** ✗ — **ya relanzadas** ✓. **✗✗ Y me equivoqué en lo segundo**: dije que las 4 federaciones «a 0 peticiones» **no** estaban paradas ✗ — **sí lo están** ✓✓ (0 peticiones desde el **11/10 ~23:00 UTC** ✗, y lo «tocado» era el **replanificado del arranque** ✓). **Probable turno de plaza** ✓; **a las 17:30 UTC se comprueba** ✓, **sin tocar turnos ni topes** ✓ |
| **Siguiente** | acabar las 5 y **verificar las 6 con la regla buena** ✓ (**canónico == paquete − imposibles − descansos** ✓); **paso 3**: Ceuta **HECHA** ✓ (los 36 son descansos ✓); **a las 17:30 UTC** ✓: si galicia, murcia, castilla-la-mancha o ceuta **siguen a 0 peticiones** ✗, **pegar las últimas 40 líneas de su registro** ✓ (**del fichero**: `docker logs` sale vacío ✗✓), **sin tocar turnos ni topes** ✓; y **Fase 1 paso 3** con el resto de federaciones ✓, una a una ✓, **siempre con `-Paquete` del día** ✓. **2014-15 y 2012-13: NO hacer nada** ✓ (están en la cola del servidor y llegarán solas ✓). **Lo del paso 5 ya no es mío** ✗: 3 accesos son decisión de David ✓ y 1 de alcance ✓ |
| **Bloqueadas** | ver §Bloqueos abajo |

## ✎ Revisión de Claude de la tanda del 11/10 (noche) — LEER ANTES DE SEGUIR

**Corregido o hecho en el código:**

1. **`informe:buscar` «ignora su argumento»**:
   - **Causa**: solo leía `--texto`; una palabra suelta (`informe:buscar rioja`) se descartaba sin aviso. Además, sin `--federacion` busca en **CyL**, sin `--temporada` solo la **vigente**, y solo grupos con cobertura certificada desde 2021-22.
   - **Arreglado**: una palabra suelta es el texto, una opción desconocida da error, y la salida dice en qué federación y temporada ha buscado.
   - **Pero no sirve para verificar importaciones.** Para eso, nuevo: `node scripts\claude\canonico-por-federacion.mjs rioja canarias melilla ceuta` (grupos, partidos y resultados por temporada en el canónico del PC; `--alineaciones` opcional). Sin probar aún contra la base: si falla, apúntalo con la salida.
2. **El registro de fallos guardaba el envoltorio** (`NativeCommandError`):
   - **Arreglado** en `importar-temporada.ps1`: quita las líneas de PowerShell y de pnpm, guarda la última línea de error real y **la salida entera de cada grupo fallido** en `pruebas\reconstruccion\salidas\importacion-<fed>-<temporada>-<grupo>.txt`, con su ruta en el JSON.
   - **Canarias**: repetir solo ese grupo para ver la causa: `pnpm importar --federacion canarias --temporada 2026-27 --grupo 903639327` (o reimportar 2026-27 entera: es idempotente). Pegar aquí las líneas del error real.
3. **«El recolector falla a los 15 min en vez de esperar» NO es un fallo**: es el turno de plazas de Chrome. Sin plaza en 15 min, la sesión deja el turno (la cola queda intacta) y otra federación lo aprovecha; esperar indefinidamente rompería ese reparto. **No se cambia.** Que Baleares saliera con código 1 es cosmético.
4. **`trae-federacion-servidor.ps1` protegido**:
   - se niega a traer `andalucia`, `madrid`, `valencia` y `cataluna`, cuya cola viva está en el PC (la del servidor es una copia parada y vieja);
   - para `castilla-leon -Todas`, solo trae las temporadas **asignadas al servidor**.

**Correcciones a lo apuntado en esta tanda:**

- **rioja NO está HECHA**: solo se trajo **2025-26** (1 de sus ~19 temporadas). Falta `trae-federacion-servidor.ps1 -Federacion rioja -Todas`.
- **Andalucía NO se trae del servidor** (vive en el PC desde el 09/10). Ni Madrid, Valencia ni Cataluña. Se importan **desde la cola del PC**, temporada a temporada: `scripts\importar-temporada.ps1 -Federacion andalucia -Temporada <AAAA-AA>` (sin `-Paquete`). Igual para las temporadas de CyL del PC.
- **T-12 zona 1 — el «hallazgo» de siguetuliga NO vale**:
  - son competiciones **federadas** de la FCyL copiadas (ya las recogemos de la federación);
  - el adaptador `siguetuliga` ya lee toda su lista de ligas y descarta las federadas;
  - y **no se excluye `/base/`**: los menores se recogen (decisión del 05/10); nunca DNI, correos ni teléfonos.
  - Método corregido en `TAREA-LARGA-FUTBOL-AFICIONADO.md` §2: **inventario → clientes por huella de plataforma → webs propias**, más **REA** para entender cómo carga una web nueva (§3.2).
- La lección del 99 % de CPU es buena: las importaciones grandes, de noche y de una en una. Si David suspende el PC, esperan.

**Plan de la próxima sesión, en este orden y sin parar entre pasos:**

1. Recoger Ceuta (pwsh-7978). Verificar **con `canonico-por-federacion.mjs ceuta`**, no con el buscador.
2. Canarias: repetir el grupo 903639327 y apuntar la causa real.
3. rioja `-Todas`; luego euskadi, navarra, cantabria, asturias, extremadura, murcia y castilla-la-mancha (de pequeñas a grandes). Las de más de ~200 MB, de noche.
4. **De noche, desde la cola del PC**: andalucia, madrid, cataluna, valencia y las temporadas de CyL del PC, una a una. Galicia y aragon desde el servidor, también de noche.
5. Entre importaciones, **T-12 zona 1 con el método nuevo**: inventario de lo que ya hay de CyL, clientes nuevos por huella de plataforma (Burgos, Palencia, Soria, Ávila, Segovia, Zamora, Salamanca) y webs propias; REA para cualquier web nueva que cargue con JavaScript.
6. Rondas de salud cada 2 h y, el lunes, la ronda semanal.

## T-04 · REPARTO AL PC — estado (11/10 21:45)

| federación | temporadas | grupos | fallos | estado |
|---|---|---|---|---|
| **melilla** | **5 de 5** | **888** | **0** | **HECHA y VERIFICADA AL EXACTO** ✓✓ — canónico y paquete coinciden en las cinco: 2.377/2.377 · 3.046/3.044 · 3.453/3.453 · 3.254/3.254 · 562/500 ✓✓. Incluye playa, sala femenino y prebenjamines ✓ |
| **rioja** | **19 ya en el canónico** ✓ (2026-27 → **2008-09**) | 146 (sólo 1 temporada en esa tanda) | **0** | **la corrección de Claude era cierta y incompleta a la vez** ✓ — es verdad que en esa tanda se trajo **1** temporada ✓, pero **las otras 18 ya estaban en el canónico** ✓✓. La 2025-26 coincide **exacta** con su paquete (6.866/6.045) ✓. El propio paso 3 imprime la lista de temporadas del origen: si sale alguna más, se trae |
| **canarias** | **6 de 6** | **47** | **0** ✓ | **HECHA y VERIFICADA AL EXACTO** ✓✓ — las seis coinciden con su paquete: 174/125 · 1.297/816 · 638/634 · 320/318 · 320/316 · 72/72 ✓✓. El fallo del grupo 903639327 **quedó resuelto** ✓ (importado aislado, código 0: 2026-27 pasó de 8/9 a **9/9**) y **NO era pérdida de datos** (ver «falso positivo» abajo ✓) |
| **ceuta** | **10 de 10** ✓ | **560** | **0** | **NO está HECHA** ✗ — **9 de 10 exactas** ✓✓ (206/200 · 2.738/2.722 · 3.024/2.983 · 2.793/2.774 · 2.099/2.094 · 2.188/2.175 · 750/724 · 3.072/2.004 · **3.044/2.790**) y **una con pérdida**: **2017-18: el origen tiene 2.080 partidos y el canónico 2.044 (−36)** ✗. **OJO — corrección de mi propia lectura** ✗: a las 22:40 dije «−74 y −27» y **estaba midiendo el canónico mientras el job seguía importando** ✗✗; al terminar, 2018-19 quedó exacta y el hueco real es −36 en 2017-18 ✓. **El <95 % de resultados SÍ es de la fuente** ✓✓: el origen ya trae 1.580/2.080 (2017-18), 2.790/3.044 (2018-19) y 2.004/3.072 (2019-20) — y esta última lleva la firma del COVID («último partido con resultado **2020-03-21**» ✓) |
| **euskadi** · **navarra** · **cantabria** · **asturias** · **extremadura** · **murcia** · **castilla-la-mancha** | — | — | — | **en el lote del paso 3** ✓ (job `pwsh-8304`, lanzado 11/10 ~22:55, una detrás de otra). Euskadi es la mayor (268 MB) |

**El fallo de Canarias: RESUELTO, y no era pérdida de datos** ✓✓ (11/10 ~22:50). **El grupo importado aislado da código 0** ✓ («recuentos origen/destino: cuadran», 184 filas actualizadas) y **Canarias 2026-27 pasó de 8/9 a 9/9 grupos** ✓✓. `903639326/903639327 (ELIMINATORIA)` de la 2026-27. **OJO — corrección de lo que escribí antes** ✗: dije que «el detalle está en el JSON» y **es falso** ✓. El fichero `pruebas\reconstruccion\importacion-fallos-canarias-2026-27.json` guarda:

```json
"motivo": "+ FullyQualifiedErrorId : NativeCommandError"
```

**Eso es el envoltorio de PowerShell, no la causa** ✗✗ — `NativeCommandError` sólo dice «un programa externo falló», **no dice qué falló** ✓. **El fallo NO es diagnosticable desde el fichero**: hay que **reproducirlo capturando el error de dentro** ✓. **Es de código → de Claude** ✗. No urgente (**1 grupo de 1.081** ✓), pero **el registro de fallos engaña**: parece documentar y no documenta ✓.

**Y es la cuarta vez que aparece la misma forma** ✓✓: la API de la FCF acepta `temporadaId` y lo ignora ✗ · `informe:buscar` acepta el término y lo ignora ✗ · el monitor llama «atascada» a lo que está ahogada ✗ · y esto guarda el sobre en vez de la carta ✗. **Un artefacto que parece contener información y contiene ruido es peor que un silencio** ✓✓: **el silencio hace buscar; el ruido hace concluir** ✓.

## ✓✓ LISTO PARA CUANDO EL SERVIDOR VUELVA (auditoría del 12/10 13:4x, pedida por David)

**David dijo: «no te preocupes por el servidor, después lo arranco; asegúrate de que todo funciona correctamente para cuando lo encienda». Esto es esa comprobación** ✓ — hecha **en el repositorio**, que es lo que se puede comprobar con el servidor apagado ✓.

**1. ¿Vuelven solos los contenedores al encenderlo? SÍ** ✓✓ — comprobado servicio a servicio, no supuesto:

| servicio | dónde se declara | `restart` |
|---|---|---|
| **postgres** | `infra/docker-compose.yml` línea 16 | **`unless-stopped`** ✓ (+ healthcheck `pg_isready` ✓) |
| **los 20 recolectores** | `docker/compose.yml`, heredan de `x-comun: &recolector` (línea 90) que lleva `restart: unless-stopped` (línea 95) ✓ | **`unless-stopped`** ✓ |
| **importador** | `docker/importador.yml` | **`unless-stopped`** ✓ |
| **monitor** | `docker/monitor.yml` | **`unless-stopped`** ✓ |
| **web** | `docker/web.yml` | **`unless-stopped`** ✓ |

**`unless-stopped` = arrancan solos al arrancar Docker** ✓✓ (salvo que alguien los hubiera parado a mano ✓). **Y el `facylf.slice` con su `MemoryMax=12G` es una unidad de systemd, así que también sobrevive al reinicio** ✓.

**2. ¿Se pediría algo DOS VECES? NO** ✓✓ — es el riesgo grave (peticiones duplicadas a la misma federación ✓) y está cerrado por los dos lados:

- **PC** (`entorno-flota.ps1`): excluye **14** (`melilla, aragon, asturias, baleares, canarias, cantabria, castilla-la-mancha, ceuta, euskadi, extremadura, galicia, murcia, navarra, rioja`) → recoge **`andalucia, madrid, cataluna, valencia`** ✓.
- **servidor** (`compose.yml`, `monitor.yml`, `web.yml`): excluye **`valencia,madrid,cataluna,andalucia`** → recoge **las otras 14** ✓. **Y no depende de la memoria de nadie**: `scripts/servidor/paso1-despliegue-20261011.sh` (líneas 27-32) **comprueba y añade `andalucia`** al `.env` del servidor ✓, y ese script **se ejecutó el 11/10** ✓.
- **14 + 4 = 18**, y **la 19 es `federacion` (CyL), que no está en ninguna de las dos listas porque va REPARTIDA POR TEMPORADAS** ✓✓ — justo como manda el diseño (*«ninguna federación puede estar en las dos flotas (se pediría dos veces) ni en ninguna (no se recogería)»* ✓).

**3. ¿Se quedaría alguna federación SIN NADIE? NO** ✓✓ — **el reparto de CyL está comprobado temporada a temporada y cuadra exacto**:

| | temporadas asignadas |
|---|---|
| **PC** (`descargas-federacion/recolector-local/temporadas-asignadas.txt`) | 2025-26 · 2023-24 · 2021-22 · 2019-20 · 2017-18 · 2015-16 · **2013-14** (7) |
| **servidor** (`scripts/servidor/temporadas-asignadas-servidor.txt`) | 2026-27 · 2024-25 · 2022-23 · 2020-21 · 2018-19 · 2016-17 · **2014-15 · 2012-13** (8) |

**Intersección: VACÍA** ✓✓ · **Unión: las 15 temporadas que tiene la cola de CyL** ✓✓ (2012-13 → 2026-27, exactas ✓). **Ni solape ni hueco** ✓.

**4. Y encaja con lo que le falta al canónico** ✓: a CyL sólo le faltan **2014-15, 2013-14 y 2012-13** ✗. **2013-14 es del PC** ✓ y **se está importando en este momento** ✓ (paso 4 ✓); **2014-15 y 2012-13 son del servidor** ✓ → **paso 3 en cuanto arranque** ✓.

**5. Lo único que NO puedo comprobar con el servidor apagado** ✗ (y que hay que mirar cuando encienda, en este orden):

1. que **Docker arranca con la máquina** y que `docker ps` da **20 contenedores `facylf-*`** ✓;
2. que los **5 que deben estar parados siguen parados** (`bizkaia`, `araba`, `gipuzkoa`, `laspalmas`, `tenerife` ✓ — salieron con código 137 y **se quedaron parados**, o sea que los paró alguien a mano ✓; si hubieran sido sólo un OOM habrían vuelto solos ✓);
3. **el aviso de anoche**: el `facylf.slice` estaba a **11 de 12 GiB** con **load 18,32** ✗✗ justo antes de caerse ✓ → **mirar `MemoryCurrent` en cuanto arranque** ✓, y **si vuelve a subir ahí, es el dato que Claude necesita para decidir el tope** ✓ (yo no lo toco ✗);
4. `docker exec facylf-monitor printenv FACYLF_EXCLUIR` → debe decir **`valencia,madrid,cataluna,andalucia`** ✓ (hay script: `scripts/servidor/recrea-monitor.sh` ✓);
5. **que el código del servidor sigue siendo el del 11/10**: `scripts/servidor/verifica-despliegue-recolector.sh` ✓ (las **«4 huellas»** que dio el paso 1 ✓). **No hace falta redesplegar nada** ✓✓: lo que hay cambiado en el repositorio son **mis documentos y un contador de sólo lectura en `_traspaso\_diag\`** ✓; **el código de producto que aparece modificado es de Claude y ya se desplegó el 11/10** ✓ (paso 1: *«4 huellas OK, suelo 2010-11, monitor, 15 contenedores recreados»* ✓). **Y yo no despliego ni comiteo** ✗ (límites del GOAL ✓).

**6. Disco: cabe, pero con poco margen** ⚠ (comprobado 12/10 13:4x). **F:** es la unidad del proyecto y está al **10 % — 20,7 GB libres** ✗. `_traspaso` ocupa **6,7 GB** ✓ y lo más grande **no es lo que hace falta** ✗:

| qué | tamaño | ¿hace falta? |
|---|---|---|
| `traspaso-pc-20261009-1531.tar` | **1,78 GB** | **no** — paquete de traspaso del 09/10 ✓ |
| `cola-valencia.sqlite` · `cola-madrid.sqlite` · `cola-cataluna.sqlite` | **1,27 GB** (665+397+213) | **no para el paso 3** — copias de las colas vivas del PC ✓ |
| paquetes de CyL (2024-25, 2022-23, 2018-19, 2016-17…) | ~1,1 GB | sí (paso 4) ✓ |
| respaldos `*-anterior-*` | **180 MB** (5 ficheros) | no ✓ |
| `facylf-web.tar` | 128 MB | no ✓ |

**Se podrían liberar ~3 GB** ✓ (el tar viejo + las tres copias ✓), **pero NO los borro** ✗✗: **son evidencia de ingesta** ✓ y eso manda (`CLAUDE.md`: *«Las SQLite y los archivos comprimidos son evidencia de ingesta»* ✓), y decidir qué se tira no es mío ✓. **Paso 3 necesita unos 2–4 GB** ✓ (cada federación deja sus paquetes y **el script aparta el anterior en vez de borrarlo** ✗, así que cada pasada engorda `_traspaso` ✓) → **cabe, pero con poco sitio** ⚠. Si quieres margen antes de encenderlo, **es tu decisión borrar el tar y las tres colas** ✓.

**7. Y en el lado del PC no hay que hacer NADA antes** ✓✓: el reparto es complementario ✓, el reparto de CyL no se solapa ✓, el supervisor está vivo ✓ y los recolectores del PC trabajan ✓ (21 procesos ✓). **Lo único que hay que seguir respetando es lo de siempre: una sola importación al canónico a la vez** ✓ (ahora mismo **no hay ninguna** ✓, el paso 4 cerró ✓).

**8. Y el paso 3 está verificado hasta el último detalle** ✓✓ (12/10 13:5x): la convención de volúmenes en `docker/compose.yml` es **`../descargas-<fed>:/app/descargas-<fed>`** ✓, así que **la ruta que usa el script** (`/app/descargas-<dir>/recolector-local/cola-v2.sqlite` ✓) **cuadra** ✓; y **las 10 federaciones pendientes tienen su servicio** ✓✓ (`rioja, euskadi, navarra, cantabria, asturias, extremadura, murcia, castilla-la-mancha, galicia, aragon` ✓) → **existirá `facylf-<fed>-1` para todas** ✓. **No queda nada que comprobar en el repositorio** ✓: lo que falta es sólo que la máquina esté encendida ✓.



### Secuencia EXACTA para cuando enciendas (copiar y pegar)

```bash
# 1) Que haya vuelto de verdad (desde el PC):
ssh servidor "uptime"                                  # si no contesta, aún no está lista
tailscale status | grep servidor                        # debe decir "active", no "offline"

# 2) Que su flota ha vuelto sola:
ssh servidor "docker ps --format '{{.Names}}' | grep -c '^facylf'"   # deben ser 20
ssh servidor "systemctl show facylf.slice -p MemoryCurrent -p MemoryMax"  # ⚠ MIRA ESTO: anoche 11 de 12 GiB

# 3) Que el reparto sigue siendo el correcto:
ssh servidor "docker exec facylf-monitor printenv FACYLF_EXCLUIR"    # valencia,madrid,cataluna,andalucia
```

```powershell
# 4) Y ya, lo primero de todo: CERRAR CASTILLA Y LEÓN (su prioridad máxima) — le faltan 2014-15 y 2012-13:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-federacion-servidor.ps1 -Federacion castilla-leon -Todas
node scripts\claude\canonico-por-federacion.mjs castilla-leon     # ← la prueba: deben salir 15 temporadas

# 5) Después, UNA A UNA, de pequeñas a grandes (y las de más de ~200 MB, de noche):
#    rioja, euskadi, navarra, cantabria, asturias, extremadura, murcia, castilla-la-mancha, galicia, aragon
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-federacion-servidor.ps1 -Federacion <fed> -Todas
node scripts\claude\canonico-por-federacion.mjs <fed>             # ← y su verificación, federación a federación
```

**Recordatorio de las tres trampas ya pagadas** ✓: **una sola importación a la vez** ✗ · **`trae-federacion-servidor.ps1` se niega con `andalucia`, `madrid`, `valencia` y `cataluna`** ✓ (su cola viva es la del PC ✓) · y **no medir el canónico mientras importa** ✗✗ (me pasó con Ceuta ✓).

## ★★★ RESUELTO: los 779 partidos de CyL **no están perdidos: el importador se niega a importarlos, y tiene razón** (11/10 23:5x)

**La respuesta, capturada en la primera temporada que probé** ✓✓ (2020-21, la del hueco mayor):

```
✗ El acta 3114304 (35292 J1) no se corresponde con la fila del calendario que la cita:
  el calendario dice «C.D. Navega vs Real Salamanca Monterrey C.F.» y el acta dice
  «U.D. Santa Marta de Tormes vs C.D. Villares de La Reina».
  El lote se detiene: hay que revisar la fuente.
```

**El acta está pegada a otro partido** ✗✗. **No es una pérdida de la importación: es que la fuente trae el acta y el calendario desacoplados** ✓, y el importador **se niega a meterlo y lo dice con nombres y apellidos** ✓✓. **Eso es lo correcto** ✓: meterlo sería inventar quién jugó contra quién ✗.

**Y con esto encajan las tres federaciones que parecían tres problemas distintos** ✓✓ — **son uno solo: la identidad (acta ↔ calendario ↔ equipo) en la fuente**:

| federación | qué pasa | cuántos partidos |
|---|---|---|
| **CyL** | 5 grupos detenidos en 2020-21 porque **el acta no corresponde a la fila del calendario** ✗ | **−779** en 5 temporadas |
| **Rioja** | 2 grupos con **dos equipos que colapsan en la misma referencia contextual** (`team_entry_referencia_contextual_uq`) ✗ | **−64** en 2026-27 |
| **Ceuta** | falta parte de 2017-18 | **−36** |

**Lo importante para David, en una frase** ✓: **los datos no se están cayendo por el camino; están esperando a que se decida qué hacer con una fuente que se contradice a sí misma** ✓. El importador es **conservador a propósito** ✓ y por eso el canónico tiene huecos exactos y contables, no datos falsos ✓.

**Y es de Claude, no mío** ✗ (límite del GOAL: no tocar el importador): hay que decidir **cómo se trata un acta que no cuadra con su calendario** — ¿se descarta el grupo entero?, ¿se importan los partidos que sí cuadran?, ¿se marca la incidencia y se sigue? Hoy **se para el lote completo de ese grupo** ✗, que es lo más seguro pero cuesta 5 grupos y 405 partidos sólo en 2020-21 ✓.

**Detalle del arreglo del registro de fallos que hay que pulir** ✗: el `motivo` del JSON guarda **sólo la última línea** del mensaje (`Reina». El lote se detiene: hay que revisar la fuente.`) porque el mensaje **se parte al envolver** en la consola ✗, así que pierde el principio —que es justo lo que informa ✓. **La salida entera sí está bien** ✓ (`pruebas\reconstruccion\salidas\importacion-castilla-leon-2020-21-35292.txt`), así que basta con **coger la frase entera del `✗`**, no una línea ✓.

### El aviso que dio lugar a esto (comparación canónico vs paquete)

| CyL · temporada | paquete (origen) | canónico | faltan |
|---|---|---|---|
| 2016-17 | 21.630 / 21.541 | 21.556 / 21.467 | **−74** ✗ |
| 2018-19 | 20.341 / 20.279 | 20.333 / 20.271 | **−8** ✗ |
| **2020-21** | 2.683 / 2.544 | 2.278 / 2.194 | **−405** ✗✗ ← **5 grupos detenidos, ya con causa** ✓ |
| 2022-23 | 21.922 / 21.273 | 21.922 / 21.273 | **=** ✓ (control: sigue exacta) |
| **2024-25** | 28.357 / 27.919 | 28.093 / 27.655 | **−264** ✗✗ |
| 2026-27 | 3.153 / 3.050 | 3.125 / 3.027 | **−28** ✗ |

**Total: 779 partidos.** Y **no lo llamé pérdida en ningún momento** ✓: primero dije «puede ser dato recogido después» y **fui a comprobarlo** en vez de concluir ✓✓ — que es exactamente lo que me enseñaron Ceuta (medí mientras importaba ✗) y las 5 zonas del barrido (nombres de equipo ✗).

**CONFIRMADO en la segunda temporada probada** ✓✓ (2024-25, la del hueco de −264): **190 importados, 3 fallidos**, y **el canónico sigue clavado en 28.093** ✗ → **no converge, luego no era dato viejo: es el guardián de la fuente** ✓✓. La misma causa, dos temporadas, y el hueco proporcional a los grupos detenidos (**5 grupos ↔ −405** en 2020-21; **3 ↔ −264** en 2024-25) ✓.

**Y está localizado en UNA competición** ✓✓: los 3 grupos detenidos de 2024-25 son **«Primera - Salamanca»** (`21734954`, `11379820`, `11379871`) y los de 2020-21 también eran **Salamanca** (`35292` «Salamanca - 1», `33979`/`33981`, `34377`, `35294` «Salamanca - 3») ✓. **No es un problema repartido por CyL: es la provincial de Salamanca** ✗, así que Claude puede mirar ahí y no en 200 grupos ✓.

**La prueba quedó parada a propósito** ✓ (job `pwsh-8439`, ya había respondido) para **ceder el turno de importación al paso 4**, que es lo que añade datos ✓.



## ★★ EL MAPA: qué falta de verdad (canónico vs origen, 11/10 ~23:05)

Sacado de `canonico-por-federacion.mjs` (todas) contra las colas vivas del PC y el listado del servidor ✓. **Esto es el estado del paso 1/3/4 del GOAL, medido, no supuesto** ✓.

| federación | temp. en canónico | origen | qué falta |
|---|---|---|---|
| **melilla** | 5 | 5 ✓ | **0 — HECHA y exacta** ✓✓ |
| **canarias** | 6 | 6 ✓ | **0 — HECHA y exacta** ✓✓ |
| **rioja** | 19 | **19** (cola del PC) ✓ | **0 — HECHA** ✓✓ (el canónico ya tenía 18; sólo faltaba 2025-26) |
| **ceuta** | 10 | 10 ✓ | 0 temporadas; **2017-18 con 36 partidos de menos** ✗ |
| cantabria · asturias · extremadura · murcia · castilla-la-mancha · aragon | **13 cada una** (2026-27 → 2014-15) | por listar (paso 3 en curso) | se ve al acabar el lote |
| **euskadi** | 13 | paso 3 | **✗✗ los resultados están al 35-40 % en TODAS las temporadas** (2025-26: 4.012 partidos / **1.543** resultados; 2015-16: 2.857/**1.005**) → **trae calendario, no actas** |
| **galicia** | 13 | paso 3 | ✗ temporadas viejas casi vacías (2016-17: **221** partidos; 2014-15: **124**) |
| **navarra** | 14 | paso 3 | ✗ temporadas viejas sin resultados (2016-17: 15 partidos; 2015-16: 128 partidos / **1** resultado; 2014-15: 166 / **0**) |
| **baleares** | **3** ✗✗ | cola del PC | **falta la mayor parte** — sólo 2026-27, 2025-26 y 2024-25 |
| **andalucia** | **7** ✗ | **14** (cola del PC) | **faltan 7: 2013-14 → 2019-20** |
| **castilla-leon** | **12** ✗ | **15** (cola del PC) | **faltan 3: 2012-13, 2013-14, 2014-15** |
| **madrid** | **7** ✗ | cola del PC | la más vieja es 2020-21 → **falta todo lo anterior** |
| **cataluna** | **2** ✗✗ | descubre en curso | 2026-27 tiene **86.697 partidos y sólo 469 resultados** → **calendario sin actas**. **Y está confirmado en su propia cola** ✓✓: `_traspaso\cola-cataluna.sqlite` tiene **186.410 partidos y sólo 7.207 con resultado (4 %)** → **el problema son las ACTAS, no el calendario ni el importador** ✓. Es el hueco más caro de los que quedan: hay 179.000 partidos de esqueleto esperando resultados |
| **valencia** | **12** ✗✗ | **664 MB** de cola en el PC | **2024-25: 981 grupos y 0 partidos** ✗✗ y **2020-21: 16 grupos y 0 partidos** ✗✗ → **dos temporadas con el esqueleto y nada dentro** (la cola estuvo parada con `INVALID_PAGE_TOKEN`) |

**Lo que este cuadro cambia** ✓✓: el encargo ya no es «traer federaciones» sino **rellenar huecos concretos y contables** ✓ — 7 temporadas de Andalucía, 3 de CyL, todo lo anterior a 2020-21 de Madrid, lo anterior a 2024-25 de Baleares, el hueco de Cataluña, los dos ceros de Valencia, y **los resultados que faltan en Euskadi, Galicia y Navarra** ✓. Y **`pruebas-sincodigo`** (1 temporada, 2 partidos) es una federación de prueba, no cuenta ✓.

### Paso 4 — lista EXACTA de temporadas que faltan (CORREGIDA 11/10 23:5x — leer esto, no la primera versión)

**La primera versión de esta tabla estaba MAL** ✗✗, y el error es instructivo: la usé con la tabla **`temporadas`** de las colas, que es **el CATÁLOGO (lo que la cola conoce), NO lo que tiene datos** ✗. Lo que manda es **`partidos`** ✓. Medido con `--por-temporada` sobre `descargas-<fed>/recolector-local/cola-v2.sqlite` ✓ (`_traspaso\_diag\cuenta-paquete.mjs <cola> --por-temporada`):

| federación | cola del PC (con DATOS) | canónico | **faltan de verdad** |
|---|---|---|---|
| **andalucia** | **13** (2014-15 → 2026-27) | 7 | **6**: 2014-15, 2015-16, 2016-17, 2017-18, 2018-19, 2019-20 ✓ (2.012–2.420 partidos cada una) |
| **castilla-leon** (`federacion`) | **13** (2013-14 y 2015-16 → 2026-27) | 12 | **1**: **2013-14** ✓ (**4.240 partidos**) |
| **madrid** | **7** (2020-21 → 2026-27) | 7 | **0** ✗ — **su cola tiene exactamente las mismas 7**; lo anterior **no está recogido** |
| **baleares** | **3** (2024-25, 2025-26, 2026-27) | 3 | **0** ✗ — **su cola sólo tiene esas 3**; los otros 10 códigos del catálogo están **vacíos** |
| **cataluna** | 2 | 2 | **0** — el hueco es de **contenido** (4 % de resultados, ver arriba) |
| **valencia** | **10**, y **sin 2024-25 ni 2020-21** ✗ | 12 | **0 importables** ✗ — **las dos temporadas vacías del canónico están vacías TAMBIÉN en el origen** ✓ |

**Lo que esto cambia, y es lo importante del día** ✓✓: **el paso 4 no es «rellenar huecos», son 7 importaciones** ✓ (6 de Andalucía + 2013-14 de CyL). Y **los huecos grandes de Madrid, Baleares y Valencia NO son de importación: son de RECOLECCIÓN** ✗ — **no hay nada que importar porque el origen no lo tiene** ✓. Eso es un cambio de trabajo: **no se arregla con importaciones, se arregla recogiendo** ✓, y por eso va a Claude/David como hallazgo y no como tarea mía de importación ✓.

**Lección, la tercera vez hoy de la misma familia** ✓✓: **medir antes de planificar** — con la tabla del catálogo habría lanzado 15 importaciones inútiles (y me habría creído que «Baleares tiene 10 temporadas pendientes» cuando su cola tiene 3) ✗. Las otras dos: medí el canónico **mientras** importaba Ceuta ✗, y conté **nombres de equipo** como ligas en el barrido ✗.

#### ✓✓ PASO 4 TERMINADO (12/10 13:5x) — 7 importaciones, 3.232 grupos, CERO fallos

**Las dos federaciones que tenían hueco importable quedan completas** ✓✓:

| federación | antes | **ahora** | importado en el paso 4 |
|---|---|---|---|
| **andalucia** | 7 temporadas | **13 de 13** ✓✓ (2014-15 → 2026-27) | 2019-20 (400 grupos) · 2018-19 (552) · 2017-18 (524) · 2016-17 (497) · 2015-16 (501) · 2014-15 (527) — **0 fallidos en las seis** ✓ |
| **castilla-leon** | 12 temporadas | **13** ✓ (+ **2013-14**) | 2013-14 (**231 grupos**, 4.238/4.212 contra 4.240/4.214 de la cola → **a 2**) ✓ |

**7 importaciones · 3.232 grupos · 0 fallidos** ✓✓, y **cada temporada comparada contra su cola** ✓ (exactas o con el goteo de 1-9 partidos ya anotado ✓).

**Y queda terminado porque Madrid, Baleares, Cataluña y Valencia NO tenían nada que importar** ✓ — medido, no supuesto ✓ (sus colas tienen exactamente lo que el canónico, o los huecos están vacíos **también en el origen** ✓).

**Lo que le queda a CyL para estar entera** ✓: **2014-15 y 2012-13**, que son **del servidor** ✓ (paso 3 ✓) — con lo que **en cuanto el servidor vuelva, CyL se cierra** ✓✓ (y es su prioridad máxima ✓).


**★ Andalucía fue la primera en quedar completa** ✓✓ (12/10 13:32, **13 temporadas** listadas por `canonico-por-federacion.mjs` y cada una cuadrando con su cola ✓), y **CyL 2013-14 la siguió** ✓ — las dos en la tabla de arriba ✓.

**Andalucía: cuatro temporadas importadas y verificadas** ✓✓, con **0 fallidos en todas** y **el canónico pegado a su cola** ✓:

```
2019-20  canónico 2012 / 1836   ← cola 2012 / 1836   EXACTO ✓✓
2018-19  canónico 2414 / 2290   ← cola 2420 / 2296   (a 6)
2017-18  canónico 2327 / 2178   ← cola 2328 / 2179   (A UNO)
2016-17  canónico 2298 / 2150   ← cola 2301 / 2153   (a 3)
2015-16  canónico 2304 / 2193   ← cola 2305 / 2193   (A UNO, y los resultados EXACTOS ✓)
```

**Y el residuo queda MEDIDO, no supuesto** ✗✓: **1, 3, 1** partidos en tres temporadas seguidas ✓ — **un goteo constante de 1 a 3 por temporada**, con los resultados casi siempre exactos ✓. Es **la misma familia** que Ceuta (−36), CyL (−779 por grupos detenidos ✗) y Rioja (−64 por identidad ✗), **en pequeño** ✓. **Se anota para Claude y NO se persigue** ✓ (el GOAL: dos fallos iguales se apuntan y se sigue ✓) — pero conviene que lo sepa: **el importador tiene un goteo de 1-3 partidos por temporada que sólo se ve comparando contra la cola** ✓, y **es invisible desde el canónico** ✗.

Van detrás: 2018-19, 2017-18, 2016-17, 2015-16, 2014-15 (Andalucía) y **castilla-leon 2013-14** ✓. Al terminar se comprueba con `canonico-por-federacion.mjs andalucia castilla-leon` ✓ y **Andalucía quedará con sus 13 temporadas** ✓✓.

**Y las cinco que NO están en el canónico (`araba`, `bizkaia`, `gipuzkoa`, `laspalmas`, `tenerife`) quedan fuera del paso 1 con prueba** ✓✓: **no tienen cola ni datos**, sólo `competiciones-por-temporada.json` (el catálogo) ✓ → **no son «federaciones ya recolectadas»**, son T-05 (bizkaia primero) ✓. Comprobado carpeta por carpeta, no supuesto ✓.



### Temporadas ESQUELETO en el canónico (barrido del 12/10 12:40, **2 de las 4 son nuevas** ✓✓)

Barrido **sistemático** de las 20 federaciones del canónico buscando el defecto que encontré a mano en Valencia ✓ (`partidos = 0` con grupos, `partidos < grupos`, o resultados a cero ✓). **Esto es el inventario completo, no una muestra** ✓:

| federación | temporada | qué le pasa | de quién es el arreglo |
|---|---|---|---|
| **valencia** | **2024-25** | **981 grupos y CERO partidos** ✗✗ | **DEL PC** ✗ — `valencia` **NO está en `FACYLF_EXCLUIR`** ✓: lo que falta es que **su recolector vuelva** (parado 24 h ✗, bloqueo 5 ✓). **NO lo arregla el servidor** ✗ |
| **valencia** | **2020-21** | 16 grupos y **CERO partidos** ✗✗ | **DEL PC** ✗ — igual que arriba ✓ |
| **navarra** | **2016-17** | **129 grupos y sólo 15 partidos** ✗ ← **nadie lo había visto** ✓✓ | **paso 3** (servidor) ✗ — `navarra` **sí** está en `FACYLF_EXCLUIR` ✓ |
| **navarra** | **2014-15** | 166 partidos y **CERO resultados** ✗ ← **nadie lo había visto** ✓✓ | **paso 3** (servidor) ✗ |

**Y aquí me equivoqué y lo dejo escrito** ✗✓: en la primera versión de esta tabla puse las cuatro como «paso 3 (servidor)» ✗ y **era falso para las dos de Valencia** ✗ — lo comprobé contra `FACYLF_EXCLUIR` y **Valencia es del PC** ✓. **Dos esqueletos se arreglan recogiendo en el PC** ✗ y **dos trayendo del servidor** ✓: **la misma avería con dos arreglos opuestos, y mirar sólo el canónico no los distingue** ✓✓ — hay que mirar **de quién es cada federación** ✓.

**Lo que sí queda probado del método** ✓: mirar el canónico **buscando ceros y proporciones imposibles** encuentra esqueletos que ninguna verificación de «temporada presente» habría visto ✗ — las cuatro **están** en el canónico, con sus grupos, y **están vacías por dentro** ✓✓.



### Temporadas FLACAS (barrido del 12/10 13:1x): 16 halladas, y **sólo 13 son problema** ✓✗

Comparando **cada federación consigo misma** (temporadas por debajo del 25 % de su propia mediana, saltando la 2026-27 que está en curso ✓). Salen 16 — y **tres NO son defectos**, que es lo que hace falta distinguir antes de tocar nada ✗:

**NO son defecto, verificado** ✓:
- **canarias 2021-22** (72 partidos, 22 %): **exacta contra su paquete** ✓✓ — esa temporada **fue así** (1 grupo, 30 jornadas ✓). Ya lo decía ESTADO: *«no hay una forma "normal" de federación»* ✓.
- **madrid 2020-21** (251, 3 %): **la cola del PC tiene exactamente 251** ✓ → **el origen también** ✓. No es importación ✗.
- **castilla-leon 2020-21** (2.278, 11 %): **causa ya conocida** ✓ — los **5 grupos detenidos** de la provincial de Salamanca ✗.

**SÍ son hueco de recolección del histórico** ✗ — y **todas son de federaciones DEL SERVIDOR** ✓✓, o sea que apuntan al mismo sitio:

| federación | temporadas flacas |
|---|---|
| **castilla-la-mancha** | **2014-15, 2015-16, 2016-17 y 2017-18** ✗ (388–552 partidos, con mediana 2.939) |
| **navarra** | **2014-15, 2015-16, 2016-17 y 2017-18** ✗ (15–304 partidos, con mediana 2.295) |
| **galicia** | **casi todo su histórico viejo** ✗ (124–545 partidos: 2014-15, 2015-16, 2016-17, 2017-18, 2019-20, 2020-21, 2021-22, 2022-23) |
| asturias | 2014-15 (740) ✗ |
| cantabria | 2014-15 (477) ✗ |
| murcia | 2015-16 (241) y 2016-17 (501) ✗ |

**Lo que esto dice del encargo** ✓✓: **el histórico está a medias en las federaciones del servidor**, y **no es un problema del canónico del PC ni de la importación** ✗ — **es que en el servidor ese histórico está recogido a medias** ✓. Es **material del paso 3** ✓ (traer lo que haya) **y, sobre todo, de que el servidor siga recogiendo** ✗. Y **refuerza lo de siempre: sin servidor, esto no avanza** ✓.



## ★ MÉTODO DE VERIFICACIÓN BUENO: **canónico == paquete de origen** (11/10 noche)

**El umbral del 95 % NO mide la importación: mide la fuente** ✓✓, y confundirlos lleva a dos errores opuestos: dar por buena una importación que perdió datos (Ceuta ✗) y dar por mala una que copió todo (Canarias ✗).

**El criterio bueno, y es exacto**: por cada temporada, comparar los recuentos del **paquete de origen** (`_traspaso\<fed>-<temporada>.sqlite`, que es la evidencia de ingesta ✓) con los del canónico. **Iguales ⇒ el traspaso no perdió nada** ✓✓. Distintos ⇒ **hay pérdida, y se cuantifica al partido** ✓.

- Contador de sólo lectura (mío, no toca nada del producto): `node _traspaso\_diag\cuenta-paquete.mjs <paquete.sqlite>` → «TOTAL N partidos · M con resultado»; con un grupo detrás, cuenta ese grupo.
- Y `node scripts\claude\canonico-por-federacion.mjs <fed>` da el otro lado.
- **Resultado de aplicarlo a las cuatro primeras** ✓: **melilla 5/5 exactas** ✓✓, **canarias 6/6 exactas** ✓✓, **ceuta 8/10 exactas y 2 con pérdida** ✗✗, **rioja 2025-26 exacta** ✓.
- **Consecuencia práctica para el GOAL**: el `<95 %` de una temporada cerrada **no significa que falte importar**: puede significar que **falta recoger** ✓ (Canarias 2025-26: el canónico es idéntico al origen y le falta un tercio de los resultados → **se arregla recogiendo, no importando** ✓). Y al revés: **una temporada al 99 % puede haber perdido 74 partidos** ✓ (Ceuta 2017-18).

## ✗ HALLAZGOS PARA CLAUDE (11/10 noche) — no tocados por mí, son suyos

1. **El importador pierde partidos y dice «0 fallidos»** ✗✗ — **Ceuta 2017-18: 2.080 en el origen → 2.006 en el canónico (−74 partidos, −45 con resultado)** y **Ceuta 2018-19: 3.044 → 3.017 (−27)** ✓. Los **grupos** coinciden exactos (39 y 69) ✓, así que no es un grupo que no entró: **son partidos de dentro de grupos que sí entraron** ✗. **Un descarte en silencio no se distingue de un partido que no existe** ✓✓, y por eso **no lo habíamos visto en 1.641 grupos** ✓.
2. **Falso positivo de la validación por lotes de temporada** ✗ — `La validación del lote 75466 ha fallado: partidos 18≠36, partidos con resultado 18≠36, actas analizadas 9≠36, participaciones 318≠1270, eventos 241≠940, técnicos 61≠179, árbitros designados 18≠36` (Canarias 2026-27) ✓. **Pero los datos quedan BIEN**: el paquete y el canónico dan **174 partidos y 125 con resultado** exactos ✓✓, y **el grupo afectado tiene 2 partidos en el origen**, no 36 ✓. Es decir: **la temporada entera se declara fallida DESPUÉS de escribir bien** ✗, mientras **el mismo grupo importado solo dice «cuadran»** ✓. **Es la quinta vez que aparece la misma forma** ✓ (API que ignora `temporadaId` · `informe:buscar` que ignora su argumento · «atascada» por «ahogada» · el registro de fallos que guarda el sobre · y ahora un contador esperado que no sale del origen) — **y es la peor de las cinco, porque este sí hace concluir**: costó una reimportación de temporada y **taparía una pérdida real** ✓.
3. **El registro de fallos ya está arreglado y PROBADO** ✓✓ (11/10 23:1x): el envoltorio escribe **un motivo real por grupo** y la ruta de su salida entera ✓. Comprobado en vivo con Rioja 2026-27: `pruebas\reconstruccion\importacion-fallos-rioja-2026-27.json` trae `"motivo": "constraint \"team_entry_referencia_contextual_uq\""` y `"salida": "...salidas\importacion-rioja-2026-27-21959333.txt"` ✓✓. **Pero sólo si se llama al envoltorio** ✓: por `pnpm importar` directo no se guarda nada (`pruebas\reconstruccion\importacion-fallos-canarias-2026-27.json` sigue con el `NativeCommandError` viejo ✓).
4. **`team_entry` — dos equipos del mismo grupo colapsan en la misma identidad** ✗✗ (Rioja 2026-27, grupos **21959333** «Grupo 5» y **21959335** «Grupo Único»; 36 importados, **2 fallidos**). **Causa completa capturada** ✓✓:
   ```
   ✗ upsert en core.team_entry (team_season_id, phase_group_id):
     duplicate key value violates unique constraint "team_entry_referencia_contextual_uq"
   ```
   Es decir: **la clave del upsert y la clave única no son la misma** ✓ — se hace upsert por `(team_season_id, phase_group_id)` pero la unicidad real es por **referencia contextual**, así que **dos equipos distintos del mismo grupo que resuelven a la misma referencia chocan** ✗. **Es de identidad, no de ritmo ni de esquema**: los dos `team_entry` están bien y el que falla es el «reconocerlos como distintos» ✓. **Y ya está medido el coste** ✓✓: la temporada 2026-27 de Rioja queda en **368 partidos** cuando su paquete trae **432** → **−64 partidos por esos 2 grupos** ✗. (Las otras dos temporadas de Rioja comprobadas quedan **exactas**: 2025-26 6.866/6.045 ✓ y 2024-25 7.415/6.574 ✓✓.)

**Y Canarias enseña algo que hacía falta saber antes de Galicia y Andalucía** ✓✓: **6 temporadas con 12, 11, 9, 8, 7 y 1 grupo cada una** — la 2021-22 entera son **1 grupo y 30 jornadas** ✓. Es decir: **el importador trata igual una temporada de 203 grupos que una de 1** ✓, y **con códigos de tres eras distintas** (`959`, `978`, `903611896` ✓). **No hay una forma «normal» de federación** ✓.

**1.641 grupos importados en las cuatro primeras federaciones, con un solo fallo — y ese fallo resultó no serlo** ✓✓ (melilla 888 · ceuta 560 · rioja 146 · canarias 47 ✓). Melilla es la mejor
prueba posible del importador por ser pequeña y tener **todos** los formatos (ligas, copas, sala, playa,
femenino, benjamines, liga escolar, descensos, play-offs de 5º a 12º ✓) — y abarca **dos eras de numeración**
(códigos de 3 dígitos como `310`/`382` junto a los de 8 como `21944612` ✓), tratadas igual ✓.

## HECHO en esta tanda (11/10, 19:00–21:15)

| paso | resultado |
|---|---|
| **Paso 1 · desplegar en el servidor** | **HECHO** ✓ — 4 huellas OK, suelo 2010-11, monitor, 15 contenedores recreados |
| **Paso 1a/1b/1c** | **HECHO** ✓ — el mínimo llega a los procesos del PC (Andalucía 4→13 temporadas ✓) y el tercer suelo desplegado |
| **Multideporte con cerrojo** | **HECHO y verificado** ✓✓ — reiniciado, **18 de 20 adaptadores con `arrancar.pid`** ✓ |
| **T-02 · verificación** | **HECHA** ✓ — temporada en curso primero (`−1.419.218.800` ✓), históricas llenándose (54/56/64/55 grupos ✓), monitor ✓, Cataluña a **1800 s** ✓, ritmo **4.600–7.200** ✓ |
| **T-03 · reabrir cancelados por red** | **HECHA** ✓✓ — **36 en el servidor + 34 en Madrid = 70** ✓, contadores a 0 ✓, **sin parar ningún recolector** (el script admite «entre tandas» con WAL ✓) |
| **T-04 · rioja 2025-26** | **HECHA** ✓✓ — traída (61,5 MB) e importada: **146/146, 0 fallos** ✓. **Idempotencia DEMOSTRADA** ✓✓: reimportada entera, **vuelve a dar 146/146 con 0 fallos y código 0** ✓ — si hiciera `INSERT` a secas habría reventado con **146 errores de clave duplicada** ✗; que no haya ni uno prueba que **usa `upsert` y no duplica** ✓. **Se puede relanzar sin miedo** ✓ |
| **T-04 · melilla** | **HECHA, 5 de 5** ✓✓ — **888 grupos importados, 0 fallos**, las cinco temporadas con código 0 ✓ (143 + 183 + 203 + 226 + 133 ✓). Abarca **todos los formatos** (ligas, copas, sala, playa, femenino, benjamines, liga escolar, descensos, play-offs del 5º al 12º ✓) y **dos eras de numeración** (códigos de 3 dígitos como `310`/`382` junto a los de 8 como `21944612` ✓), tratadas igual ✓. **Es la mejor prueba del importador** ✓ |
| **T-12 · zona 1** | **empezada** ✓ — 16 consultas, **planteamiento corregido** (ver bloqueo 3) |

## T-08 · RITMO DEL PC — diagnóstico con causa (12/10 14:0x) ✗✓

Aprovechando que **el paso 4 había terminado** (o sea el PC **en reposo** ✓, sin mis importaciones compitiendo ✗ — que es lo que **contaminaba mi medida anterior** ✗✓), medí el ritmo de las 5 federaciones del PC **y**, como pide T-08, **el trabajo vencido de cada una** ✓ (`--ritmo 60` y `--trabajos` sobre su cola ✓). **El criterio de T-08 tiene dos mitades y hacen falta las dos** ✓✓ — sólo con el ritmo se concluye mal ✗:

| federación | ritmo/h | **vencidos AHORA** | worker vivo | navegador | veredicto |
|---|---|---|---|---|---|
| andalucia | 293 ✓ | 425 | ✓ | ✓ | **bien** ✓ |
| federacion (CyL) | 343 ✓ | 405 | ✓ | ✓ | **bien** ✓ |
| **cataluna** | **356** ✓ | **0** ✓✓ | **✓** (`recolector-cataluna-datos.mjs --max 400` ✓) | no hace falta: va contra **API** ✓ | **bien** ✓✓ |
| **madrid** | **5** ✗✗ | **647** ✗ | **NO** ✗ | no ✗ | **SALTA el criterio** ✗✗ |
| **valencia** | **0** ✗✗ | **5.042** ✗✗ | **NO** ✗ | no ✗ | **el peor** ✗✗ |

**★ Y la causa está en el registro del supervisor** ✓✓ (`registros\supervisor-flota.log`):

```
2026-10-11 10:59:42  No se pudo leer la lista de procesos
   (Command failed: powershell.exe ... Get-CimInstance Win32_Process ... ConvertTo-Json);
   se espera en vez de arriesgar un duplicado.
2026-10-11 17:28:58  Supervisor unico de la flota: 5 federaciones, 4.5 GB declarados, reserva 1 GB ...
```

**Es un fallo que el propio código ya documenta** ✗✓ (el comentario de `supervisor-flota.mjs` lo dice: *«Medido en este PC: el supervisor dejó de poder leer la lista de procesos y…»* ✓): **cuando el supervisor no puede leer la lista de procesos de Windows, ESPERA en vez de arrancar** ✓ — **a propósito**, para no duplicar trabajadores ✓. **Consecuencia**: **Madrid y Valencia se quedaron sin worker** ✗✗ y **nadie los levanta** ✓ — **el supervisor está vivo** (PID 22360 ✓) **y no puede** ✗.

**★ Y me corrijo otra vez, ya van tres hoy** ✗✓: por la mañana apunté **Cataluña** como «parada 16 h» ✗. **Cataluña no está parada**: hace **356 peticiones/hora** ✓✓, **la que más**, y **no tiene nada vencido** ✓✓ — su recolector **va contra una API** (`fcf.cat` ✓), así que **no necesita navegador** ✓ y su ritmo no se parece al de las demás ✓. **Las dos que fallan son Madrid y Valencia** ✓. **Tres veces hoy he concluido de más** ✗ (baleares excluida a propósito ✓, valencia es del PC y no del servidor ✓, y cataluña no está parada ✓) — **siempre por generalizar desde parecidos en vez de mirar el dato propio de cada caso** ✓✓.

**Y lo que NO hago** ✗: **no arranco Madrid ni Valencia a mano**. El GOAL prohíbe cambiar el ritmo de los recolectores ✗ y el manual avisa de que **arrancar un worker que el supervisor cree vivo duplica trabajadores** ✗ (por eso existe el cerrojo ✓). **Es de Claude** ✓ — y ahora tiene la causa exacta, no un síntoma ✓: **el supervisor no puede leer `Win32_Process` y se queda esperando** ✗.

### ✓✓✓ Y LA CAUSA FINAL DE MADRID, entera y en una línea (12/10 14:0x)

Su propio registro lo dice ✓ (`descargas-madrid\recolector-local\worker-programado.log` ✓):

```
14:03:30  [supervisor] pid 28528: scripts/recolector-madrid.mjs arrancar
          Recolección en pausa hasta 2026-10-12T12:44:29Z:
            clasificacion|22|26737701|26737704||: 5 fallos seguidos:
            api/standings?idGroup=26737704&round=34 no devolvió JSON utilizable (4 B)
14:05:07  El worker termino; siguiente intento en 300 s (planificador: 2362 s)
```

**★ Madrid tiene worker y funciona** ✓✓ — **arranca, hace su pasada y termina cada ~5 minutos, POR DISEÑO** ✓ (`siguiente intento en 300 s` ✓). Lo que pasa es que **se pone en pausa él mismo** ✗ tras **5 fallos seguidos** de un endpoint que **devuelve 4 bytes** ✓✗.

**Así que las dos correcciones anteriores sobre Madrid eran incompletas, y ahora la causa es UNA** ✓✓: **`api/standings?idGroup=…&round=… » (4 B)`** ✓. Esa respuesta vacía **cuenta como fallo** ✗, a los 5 seguidos **el recolector se pausa** ✗, y de ahí sale todo lo demás: **10 peticiones/hora** ✓, **647 trabajos vencidos** ✗, y que al mirar los procesos **unas veces haya worker y otras no** ✓ (está en el hueco de 300 s ✓✓).

**El arreglo, para Claude, es pequeño y de una sola cosa** ✓✓: **tratar esa respuesta vacía como «esta jornada no tiene clasificación»** ✓ (o dejar de pedir las jornadas que no existen ✓) **en vez de como un fallo** ✗. Con eso **Madrid sale de la pausa solo** ✓ y sus 647 vencidos empiezan a correr ✓. **No es el supervisor** ✗ (mi primera hipótesis ✗), **no es falta de worker** ✗ (la segunda ✗): **es un contador de fallos que se dispara con una respuesta legítimamente vacía** ✓✓.

**Y lo mismo vale para las 7 cancelaciones de `standings` de Madrid** ✓ — el mismo endpoint ✓.



### ★ CORRECCIÓN (12/10 14:2x): **son DOS averías distintas**, no una ✗✓

Miré los procesos y **el registro de cancelaciones** (`--cancelados`), y **me vuelvo a corregir** ✗ (cuarta vez hoy ✓):

| federación | worker | **causa REAL** |
|---|---|---|
| **madrid** | **SÍ lo tiene** ✓ (`recolector-madrid.mjs arrancar`, PID 4476 ✓) | **su API falla** ✗✗: `api/standings?idGroup=…&round=… **no devolvió JSON utilizable (4 B)**` ✓ — **y con sellos de las 11:42–11:44 de hoy** ✓, o sea **está fallando ahora mismo** ✓. **No es el supervisor** ✗ |
| **valencia** | **NO** ✗✗ | **el supervisor no la lanza** ✓ (el modo «no puedo leer la lista de procesos → espero» ✓) |

**Así que «Madrid sin worker» era falso** ✗ — Madrid **trabaja, y su trabajo falla** ✓✗. Las dos necesitan a Claude, **por motivos distintos** ✓✓: una **petición que el servidor de Madrid rechaza** ✗ y un **supervisor que se queda esperando** ✗. **Confundirlas habría mandado a Claude al sitio equivocado** ✓✓.

### ★★ Y el hallazgo grande: **1.062 actas de Madrid que se descargan y NO traen datos** ✗✗

Al agrupar los cancelados de Madrid **normalizando los números** ✓ (que es lo que colapsa `idGroup=27596334&round=11` en un solo grupo ✓) salió la verdad, y **me obligó a corregirme una quinta vez** ✗✓: había dicho que casi todos eran `standings` ✗ y **son 7** ✓. El dominante es otro, y es **mucho más serio**:

```
  1062  La ficha de acta <id> no trae datos de partido (253935 B)
     7  api/standings?idGroup=… no devolvió JSON utilizable (4 B)
     6  api/results?idGroup=…
     1  la fuente no publica ninguna jornada para este grupo
```

**Mil sesenta y dos fichas de acta que se descargan —¡254 KB!— y no traen datos de partido** ✗✗. **Y el detalle que lo delata** ✓✓: los tamaños vienen **casi idénticos** (**253.935 B** y **253.552 B**, repetidos ✓) → **eso no es un acta: es una página plantilla** ✓ (una cáscara de JavaScript, o una página de error/consentimiento ✓).

**Por qué importa más que las otras dos averías** ✗✗: los tres motivos de Madrid (actas sin datos ✓, `standings` 4 B ✓, `results` ✓) **están todos en estado `cancelado`** ✓ — que es **terminal**: **no se reintentan** ✗. Es decir: **esas 1.062 actas no se van a volver a pedir solas** ✗✗, y **son datos que existen en la fuente y no tenemos** ✓.

**Y encaja con el canónico, sin contradicción** ✓: el canónico de Madrid **coincide con su cola** en resultados (2022-23: 8.711 los dos ✓) → **el canónico es fiel a la cola** ✓; **lo que falta está más atrás**, en que la cola **no pudo leer** esas actas ✓✓. O sea: **no es un problema de importación, es de lectura** ✓.

**Y es EXCLUSIVO de Madrid** ✓✓ (comprobado en las cinco colas del PC con `--agrupa '(no trae datos de partido)'` ✓): madrid **1.062**, y **andalucía, cataluña, valencia y federación: cero** ✓. Eso **estrecha el parte**: no es un problema de la plataforma ni del motor, **es de la lectura de las actas de Madrid** ✓✓ — y por eso **no lo arreglo yo** ✗.

**Lo que propongo, y por qué no lo hago yo** ✗: son **candidatas a reabrir**, con el mismo remedio que T-03 ✓✓ (`reabre-cancelados-por-red.mjs` ✓ — que ya reabrió 70 por red ✓). **Pero el código es de Claude** ✗ y hay que decidir **por qué** la página vuelve vacía antes de reabrir 1.062 a ciegas ✗✗ — si es que la web cambió, reabrir sólo las volvería a cancelar ✓. **Queda en el parte, con el tamaño exacto de la página** ✓ (que es la pista que identifica la plantilla ✓).

### ✓✓✓ RESUELTO, y el final NO es el que yo había cantado: **no hay dato perdido** (12/10 14:2x)

**Primero la corrección, porque llegué a escribir «los datos SÍ están» y era prematuro** ✗✗. La cadena de lo que pasó, que vale más que el resultado:

1. Vi que la **página** `rffm.es/acta-partido/5469201` devuelve **256 KB con CERO texto visible** ✓ y que el partido está en **`__NEXT_DATA__.props.pageProps.game`** ✓ → **concluí que los datos estaban y que al lector le faltaba leerlos** ✗.
2. Fui a buscar la evidencia en disco ✓ y encontré `acta-5469201.json` ✓ — **de 1,4 KB**, cuando las que funcionan pesan **9-11 KB** ✓ → ya no cuadraba ✗.
3. **Lo abrí, y ahí estaba la respuesta** ✓✓:

```json
"codacta": "5469201",
"nombre_competicion": "PREFERENTE BENJAMÍN F-7",
"jornada": "6",   "fecha": "22-11-2025",
"acta_cerrada": "0",               ← ★ EL ACTA NO ESTÁ CERRADA
"equipo_local": " ",  "goles_local": "",     ← sin equipos y sin marcador
"jugadores_equipo_local": [],      ← sin jugadores
"host": "https://appweb.rffm.es/"  ← ★ el lector usa LA API, no la página
```

**Son actas de «PREFERENTE BENJAMÍN F-7» que la Federación de Madrid NO ha cerrado** ✓✓ — **no es que no sepamos leerlas: es que no hay nada que leer** ✓. El lector hizo **lo correcto** al cancelarlas ✓✓, y su mensaje («no trae datos de partido») **es exacto** ✓.

**Y mi error tiene nombre** ✗✓: **miraba la página web mientras el lector usa la API** ✓ (`appweb.rffm.es` ✓, que el propio JSON declara ✓). La página es una app Next.js que sí lleva el partido en `__NEXT_DATA__` ✓, **pero el lector nunca pasa por ahí** ✓ — así que mi «está en `props.pageProps.game`» describía **otro camino, no el que falla** ✓✓. **Sexta corrección del día, y la más instructiva**: *comprobar en qué camino ocurre el fallo antes de buscar la causa en otro* ✓✓.

**Consecuencia, y es buena** ✓✓: **no hay 1.062 actas perdidas** ✗ — hay **1.062 partidos de benjamín cuya acta la federación no cierra** ✓. **No hay nada que reabrir** ✓✓ (y por eso **hice bien en no reabrirlas** ✓: se habrían vuelto a cancelar, exactamente el riesgo que anoté ✓). **Nada para Claude aquí** ✓ — y **queda como límite de la fuente**, en la misma familia que las 1.799 de CyL («la fuente ya no la publica» ✓).

**Lo único que sigue sin explicación del registro de cancelados** ✗: las **61 de Andalucía con «(sin motivo guardado)»** ✓ — ésas sí son un hueco en la información, no en los datos ✓.





### Y el registro de cancelaciones, que nadie había mirado ✓

Cancelar es un estado **terminal** ✓, así que un «cancelado» puede ser una jornada **que no se recogió nunca** ✗. Agrupé los 135.000 cancelados de las 5 colas **por motivo** ✓:

| federación | cancelados | **el motivo, y si es legítimo** |
|---|---|---|
| **cataluna** | **125.357** | **125.244 son DEDUPLICACIÓN** ✓ («el código de acta ya está en la cola en su jornada: esta fila la copió el defecto de la jornada» ✓, último 25/09 ✓) + 106 «obsoleto» ✓ + **1 solo timeout** ✗ → **NO es pérdida** ✓✓ |
| valencia | 7.275 | **3.709 + 3.538 legítimos** ✓ («la fuente no publica partidos» / «el grupo no publica ninguna jornada») + **15 `fetch failed`** ✗ |
| **madrid** | 1.076 | **1.062 son «la ficha de acta no trae datos de partido (253.935 B)»** ✗✗ — **el hallazgo grande** ✓ (ver abajo ★★) + **7 `standings … 4 B`** ✗ + 6 `results` ✗ |
| andalucia | 74 | **61 «(sin motivo guardado)»** ✗ ← **el patrón del ruido, otra vez**: una cancelación **sin motivo no se puede juzgar** ✓, y son de **hoy** (11:42 ✓) |
| federacion (CyL) | 1.941 | **1.799 «la página del acta viene vacía y el partido es de hace más de dos meses: la fuente ya no la publica»** ✓ → **límite de la FUENTE**, no nuestro ✓, y **queda anotado para que nadie las busque** ✓ |

**Lo que esto cierra** ✓✓: **no hay pérdida masiva escondida en los cancelados** ✓ — lo que parecía enorme (125.000) es **deduplicación** ✓ (el adaptador de Cataluña copió cada fila en su jornada y luego la limpió ✓). **Y quedan dos cosas pequeñas y reales** ✗: **61 cancelaciones sin motivo en Andalucía** y **los `standings` de Madrid** ✓.



**De paso, el aviso de memoria del PC** ⚠: **2,4 GB libres de 31,9 (92 % en uso)** ✗, y quien la llena **no es la flota** ✓: `vmmemWSL` 2,8 GB · WSL 870 MB · **python 853 MB** · Docker 800 MB · ChatGPT 728 MB ✓ — **exactamente lo que dice `entorno-flota.ps1`: hay que mirar lo que llena la memoria, no los números de la flota** ✓. Con 2,4 GB libres **la reserva de 1 GB no bloquea** ✓ (los navegadores pueden abrirse ✓), así que **la falta de workers no es por memoria** ✓.



## T-11 · MENORES Y ACTAS — **YA ESTABA APLICADO** ✓✓ (12/10 14:1x) — y por eso **no hubo que reiniciar nada**

T-11 pedía *«comprobar si `scripts\multideporte\aplica-menores-y-actas.ps1` se aplicó (05/10); **si no, aplicarlo**»* ✓. **Lo comprobé primero, que es lo que evita el riesgo** ✓✓ — porque **aplicarlo mata y relanza los 18 workers de multideporte** ✗ (`Stop-Process` por PID + `Start-ScheduledTask` ✓), y **no era el momento**: el PC está al **92 % de memoria** ⚠ y **Madrid y Valencia ya están sin worker** ✗ (T-08 ✓).

**La medida, con `calidad.mjs` (sólo lectura ✓) y contando en la cola:**

| qué pide el criterio | medido |
|---|---|
| «`calidad.mjs` muestra jugadores en `serversports`» ✓ | **37.879 fichas con `dorsal`** ✓✓ y **38.951 con `jugadores`** ✓✓ (de 38.948 fichas ✓) |
| menores recogidos y marcados, sin nombres publicables ✓ | **38.957** con la marca `menores` ✓✓ |
| «actas de balonmano leídas» ✓ | **3.062 registros `acta`** en `isquad-balonmano` ✓✓ |

**Conclusión: T-11 HECHA y no había nada que hacer** ✓✓ — **la relectura del 05/10 sí se aplicó** ✓. Y la lección operativa, que vale para las tres tareas del paso 7: **comprobar antes de aplicar** ✓✓ — la mitad de las veces ya está hecho, y la otra mitad el «arreglo» mueve la flota ✗.



## INFORME del GOAL: tabla por federación (12/10 14:0x) — con su criterio aplicado a las 20

**El formato es el que pide el GOAL** ✓ (*«tabla por federación (temporadas en canónico / faltantes / HECHA sí-no)»* ✓). **Pero hay que leerla con una advertencia, o engaña** ✗✓: **la columna `<95 %` mide la FUENTE, no nuestro trabajo** ✓✓ — lo demostré con Canarias (**idéntico al origen** ✓) y con Ceuta ✓. Las columnas que dicen algo de **nosotros** son **`temp`** (temporadas presentes ✓) y **`vac`** (temporadas **vacías** ✗).

| federación | temp. | vacías | cerradas <95 % | lectura |
|---|---|---|---|---|
| **andalucia** | **13** ✓ | 0 ✓ | 5 | **HECHA en temporadas** ✓✓ (13 de 13 verificadas contra su cola ✓) |
| **castilla-leon** | **13** ✓ | 0 ✓ | 0 | **HECHA en temporadas** ✓✓ — y **la más limpia** ✓ (le faltan del servidor 2014-15 y 2012-13 ✓) |
| **rioja** | **19** ✓ | 0 ✓ | 9 | **HECHA en temporadas** ✓✓ (las 19 que tiene su cola ✓); 9 temporadas con actas al ~88 % ✗ (**fuente** ✓) |
| **melilla** | **5** ✓ | 0 ✓ | 0 | **HECHA y VERIFICADA AL EXACTO** ✓✓ |
| **canarias** | **6** ✓ | 0 ✓ | 1 | **HECHA y VERIFICADA AL EXACTO** ✓✓ (el <95 % de 2025-26 **es del origen** ✓) |
| **ceuta** | **10** ✓ | 0 ✓ | 3 | **HECHA en temporadas** ✓; **2017-18 perdió 36 partidos** ✗ (lo único real ✓) |
| aragon · asturias · cantabria · castilla-la-mancha · extremadura · galicia · murcia · navarra | 12–14 ✓ | **0** ✓ | 0–5 | **HECHA en temporadas** ✓ (pendiente el paso 3 para traer del servidor ✓) |
| **euskadi** | 13 ✓ | 0 ✓ | **12** ✗✗ | **el peor**: resultados al 35-40 % **en casi todas** ✗ → **hueco de RECOLECCIÓN** ✓, no de importación ✗ |
| **madrid** | 7 ✓ | 0 ✓ | 0 | **HECHA en temporadas** ✓ (7 = las de su cola ✓); **1.062 actas de benjamín que la fuente no cierra** ✗ (límite de la fuente ✓) |
| **cataluna** | **2** ✗ | 0 ✓ | 1 | **falta contenido**: su cola tiene **4 % de resultados** ✗ (el descubridor sigue ✓) |
| **valencia** | 12 ✓ | **2** ✗✗ | 0 | **las 2 vacías son suyas y del PC** ✗: 2024-25 y 2020-21, **vacías también en el origen** ✓ |
| baleares | 3 ✓ | 0 ✓ | 0 | **HECHA en temporadas** ✓ (3 = las de su cola ✓; el resto lo tiene el servidor ✓) |
| pruebas-sincodigo | 1 | 0 | 0 | federación de **prueba** ✓, no cuenta ✓ |

**Lo que dice esta tabla, en una línea** ✓✓: **ninguna federación pierde temporadas salvo Valencia, que tiene dos vacías** ✗ — y **la mitad «todas las temporadas están» del criterio se cumple en 19 de 20** ✓✓. **Lo que queda son tres cosas distintas y ninguna es de importación** ✓: **Euskadi** (recolección al 35-40 % ✗), **Cataluña** (4 % de resultados ✗) y **las dos vacías de Valencia** (que están vacías **también en el origen** ✓).



## BLOQUEADA · T-06 · Valencia (`INVALID_PAGE_TOKEN`) · 12/10 14:0x ✗

**Hecha la prueba que pide T-06** ✓ (*«una sola petición de prueba con `Referer`, cookie y token de la página»* ✓) con `scripts\prueba-referer-valencia.mjs` ✓ — **3 peticiones separadas 10 s** ✓ y respetando **la condición que el propio script pone**: *«sólo cuando el recolector haya salido de su pausa… hacerle peticiones mientras está pausado es insistirle a una web que ya ha dicho que no»* ✓. **Se cumplía** ✓: la pausa era hasta el **09/10 08:14** ✓ y Valencia **pidió con normalidad después** (hasta el **11/10 10:31** ✓) → **su turno había llegado** ✓.

**Resultado, y cierra la hipótesis que traía el script** ✗✓:

```
[403] COMO LO HACE EL RECOLECTOR   {"reason":"Token de página inválido o ausente","reason_code":"INVALID_PAGE_TOKEN"}
[403] CON Referer                  ← igual
[403] COMO UN NAVEGADOR            ← igual (Accept-Language + Origin)
```

**★ Las tres dan 403** ✓✓ → **la causa NO es la forma de la petición** ✗. El script lo dice él mismo: *«si las tres dan 403, la causa es otra (sesión o bloqueo por IP) y hay que capturar la red de un navegador navegando de verdad»* ✓. **Y el motivo está en la respuesta** ✓: **`Token de página inválido o ausente`** ✓✓ — **la API exige el token que la propia página genera** ✓.

**Qué significa para el arreglo** ✗: **no son dos líneas** ✓ — el recolector tendría que **cargar primero la página del grupo y quedarse con su token**, y usarlo en las llamadas siguientes ✓. **Es de Claude** ✗ (código del recolector ✓), y **ahora sabe que el arreglo no es de cabeceras** ✓✓ — que es exactamente lo que la prueba venía a averiguar ✓.

**Criterio de T-06, NO cumplido** ✗: *«Valencia pide sin `bloqueo` 24 h · su 2024-25 deja de tener 0 partidos»* ✓ — lleva **0 peticiones y 5.042 trabajos vencidos** ✗✗, y **sus dos temporadas vacías siguen a cero** ✗. **Y encaja con el canónico**: sus 2 temporadas vacías están vacías **también en el origen** ✓ (medido ✓), así que **importar no las arregla**: hay que recoger ✓.

**Mientras tanto sigo con**: el paso 3 y las tareas del servidor, en cuanto David lo encienda ✓ (T-05, T-07, T-09 y T-10 ✓).

## Bloqueos (apuntados, no perseguidos)

1. **baleares — RESUELTA SOLA** ✓✓ (11/10 21:40). Estuvo atascada **sin plaza de Chrome** (`5 plazas ocupadas de 5`), y **a los 15 min fallaba con código 1** en vez de seguir esperando ✓. **No estaba rota: no cabía** ✓. Ahora hace **219 peticiones/hora** ✓✓ con respuesta media de 3,8 s ✓ — **consiguió su plaza y arrancó** ✓. **La lección, que vale más que el caso**: el monitor la llamaba «atascada» ✗ y **reiniciarla habría vuelto a meterla en el mismo bucle** ✗ — **«atascada» y «ahogada» se ven igual y se arreglan al revés** ✓✓. **Pendiente de Claude** ✗ (no urgente): que **espere en vez de fallar a los 15 min**, para que ninguna otra entre en ese bucle ✓.
2. **`informe:buscar` ignora su argumento** ✗✗ — **código de Claude**. `rioja`, `ARRUBAL` y `CALZADA` devuelven **listas idénticas** ✓ → el término no se usa. **Es la misma trampa que el `temporadaId` de la FCF**: dos ejecuciones que devuelven lo mismo no son una confirmación, son una sospecha. **Afecta a la verificación de T-04** (hay que hacerla por códigos de grupo ✓, no por texto ✓).
3. **T-12 zona 1: la vía municipal no da ligas añadibles** ✗ — las competiciones municipales y de veteranos **existen** ✓ pero están **en PDF, en webs de ayuntamientos** ✓ (cientos, uno por pueblo ✗). **No se pueden añadir a un lector**: hace falta uno por pueblo ✗✗. **El barrido debe insistir en PORTALES** ✓ (`serversports`, `mygol`, `playooz`, `lapreferente`, `siguetuliga` ✓ — patrón: `quart.serversports.com` ✓). **Lo municipal es una decisión de alcance de David** ✓.

4. **⚠⚠ EL SERVIDOR ESTÁ CAÍDO desde ~23:30 del 11/10 (detectado 12/10 12:18)** ✗✗ — **y mi aviso de las 23:30 era un positivo de verdad** ✓✓.
   - **Hechos, no suposiciones** ✓: **no responde a ping** ✗; **ARP `Incomplete`** con MAC `00-00-00-00-00-00` → **no hay ninguna máquina con esa IP en la LAN** ✓; **ssh por LAN y por Tailscale, los dos `Connection timed out`** ✗; y **Tailscale lo dice con fecha**: `servidor … linux … offline, last seen 11h ago` ✓.
   - **NO es mi red** ✓✓, y lo comprobé antes de decirlo: Internet OK (1.1.1.1, 17 ms ✓), router OK (192.168.1.1, 1 ms ✓), el PC tiene 192.168.1.132 en la misma subred ✓.
   - **Lo que huele, y hay que decirlo** ✗: la última medida buena fue a las **23:30** con **load 18,32 en 4 núcleos** y **el slice a 11 de 12 GiB** ✗✗ (venía de 7,49 y de 9,55). Murió **justo después** ✓. Encaja con **presión de memoria** ✗. **Y es información para Claude, que es quien decidió subir el tope de 9 a 12 GiB** ✓ — no lo toco yo ✗ (límite del GOAL).
   - **Qué bloquea** ✗: **el paso 3 entero** (traer federaciones del servidor) — es imposible sin servidor ✓. También la ronda de salud del servidor ✓.
   - **⚠ Y LO GRAVE, que al principio no dije** ✗✗: **no es sólo que no se puedan traer datos — es que 14 federaciones no las está recogiendo NADIE**. El reparto del proyecto es **complementario por diseño** (`entorno-flota.ps1`: *«ninguna federación puede estar en las dos flotas (se pediría dos veces) ni en ninguna (no se recogería)»* ✓): el **PC** lleva `andalucia, madrid, cataluna, valencia` + `federacion` por temporadas ✓, y el **servidor** las otras **14** (`melilla, aragon, asturias, baleares, canarias, cantabria, castilla-la-mancha, ceuta, euskadi, extremadura, galicia, murcia, navarra, rioja` ✓). **Con el servidor apagado, esas 14 están sin recolectar** ✗✗ — y **el histórico que les falta no se recupera solo**: son jornadas que pasan ✓. **Por eso encenderlo no es «desbloquear una tarea mía», es volver a recoger 14 federaciones** ✓.
   - **Qué NO bloquea** ✓✓: **el paso 4** (job `pw8712`, sigue importando Andalucía **ahora mismo** ✓), **los 22 recolectores del PC** (siguen trabajando ✓ — no dependen del servidor ✓), **T-12** (hecho ✓) y **toda la verificación con `canonico-por-federacion.mjs`** ✓.
   - **Qué NO hago** ✗: **tocar la alimentación o los ajustes del servidor**. Es de David y está apagado ✓ → **es cosa suya encenderlo** ✓. Se lo reporto ✓.
   - **Y lo que esto enseña** ✓✓: la ronda de salud del GOAL **sirvió**: el aviso de las 23:30 precedió a la caída, y el número que lo anticipaba (11 de 12 GiB) estaba escrito ✓. **Un aviso a tiempo vale más que un diagnóstico a posteriori** ✓.



5. **⚠⚠ RECOLECTORES PARADOS: DOS SON ANOMALÍA REAL Y EL TERCERO NO (12/10 12:21, CORREGIDO POR MÍ A LAS 12:25)** ✗✓ — medido en la tabla **`peticiones`** (que es lo que manda ✓, NO `actualizado_en` ✓), con `_traspaso\_diag\cuenta-paquete.mjs <cola> --ritmo 60`:

   | federación (PC) | peticiones última hora | **última petición** | consecuencia |
   |---|---|---|---|
   | andalucia | 10 ✓ | hace un momento ✓ | — |
   | madrid | 25 ✓ | hace un momento ✓ | — |
   | federacion (CyL) | 8 ✓ | hace un momento ✓ | — |
   | ~~cataluna~~ | **356/h** ✓✓ | **hace un momento** ✓ | **CORREGIDO a las 14:0x: NO está parada** ✓✓ — su recolector **va contra una API** y no necesita navegador ✓ (ver §T-08 ✗✓) |
   | **valencia** | **0** ✗✗ | **11/10 10:31** ✗✗ | **ANOMALÍA REAL** ✗✗: **sin worker** y **5.042 trabajos vencidos** ✗✗ |
   | **madrid** | **5/h** ✗✗ | hace 6 min | **ANOMALÍA REAL** ✗✗: **sin worker propio** y **647 vencidos** ✗ — el supervisor no puede leer `Win32_Process` y **espera** (ver §T-08 ✓) |
   | **baleares** | **0** ✗ | 21/09 19:22 | **ESTÁ EN `FACYLF_EXCLUIR`: la recoge el SERVIDOR** ✓, así que su cola del PC parada **es LO ESPERADO** ✓✗ — su hueco lo llena el **paso 3** cuando el servidor vuelva ✗ |

   **Y aquí me equivoqué yo** ✗✗, así que esto queda escrito para no repetirlo: a las 12:21 dije «**tres** recolectores caídos» ✗ y **era falso para baleares** ✗. Lo comprobé **en la fuente de verdad**, `scripts/entorno-flota.ps1` ✓:
   ```powershell
   $env:FACYLF_EXCLUIR = 'melilla,aragon,asturias,baleares,canarias,cantabria,castilla-la-mancha,ceuta,euskadi,extremadura,galicia,murcia,navarra,rioja'
   ```
   **`baleares` está excluida a propósito** ✓✓ y **`cataluna`, `valencia` y `madrid` NO** ✓ (asignadas al PC). El comentario del fichero lo explica: *«el responsable decide que Valencia, Madrid y Cataluña vuelvan al PC y el servidor se quede con las otras dieciséis… la lista ya no es «lo que se ha ido al servidor», sino «lo que NO se recoge aquí»»* ✓. **Son DOS anomalías, no tres** ✓ — y la de Baleares es el caso **simétrico**: no un recolector roto, sino una federación **delegada a un servidor caído** ✗.
   **Y es, palabra por palabra, la trampa que el propio `entorno-flota.ps1` ya documentó el 24/09** ✓✓ para `federacion`: *«no era «la recoge el servidor», era «no la recoge nadie»»* ✓. **La misma trampa seis semanas después, y esta vez la escribí yo** ✗ — por eso **comprobar en la fuente de verdad valía más que tres fechas parecidas** ✓.

   **Lo que esto explica del canónico** ✓✓: **el hueco de Cataluña (4 % de resultados) y el de Valencia (2 temporadas a cero) sí son de recolección, no de importación** ✗ — sus recolectores están parados **16 y 24 horas** ✓. **En cambio el de Baleares NO es una avería**: lo llena el **paso 3** cuando el servidor vuelva ✓. **Así que «no hay nada que importar» vale para los tres, pero por dos motivos distintos** ✓✓ — y eso es justo lo que no se ve mirando sólo el canónico ✗.
   - **Ya hay prueba de que la fuente tiene datos, para Baleares** ✓: en el servidor lo vi importando su **2024-25** anoche (`--federacion baleares --temporada 2024-25 --grupo 7232678` ✓) → **la fuente los tiene; lo que falta es traerlos** ✓ (paso 3 ✗), no recogerlos ✗.
   - **Lo que vi**: en el PC hay **2 workers `recolector-local`** (andalucía y CyL ✓), **1 de madrid** ✓ y **18 de multideporte** ✓; **ninguno de cataluña, valencia ni baleares** ✗. **Y el supervisor de flota está VIVO** (`supervisor-flota.mjs`, PID 22360 ✓) — o sea que **está vivo y no los levanta** ✗.
   - **Qué NO hago** ✗: **no los arranco a mano**. Dos motivos, y los dos están escritos: (a) el GOAL prohíbe **cambiar el ritmo de los recolectores** ✗, y (b) el manual avisa de que **arrancar a mano un worker que el supervisor cree vivo duplica trabajadores** ✗ (por eso existe el cerrojo `arrancar.pid` ✓). **Es de Claude** ✓.
   - **Por qué es bloqueo real y no una nota** ✓: el objetivo es *«TODAS las temporadas de TODAS las federaciones ya recolectadas»* — y **lo que no se recoge no llega nunca al canónico** ✗. Importar no lo arregla ✓ (ya lo demostré: no hay nada que importar ✓). **Hay que volver a recoger.**

## Lecciones operativas de esta tanda

- **Los trabajos de fondo del programa sobreviven a la sesión; los `Start-Job` de PowerShell NO** ✗. Comprobado en carne propia: el primer intento de Melilla hizo 2 de 5 temporadas y se cortó al cerrar la sesión ✗ (sin daño, porque la importación es idempotente ✓). **Y los del programa sobrevivieron también a 12 h de PC suspendido** ✓✓ (12/10: el paso 4 siguió donde estaba ✓).
- **No lanzar dos importaciones al canónico a la vez** ✗: subieron la CPU del PC al **96 %** ✓. **Y medido mejor (11/10 21:47): el coste no es «una importación», es «de qué tamaño»** ✓✓ — con **Canarias (38 MB) la CPU fue 60 %** ✓ y con **Ceuta (216 MB) llegó al 99 %** ✗✗. **Galicia (~178.000 trabajos) y Andalucía (~214.000) son mucho mayores** ✗: **hacerlas de noche**, no a media tarde con las federaciones pidiendo ✓. Y lo tranquilizador: **con la CPU al 99 % las tres federaciones del PC siguen pidiendo y sin un solo bloqueo** ✓✓ — **se frena, no se rompe** ✓.
- **Leer la cabecera del script antes de inventarse el procedimiento**: T-03 lo dice («entre tandas» ✓) y ahorró 15 paradas y 15 arranques que yo había planificado ✗.

## Trabajo de fondo (T-12) — cerrojo de multideporte RESUELTO por Claude, 11/10 20:10

- **Hecho:** `recolector-multideporte.mjs arrancar` tiene ya cerrojo por adaptador (`descargas-multideporte/<adaptador>/arrancar.pid`).
  - Si ya hay un trabajador vivo de ese adaptador, el segundo dice «Ya hay un trabajador de X en marcha» y no arranca.
  - Un cerrojo de un proceso muerto se hereda, y se borra al salir.
  - Probado fuera del proyecto, sin peticiones.
- **Corrección a la nota anterior:** `--max` **sí** es un argumento del recolector multideporte (`arrancar … [--max 300]`); no era solo del descubridor de Cataluña.
- **Falta UNA cosa (DeepSeek, ahora):** los trabajadores que ya corren se lanzaron con el código viejo y no tienen el cerrojo. Hay que reiniciar el multideporte una vez:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\multideporte\reiniciar-multideporte.ps1
  ```
  Comprobación a los 2 min: existe `descargas-multideporte\<adaptador>\arrancar.pid` en los adaptadores activos.
- Hasta ese reinicio sigue valiendo la regla: no lanzar a mano un adaptador activo; para una liga nueva, `sembrar`.
- `sondeo-multideporte.mjs`: es un sondeo de una vez, no un trabajador continuo. No se lanza junto a nada; no hace falta cerrojo.
- `recolector-madrid.mjs`: lo vigila el supervisor de la flota, que no lanza un segundo si ve uno vivo. Basta con no lanzarlo a mano.

**Orden de trabajo ahora, sin parar entre medias y sin informar después de cada paso:**
1. reiniciar el multideporte (arriba);
2. **T-02** (vencida desde las 19:00);
3. T-03;
4. **T-12, zona 1** (CyL), y seguir.

## Cola (copia de §3 con su estado)

| ID | Estado | Nota |
|---|---|---|
| T-01 | **HECHA** ✓ | desplegada y verificada a las 19:05: aragon 13-14/12-13/11-12/10-11 (195/203/197/187), CLM, euskadi (4 cada una), extremadura (3), asturias y navarra (2), federacion 14-15/13-14/12-13. Todas con 0 grupos aún: los llena `catalogo_temporada`/`grupos` |
| T-02 | **LISTA** | vencía a las 19:00. Los cinco controles del encargo |
| T-03 | LISTA (tras T-02) | |
| T-04 | LISTA | empezar por rioja 2025-26 con -SoloTraer |
| T-05 | LISTA (tras 24 h de salud en verde) | bizkaia primero |
| T-06 | LISTA | |
| T-07 | LISTA | |
| T-08 | LISTA (tras T-02) | |
| T-09 | LISTA | |
| T-10 | **INNECESARIA** ✓✓ (13/10, Claude petición 134) | **La memoria NO es el problema**: de los 11,6 GiB del slice, **7,2 son caché de disco** (se libera sola ✓) y **4,4 son de procesos** ✓; presión «full» de 1,56 % a 5 min y **ni un solo OOM** ✓. Y **el apagón del 11/10 no fue memoria** ✗✓: el journal del arranque anterior **se corta en seco a la 01:12** (hora del servidor), sin OOM, sin pánico y **sin apagado ordenado** → **corte de corriente o cuelgue** ✓. **Es para David**: un SAI ✓, o mirar si se reinició solo ✓ |
| T-11 | LISTA | |
| T-12 | LISTA · **trabajo largo de fondo** | manual propio: `TAREA-LARGA-FUTBOL-AFICIONADO.md` (barrido de 11 zonas, una por sesión; progreso en su §6). Se avanza en todo hueco entre rutinas y esperas |
| T-13 | fechas: noviembre | |

**Estado de la cola al 12/10** ✓: **T-01 a T-04 HECHAS** ✓✓ (y el paso 4 **terminado** ese día ✓). **T-08 HECHA** ✓ (diagnóstico con causa ✓) · **T-11 HECHA** ✓✓ (ya estaba aplicado ✓) · **T-12 HECHA** ✓✓ (las 11 zonas ✓) · **T-06 BLOQUEADA y diagnosticada** ✗✓ (**es del PC y no del servidor** ✓ — la API de Valencia exige **el token de la página** ✓, ver arriba ✓). **Necesitan el servidor** ✗: **T-05** (las cinco territoriales), **T-07** (Melilla), **T-09** (el monitor) y **T-10** (`systemd-oomd`) → **esperan a que David lo encienda** ✓. **★ Y T-10 ya está resuelta el 13/10: es INNECESARIA** ✓✓ — la memoria **no** era el problema (**7,2 GiB de caché, 4,4 de procesos, ningún OOM** ✓) y el apagón del 11/10 fue **corte de corriente o cuelgue** ✗ (journal cortado en seco ✓).

## Medidas (una línea por ronda)

| Fecha | Máquina | Ritmo (pet./24 h por federación activa) | Queda | Nota |
|---|---|---|---|---|
| **12/10 16:2x** | **PC** | **Madrid 7.074 en 3 h** (24 h: 8.070 ✓) · **Andalucía 8.827** (11.593 ✓) · **Cataluña 5.643** (5.827 ✓) · **Valencia 5.014** (5.016 ✓) — **las cuatro colas del PC trabajando a buen ritmo** ✓✓ | Madrid: pendientes 2025-26 **29.938** + 2026-27 **526** ✓ · Andalucía: 2023-24 **67.060** ✓ · Cataluña: 2026-27 **1.411** ✓ | **El arreglo de Madrid AGUANTA** ✓✓ (nada de 10/h ✗: **~2.358/h** ✓, y su último trabajo es de las **14:18** ✓, sin pausa nueva por `standings` ✓✓). **Valencia** es la única más atrás (último 13:36 ✓, última acta **06/10** ✓): es el comportamiento ya documentado ✓ (ve la pausa de 24 h y sale ✓) y **T-06 está bloqueada y diagnosticada** ✗✓ — **no se le hacen más pruebas** ✓. **Servidor: sigue apagado (15 h)** ✗ |
| **11/10 23:30** | **servidor** | **5 contenedores a la vez: galicia 80,3 % · CLM 72,2 % · baleares 60,2 % · importador 59,0 % · rioja 54,8 %** → **~327 % de 400 %** ✗ | importador del servidor: 7.199 de 22.105 (14.775 pendientes) ✓ | **⚠ load 18,32** (era 9,55 a las 22:45 y 7,49 antes) ✗✗ y slice **11 de 12 GiB** ✗. Varios contenedores **pegados a su tope de 1,562 GiB** (galicia 1.125 · murcia 1.147 · aragon 1.052 · baleares 1.016 MiB) ✗. **Comprobado que NO es mío** ✓✓: no queda ninguna extracción de `trae-federacion-servidor` viva (lo verifiqué con `_traspaso\_diag\quien-consume.sh` ✓). **Es el trabajo normal: cinco federaciones scrapeando con Chrome a la vez.** No se toca nada (límite del GOAL) ✗ — se apunta y se reporta ✓ |
| 11/10 22:45 | servidor | — | importador del servidor: 7.199 de 22.105, 131 apartadas | load 9,55 ✗ y slice 11 GiB de 12 = 92 % ✗✗. 20 contenedores ✓ y los 5 nuevos parados ✓ |
| 11/10 12:54 | servidor | 4.505–7.380 | Galicia ~178k, CyL ~39k, pequeñas 13k–60k cada una | medido por Claude |
| 11/10 12:58 | PC | CyL 5.021 · Madrid 4.901 · Andalucía 4.394 | Andalucía ~214k, Madrid ~91k, CyL ~30k | antes del arreglo del suelo del PC |

## Historial

| Fecha | Qué | Resultado |
|---|---|---|
| **12/10 16:2x** | **Fase 2 paso 5 — las 4 candidatas que quedaban, clasificadas con REA** ✓✓ | **Cartagena: BLOQUEADA por el WAF** ✓✗ · **`fafutsala.com`: dominio APARCADO en IONOS** ✓✗ · **Huelva F7 y La Rioja: sin plataforma** ✓. **Me corrijo**: la fila 32 («no es fallo del sitio») era **falsa** ✗✓. **Lección**: *candidato sin petición hecha = candidato sin clasificar* ✓✓ — **dos de las cuatro solo se cayeron al pedirlas** ✓. **Paso 5 CERRADO**; de todo el barrido **sólo Palencia deja lector viable** ✓ |
| 11/10 | Pasos 1, 1a y 1b del encargo del 11/10 | hechos y verificados (Andalucía 4 → 13 temporadas; Madrid pidiendo) |
| 11/10 19:30 | Claude: T-12 detallada en `TAREA-LARGA-FUTBOL-AFICIONADO.md`; corregido en `FUTBOL-AFICIONADO.md` §3 que `arrancar` a mano un adaptador activo duplica trabajadores (usar `sembrar`) | — |

## DeepSeek, 01/11/2026 — CI de `facylf`: los dos rojos diagnosticados; **no hay verdes** y la línea base 633/359/60 no se acredita

**Task** `task_7c6fa02d9209` · **dispatch** `ctx_399a562d8129` · **run** `run_517457d35a0e`.
Árbol `703b6097c48fa697f5bd58f25e53c3ef0402c3930445bdd3a99b78b67d364aba`, perfil
`7b1c873463a98edea62ecc0f4b3cf9efee308e25c4c19c8d9713865071d89aa4`, HEAD `01b0580d0709`, rama `ErDeivih/equipo-ia`.

### Qué se midió (una puerta por llamada)

| Puerta | Resultado | Evidencia |
|---|---|---|
| `4532c4868add` (pnpm test) | **rojo**: 488,87 s, 45 ficheros ok / 4 con problemas, **541 pass · 2 fail · 41 skip**, `failure_classes ["timeout"]`, `database_codes []` | `f63820a60b63a8c375a9c3ca343f1e4ad2bbb76ddd4f36a244a2cd58520792ff` |
| `1824e75dbd39` (pnpm planes) | **rojo, no ejecutable**: `TimeoutError` a **300,633 s**, `code null`, `counts {}`, `interrupted` | `716ffb2fd088605e6580be395e8622789f9fefba2bb6978d2c86338d14a6d255` |
| `2f523b707a76` (lint), `4013b847119b` (SQL/PGlite), `6340c694e42c` (build web) | **no ejecutadas** en esta ronda | — |

### Causa de los 2 tests rojos (hipótesis vigente, aceptada por el controlador)

`apps/web/test/consultas.test.ts` llama a `consulta()` **sin `presupuestoMs`** en `:72`
(`COBERTURA_POR_FEDERACION.sql`) y `:453` (`RECUENTOS_DEL_CANONICO.sql`). Sin presupuesto no se abre
conexión propia y manda el `statement_timeout: 5000` del pool; PostgreSQL cancela con **SQLSTATE 57014** y
`conexion.ts:86-95` lo traduce a «La consulta superó el presupuesto de tiempo del servidor de la web (5 s)».
**No es un timeout de Vitest** (30 s). Explica que `database_codes` quede vacío y que el extracto público
apunte a `conexion.ts:132`. Consecuencia: **las pruebas de contrato nunca comprueban el presupuesto declarado**
(800 ms y 1500 ms), solo el tope de 5 s del pool; y en la copia esas consultas tardan **más de 5 s**.
Los otros 2 ficheros con problemas son de **colección**, no de aserción (`packages/canonico/test/lote.test.ts:1`,
`packages/ingesta/test/reconstruccion-cola/herramienta.test.ts:6`).

### Bloqueos de arnés (escalados, no reparables desde el workspace)

1. **`1824e75dbd39` no ejecutable con tope de 300 s.** Misma puerta daba `code 1` en 8,7 s con «45 consulta(s)
   fuera de presupuesto» sobre copia vacía; la suite completa está documentada en **916 s**. **Declarada NO
   EJECUTABLE y no verde** en el perfil `7b1c8734…`. Se pidió al arnés `timeout_seconds ≥ 660 s` conservando
   comando y umbrales, o declaración oficial de no ejecutable. `escalation` `msg_07cd0bfe626a`.
2. **No hay vía para medir estadísticas ni `EXPLAIN` sobre `facylf-ci-pg`.** `equipo-local diagnosticar facylf
   pruebas/ci/_probar-explain.mjs` responde «Guion fuera de las fuentes publicas autorizadas»; no existe ningún
   `_probar-*.mjs` ni el directorio `pruebas/ci/`; `registrar_puerta` solo admite guiones ya existentes.
   Sin eso **no se distingue copia (datos/estadísticas) de producto (SQL/plan)** y no se fabrica el dato.
   Dato heredado, no medición propia: cinco tablas consultadas de la copia con `last_autoanalyze` del 31/10 y
   0-98 modificaciones posteriores. `escalation` `msg_21688c286529`.

**No se tocó SQL, presupuestos, umbrales, gates, originales ni datos. Sin commit, push, merge ni despliegue.
Desconocido ≠ 0: no hay cifra de cobertura ni de recuentos de esta ronda.**

## 34.º intento / reparación P0 `task_7c6fa02d9209` · `ctx_5f8fd1700fcd` (01/11/2026)

Árbol de trabajo **`e51bc7c1…`** (HEAD `01b0580d`, rama `ErDeivih/equipo-ia`), perfil
**`7b1c8734…`**. El Dispatch anterior dio los dos rojos por reproducidos; esta ronda vuelve a
reproducirlos y cierra el diagnóstico con la evidencia saneada leída por el camino público.

### Reproducción (esta ronda)

| Puerta | Resultado | Evidencia |
|---|---|---|
| `1824e75dbd39` (planes · 60) | **NO EJECUTABLE**: `TimeoutError` a **300,86 s**, `interrupted: true`, `counts {}` | `201cfe77d9c6c6efcd576ea12a9d64dcbef983a4d90e308ce0d48648c141af2b` |
| `4532c4868add` (pnpm test) | **rojo**: 537 pass · **6 fail** · 41 skip, 45 ficheros ok / 4 con problemas, `failure_classes ["timeout"]`, `database_codes []` | `c8b6b0763f2a8aa7413d48cfb61ce16a4331539f9d428a7e452dddff89c8a6a4` |

Los 6 fallos, con nombre público, son **todos** de las dos consultas pesadas del catálogo y todos por
el mismo tope: `el listado devuelve exactamente las columnas prometidas…`, `la cobertura del listado
respeta las invariantes…`, `el filtro de federación devuelve sólo esa federación…`, `los filtros de
vocabulario y el texto de búsqueda…`, `la paginación cuenta lo que cumple los filtros…` y `los
recuentos de la portada traen una sola fila…`, localizados en `apps/web/test/consultas.test.ts`
**:332, :349, :376, :392, :414, :453**. Las cinco primeras salen de `LISTADO_DE_GRUPOS`, la última de
`RECUENTOS_DEL_CANONICO`. Llaman a `consulta()` sin `presupuestoMs`, así que no se abre conexión propia
y manda el `statement_timeout: 5000` del pool (`conexion.ts:132`); PostgreSQL cancela con 57014 y el
adaptador lo traduce a «presupuesto de tiempo del servidor». **No es un timeout de Vitest** y **no se
arregla subiendo el `statement_timeout` ni tocando aserciones**: en la copia esas dos consultas tardan
más de 5 s, con presupuestos declarados de 1000 ms.

### Por qué no se optimiza el SQL en esta ronda

`LISTADO_DE_GRUPOS` tiene tres candidatos de coste (`count(*) over ()` que materializa todas las filas
filtradas antes del `LIMIT`, el agregado global `left join (select … from core.team_entry group by
phase_group_id)` que recorre la tabla entera aunque solo se paginen 80 filas, y el orden de ~40.000
filas); `RECUENTOS_DEL_CANONICO` agrega `ops.coverage_checkpoint` y cuenta `core.matchday`. Sin
`EXPLAIN (ANALYZE)` **no se distingue** cuál pesa ni si el plan elegido en la copia es el de la huella
guardada. Cambiar el SQL a ciegas puede empeorar 40.000 grupos y no hay medición para verificarlo: se
prohíbe por decisión del controlador (`msg_59ded085d60c`).

### Bloqueo de arnés (vigente, escalado)

No existe **ningún** `_probar-*.mjs` público: `glob **/*_probar-*.mjs` sin coincidencias, `grep
FLUJO_EXPLAIN_SUMMARY|_probar-` solo devuelve este documento y el propio artefacto de diagnóstico. La
política de escritura rechaza `pruebas/ci/_probar-explain.mjs` y `_probar-explain.mjs` con «Ruta fuera de
las fuentes publicas o memoria autorizadas», `equipo-local diagnosticar` rechaza
`pruebas/ci/_preparar-ci-explain.mjs` con «Guion publico existente _probar-*.mjs», `read` de
`pruebas/ci/_probar-vista-previa.mjs` da «File not found» y `registrar_puerta` solo admite guiones ya
existentes. Queda como **artefacto untracked y no ejecutable** `pruebas/ci/_preparar-ci-explain.mjs`
(mide con `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` y emite solo `FLUJO_EXPLAIN_SUMMARY` numérico, sin
SQL ni filas, `statement_timeout 120 s`), **no** registrado como puerta.

`escalation` **`msg_ea21a96a2784`** (consolida `msg_1a979afaf96a`) pide: (a) ruta pública escribible
para `_probar-explain.mjs` o habilitar `registrar-preparacion` para el artefacto; (b) tope de
`1824e75dbd39` **≥ 600 s**, conservando comando y las 60 consultas.

**Estado declarado:** `1824e75dbd39` **NO EJECUTABLE, no verde** en el perfil `7b1c8734…`;
`4532c4868add` **rojo** (537/6/41); **60 / 633 / 359 no acreditados**; `all_registered_gates_verified:
false`. No se tocó SQL, presupuestos, umbrales, migraciones, `.env`, Docker, datos ni recolectores; sin
commit, push, merge ni despliegue.

### Addenda 01/11: dos huecos de arnés y por qué el cambio de `presupuestoMs` no repara nada

Decisión del controlador (`msg_484484791d75`): opción **D** (bloquear por capacidad de arnés, no
optimizar a ciegas, no gastar la plaza pesada). Los dos huecos, por separado:

1. **El tope de 300 s no se puede subir desde el workspace.** `timeout_seconds: 300` de
   `1824e75dbd39` vive en el `ci_contract` del perfil `7b1c8734…`, que `contexto_proyecto` entrega en
   **solo lectura**; `grep 1824e75dbd39|timeout_seconds` sobre fuentes públicas devuelve solo este
   documento (51 líneas narrativas) y `registrar_puerta` únicamente añade una puerta para un
   `_probar-*.mjs` **existente**, sin editar topes. Referencia para alinearlo: la suite completa ya tarda
   **916 s** según este mismo documento, así que 300 s no cubre una pasada sana; repetir `validar` solo
   produce otro `TimeoutError` idéntico.
2. **No hay vía de medición desde el workspace.** `glob **/*_probar-*.mjs` no encuentra nada, `write` de
   un guion nuevo está denegado y `diagnosticar` exige un `_probar-*.mjs` existente. Pedido: o `EXPLAIN
   (ANALYZE)`/tiempos reales de `LISTADO_DE_GRUPOS` y `RECUENTOS_DEL_CANONICO`, o un `_probar-*.mjs`
   de medición que sea registrable.

### Addenda 01/11 (segunda): el arnés se abrió, se midió una vez y el owner CI cayó

El controlador admitió `pruebas/ci/_probar-*.mjs` en `source_globs` (`msg_a6d5d65feec7`,
`delivery_b544ad5a311b`), así que el hueco 2 de arriba **ya no es cierto en su forma literal**: existe
el artefacto untracked y `diagnosticar` lo ejecutó una vez. Queda lo que sigue.

**Medición obtenida (sí hay recibo).** Guion `pruebas/ci/_probar-explain.mjs`, comando
`equipo-local diagnosticar facylf pruebas/ci/_probar-explain.mjs`; recibo
`03a7c6073a5d5499ecffee44141696753ca53c7272bbe07f6ebadfa3c504a8dd`, puerta `diagnostic_8b8f3045754b`,
`ok: true`, 23,568 s, `tree_hash 45b2dbb3f6aa06550201c0740b4ccbaa643b7bf0c296e7322a3d5b454af2c2be`,
perfil `7b1c873463a98edea62ecc0f4b3cf9efee308e25c4c19c8d9713865071d89aa4`,
`diagnostic_only: true`, `acceptance_gate_registered: false` (no vale como puerta).

`LISTADO_DE_GRUPOS` (mejor de 2, en caché, `shared_read_blocks: 0`): `execution_ms 6786,7`,
`planning_ms 1,961`. Plan: `Limit` (80 filas) 6785,2 ms → `Sort` sobre **50 268** estimadas →
`WindowAgg` 5562,4 ms con 50 268 filas → `Hash Join` 4062,6 → `Hash Join` 1595,1; el agregado de
`core.team_entry` (~402 417 filas) aporta ≈2 s. Presupuesto declarado 1000 ms ⇒ **≈6,8×** sobre SLA, y
el pool corta a 5000 ms ⇒ explica los `57014`. El coste dominante es `count(*) over ()`, calculado antes
del `LIMIT`.

**Arreglo propuesto, aún sin medir.** Paginar primero (CTE/subconsulta con `order by` + `limit $12
offset $13`), `(select count(*) from base)::int as total` como initplan no correlado, e `inscripciones`
por subconsulta correlada en la lista de objetivo (PostgreSQL la evalúa después de `Sort`+`Limit`, solo
80 escaneos de `team_entry_grupo_idx`). Se descarta `LATERAL` a nivel de join: se ejecutaría para las
50 268 filas. Sin cambios de columnas, orden ni `PARAMETROS_CATALOGO`.

**Bloqueo nuevo (infraestructura, no producto).** Tras la primera medición, `equipo-local diagnosticar
facylf pruebas/ci/_probar-explain.mjs` respondió `Herramienta local sin recibo; no repetir una acción
incierta` y después, literalmente:

```json
{"ok": false, "error": "ci_owner_exited_reconcile_existing_receipts"}
```

Un intento previo sobre `pruebas/ci/_probar-listado.mjs` había devuelto el mismo `sin recibo`. No hay
comando desde el workspace para reconciliar el owner CI (`validar` ejecuta puertas, `registrar_puerta`
solo añade guiones existentes, `equipo-local evidencia` exige id). El controlador (`msg_abd67bb007a2`)
confirma que no puede reconciliarlo y ordena: no repetir la llamada idéntica, no abrir otra ruta de
medición, **no** convertir la consulta en roja ni dar por acreditada la línea base, dejar el SQL intacto
y escalar con esta reproducción.

**Estado declarado:** `1824e75dbd39` **NO EJECUTABLE** (301 s, `counts: {}`) y sin medición de la
variante paginada; `4532c4868add` **rojo** (537/6/41, seis `57014`, uno con 15 710 s de span por
suspensión del PC, no por SQL); **60 / 633 / 359 no acreditados**; `all_registered_gates_verified:
false`. No se tocó SQL, presupuestos, umbrales, snapshots, migraciones, `.env`, Docker, datos ni
recolectores; sin commit, push, merge ni despliegue. El fallo de arnés **no** es un resultado del
producto y no se usa para cerrar nada.

**`presupuestoMs: 1000` no repara el rojo y no se aplicó.** `conexion.ts:114-118` solo abre conexión
propia y ejecuta `set local statement_timeout` cuando `presupuesto > 5000`; con 1000 ms manda igualmente
el pool de **5000 ms**, así que el cambio es neutral (dejaría los mismos seis 57014) y un árbol cambiado
daría evidencia engañosa. Además `:414` usa `consultaEnUnaFoto` (`conexion.ts:149`), cuya firma no acepta
`presupuestoMs` y que por diseño nunca amplía. Conclusión registrada: los seis timeouts son **hallazgo de
producto** — las dos consultas tardan >5 s reales frente a su presupuesto declarado de 1000 ms — y la
reparación exige medir, no subir topes ni tocar aserciones.

## 38.º intento / verificación de las 7 puertas · `task_c20167f3fcbe` · `ctx_9823de25d72f` (02/11/2026)

Árbol **`d822fb003b9d7297b8b8c0554bd1adab2a36175946529ebc31f7e881f35387ac`**, perfil **`e91457fd…`**,
HEAD `01b0580d…`. El encargo citaba el árbol `d2488206`, que **no coincide** con el working tree: se usa
`d822fb00` como referencia (decisión `msg_2928d7a2003a`).

| Puerta | Resultado | Evidencia |
|---|---|---|
| `2f523b707a76` lint | verde, code 0, 5,16 s | `2c14cda1…` |
| `6340c694e42c` web build | verde, code 0, 87,05 s | `c87dd012…` |
| `4013b847119b` SQL/PGlite (359) | verde, code 0, 412,14 s | `8782b0c8…` |
| `51df9d75a0f5` listado | verde, code 0, 20,58 s | `b923bfd1…` |
| `593e89fd5bdf` explain | verde, code 0, 11,10 s | `9c3f4071…` |
| `1824e75dbd39` planes (60) | **NO EJECUTABLE**: `TimeoutError` 300,97 s, `interrupted`, code `null` | `c9c09002…` |
| `4532c4868add` pnpm test (633) | **rojo**: code 1, 567,08 s, 539 pass / 4 fail / 41 skip, 5 ficheros, `failure_classes ["timeout"]`, `database_codes []` | `c6c9797f…` |

Sin fallos de aserción ni de dato: los rojos públicos son los mismos de siempre y **rotan** entre
ejecuciones (`:332`, `:402`, `:453`), compatible con ancho del PostgreSQL del sandbox. Decisión del
controlador (`msg_2928d7a2003a`): **no** tocar SQL, `catalogo.ts` ni `conexion.ts`; bloquear como
entorno, no como producto, y escalar.

**Canal de medición: sigue sin dar cifras.** `registrar_puerta` confirma que `_probar-explain.mjs` y
`_probar-listado.mjs` **ya estaban registrados** como `593e89fd5bdf` y `51df9d75a0f5`. Ambos devuelven
`ok: true` / `code 0`, pero el recibo saneado llega con `public_numeric_explain: []`, `counts: {}` y
`output_characters: 350`: la línea `FLUJO_EXPLAIN_SUMMARY` la retira el saneador del arnés. La única
medición válida sigue siendo la del 01/11 (`03a7c607…`): `LISTADO_DE_GRUPOS` 6786,7 ms, `WindowAgg`
5562,4 ms sobre 50 268 filas. Sin cifras nuevas **no se cambia SQL a ciegas**.

**Escalación al owner del arnés:** `msg_6492d2022b5c` (pide `timeout_seconds` 1200 para `1824e75dbd39`
y exponer el resumen EXPLAIN o confirmar `_probar-explain.mjs` como canal oficial). Mientras el owner
no devuelva recibo, `1824e75dbd39` queda **NO EJECUTABLE por tope del contrato** (deuda del arnés), no
verde.

**Estado declarado:** `all_registered_gates_verified: false`; `production_authorized: false`;
60/633 no acreditados; los 359 de PGlite sí. Sin cambios de producto en esta ronda, sin commit, push,
merge ni despliegue, y sin tocar aserciones, umbrales, migraciones, `.env`, Docker, datos ni
recolectores.

## 41.º intento · Medición p95 de listado y recuentos, sin cambiar SQL (02/11/2026)

**Qué se ha medido.** `pruebas/ci/_probar-listado.mjs` ejecuta ahora, con la misma frontera de
conexión que la web (`conexion.ts`), 1 calentamiento + 20 muestras de tiempo de pared por consulta y
publica p50/p95/máximo junto al presupuesto declarado en `catalogo.ts`. Comprobación realizada sobre
el árbol de trabajo (`apps/web/src/consultas/catalogo.ts` con los arreglos del 01/11 aplicados y sin
commitear). Las cifras son de la copia CI con caché caliente, no de producción.

| consulta | presupuesto p95 | p50 | p95 | máximo | veredicto |
|---|---:|---:|---:|---:|---|
| `listado-de-grupos` | 1000 ms | 75,0 ms | **87,7 ms** | 95,1 ms | cumple, 11× de margen |
| `recuentos-del-canónico` | 1500 ms | 175,9 ms | **194,7 ms** | 212,2 ms | cumple, 7,7× de margen |

**EXPLAIN de control (`listado-de-grupos`).** `listado-actual` 66,9 ms (Sort 66,0 ms; tres Hash Join
sobre 46 167 filas; `Seq Scan` de `core.phase_group` 2,8 ms sobre 50 268 filas; `CTE Scan` 4,5 ms).
No hay `WindowAgg`: el plan patológico de 6786,7 ms con ventana sobre 50 268 filas ya no está en el
árbol. La candidata «paginar primero» que dejé preparada mide **182,4 ms**, casi el doble que la
forma actual: la materialización del total y de las inscripciones ya resuelve el problema, así que
**no se aplica la candidata y no se toca SQL** (coherente con `msg_59ded085d60c`).

**Qué cambia en el arnés.** Los diagnósticos ya **no escriben recibos dentro del árbol**: escribir un
fichero durante la puerta cambiaba la huella y dejaba `subject_changed_after_gates: true`. El padre
captura el stdout del hijo y reemite solo las líneas `FLUJO_EXPLAIN_SUMMARY `; el lector del arnés
sigue descartándolas (`public_numeric_explain: []`), así que la cifra se conserva aquí, que es el
canal que sí lee una persona. `pruebas/ci/_probar-medicion*.mjs` quedan como placeholders mínimos
(borrables): los números viven en esta tabla.

**Estado declarado (esta ronda).** Medición p95 con recibo real para las dos consultas de la entrega.
Puertas `51df9d75a0f5` y `593e89fd5bdf` ejecutadas sobre el árbol de la medición (code 0; el recibo
público del arnés no expone las cifras por el saneador). `1824e75dbd39` sigue **NO EJECUTABLE** por
`timeout_seconds: 300` frente a ~916 s de la suite, y `4532c4868add` sigue rojo por timeouts de
entorno, no de aserción. `all_registered_gates_verified: false`; `production_authorized: false`. Sin
commit, push, merge ni despliegue; sin tocar umbrales, aserciones, datos ni recolectores.

## 42.º intento · Vista previa local y su puerta en verde (02/11/2026)

**Task** `task_fbdec9ed6d49` · **dispatch** `ctx_3316cf07bc2a` · **run** `run_517457d35a0e`.
Árbol final `ed0120a72a3938082c5ebdb55efc74b44be17eb99c6f6cc164d329c5ddc4b317`, perfil
`5ec3594b…`, HEAD `01b0580d…`, rama `ErDeivih/equipo-ia`.

Entrega: `scripts/vista-previa.mjs` (arranque local de la web para revisión manual, sólo `127.0.0.1`,
rechaza `DATABASE_URL_*` no locales, devuelve `next-env.d.ts`/`tsconfig.json` a su contenido original
al salir) y su puerta `pruebas/ci/_probar-vista-previa.mjs`, documentada en `ENTORNO-LOCAL.md` §8.

**Diagnóstico del arranque en rojo.** Con el servidor de desarrollo de **Turbopack** la portada
respondía 500 con un `ENOENT` acotado por sondas a `apps/web/.next/dev/…`, sin traza de módulo ni de
base de datos, y borrar `.next` antes de arrancar no lo cambiaba. Causa del ruido de diagnóstico: el
sandbox **no tiene `taskkill` ni `netstat`** (comprobado con una sonda de códigos: ambos `spawnSync`
dan error y salida vacía), así que la parada anterior nunca mató nada y el puerto quedaba abierto por
artefacto del arnés, no por el producto. `repositorio-local.ts` quedó descartado como causa (`db()`
usa `existsSync` y devuelve `null` sin base).

**Arreglo.** El guion arranca `next dev --webpack` —el mismo motor que `next build`— y la portada
devuelve 200 sin canónico (aviso de «canónico no disponible»). La parada es por `process.kill` del
propio hijo (sin binarios externos) más `taskkill` best-effort si existe, y la prueba pide el cierre
por el **canal IPC** (`"parar"`), que recorre el mismo camino que Ctrl+C: Windows no entrega señales a
un proceso en primer plano, así que no hay otra forma honesta de probarlo.

**Resultado.** Puerta `0c6e21dff965` **verde**, code 0, 19,0 s, `subject_changed_after_gates: false`,
evidencia `ca42c34e683065cd414017b81277e847936d70ee0ccb135d46819f7998293650`.
`all_registered_gates_verified: false` (quedan `1824e75dbd39`, `2f523b707a76`, `4013b847119b`,
`4532c4868add`, `51df9d75a0f5`, `593e89fd5bdf`, `6340c694e42c`, ya medidas en la ronda 41.º/38.º sobre
otros árboles); `production_authorized: false`. Sin commit, push, merge ni despliegue; sin tocar SQL,
umbrales, aserciones, datos ni recolectores.
