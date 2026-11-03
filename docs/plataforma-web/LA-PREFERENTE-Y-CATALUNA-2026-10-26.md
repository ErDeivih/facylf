# La Preferente terminada (L2-L7) y Cataluña entera — 26/10/2026

> Claude, 26/10/2026, 17:00. Revisa lo que hizo DeepSeek el 26/10 (bloque de las 16:15 en `ESTADO-DEEPSEEK.md`) y
> termina lo que quedaba de `LA-PREFERENTE-PLAN-2026-10-25.md`. **Sin commits.** Las migraciones nuevas (0052, 0053)
> están escritas y probadas en una copia, **no aplicadas** en la base real.

## 1. Lo que hay hoy (medido a las 15:44-15:54 con las peticiones 219 y 220)

| Qué | Dato | Lectura |
|---|---|---|
| Docker y `facylf-postgres` | arriba, 19 h, sano | — |
| Migraciones | **0051 sí; 0052 y 0053 no** | hay que aplicarlas (§4, paso 1) |
| `externo.*` en la base real | 0 filas | normal: todavía no hay calendarios leídos (y sin 0052, el publicador no tiene permiso) |
| Cola de `lapreferente-federado` | 387 peticiones; 324 páginas de región y **21.699 calendarios** encolados; 0 registros | va por las regiones (prioridad 5-6); los calendarios empiezan ahora |
| Calendarios por temporada | 722 (2010-11) … 2.364 (2024-25), 2.469 (2025-26), 1.716 (2026-27) | toda España, todas las categorías salvo baloncesto |
| Ritmo de LP | ~7,8 s por página (199 en 26 min) | con el PC ~10 h/día, **~4.600 páginas/día** |
| Proceso **viejo** `lapreferente` | **sigue vivo** (PID 15316) | DeepSeek lo paró, pero el supervisor lo relanzó: hace falta `scripts\multideporte\reiniciar-multideporte.ps1` (§4, paso 2) |
| Cataluña 2025-26 (FCF) | 26.988 actas hechas, **111.896 pendientes**, 4.834 sin datos | 3.613 actas en 24 h ⇒ **~31 días** sólo en el PC |
| Cataluña 2026-27 (FCF) | 15.854 hechas, 7.595 pendientes | ~2 días |
| Memoria libre del PC | 7,7 GB de 31,9 | hay margen |

## 2. Lo hecho hoy

### La tubería La Preferente → canónico, probada de punta a punta

Probada en una copia (PostgreSQL 16 con 0001-0053) con una cola de LP de prueba: una competición de CyL con su URL de
federación y una de Cataluña 2018-19 sin URL, con ficha.

1. **`scripts/lapreferente/a-externo.mjs`** (L2): cola de `lapreferente-federado` → `externo.lp_*`.
   - **Por tandas** de 300 competiciones, con dos cursores ordenados (`iterate` de node:sqlite). Con el histórico
     serán ~22.000 calendarios y millones de partidos: cargarlo entero agotaría la RAM.
   - **Incremental**: sólo lo que ha cambiado desde la última pasada (calendario, partidos o fichas), con 1 h de
     margen. `--todo` lo rehace entero; `--seco` no escribe.
   - **Da de alta las federaciones que falten** en `core.federation`, como el importador (buscar primero, crear sólo
     si falta).
   - **Tipo de gol** (normal, penalti, propia puerta) y **lado** de cada gol. El lado sale del marcador parcial que LP
     pone en cada gol, no del encabezado «GOLEADORES equipo».
2. **`scripts/lapreferente/empareja.mjs`** (L3a): cada competición de LP con su grupo de la federación.
   - Por **código exacto** cuando LP trae la URL de la federación (PNFG, iSquad, FCF, RFEF).
   - Si no, por **equipos y marcadores** entre los 3 grupos más parecidos.
   - Arreglos de hoy:
     - las diferencias de marcador se guardan (antes quedaban vacías);
     - un emparejado por código ya no se da por «dudoso» porque la federación vaya atrasada;
     - los cruces repetidos (grupos a 3-4 vueltas) se casan por orden de jornada.
   - Marca `reemplazada_por` en una edición de LP en cuanto la federación cubre ese grupo.
3. **`scripts/lapreferente/cola-lp.mjs`** (L3b): lo `sin_contraparte` va a una cola SQLite con el formato de
   recolector-local, competición a competición. Todos los códigos llevan «lp» delante.
   - Se importa con el importador de siempre y `FACYLF_ORIGEN=lapreferente`.
   - `catalogo.ts` exige esa variable para códigos `lp…` y la rechaza sin ella; **probado**.
   - `importar-temporada.ps1` ya no rechaza el paquete de LP por haber uno «más nuevo» de la federación.
4. **Comprobado en la copia**:

   | Comprobación | Resultado |
   |---|---|
   | CyL, emparejado por código | ✓, con su único marcador distinto apuntado |
   | Cataluña 2018-19 | importada con `origen = 'lapreferente'`: 12 partidos, 1 acta, 6 alineaciones, 7 eventos |
   | Mismo grupo importado como si viniera de la FCF | la edición de LP queda con `reemplazada_por` |
   | Pruebas de `scripts/lapreferente/` y del adaptador | **17 en verde** |
   | Canónico | **207 de 208** (la que falla son las «muestras de oro», que no estaban en la copia) |

5. **`scripts/lapreferente/ciclo-lapreferente.ps1`**: hace los cuatro pasos de una vez, por federación y temporadas:
   a-externo, empareja, cola-lp + importación, y vigía.

### L5 · Vigía

**`scripts/lapreferente/vigia.mjs`** hace tres chequeos (área «calidad» del vigía de la plataforma; abren y cierran
alertas en `ops.alerta`):

| Chequeo | Qué mira | Avisa cuando… |
|---|---|---|
| `lp_resultados_que_faltan` | Partidos de grupos emparejados con resultado en LP hace > 3 días y sin resultado en el canónico. Es el caso de Araba. | hay 5 o más |
| `lp_marcadores_distintos` | Grupos con menos del 95 % de marcadores iguales | hay alguno |
| `lp_emparejados_dudosos` | Emparejados que no son seguros | hay alguno |

- Enganchado en `scripts/vigilancia-plataforma.mjs`:
  - **una vez por hora**, porque recorre `externo.lp_partido`;
  - con import dinámico y `try`: si algo falla, el vigía sigue.
- Probado en la copia: quitando 6 resultados de la federación, avisa de esos 6.

### L7 · Fuera de la web mientras David no diga lo contrario (D2)

- **Migración 0053**: seguridad por filas en `core.competition_edition` **sólo para `facylf_lector`**, y por tanto
  para la web y para `facylf_app`, que lo hereda.
  - La web no ve nunca una edición reemplazada.
  - Tampoco ve las de LP, salvo con `facylf.lp_publico = on`.
  - El publicador, la proyección y el administrador ven todo.
  - Así no hay que tocar las 46 consultas de la web: todas pasan por la edición.
  - Probado con los tres roles.
- **`scripts/proyectar-lectura.mjs`** no proyecta los grupos de esas ediciones (búsqueda, carreras, ojeo) salvo con
  `FACYLF_LP_PUBLICO=true`.
- **Para publicar** (si David dice sí):
  1. `alter role facylf_lector set facylf.lp_publico = 'on'` y reiniciar la web;
  2. `FACYLF_LP_PUBLICO=true` y reproyectar;
  3. que la web ponga «Dato no oficial (La Preferente)» en edición, partido y acta. Esto queda para DeepSeek: la columna
     es `core.competition_edition.origen`.

### El adaptador, más fino

- **Fichas de Cataluña sólo hasta 2024-25** (`lapreferente-fichas.json`: `"hasta": "2024-25"`). 2025-26 y 2026-27 las
  da la FCF con actas: no se piden dos veces.
- Dentro de las fichas, **de la temporada más reciente a la más vieja** (prioridad 62 → 76).
- **El histórico de calendarios de Cataluña, primero** (`"calendarios_primero": [9]`, prioridad 15 frente a 20):
  - La página de una semilla dice `IDccaa 0`, así que la comunidad se reconoce por las etiquetas de sus grupos.
    Medido hoy: la semilla 22365 trae «Primera Catalana | Segona Catalana | …».
  - Para los 19.983 calendarios ya encolados, `scripts/lapreferente/prioriza-cola.mjs --aplica` hace releer las 324
    páginas de región (~40 min), y el motor se queda con la prioridad menor.

## 3. Cataluña entera: el plan

| Tramo | Fuente | Qué da | Cuándo (PC ~10 h/día) |
|---|---|---|---|
| **2026-27** | FCF (ya corre) | resultados y actas | ~2 días para ponerse al día; después, en vivo |
| **2025-26** | FCF (ya corre) | 111.896 actas pendientes | **~31 días** en el PC · ~13 días si el recolector de Cataluña pasa al servidor (24 h) |
| **2010-11 → 2024-25** | **La Preferente** (calendarios) | resultados y clasificaciones de todas las categorías (la FCF no tiene histórico) | ~5.600 calendarios catalanes ⇒ **~1-2 días** desde que se aplique `prioriza-cola` |
| **2019-20 → 2024-25** (y antes, lo que haya) | La Preferente (fichas) | alineaciones, goles, tarjetas (en Cataluña LP no publica cambios) | ~150.000-250.000 fichas ⇒ **meses en el PC**; 25-40 días en el servidor |

- **El cuello de botella es el horario del PC**, no las webs. FCF y LP son webs distintas, así que pueden ir a la
  vez, cada una a su ritmo.
- **D6 (decisión de David):** pasar el recolector de Cataluña (FCF) y/o `lapreferente-federado` al servidor 24 h, como
  se hará con CyL hacia el 30/10. Antes hay que medir la carga del servidor: con 16 recolectores estaba a carga 14.
  - Recomendación: **primero CyL** (ya decidido, D1). Después, **LP** al servidor: es un solo carril y no usa
    navegador. Cataluña-FCF se queda en el PC hasta ver cómo aguanta el servidor.
- Las fichas de LP de 2025-26 **no** aceleran las actas de la FCF: el diseño sólo lleva al canónico lo que la
  federación no tiene.
  - Meter actas de LP «provisionales» en grupos que sí son de la federación es otro diseño (duplicados, menores,
    sustitución posterior). **No se ha hecho**: si David lo quiere, es un encargo aparte.

## 4. Encargo para DeepSeek (en este orden)

1. **Aplicar 0052 y 0053**: `pnpm db:migrar`.
   - Comprobar:
     - `has_schema_privilege('facylf_publicador','externo','USAGE')` = t;
     - existe la política `web_sin_la_preferente`;
     - la web sigue enseñando lo mismo: hoy no hay ninguna edición de LP.
2. **Parar el `lapreferente` viejo**: `scripts\multideporte\reiniciar-multideporte.ps1`.
   - Comprobar que en `Win32_Process` sólo queda `--adaptador lapreferente-federado`.
3. **Adelantar el histórico de Cataluña**, cuando el proceso de `lapreferente-federado` se haya relanzado con el código
   de hoy (lo hace solo tras cada `--max 200`; si hay duda, después del paso 2):
   - `node scripts\lapreferente\prioriza-cola.mjs` (cuenta);
   - después, `node scripts\lapreferente\prioriza-cola.mjs --aplica`.
4. **Pruebas**: `node --test scripts/lapreferente/lapreferente.test.mjs scripts/lib/empareja-lapreferente.test.mjs scripts/multideporte/adaptadores/lapreferente-federado.test.mjs` (17 en verde).
5. **Cuando haya calendarios** (a partir de mañana), una vez al día y fuera de las horas de David:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lapreferente\ciclo-lapreferente.ps1 `
     -Federacion cataluna -Temporadas 2010-11,2011-12,2012-13,2013-14,2014-15,2015-16,2016-17,2017-18,2018-19,2019-20,2020-21,2021-22,2022-23,2023-24,2024-25
   ```
   - Para las demás federaciones, primero `-SoloEmparejar`, para ver cuánto queda `sin_contraparte`.
   - Después, sus temporadas sin datos de la federación (las de `cobertura-federaciones`).
   - Comprobar en Cataluña 2018-19:
     - aparecen ediciones con `origen = 'lapreferente'`;
     - ninguna edición de la federación duplicada;
     - `vigia.mjs` sin `lp_marcadores_distintos` disparatados.
6. **L7 en la web** (sólo si David dice sí a publicar):
   - marca «Dato no oficial (La Preferente)» en edición, partido y acta, con enlace a LP;
   - luego `alter role` + `FACYLF_LP_PUBLICO=true` (§2, L7).
7. **L6** (`persona_grupo` con el `J{id}` de LP como evidencia) queda para después: no bloquea nada.

## 5. Decisiones de David

| # | Pregunta | Por defecto |
|---|---|---|
| D2 | ¿Publicar lo que sólo está en LP, marcado como no oficial? | **No** (está todo preparado para un sí) |
| D5 | ¿Enviar el correo de permiso a LP? (borrador en `ENCARGO-DEEPSEEK-2026-10-25.md`) | No se envía nada |
| D6 | ¿LP y/o Cataluña-FCF al servidor 24 h? | LP sí, tras el cambio de CyL; Cataluña-FCF, no por ahora |
| D7 | ¿Actas «provisionales» de LP en grupos que la FCF ya tiene, mientras llegan las suyas? | No (es otro diseño) |

## 6. Ficheros de hoy

- **Nuevos:**
  - `scripts/lapreferente/vigia.mjs`
  - `scripts/lapreferente/prioriza-cola.mjs`
  - `scripts/lapreferente/ciclo-lapreferente.ps1`
  - `scripts/lapreferente/lapreferente.test.mjs`
  - `infra/migraciones/0053-la-preferente-fuera-de-la-web.sql`
- **Cambiados:**
  - `scripts/lapreferente/a-externo.mjs`, `empareja.mjs` y `cola-lp.mjs`
  - `scripts/lib/empareja-lapreferente.mjs`
  - `infra/migraciones/0052-…sql` (subtipo de gol; **no aplicada todavía**, así que se puede cambiar)
  - `scripts/multideporte/adaptadores/lapreferente-federado.mjs`
  - `scripts/multideporte/lapreferente-fichas.json`
  - `scripts/importar-temporada.ps1`
  - `scripts/proyectar-lectura.mjs`
  - `scripts/vigilancia-plataforma.mjs`
