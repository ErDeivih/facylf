# Cierre de CyL · auditoría de los dos canónicos y las dos colas

**Medido el 09/11/2026, entre las 17:00 y las 17:30 (Europe/Madrid), en la rama `fase-c`.**
Todo lo de este documento es lectura: canónicos (PC en el contenedor `facylf-postgres` y servidor por SSH), colas
(`node:sqlite` en `readOnly`) y los paquetes ya extraídos en `_traspaso`. No se ha escrito en ninguna base ni cola,
no se ha tocado ningún recolector ni contenedor, y no se ha hecho commit.

> **Aviso de foto móvil.** El canónico del PC está recibiendo importaciones mientras se escribe esto (equipo
> `operador-pc`): entre la primera pasada (17:05) y la última (17:30) ha pasado de **138 a 140** ediciones completas
> y los grupos a traer han bajado de 1.265 a 1.262. Las tablas de ediciones y grupos son de las **17:30**; las de
> tamaño, de las **17:10–17:25**; las colas, de las **17:02 (PC) y 17:16 (servidor)**. Para refrescar cualquier cifra:
> los `.sql` y `.mjs` de `tmp/auditoria-cierre-cyl/` (ver §9).

---

## 1. Corrección del reparto de temporadas (lo que cambia la lectura de los FALTAS)

El reparto **verificado en el código y en los ficheros de asignación** (`scripts/servidor/temporadas-asignadas-servidor.txt`,
`descargas-federacion/recolector-local/temporadas-asignadas.txt`, leído a las 17:09 de hoy) es:

| Máquina | Temporadas que recolecta |
|---|---|
| **Servidor** (8) | 2026-27, 2024-25, 2022-23, 2020-21, 2018-19, 2016-17, 2014-15, 2012-13 |
| **PC** (7) | 2025-26, 2023-24, 2021-22, 2019-20, 2017-18, 2015-16, 2013-14 |

Tres correcciones que los documentos de partida no recogen y que cambian por completo la interpretación:

1. **Las dos colas no son disjuntas.** Las dos conocen el catálogo de las 15 temporadas y las dos tienen datos de casi
   todas (la del PC conserva recolección antigua de temporadas que hoy son del servidor, y al revés). Lo que cambia
   es **quién sigue recolectando**: el reparto es de *trabajo futuro*, no de *datos*. Por eso «sin origen en la cola»
   en los FALTAS no se puede leer como «no existe»: hay que mirar la cola **de la máquina dueña** de esa temporada.
2. **El canónico del servidor no tiene 4 de sus 8 temporadas.** Tiene 259 ediciones de CyL, pero **0 de 2012-13,
   2014-15, 2016-17 y 2018-19**. Esas temporadas las ha recolectado el servidor y nunca las ha importado a su canónico;
   lo recolectado por él está **solo en su cola** (el PC tiene versiones **parciales** de 2016-17 y 2018-19, y de
   2012-13 y 2014-15 de la federación no tiene nada).
3. **2014-15 es el caso grave.** La única 2014-15 que hay en el canónico del PC son **3 ediciones de La Preferente**
   (códigos `lp5463`, `lp5464`, `lp5799`), completas pero sin actas de la federación. La 2014-15 de la federación
   —**58 competiciones, 358 grupos con datos, 27.090 partidos y 26.013 actas hechas**— **no está en ningún canónico**:
   solo en la cola del servidor. Es el mayor volumen de CyL en riesgo de perderse.

Los FALTAS (`FALTAS-POR-TEMPORADA.md` y sus hermanos) analizan **solo el canónico del PC y solo la cola del PC**, y
además no cubren 2012-13…2019-20. Sus cifras del canónico del PC se reproducen casi exactamente hoy (2020-21: 31/9;
2021-22: 66/12; 2022-23: 70/12; 2023-24: 83/24; 2025-26: 71/20; 2026-27: 56/1), salvo 2024-25, que allí era 79/19
y hoy es **79/20** porque las importaciones de hoy han cerrado una edición más. Para las temporadas del servidor sus
«faltas» mezclan datos del canónico del PC con trabajos abandonados de la cola del PC: no son la medida del trabajo
que queda, que está en la cola del servidor.

---

## 2. Tabla por temporada: los dos canónicos y la unión

Una edición está **completa** cuando todos sus `phase_group` tienen `ops.coverage_checkpoint.visibility_state='completa'`
y ningún checkpoint falta (la condición de `scripts/metricas-facylf.mjs`). La «unión» empareja por
(temporada, `competition_edition.codigo_externo`); **no hay ninguna edición en el servidor que no esté en el PC**
(0 solo-servidor), porque el PC importó en octubre los paquetes de las temporadas del servidor.

### A. Por temporada, cada canónico y la unión

| Temporada | Recolecta | Ed. PC | Compl. PC | Ed. serv. | Compl. serv. | Sólo PC | Sólo serv. | En los dos | PC más completa | Serv. más completa | Igual de incompletas | Completas en los dos | Unión | Completas en alguno | Incompletas en todos |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2012-13 | servidor | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 0 |
| 2013-14 | pc | 46 | 5 | 0 | 0 | 46 | 0 | 0 | 0 | 0 | 0 | 0 | 46 | 5 | 41 |
| 2014-15 | servidor | 3 | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 3 | 0 |
| 2015-16 | pc | 65 | 9 | 0 | 0 | 65 | 0 | 0 | 0 | 0 | 0 | 0 | 65 | 9 | 56 |
| 2016-17 | servidor | 58 | 6 | 0 | 0 | 58 | 0 | 0 | 0 | 0 | 0 | 0 | 58 | 6 | 52 |
| 2017-18 | pc | 60 | 8 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 | 0 | 60 | 8 | 52 |
| 2018-19 | servidor | 61 | 8 | 0 | 0 | 61 | 0 | 0 | 0 | 0 | 0 | 0 | 61 | 8 | 53 |
| 2019-20 | pc | 56 | 1 | 0 | 0 | 56 | 0 | 0 | 0 | 0 | 0 | 0 | 56 | 1 | 55 |
| 2020-21 | servidor+pc | 31 | 9 | 24 | 13 | 7 | 0 | 24 | 3 | 16 | 1 | 4 | 31 | 18 | 13 |
| 2021-22 | pc | 66 | 12 | 2 | 0 | 64 | 0 | 2 | 2 | 0 | 0 | 0 | 66 | 12 | 54 |
| 2022-23 | servidor | 70 | 12 | 35 | 23 | 35 | 0 | 35 | 7 | 16 | 3 | 9 | 70 | 26 | 44 |
| 2023-24 | pc | 83 | 24 | 33 | 32 | 50 | 0 | 33 | 1 | 14 | 0 | 18 | 83 | 38 | 45 |
| 2024-25 | servidor | 79 | 20 | 76 | 56 | 3 | 0 | 76 | 3 | 44 | 9 | 20 | 79 | 56 | 23 |
| 2025-26 | pc | 71 | 20 | 37 | 27 | 34 | 0 | 37 | 4 | 8 | 6 | 19 | 71 | 28 | 43 |
| 2026-27 | servidor | 56 | 1 | 52 | 1 | 4 | 0 | 52 | 29 | 4 | 18 | 1 | 56 | 1 | 55 |
| **Total** | — | **807** | **140** | **259** | **152** | **548** | **0** | **259** | **49** | **102** | **37** | **71** | **807** | **221** | **586** |

Lectura:

- **807 ediciones** de CyL en la unión = **773 de la federación** (códigos numéricos) + **34 de La Preferente**
  (códigos `lp…`, 19 completas). El canónico del servidor tiene **259, todas de la federación, y las 259 están
  también en el PC**: por ediciones, el PC es **superconjunto** (548 ediciones solo en el PC).
- **Completas en algún canónico: 221 (27,4 %). Incompletas en todos: 586 (72,6 %).**
- De las 259 que están en los dos, **el servidor está más completo en 102 y el PC en 49**; 71 están completas en los
  dos y 37 empatan como incompletas. Es decir: **ninguno de los dos canónicos puede presumir de estar al día**; los dos
  tienen cosas que el otro no tiene.
- En las temporadas del PC el servidor no aporta ediciones (solo tiene 2020-21 a 2026-27), pero **sí aporta grupos
  presentes y datos** (p. ej. 2023-24 en la cola del servidor: 6.996 partidos y 6.094 actas hechas de grupos que en el
  PC siguen incompletos). Y en las del servidor el PC conserva recolección antigua incompleta.

---

## 3. Ediciones incompletas en la unión (586) y su causa

Por cada edición incompleta en *ambos* canónicos se compara el canónico más avanzado con lo que la **cola de su máquina
dueña** ya tiene. Clasificación (una por edición):

| Causa | Significado | Qué pide |
|---|---|---|
| **a-importar** | La cola ya tiene actas/partidos que el canónico no enseña (la recolección va por delante) | **Importar**; no hace falta recolectar |
| **a-recolectar** | No hay datos nuevos que importar, pero **quedan trabajos pendientes** en la cola | Dejar trabajar al recolector |
| **b** | No hay trabajo y hay grupos `ausente_web` en la cola o trabajos `bloqueado` | **Identidad o calendario** (resolución manual) |
| **c** | Ni trabajo ni origen conocido en la cola | Probablemente **no publicado** en el portal; irreducible con las colas actuales |

### B. Ediciones incompletas en la unión, por temporada y causa

| Temporada | Incompletas | a-importar | a-recolectar | b | c | Partidos que faltan | Actas en cola sin importar | Jornadas pend. | Actas pend. | Calendarios pend. | Clasificaciones pend. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2013-14 | 41 | 36 | 0 | 0 | 5 | 6861 | 3687 | 921 | 0 | 110 | 110 |
| 2015-16 | 56 | 40 | 0 | 0 | 16 | 15.535 | 7430 | 1708 | 0 | 100 | 102 |
| 2016-17 | 52 | 30 | 0 | 2 | 20 | 10.279 | 6553 | 689 | 0 | 40 | 42 |
| 2017-18 | 52 | 33 | 0 | 5 | 14 | 12.311 | 6543 | 1205 | 0 | 56 | 58 |
| 2018-19 | 53 | 32 | 0 | 9 | 12 | 9973 | 7255 | 536 | 1 | 4 | 0 |
| 2019-20 | 55 | 37 | 1 | 5 | 12 | 21.960 | 4670 | 2125 | 0 | 82 | 84 |
| 2020-21 | 13 | 7 | 5 | 0 | 1 | 1744 | 323 | 1062 | 132 | 82 | 83 |
| 2021-22 | 54 | 4 | 31 | 1 | 18 | 9812 | 89 | 1991 | 0 | 66 | 68 |
| 2022-23 | 44 | 22 | 0 | 0 | 22 | 3351 | 2550 | 0 | 0 | 0 | 0 |
| 2023-24 | 45 | 0 | 38 | 0 | 7 | 4728 | 0 | 1008 | 0 | 65 | 67 |
| 2024-25 | 23 | 4 | 0 | 0 | 19 | 4830 | 155 | 0 | 0 | 0 | 0 |
| 2025-26 | 43 | 1 | 33 | 0 | 9 | 4630 | 1 | 1048 | 0 | 82 | 84 |
| 2026-27 | 55 | 54 | 0 | 0 | 1 | 32.030 | 4080 | 4716 | 163 | 0 | 193 |
| **Total** | **586** | **300** | **108** | **22** | **156** | **138.044** | **43.336** | **17.009** | **296** | **687** | **891** |
| *de las c: La Preferente* | 15 | — | — | — | — | — | — | — | — | — | — |

Reparto por máquina dueña del trabajo:

| | Incompletas | a-importar | a-recolectar | b | c |
|---|---:|---:|---:|---:|---:|
| Temporadas del **PC** (7) | 346 | **151** | 103 | 11 | 81 |
| Temporadas del **servidor** (8) | 240 | **149** | 5 | 11 | 75 |

De las 586, **480 están solo en el canónico del PC** y **106 en los dos** (ninguna solo en el servidor).

La diferencia que más importa: **151 de las 300 «a-importar» son de temporadas del PC** (2013-14: 36, 2015-16: 40,
2017-18: 33, 2019-20: 37, 2021-22: 4, 2025-26: 1): para ésas **no hay que traer nada de ninguna parte**, basta con pasar
el importador sobre la cola del propio PC. Las otras **149 necesitan el paquete del servidor**.

El listado **edición a edición** (las 586, con grupos completos/total de cada canónico, partidos que faltan, causa,
subcausa y trabajo pendiente por tipo) está en:

- `tmp/auditoria-cierre-cyl/ediciones-incompletas.csv` (587 líneas con cabecera).

### Lo que explica cada bloque

- **2014-15 no aparece en esta tabla y es el hueco mayor**: sus 58 competiciones de la federación no existen como
  edición en ningún canónico, así que no son «ediciones incompletas», son «ediciones que solo están en la cola». Lo
  mismo, sin datos, 2012-13 (22 competiciones catalogadas; 1 grupo con 2 partidos).
- **2026-27 es la temporada en curso**: 55 de sus 56 ediciones están incompletas por definición (la liga no ha
  terminado; el checkpoint no puede dar `completa`). Su causa a-importar significa «el canónico va por detrás de la
  recolección», no «hay un fallo»; su cota útil es terminar la temporada sin perder actas.
- **2023-24, 2025-26 y 2021-22 son recolección pendiente** (38 + 33 + 31 ediciones): la cola del PC tiene trabajo, y
  mientras el recolector avance no son irreducibles.
- **2024-25 y 2022-23**: casi todo «c» (19 y 22 ediciones). Son ediciones cuyos grupos están `presente` en la cola pero
  sin trabajo pendiente y sin datos que el canónico no tenga ya: la fuente no publica más (grupos de relleno, copas
  sin actas, fases que la federación no cargó).
- **Las 15 «c» de La Preferente** no son «imposibles»: su origen es La Preferente (paquetes `lapreferente/`), fuera de
  las dos colas de la federación. Se marcan aparte para no confundirlas con las 141 de la federación.
- **Las 22 «b»** (2019-20: 5, 2018-19: 9, 2017-18: 5, 2016-17: 2, 2021-22: 1) son las que necesitan **identidad o
  calendario** (grupos `ausente_web`, trabajos `bloqueado`): es el mismo tipo de caso que el PLAN-RECUPERACION describe
  para 2020-21 (Casco Viejo, Quintanar-Palacio…). La lista completa, para atacar de una en una:

| Temporada | Edición | Competición | Grupos completos | Partidos que faltan | Grupos `ausente_web` en la cola |
|---|---|---:|---:|---:|---:|
| 2021-22 | 10239 | Tercera Federación | 1/2 | 1 | 3 |
| 2019-20 | 7744 | 1ª División Provincial de Aficionados | 0/9 | 638 | 1 |
| 2019-20 | 7750 | 1ª División Provincial de Infantiles | 0/9 | 443 | 3 |
| 2019-20 | 7752 | 1ª División Provincial de Prebenjamines | 0/8 | 358 | 1 |
| 2019-20 | 7779 | 1ª División Provincial de Benjamines | 0/9 | 423 | 1 |
| 2019-20 | 7780 | 1ª División Provincial de Alevines | 0/9 | 422 | 1 |
| 2018-19 | 6407 | Copa Delegación 1ª Div. Provincial de Infantiles | 1/2 | 1 | 5 |
| 2018-19 | 6413 | Copa Delegación 1ª Div. Provincial de Alevines | 1/2 | 7 | 7 |
| 2018-19 | 6416 | 3ª División Provincial de Prebenjamines | 1/2 | 18 | 6 |
| 2018-19 | 6419 | Copa Delegación 1ª Div. Provincial de Cadetes | 1/3 | 3 | 3 |
| 2018-19 | 6420 | 2ª División Provincial de Alevines | 11/12 | 0 | 1 |
| 2018-19 | 6450 | Copa Delegación 1ª Div. Provincial de Benjamines | 1/2 | 7 | 8 |
| 2018-19 | 6451 | 2ª División Provincial de Benjamines | 7/11 | 48 | 3 |
| 2018-19 | 6462 | 1ª División Provincial de Juveniles | 4/8 | 59 | 1 |
| 2018-19 | 6474 | 2ª División Provincial de Infantiles | 4/7 | 47 | 2 |
| 2017-18 | 5229 | Copa Delegación 1ª Div. Provincial de Infantiles | 1/2 | 1 | 5 |
| 2017-18 | 5239 | Copa Delegación 1ª Div. Provincial de Alevines | 1/2 | 6 | 7 |
| 2017-18 | 5270 | Copa Delegación 1ª Div. Provincial de Benjamines | 1/2 | 1 | 8 |
| 2017-18 | 5272 | Copa Delegación 1ª Div. Provincial de Cadetes | 1/2 | 0 | 4 |
| 2017-18 | 5283 | 3ª División Provincial de Benjamines | 2/3 | 0 | 11 |
| 2016-17 | 3754 | 2ª División Provincial de Prebenjamines | 3/8 | 89 | 1 |
| 2016-17 | 3758 | 2ª División Provincial de Alevines | 9/11 | 12 | 3 |

---

## 4. Destino concreto de la consolidación: grupos a traer del servidor al PC

Para cada temporada del servidor se cruzan los **grupos con datos en la cola del servidor** (`grupos.estado='presente'`
y al menos un partido o un acta hecha) con el canónico del PC: se descartan los que ya están `completa` en el PC
(**no se reimporta lo que ya está**) y se listan los que **no existen** o están **incompletos**.

### C. Destino concreto: grupos de la cola del servidor que faltan o están incompletos en el canónico del PC

| Temporada | Grupos con datos en la cola del servidor | Ya completos en el PC | A traer | No existen en el PC | Incompletos en el PC | Ediciones afectadas | Partidos en cola | Actas hechas en cola | Trabajos pendientes en la cola del servidor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2012-13 | 1 | 0 | 1 | 1 | 0 | 1 | 2 | 1 | 0 |
| 2014-15 | 358 | 0 | 358 | 358 | 0 | 58 | 27.090 | 26.013 | 704 |
| 2016-17 | 286 | 144 | 142 | 0 | 142 | 52 | 13.288 | 13.067 | 763 |
| 2018-19 | 267 | 143 | 124 | 0 | 124 | 52 | 12.942 | 12.767 | 541 |
| 2020-21 | 331 | 177 | 154 | 0 | 154 | 21 | 4023 | 3610 | 0 |
| 2022-23 | 284 | 155 | 129 | 0 | 129 | 57 | 13.773 | 12.362 | 0 |
| 2024-25 | 288 | 171 | 117 | 0 | 117 | 58 | 11.628 | 10.595 | 0 |
| 2026-27 | 238 | 1 | 237 | 2 | 235 | 55 | 8509 | 7946 | 5088 |
| **Total** | **2053** | **791** | **1262** | **361** | **901** | **354** | **91.255** | **86.361** | **7096** |

- **1.262 grupos, 91.255 partidos, 86.361 actas hechas** que hoy no están aprovechadas en el canónico del PC
  (361 grupos no existen allí y 901 están incompletos).
- **791 grupos** de la cola del servidor ya están completos en el PC: reimportarlos sería trabajo tirado.
- **2014-15 primero**: 358 grupos y 26.013 actas que no están en ningún canónico. Es el único bloque **grande** que hoy
  solo existe en la cola (los otros «solo en cola» son 22 competiciones de 2012-13 sin datos y 1 edición suelta de
  2020-21 y otra de 2026-27).
- **2026-27**: 237 grupos; es la temporada en curso, se irá completando (y conviene ir trayéndola en tandas).
- Los **7.096 trabajos pendientes** de la cola del servidor para esos grupos son recolección suya; no bloquean la
  importación de lo ya recolectado.

Fichero para atacar la lista sin recalcular nada:

- `tmp/auditoria-cierre-cyl/grupos-a-traer.csv` (1.262 filas, una por grupo), columnas:
  `temporada;edicion_codigo;grupo_codigo;grupo_id_pc;grupo_id_servidor;estado_pc;partidos_en_cola;actas_hechas_en_cola;trabajos_pendientes_cola;motivo`.
  - `grupo_codigo` es el `codigo_externo` del grupo (el que entiende `scripts/claude/extrae-temporada-cola.mjs` como
    filtro de grupos).
  - `grupo_id_pc` es el `core.phase_group.id` **en el canónico del PC** (vacío cuando el grupo no existe allí).
  - `grupo_id_servidor` es el `core.phase_group.id` **en el canónico del servidor** (referencia; vacío si no está).
  - `motivo` = `no_existe_en_pc` (361) o `incompleto_en_pc_<visibility_state>` (901).

Uso con la vía ya existente del repo:

```powershell
# Opción A · la del script del repo: extrae la temporada ENTERA, la trae por scp y la importa grupo a grupo.
scripts\claude\trae-federacion-servidor.ps1 -Federacion castilla-leon -Temporadas 2014-15
# (con -SoloTraer deja el paquete en _traspaso sin importar; -Maximo limita las temporadas por pasada)

# Opción B · solo los grupos del CSV (ahorra ~la mitad de red): el extractor acepta una lista de grupos.
#   En el servidor: node scripts/claude/extrae-temporada-cola.mjs <cola-origen> <destino.sqlite> 2014-15 <grupo…>
#   Al PC por scp a _traspaso\; después: scripts\importar-temporada.ps1 -Federacion castilla-leon -Temporada 2014-15 -Paquete _traspaso\...
```

Recomendación de orden: **2014-15 → 2016-17 → 2018-19 → 2022-23 → 2024-25 → 2020-21 → 2026-27 (a tandas) → 2012-13
(nada que traer: 1 acta)**. El script de traída ya mide el servidor antes y después de cada temporada y para si no hay
margen; se deben respetar sus `-Maximo 4` y sus pausas (regla de David: el servidor no se sobrecarga).

---

## 5. Tamaño de CyL en cada canónico y tamaño de las colas

Tamaño total de cada base (medido, `pg_database_size`): **PC 38.476.977.855 B (36 GB según `pg_size_pretty`)** ·
**servidor 16.691.533.503 B (16 GB)**. Sólo una parte es CyL; el resto son las otras federaciones y, sobre todo, los
diarios del importador (`ops.batch_cambio`, que en el PC ocupa 7,65 GB y **no se traslada**).

### D. Tamaño de CyL por tabla (tabla + índices, MB)

Bytes repartidos por proporción de filas de CyL sobre las de la tabla entera (`pg_total_relation_size`); filas
«estimado» = proporción de partidos, no contadas (no se recorren las tablas de hechos enteras).

| Tabla | Filas CyL PC | MB PC | Filas CyL servidor | MB servidor | Nota |
|---|---:|---:|---:|---:|---|
| `core.appearance` | 2.849.814 | 1001.2 | 2.226.320 | 618.8 | estimado |
| `core.match_event` | 1.492.373 | 672.2 | 1.097.505 | 437.7 | estimado |
| `core.match_staff` | 852.698 | 249.3 | 375.435 | 94.5 | contado |
| `core.match` | 244.104 | 125.3 | 90.193 | 42.9 | contado |
| `core.match_report` | 227.394 | 87.9 | 87.911 | 30.3 | contado |
| `core.match_source` | 244.197 | 62.9 | 90.193 | 20.2 | contado |
| `core.person` | 268.014 | 57.0 | 202.898 | 44.8 | estimado |
| `core.person_name` | 278.451 | 50.2 | 198.912 | 38.9 | estimado |
| `core.match_official` | 132.610 | 30.2 | 79.846 | 15.5 | contado |
| `core.standing_snapshot` | 60.302 | 15.0 | 16.447 | 3.4 | contado |
| `core.team_entry` | 34.949 | 13.2 | 10.728 | 4.2 | contado |
| `core.matchday` | 71.920 | 11.8 | 21.232 | 3.5 | contado |
| `core.team_alias` | 12.746 | 3.2 | 4656 | 1.3 | contado |
| `core.team_season` | 9670 | 2.9 | 3282 | 1.0 | contado |
| `core.phase_group` | 3600 | 0.8 | 1063 | 0.3 | contado |
| `ops.coverage_checkpoint` | 3600 | 0.7 | 1063 | 0.2 | contado |
| **Total CyL** | **6.789.262** | **2384.9** | **4.509.401** | **1357.9** | datos solos: 782.7 / 440.6 MB |

Lo que hay que saber para planificar:

- **CyL ocupa ≈ 2,4 GB con índices en el canónico del PC (782,7 MB de datos) y ≈ 1,4 GB en el del servidor
  (440,6 MB de datos)**. Para trasladar solo hacen falta los datos: **~0,8 GB** desde el PC.
- El **70 % del peso con índices** (62,6 % de los datos) son dos tablas de hechos: `core.appearance` (1,0 GB en el PC)
  y `core.match_event` (0,7 GB). Sus filas son **estimadas** por proporción de partidos (no se han recorrido esas
  tablas enteras en el servidor, que está cargado); el resto de tablas son conteos exactos.
- `core.person`/`core.person_name` son tablas **compartidas entre federaciones**: la parte «de CyL» estimada por
  proporción es una cota; al trasladar habría que deduplicar por identidad, no copiar el 12,5 % a ciegas.
- **El canónico del servidor tiene un esquema anterior**: le faltan `core.match_esquema`, `core.squad_snapshot`,
  `core.squad_member`, `core.current_squad_member`, `core.reglamento_grupo` y `core.appearance_detalle` (comprobado en
  `information_schema`). Cualquier importación de filas del PC al servidor exige **migrar antes** el servidor.

### Colas

| Cola | Fichero | Competiciones | Grupos | Partidos | Actas | Trabajos | Tamaño |
|---|---|---:|---:|---:|---:|---:|---:|
| PC | `descargas-federacion/recolector-local/cola-v2.sqlite` | 852 | 3.773 | 167.581 | 164.019 | 234.904 | **2.519.446.848 B (2,52 GB)** + WAL 20,6 MB |
| Servidor | `/srv/data/facylf/descargas-federacion/recolector-local/cola-v2.sqlite` | 855 | 4.080 | 200.579 | 195.647 | 270.553 | **2.928.390.144 B (2,93 GB)** |

Las dos colas pesan más que todo CyL junto: son evidencia de ingesta (actas completas en JSON, con participaciones y
eventos) y por eso los paquetes de temporada pesan mucho más que las filas que producen en el canónico.

### E. Paquetes de temporada ya extraídos (medidos el 13/10/2026) y estimación a hoy

Los paquetes de las 7 temporadas del servidor ya existen en `_traspaso/federacion-<temporada>.sqlite`; se han abierto
en solo-lectura para medir su contenido.

| Temporada | Actas hechas hoy en la cola del servidor | Paquete medido (MB) | Estimación hoy (MB) | B/acta medido |
|---|---:|---:|---:|---:|
| 2012-13 | 1 | sin medir | 0.0 | — |
| 2014-15 | 26.013 | 64.6 | 297.5 | — |
| 2016-17 | 27.309 | 216.2 | 271.0 | 10.406 |
| 2018-19 | 27.034 | 205.8 | 272.6 | 10.573 |
| 2020-21 | 8461 | 44.0 | 67.0 | 8302 |
| 2022-23 | 33.275 | 300.2 | 381.1 | 12.008 |
| 2024-25 | 36.473 | 483.4 | 483.4 | 13.898 |
| 2026-27 | 7949 | 57.7 | 118.8 | 15.676 |
| **Total** | — | **1372.0** | **1891.4** | — |

Notas de honestidad:

- El paquete de **2014-15 está ilegible como SQLite** (64,6 MB, sin tablas legibles): parece una extracción
  interrumpida. Su tamaño está medido; su contenido, **sin medir**, y su estimación de hoy usa la media de B/acta.
- El de **2012-13 no existe**: apenas hay 2 partidos en la cola del servidor, no compensa.
- El paquete de **2024-25 cambió de tamaño durante esta auditoría** (383,9 MB → 483,4 MB): el PC lo está
  regenerando/importando en paralelo. Los tamaños de `_traspaso` son foto, no constante.

---

## 6. Coste estimado de las dos vías

Supuestos, todos medidos o documentados: **193–398 filas/s** de importación y **33.894 filas de canónico por cada 342
partidos** (≈ 99,1 filas/partido) según `docs/plataforma-web/IMPORTADOR-INFORME.md` §3 y §4 (medido el 14/09/2026);
**1,6 MB/s** de red (1,6 × 10^6 B/s) según el encargo. «Filas de canónico» = participaciones + eventos + técnicos +
personas + partidos + actas que produce el importador.

### F. Coste estimado de las dos vías

| Vía | Grupos/partidos | Filas de canónico | Red (MB) | Red a 1,6 MB/s | CPU (h, 193–398 filas/s) |
|---|---:|---:|---:|---:|---:|
| **1 · Extraer del servidor sus 8 temporadas, traerlas al PC e importarlas en el canónico del PC** (la del encargo) | 1262 grupos / 91.255 partidos | 9.043.851 | 1891.4 | 21 min | 6.3–13.0 h |
| **A · Reimportar en el servidor sus propias 8 temporadas desde su cola** | 172.627 partidos | 17.108.244 | 0 | 0 | 11.9–24.6 h |
| **2 · Exportar/importar filas del canónico del PC al del servidor** (COPY) | 6.789.262 filas de CyL | 6.789.262 | 782.7 (datos) | 9 min | ≥ 4.7–9.8 h (cota superior con ritmo del importador; COPY sin medir) |

Colas hoy: PC **2402.9 MB**, servidor **2792.7 MB**.

Desglose y límites:

- **Vía 1 (servidor → PC, la elegida por el encargo).** Red: **1.891,4 MB estimados hoy** (~21 min a 1,6 MB/s); con los
  paquetes ya medidos (1.372,0 MB, cota inferior porque son del 13/10) serían ~15 min. Se puede reducir a la mitad
  extrayendo **solo los grupos del CSV** (son el 52 % de las actas de esas temporadas), no la temporada entera.
  CPU: importar 9,04 M de filas en el PC, **6,3–13,0 h**. **Sin medir**: la CPU de la extracción en el servidor (el
  script la hace con `nice 19` y mide el servidor antes/después; no se ha ejecutado en esta auditoría).
- **Vía A (reimportar en el servidor lo suyo).** No cuesta red (el paquete se hace en la misma máquina), pero
  **no resuelve las 7 temporadas del PC** y cuesta **11,9–24,6 h** de CPU solo para las 8 del servidor. Además el
  canónico del servidor necesita migraciones y la web se quedaría coja de las temporadas del PC hasta la segunda fase.
- **Vía 2 (canónico PC → servidor, para publicar).** Red barata: **782,7 MB de datos** (~9 min a 1,6 MB/s), más
  reconstruir índices en el servidor (no incluido, sin medir). CPU de COPY **sin medir**; la cota superior con el ritmo
  del importador es 4,7–9,8 h. Requiere **migrar antes el esquema del servidor** (le faltan 6 tablas) y hacerlo en
  ventana de baja actividad (el servidor va con 4 núcleos y la recolección encima).

---

## 7. Recomendación

**Consolidar en el canónico del PC y publicar desde él** (es la vía que ya está escrita en
`scripts/claude/trae-federacion-servidor.ps1`: «la regla de David es tener TODA la información en un mismo sitio (el
canónico del PC)»), por este orden y por estas razones medidas:

1. **El PC ya es el canónico mayor**: 807 ediciones frente a 259; las 259 del servidor están todas en el PC y hay 548
   que solo están en el PC. Su esquema es el nuevo (el del servidor no tiene ni `squad_*` ni `reglamento_grupo`). Traer
   del servidor al PC no crea ediciones duplicadas ni exige migrar nada; hacerlo al revés exige migrar el servidor y
   exportar 548 ediciones.
2. **Traer las 8 temporadas del servidor con la lista de §4** (1.262 grupos; ~1,9 GB de red, 6,3–13,0 h de CPU del PC).
   Empezando por **2014-15** (358 grupos y 26.013 actas que hoy no están en ningún canónico), después 2016-17, 2018-19,
   2022-23, 2024-25, 2020-21, 2026-27 (a tandas) y 2012-13 (casi nada). No reimportar los 791 grupos que ya están
   completos en el PC.
3. **Importar en paralelo, sin red, las 151 ediciones «a-importar» de temporadas del PC** (2013-14, 2015-16, 2017-18,
   2019-20, 2021-22, 2025-26) con el importador normal sobre la cola del PC: no hace falta traer nada de fuera.
4. **Dejar seguir la recolección** de las 108 ediciones «a-recolectar» (2023-24: 38, 2025-26: 33, 2021-22: 31,
   2019-20: 1 y 5 de 2020-21 en el servidor). No hay que cambiar el ritmo de ningún recolector para esto.
5. **2020-21 no necesita más recolección en el PC**: la cola del servidor ya tiene 8.461 actas hechas y **0 trabajos
   pendientes** para esa temporada. Basta con traer sus 154 grupos (4.023 partidos). De hecho, el fichero de
   asignación del PC ya no incluye 2020-21 (leído a las 17:09 de hoy), así que el plan de recuperación de 2020-21
   del PLAN-RECUPERACION-2020-2021.md está superado por esta vía.
6. **Publicar**: cuando el PC esté consolidado, refrescar el canónico del servidor desde el PC **solo con CyL**
   (~0,8 GB de datos, ~9 min de red; CPU de COPY sin medir) en ventana de baja actividad, y **migrar antes** el
   esquema del servidor. No volcar la base entera: son 36 GB y la mayor parte no es CyL.
7. **Temporada en curso (2026-27)**: no perseguir «completa» hasta que termine; sí ir trayendo sus 237 grupos en tandas
   para que la web no pierda actas.

Si el objetivo fuera que **el canónico que sirve la web (el del servidor) sea el único**, la vía para llegar es la
**2** de §6 (exportar de CyL del PC e importar en el servidor): red barata (~0,8 GB de datos) pero **exige migrar antes
el esquema del servidor** y su CPU de COPY está **sin medir**. Mi recomendación sigue siendo **consolidar en el PC
primero** —es donde está el 100 % de las ediciones y el esquema nuevo— y **publicar después** desde él; hacerlo al revés
duplicaría trabajo (traer al servidor 548 ediciones que ya están en el PC, con migraciones por medio).

### Lo que es irreducible (o casi)

- **178 de las 586 ediciones incompletas (30,4 %)** no se arreglan con las colas actuales: **22 necesitan identidad o
  calendario** (causa b) y **156 no tienen origen conocido** (causa c), de las cuales 141 son de la federación
  (probablemente no publicadas: grupos de relleno, copas sin actas, fases no cargadas) y **15 son de La Preferente**
  (su origen es el otro proyecto de importación, no las colas de la federación).
- **2026-27**: 55 ediciones incompletas es el estado normal de una temporada en curso; solo será «irreducible» si el
  portal deja de publicar jornadas antes de terminar.
- Lo demás **sí es recuperable**: 300 «a-importar» (151 ya en la cola del PC, 149 en la del servidor) + 108
  «a-recolectar». Techo teórico, si cada importación aportara todo lo que la cola ya tiene: **521 ediciones completas
  (64,6 %)**; en la práctica será menos, porque 2026-27 está en curso y algún grupo seguirá incompleto aunque se
  importe.

---

## 8. Estado de partida verificado

Cifras para citar tal cual (foto del 09/11/2026, 17:30; el canónico del PC sigue importando):

1. El canónico del PC tiene **807 ediciones de CyL** (773 de la federación + 34 de La Preferente); **140 completas**.
2. El canónico del servidor tiene **259 ediciones de CyL**, todas de la federación; **152 completas**.
3. **Las 259 del servidor están también en el PC** (0 solo-servidor; 548 solo en el PC): por ediciones, el PC es
   superconjunto.
4. El canónico del servidor **no tiene ninguna edición de 2012-13, 2014-15, 2016-17 ni 2018-19**, aunque las recolecta:
   lo recolectado por él está solo en su cola (el PC tiene versiones parciales de 2016-17 y 2018-19, y de 2012-13 y
   2014-15 de la federación, nada).
5. En la unión hay **221 ediciones completas (27,4 %)** y **586 incompletas en todos los canónicos (72,6 %)**.
6. De las 586: **300 solo necesitan importación** (151 de ellas de la cola del propio PC), **108 recolección**,
   **22 identidad/calendario** y **156 no tienen origen conocido** (141 federación + 15 La Preferente).
7. Faltan **138.044 partidos** en las ediciones incompletas; hay **43.336 actas ya recolectadas sin importar** y
   **17.009 jornadas pendientes** en las colas.
8. **2014-15 es el hueco mayor**: 58 competiciones y **358 grupos con 26.013 actas hechas** que no están en ningún
   canónico; el PC solo tiene 3 ediciones de La Preferente de esa temporada.
9. Para completar el PC desde el servidor hay que traer **1.262 grupos, 91.255 partidos y 86.361 actas**; los otros
   **791 grupos con datos** de la cola del servidor ya están completos en el PC y no se reimportan.
10. CyL ocupa **2.384,9 MB con índices en el PC (782,7 MB de datos, 6.789.262 filas)** y **1.357,9 MB en el servidor
    (440,6 MB de datos, 4.509.401 filas)**.
11. Las colas pesan **2,52 GB (PC)** y **2,93 GB (servidor)**; juntas, más que todo CyL.
12. Traer y reimportar las temporadas del servidor en el PC cuesta **~1,9 GB de red (~21 min a 1,6 MB/s) y 6,3–13,0 h
    de CPU**; publicar después cuesta **~0,8 GB de datos (~9 min)** más migrar el esquema del servidor.
13. **2020-21 ya está recogido en el servidor** (8.461 actas, 0 trabajos pendientes): no hace falta seguir
    recolectándolo en el PC; basta importar sus 154 grupos.
14. El canónico del PC avanzó durante la propia auditoría (138 → 140 completas en 25 minutos): las cifras son foto y la
    medición es repetible con lo que queda en `tmp/auditoria-cierre-cyl/`.

---

## 9. Reproducibilidad y límites

Todo lo usado está en `tmp/auditoria-cierre-cyl/` (sólo-lectura sobre las fuentes; único sitio escrito, junto con este
documento):

| Fichero | Para qué |
|---|---|
| `01-esquema-nucleo.sql` | tablas y columnas de `core`/`ops` y de `ops.coverage_checkpoint` |
| `02-foto-temporada.sql` | ediciones/completas por temporada y estados de cobertura (se ejecuta igual en las dos máquinas) |
| `03-ediciones-detalle.sql` / `04-grupos-detalle.sql` | volcados CSV por edición y por grupo (`pc-ediciones.csv`, `srv-ediciones.csv`, `pc-grupos.csv`, `srv-grupos.csv`) |
| `05a-tamanos-tablas.sql` | `reltuples` y `pg_total_relation_size` por tabla (bytes exactos, sin recorrer nada) |
| `05b-filas-cyl.sql` / `05b-filas-cyl-servidor.sql` | filas de CyL por tabla navegando índices (sin recorrer tablas de hechos; el del servidor evita las tablas que allí no existen) |
| `esquema-cola-pc.mjs` | esquema de la cola v2 |
| `sondeo-cola.mjs` | sondeo de una cola (tamaño, catálogo, grupos con datos, trabajos) — `cola-pc.json`, `cola-servidor.json` |
| `analiza.mjs` | une canónicos + colas: tablas A/B/C, `analisis.json`, `ediciones-incompletas.csv`, `grupos-a-traer.csv` |
| `mide-paquetes.mjs` | mide los paquetes de `_traspaso` (filas y bytes) — `paquetes.json` |
| `coste.mjs` | tamaño de CyL por tabla y coste de las vías — `coste.json` |
| `genera-tablas.mjs` | genera `tablas.md` (las tablas de este documento, sin copiar a mano) |

Cómo repetir (PowerShell 5.1; la contraseña no se imprime, se carga con `process.loadEnvFile('.env')`):

```powershell
# canónico del PC (contenedor facylf-postgres, 127.0.0.1:5433)
Get-Content tmp\auditoria-cierre-cyl\02-foto-temporada.sql -Raw | docker exec -i facylf-postgres psql -U facylf_publicador -d facylf -f -
# canónico del servidor
Get-Content tmp\auditoria-cierre-cyl\02-foto-temporada.sql -Raw | ssh servidor "docker exec -i facylf-postgres psql -U facylf_admin -d facylf -f -"
# colas
node tmp\auditoria-cierre-cyl\sondeo-cola.mjs "F:\Proyectos\facylf\descargas-federacion\recolector-local\cola-v2.sqlite" pc tmp\auditoria-cierre-cyl\cola-pc.json
node tmp\auditoria-cierre-cyl\analiza.mjs; node tmp\auditoria-cierre-cyl\coste.mjs; node tmp\auditoria-cierre-cyl\genera-tablas.mjs
```

Límites declarados:

- **El servidor está cargado** (4 núcleos con la recolección): sus consultas fueron cortas, de sólo lectura, con
  `statement_timeout` y sin recorrer tablas de hechos. `core.appearance`, `core.match_event`, `core.person` y
  `core.person_name` están **estimadas por proporción de partidos**, no contadas (marcadas «estimado»).
- **CPU de COPY y de la extracción del paquete en el servidor: sin medir** (no se ha ejecutado ninguna de las dos vías;
  sólo se ha leído). El coste de CPU se da con el ritmo medido del importador (193–398 filas/s).
- **1,6 MB/s** es la hipótesis del encargo (1,6 × 10^6 B/s), no una medición de esta red.
- El paquete de **2014-15 no es legible** y el de 2024-25 **cambió durante la auditoría** (§5): los tamaños de
  `_traspaso` son foto y pueden estar en movimiento.
- El canónico del PC **está cambiando ahora mismo**: las cifras de este documento son la foto de las 17:30 y se repiten
  con los scripts de arriba.
