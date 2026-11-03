# ENCARGO GRANDE para DeepSeek — 27/10/2026 (escrito el 26/10, 22:00)

> **David, 26/10:** «ha trabajado muy poco DeepSeek. ¿Está todo correcto? Dale un encargo para que trabaje mucho y lo
> arregle todo».
>
> Claude ha revisado lo hecho el 26/10 con las peticiones 221 y 222 (sólo lectura): está bien, pero se queda corto
> (§1). Debajo de eso hay un problema mucho mayor: **el canónico lleva 2-3 semanas sin importar 18 de las 19
> federaciones**, **hay una sola copia de seguridad en toda la historia** y **la proyección para la web está al 2 %**
> (§2).
>
> Este encargo es **trabajo para unas dos semanas**. Va por bloques (A-F), en orden de importancia, cada punto con su
> «terminado cuando». **Sustituye** a los encargos anteriores en lo que se solapen; lo que no se repite aquí sigue
> como estaba (el de la web del 24/10 y el de La Preferente del 26/10).

## 0. Cómo trabajar (léelo entero: es lo que más ha fallado)

1. **No pares al acabar un paso.** Cuando un punto termina, pasa al siguiente de la lista sin preguntar. Una sesión
   acaba cuando se termina el contexto o cuando sólo quedan cosas que esperan a David (§10), no antes. Una sesión de
   4 minutos con 6 pasos hechos es poco: aquí hay trabajo para días.
2. **Lo largo, en segundo plano.** Importar, proyectar o recoger lleva horas.
   - Se lanza en segundo plano con prioridad baja (`Start-Process -WindowStyle Hidden` + `BelowNormal`, o la tarea programada).
   - Se anota el PID y el fichero de registro.
   - **Mientras corre, se trabaja en otro bloque** (la web, por ejemplo).
   - Se vuelve a mirar cada 30-60 min.
3. **Una cosa pesada a la vez en el PC.** Importación, proyección, mantenimiento y compilación de la web no van juntas.
   - Antes de lanzar algo pesado: **memoria libre ≥ 4 GB** (hoy 5,1 GB).
   - Si David está usando el PC (CPU > 70 % sostenida o lo dice), se pausa lo pesado.
4. **La hora, la del PC.** Tu bloque del 26/10 dice «27/10, 10:30» y se escribió el 26/10 hacia las 21:15. Usa `Get-Date` al escribir en ESTADO.
5. **Una migración aplicada no se edita nunca**, ni sus comentarios.
   - Lo de 0051 está comprobado: el SQL, sin comentarios, es idéntico a la propuesta, y el hash nuevo vale.
   - Pero no se repite: si hace falta cambiar algo, migración nueva.
6. **Nada se da por hecho sin su prueba.**
   - Cada punto cerrado lleva su salida en ESTADO-DEEPSEEK.md.
   - Lo que no se pudo hacer va con su porqué y con lo que se intentó.
   - Ejemplo de lo que no vale: tu bloque dice «lancé el catálogo» de la RFEF, y en el chat dices que `preparar` falló por falta de catálogo. Las dos cosas no pueden ser verdad.
7. **Reglas de siempre:**
   - recogida respetuosa (FacylfBot, 5-8 s, una petición a la vez por web, sin saltarse límites puestos a propósito);
   - nunca nombres de menores fuera del PC;
   - el servidor no se toca más allá de lo que se dice (carga > 14 → no se añade trabajo);
   - `infra/docker-compose.yml`, sólo con David;
   - commits, sólo los de la web en la rama `fase-c` (encargo del 24/10); push y `main`, David.
8. **Al cerrar cada bloque:**
   - un bloque arriba del todo en ESTADO-DEEPSEEK.md;
   - poner al día la tabla de §9 de este documento (pendiente / en curso / ✓ / bloqueado y por qué).

## 1. Revisión de lo del 26/10 (Claude, peticiones 221-222)

| Paso | Comprobado | Nota |
|---|---|---|
| 0052-0054 aplicadas | ✓ en `ops.migracion` a las 20:16 | La web no puede leer las tablas de `externo` y sí las vistas; la política existe ✓ |
| `lapreferente` viejo parado | ✓ sólo queda `lapreferente-federado` | — |
| Histórico de Cataluña adelantado | ✓ 3.196 calendarios a prioridad 15 | La Preferente ya ha leído **286 competiciones y 50.988 partidos** |
| Tarea diaria «FACyLF La Preferente» | ✓ creada | — |
| Pruebas | ✓ (39) | — |
| RFEF | ◐ | `descargas-rfef/recolector-local/cola-v2.sqlite` vacía (204 KB) y **sin catálogo**. Ver B6 |
| Web L7 | ✗ | Va en E3 |
| **Hueco sin explicar** | ✗ | La Preferente hizo 416 peticiones a las 15 h, 56 a las 16 h y **0 entre las 17 y las 19 h**, con el PC encendido. Ver A4 |

## 2. Lo que está mal de verdad (medido el 26/10, 21:30-21:45)

| Qué | Dato | Por qué importa |
|---|---|---|
| **Importaciones** | Último lote: **CyL hoy**; Euskadi y Navarra 14/10; Rioja 13/10; Ceuta y Andalucía 12/10; Canarias y Melilla 11/10; **las otras 10 federaciones, el 07/10**. **Bizkaia, Gipuzkoa, Araba, Las Palmas y Tenerife: nunca** | La web enseña lo que hay en el canónico, y el canónico va 2-3 semanas por detrás de las colas |
| Ejemplos del atraso | Cataluña 2026-27: 86.697 partidos, **469 con resultado**; Andalucía 2023-24: 2.161 partidos (la cola tenía 67.060 pendientes); Valencia 2024-25: **no está**; Madrid antes de 2020-21: **no está**; Canarias: 2.821 partidos en total | — |
| **Copias de seguridad** | **Una sola, el 23/10.** `copia_de_seguridad` en fallo (80 h). **Las tareas de la plataforma no están registradas** (no existen «FACyLF copia», «mantenimiento», «proyector» ni «vigilancia») | Un fallo de disco hoy es perderlo todo |
| **Proyección (W0)** | **39.463 grupos pendientes, 936 proyectados** (último, el 23/10) | Sin proyección la web nueva no tiene datos |
| Mantenimiento | `tuplas_muertas:core.appearance` 39 %; `cache_sin_refrescar` 34.643; `ediciones_sin_medir` 11.339 | La base se hincha y se vuelve lenta |
| Ritmo de recogida (colas) | Pendiente vencido: Andalucía 320.931 (2.420/día), Galicia 171.557, Madrid 142.678, Cataluña 137.249, Valencia 133.249 (1.561/día), Aragón 79.051, Bizkaia 64.089… | Al ritmo de hoy son **meses**. Andalucía tiene 189.283 **jornadas** pendientes |
| Castilla-La Mancha | `ritmo_bajo` desde el 23/10: **73 peticiones en 24 h** frente a 1.216 de mediana. El cambio del turno (600 → 240) no lo arregló | — |
| Araba | `resultados_atrasados`: 25 de 80 jornadas jugadas hace 2-9 días sin ningún resultado | — |
| Calidad | `titular_en_dos_partidos_a_la_vez` 321 · `casos_graves_abiertos` 607 · `minutos_no_calculables` 77,5 · `actas_a_revisar_7d` 98,2 | — |
| Importador | 43 s - 2 min por grupo (`importar-masivo.mjs`) y ~29.500 unidades | La importación es otro cuello de botella |

## 3. Bloque A — Hoy, lo urgente (≈ 3 h)

**A1. Copia de seguridad YA.**
- Ejecutar `node scripts/copia-seguridad.mjs`.
- Comprobar en `ops.copia` que la nueva está `correcta = t` y que el fichero existe en `D:\facylf-copias`.
- **Terminado:** dos copias en `ops.copia` y `copia_de_seguridad` en `ok`.

**A2. Tareas de la plataforma registradas.**
- Ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tareas-plataforma.ps1`.
- Después, ajustar para que **al encender el PC por la mañana no arranque todo a la vez**: copia, mantenimiento y La Preferente con `StartWhenAvailable` y un retraso escalonado (+20, +40 y +60 min tras el arranque), con prioridad baja.
- El «FACyLF proyector» cada 15 min se deja como está en el guion; si molesta a David, se pasa a cada hora.
- **Terminado:**
  - `Get-ScheduledTask 'FACyLF*'` enseña copia, mantenimiento, proyector, vigilancia, parte diario, avisos y ojeo en `Ready`;
  - al día siguiente, `ops.copia` tiene la copia de las 3:31 (o la del arranque) y `restauracion_probada` deja de avisar el día 2.

**A3. Mantenimiento ahora.**
- Ejecutar `node scripts/mantenimiento-bd.mjs --noche`, sin nada más pesado a la vez.
- **Terminado:** `tuplas_muertas:core.appearance` por debajo del 10 %.

**A4. El hueco de La Preferente (16-20 h del 26/10).**
- En `descargas-multideporte/lapreferente-federado/cola.sqlite`, tabla `peticiones`, y en los registros del supervisor: ¿pausa por errores? ¿el proceso vivo sin pedir? ¿el supervisor tardó en relanzarlo?
- Si es un fallo del motor o del supervisor, arreglarlo con su prueba.
- **Terminado:** causa escrita y, si había fallo, arreglado y probado. En 24 h, ≥ 6.000 peticiones con el PC encendido todo el día (o lo proporcional a sus horas).

**A5. El vigía avisa ya de «servidor sin datos».**
- Lo ha añadido Claude hoy en `scripts/claude/enlace-claude.mjs`: si las métricas del servidor tienen más de 60 min, pone un CRÍTICO en `estado/vigia/alertas.log` y en `servidor-ausente.json`.
- No hay que hacer nada; sólo saberlo.

## 4. Bloque B — El canónico al día y que no se vuelva a quedar atrás (≈ 2-3 días de máquina; el trabajo de verdad)

**B1. Medir el atraso, federación por federación y temporada por temporada** (sólo lectura).
- Script nuevo `scripts/frescura-canonico.mjs`. Para cada una de las 24 fuentes y cada temporada compara:
  - en la cola (la del PC, o la del servidor con su `foto`/`extrae`): partidos, partidos con resultado y actas hechas;
  - en el canónico: partidos, con resultado y con `match_report`.
- Escribe `estado/vigia/frescura.json` y una tabla `.txt`.
- Que lo lea el vigía: aviso si una federación tiene más del 2 % de diferencia en la temporada en curso o lleva más de 48 h sin lote.
- **Terminado:** la tabla existe, se rehace sola cada noche (va dentro de B3) y sale en el parte de las 8:05.

**B2. Ponerlo al día todo, empezando por lo que se ve.**
- Con lo que ya hay:
  - en el PC, `importar-temporada.ps1 -Federacion <f> -Temporada <t>`;
  - en el servidor, `scripts\claude\trae-federacion-servidor.ps1` / `trae-temporadas-servidor.ps1` + `importar-temporada.ps1 -Paquete …`;
  - o `node scripts/ciclo-importacion.mjs --aplicar --federacion <f>`.
- Orden:
  1. **2026-27 y 2025-26 de las 24 fuentes.**
  2. **Las cinco provinciales (Bizkaia, Gipuzkoa, Araba, Las Palmas, Tenerife), todas sus temporadas**: nunca se han importado.
  3. **Las temporadas que faltan enteras**: Valencia 2024-25, Madrid antes de 2020-21, Cataluña antes de 2025-26 (eso lo dará La Preferente), Andalucía 2014-15 a 2024-25 casi vacías…
  4. El resto, de la más nueva a la más vieja.
- Una importación a la vez, con prioridad baja, en segundo plano. Mientras, bloque E.
- Lo que falle se aparta con su motivo (como hace `importar-masivo.mjs`) y se apunta; no para la cola.
- **Terminado:** en `frescura.txt`, toda temporada con menos del 2 % de diferencia, o explicada una por una (por ejemplo, «la cola tiene X partidos de grupos retirados»).

**B3. Que no se vuelva a quedar atrás: importación diaria automática.**
- Tarea «FACyLF importar al día» (por la noche o al encender, escalonada con A2), que:
  - **trae del servidor** lo de sus federaciones;
  - **importa en todas** lo cambiado desde el último lote: como mínimo, la temporada en curso y la anterior;
  - pasa `frescura-canonico.mjs`.
- Medir cuánto tarda una pasada en la que no ha cambiado nada. Si pasa de 1 h, primero B4.
- **Terminado:** tres días seguidos con lotes de las 24 fuentes en `ops.batch` y `federacion_sin_lote` en `ok`.

**B4. Acelerar el importador** (en paralelo con B2, sobre una base de PRUEBA, nunca la real).
- Perfilar un grupo típico (43 s - 2 min). Lo normal es que se vaya en una consulta por fila: pasar a inserciones por lotes, sentencias preparadas y menos idas y vueltas.
- **Regla de oro:** lo importado tiene que ser **idéntico**.
  - Prueba: importar 20 grupos (CyL, Galicia, Madrid, Valencia y Cataluña) con el importador viejo y con el nuevo en dos bases de prueba.
  - Comparar tabla a tabla (`core.*`, `source.*`) con un `except` en los dos sentidos: cero diferencias.
  - `pnpm --filter @facylf/canonico test` en verde (208, incluidas las muestras de oro).
- **Terminado:** media ≤ 15 s por grupo en los mismos 20, cero diferencias y pruebas en verde. Entonces se usa para B2/B3.

**B5. Proyección completa (W0 del encargo de la web)**, después de B2, una federación cada vez y por la noche:
```
pnpm lectura:proyectar --federacion <f> --limite 1000 --sin-globales
node scripts/proyectar-lectura.mjs --temporadas-todo
node scripts/proyectar-lectura.mjs --identidad-todo
node scripts/mantenimiento-bd.mjs --noche
```
- **Terminado:**
  - `pnpm lectura:estado` sin pendientes;
  - `proyeccion_pendiente` en `ok`;
  - `ediciones_sin_medir` y `cache_sin_refrescar` en `ok`;
  - `pnpm planes` en verde.

**B6. La RFEF, de verdad** (fuente `rfef`, perfil `perfiles/rfef.json`).
- Hacer la pasada de descubrimiento que crea `descargas-rfef/competiciones-por-temporada.json` y `grupos-por-temporada.json`: la misma herramienta y forma que se usó con las provinciales el 16/10 (`packages/ingesta/bin/descubrir.ts` y `catalogo-historico.ts` con el perfil).
- **Antes de `preparar`, enseñar el catálogo de 2026-27 y comprobarlo:**
  - salen 1.ª y 2.ª Federación, División de Honor juvenil, femenino nacional y Copa del Rey;
  - **no** salen Tercera ni Liga Nacional juvenil, que son de las territoriales.
- Después, `preparar` y `arrancar --perfil perfiles/rfef.json` en el PC: primero 2026-27 y 2025-26, luego hacia atrás.
- Importar con `importar-temporada.ps1 -Federacion rfef`. La configuración ya la trae en `nacionales` y el importador ya lo acepta.
- **Terminado:** un grupo de 2.ª Federación 2025-26 en el canónico con todos sus partidos y actas; cotejar 5 actas contra la web de la RFEF; y la RFEF en la tabla de B1.

## 5. Bloque C — Recoger más deprisa sin pedir más deprisa (≈ 3-4 días)

**C1. La tabla cruzada PNFG** (pendiente desde el 25/10; detalle en `FUENTES-ALTERNATIVAS-2026-10-25.md` §2).
- Un trabajo nuevo `tabla_cruzada` en el recolector PNFG.
  - Una página (`NFG_VisTablaCruzada?cod_primaria=1000120&CodGrupo=<g>`, **el enlace se toma del calendario archivado**, no se construye a mano) da los resultados de todo el grupo con su jornada.
  - Se guardan como resultados de partido (sin acta) y se cotejan con las jornadas ya leídas.
- Así, Andalucía tiene 189.283 jornadas pendientes: unas ~7.500 páginas le darían **todos sus resultados**.
- Las jornadas se siguen leyendo, porque son las que dan el código del acta. Pero con prioridad: primero las que tienen partidos jugados y actas; las vacías, se saltan.
- Prueba con el grupo 8947 de CyL 2015-16 (240 partidos con resultado en una página). Después, en todas las PNFG con jornadas pendientes, empezando por Andalucía, Galicia, Bizkaia y Aragón.
- **Terminado:**
  - pruebas del lector en verde;
  - el 100 % de los marcadores que ya teníamos coinciden con la tabla, y las diferencias se apuntan como incidencia, no se pisan;
  - la cobertura de resultados de Andalucía sube de forma medible en `frescura.txt`.

**C2. Las actas por HTTP, otra vez y con método** (`RECOLECCION-10GB.md` del 20/09: se descartó porque la página sin JavaScript perdía 6 jugadores y el árbitro).
- Repetir `scripts/prueba-actas-por-http.mjs` con 40 actas de 5 federaciones.
- Mirar en el HTML plano **dónde están** los jugadores y el árbitro que faltan.
  - Si están en el HTML (filas con otra estructura, atributos, un JSON en la página), adaptar el intérprete.
  - **Si para sacarlos hay que ejecutar o imitar el código que la web usa para esconder datos, se para ahí y se deja escrito**: no se esquivan protecciones puestas a propósito.
- Sólo con **el 100 % igual en 200 actas por federación** (alineaciones, eventos, árbitro, técnicos) se activa por federación, con un interruptor en `recolector.<fed>.config.json`.
- Mismo ritmo: 6-8 s por petición. La ganancia es que no hace falta plaza de Chrome ni 4 peticiones por acta.
- **Terminado:** informe con la causa y, si es viable, 1 federación funcionando 48 h, medida (actas/día, errores, RAM) frente a antes.

**C3. Castilla-La Mancha** (73 peticiones en 24 h desde el 23/10).
- Diagnóstico real: registro del worker en el servidor, plaza de Chrome, pausas, errores.
- **Terminado:** más de 1.000 peticiones en 24 h, o la causa escrita y algo que dependa de David.

**C4. Araba** (25 de 80 jornadas jugadas sin ningún resultado).
- ¿No lo publica la federación, o no lo leemos? Mirar la página en vivo de 3 de esas jornadas (una petición cada una) y compararlas con nuestra cola.
- En cuanto La Preferente tenga Araba, el vigía de La Preferente (`lp_resultados_que_faltan`) lo dirá también.
- **Terminado:** causa escrita y, si es nuestra, arreglada.

**C5. Plazas de Chrome del servidor.**
- Medir, por federación, cuántas horas al día tiene plaza: está en los registros, en «esperando para abrir Chrome». Hoy Galicia (171.557 vencidos) pasa horas sin pedir.
- Proponer el reparto que más actas saca **con la misma carga**: por ejemplo, más tiempo para las que tienen más vencido.
- **Terminado:** tabla y propuesta; se aplica si no sube la carga del servidor.

**C6. Cataluña (FCF), siempre en marcha con el PC encendido.**
- Comprobar que el worker no se para por su `--max 400` sin relanzarse, y que no tiene pausas de más.
- **Terminado:** ≥ 5.000 actas en un día con el PC encendido 10 h, o la causa escrita.

## 6. Bloque D — La Preferente cada día (≈ 30 min al día)

**D1. Mañana, la primera pasada a mano**, cuando `externo` tenga datos (ya hay 286 competiciones en la cola):
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lapreferente\ciclo-lapreferente.ps1 -Todas`.
- Mirar la RAM: Node va con 1 GB como máximo.
- Pegar en ESTADO:
  - la tabla de emparejados, dudosos y sin contraparte por federación;
  - `partidos_casados`;
  - lo que diga el vigía.
- **Objetivo:** dudosos < 5 %.
- Coger 10 emparejados al azar por federación y cotejar marcadores y equipos.
- Si algo empareja mal, se arregla el emparejador con su prueba en `scripts/lapreferente/lapreferente.test.mjs`.

**D2. Cada día:**
- que la tarea de las 6:01 haya ido bien: su registro y `ops.alerta` de `lp_*`;
- que la cola de La Preferente haya pedido ≥ 4.000 páginas con el PC encendido;
- que Cataluña 2010-2025 vaya entrando como ediciones `origen = 'lapreferente'`.

**D3. Cada semana:** `node scripts/lapreferente/elige-fichas.mjs`, mirar el resumen y anotarlo. El ciclo ya lo aplica.

## 7. Bloque E — La web (encargo del 24/10: W1-W7). Es lo que se hace mientras corren B y C

- Rama `fase-c`, commit por etapa, todo lo de §1-§8 del encargo del 24/10.
- Hoy sólo está el primer commit de W1 (Next 16).
- Datos de verdad: **primero CyL** (es la que está al día). Las demás irán llegando con B2 y B5.

| Etapa | Qué, en una línea | Estado |
|---|---|---|
| E1 = W1 | Esqueleto común, caché por etiquetas, observabilidad, métricas de uso | pendiente (sólo Next 16 hecho) |
| E2 = W2 | Cuentas (Better Auth), primer administrador (David), 2FA | pendiente |
| E3 = W3 | Fichas públicas con Q1-Q9. **Incluye La Preferente (L7):** marca «Dato no oficial · La Preferente» cuando `core.competition_edition.origen = 'lapreferente'`, con enlace a `https://www.lapreferente.com/index.php?comp=<id>` (`codigo_externo` sin «lp»); y en `/partido/[id]`, si no hay `core.match_report` pero sí fila en `externo.acta_provisional_partido`, alineaciones y eventos de `externo.acta_provisional_alineacion` / `_evento` con el rótulo «Acta provisional (La Preferente) · no oficial». Cuando esté: `alter role facylf_lector set facylf.lp_publico = 'on'`, `FACYLF_LP_PUBLICO=true` en el `.env` de la proyección, reproyectar y reiniciar la web | pendiente |
| E4 = W4 | Rankings, Comparar, Ojeo, Árbitro | pendiente |
| E5 = W5 | Mi panel, avisos, Mi cuenta | pendiente |
| E6 = W6 | Panel de administración | pendiente |
| E7 = W7 | Estados, accesibilidad, móvil | pendiente |

W8 (canal de avisos) espera a David (§9). W9-W10, cuando estén W1-W7.

## 8. Bloque F — Calidad de datos (para los ratos de espera)

| # | Qué | Terminado cuando |
|---|---|---|
| F1 | `titular_en_dos_partidos_a_la_vez` = 321 | Causa (¿homónimos?, ¿partidos duplicados?, ¿error del lector?) con 10 ejemplos y el arreglo o la explicación |
| F2 | `casos_graves_abiertos` = 607 | Clasificados por tipo. Lo que sea nuestro, arreglado; lo de la fuente, marcado como revisado con motivo |
| F3 | `actas_a_revisar_7d` = 98,2 y `minutos_no_calculables` = 77,5 | Qué miden exactamente (definición en 0030/0032) y si son normales o señal de un lector roto |
| F4 | `marcadorDistintoDeGoles` (25/10) | Medido por federación tras B2, sin corregir nada a ciegas |

## 9. Tabla de seguimiento (ponla al día en cada sesión)

| Punto | Estado | Nota |
|---|---|---|
| A1 copia | pendiente | |
| A2 tareas | pendiente | |
| A3 mantenimiento | pendiente | |
| A4 hueco de La Preferente | pendiente | |
| B1 frescura | pendiente | |
| B2 importar todo | pendiente | |
| B3 importación diaria | pendiente | |
| B4 importador más rápido | pendiente | |
| B5 proyección (W0) | pendiente | |
| B6 RFEF | en curso | cola vacía, falta catálogo |
| C1 tabla cruzada | pendiente | |
| C2 actas por HTTP | pendiente | |
| C3 CLM | pendiente | |
| C4 Araba | pendiente | |
| C5 plazas del servidor | pendiente | |
| C6 Cataluña siempre en marcha | pendiente | |
| D1 primera pasada de La Preferente | pendiente | mañana |
| E1-E7 web | pendiente | |
| F1-F4 calidad | pendiente | |

**Orden para mañana:**
1. A1 → A2 → A3, la primera hora.
2. A4.
3. Lanzar B2 con 2026-27 y 2025-26 en segundo plano.
4. Mientras corre: B1 y E1.
5. Por la tarde: D1, revisar B2 y lanzar la siguiente tanda.
6. Por la noche: B5 de CyL.

Los días siguientes, el mismo patrón: siempre una importación o proyección corriendo y, en paralelo, la web o el bloque C.

## 10. Lo que decide David (no lo decidas tú; si un punto depende de esto, sigue con otro)

- El canal de avisos al móvil (Telegram o ntfy) y el correo de envío (`SMTP_URL`).
- Cargador nuevo para el servidor y la prueba de Wake-on-LAN en la BIOS.
- Abrir la web a Internet (no está previsto) y, antes, el correo de permiso a La Preferente.
- Borrar las personas huérfanas (D4: no).
- `git push`, unir a `main` y reescribir historia.
- Borrar `tmp\_to_delete` (dos ficheros temporales de Claude, ya sin uso): **David puede borrarlo cuando quiera**.
