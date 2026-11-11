# Caso Fondo Popular · de las fuentes federativas al canónico

Documento de portfolio para un perfil de BI: **qué datos existen, cómo se convierten en un modelo consultable, cuánto
está cubierto de verdad y con qué regla de calidad se decide que un dato «vale»**.

Cifras de referencia (auditoría del **09/11/2026**, que es la base con la que se cerró CyL): **807 ediciones** de
Castilla y León, **221 completas (27,4 %)** y 586 incompletas (72,6 %). Después, al cerrar 2014-15, el universo
creció a **867 ediciones** con **206 completas (23,8 %)**; el porcentaje baja porque entran 58 ediciones nuevas que
antes no estaban en el canónico. Las dos cifras son ciertas y miden cosas distintas: la primera compara la misma
base, la segunda es la foto de hoy.

## 1 · Fuentes federativas

| Fuente | Qué aporta | Uso en el canónico |
|---|---|---|
| Portal de la **Real Federación de Castilla y León** (rfcylf.es) | calendarios, resultados, clasificaciones, índices de jornadas y actas | fuente principal de la recolección |
| **La Preferente** | competiciones provinciales y fichas de equipo que la federación no publica con detalle | complemento (34 ediciones de CyL) |
| **Actas** (HTML/PDF por partido) | alineaciones, goles, tarjetas, cambios, técnicos, árbitros, campo | eventos y participaciones del modelo |
| **Paquetes de temporada** extraídos del servidor | temporadas históricas ya recolectadas | importación por lote en el PC |
| **Cola propia** (SQLite) | estado de cada petición: qué falta, qué se aplazó, qué falló | evidencia de ingesta, no se publica |

La instancia es **privada**: no se publica ningún dato sin decisión explícita y revisión de seguridad.

## 2 · Modelo canónico (PostgreSQL)

El canónico separa **evidencia** de **modelo** y de **producto**:

- `source` · lo que se descargó, con su huella y su estado (incluye la cola local y los paquetes).
- `core` · entidades de negocio con identidad contextual:
  `federation`, `club`, `team_season`, `team_entry`, `competition`, `competition_edition`, `phase`, `phase_group`,
  `matchday`, `match`, `match_report`, `appearance`, `event`, `person`, `official`.
- `analytics` · derivados: nombres cortos de equipo, agregados por grupo.
- `ops` · operación: `coverage_checkpoint` (qué tiene cada grupo y si es visible/completa), colas y vigilancia.
- `app` · cuentas, preferencias y favoritos de la web.

Reglas de identidad que respeta el modelo: club ≠ equipo-temporada ≠ inscripción en competición; la identidad externa
siempre lleva federación y contexto (nombre igual no implica persona igual).

## 3 · Cobertura por temporada

`ops.coverage_checkpoint` guarda, por grupo: jornadas esperadas/descubiertas/cerradas, partidos esperados/conocidos/
con resultado, actas enlazadas/disponibles/parseadas/correctas, y un `visibility_state`
(`completa`, `verificada_hasta_jornada`, `parcial_privada`, `oculta`).

**Definición de «edición completa»**: todos sus grupos en `completa`. No se redondea ni se supone: si un grupo no
llega, la edición no cuenta.

Foto de hoy (867 ediciones de CyL):

| Temporada | Completas / ediciones | % |
|---|---:|---:|
| 2026-27 | 1 / 57 | 1,8 % |
| 2025-26 | 20 / 71 | 28,2 % |
| 2024-25 | 41 / 79 | 51,9 % |
| 2023-24 | 24 / 83 | 28,9 % |
| 2022-23 | 32 / 70 | 45,7 % |
| 2021-22 | 12 / 66 | 18,2 % |
| 2020-21 | 16 / 31 | 51,6 % |
| 2019-20 | 1 / 56 | 1,8 % |
| 2018-19 | 9 / 61 | 14,8 % |
| 2017-18 | 10 / 60 | 16,7 % |
| 2016-17 | 6 / 58 | 10,3 % |
| 2015-16 | 9 / 65 | 13,8 % |
| 2014-15 | 18 / 61 | 29,5 % |
| 2013-14 | 5 / 46 | 10,9 % |
| 2012-13 | 2 / 3 | 66,7 % |
| **Total** | **206 / 867** | **23,8 %** |

Base de la auditoría del 09/11 (807 ediciones): **221 completas = 27,4 %**. Techo teórico con todo lo recuperable:
**521 de 807 (64,6 %)**; el resto son ediciones sin origen identificable (156) o con problemas de identidad (22), que
no se pueden inventar.

## 4 · Regla de calidad (lo que decide que un dato «vale»)

1. **Desconocido ≠ 0.** Un partido sin marcador se publica «—», no 0-0; un acta sin árbitro queda «sin árbitro», no
   se rellena.
2. **Validación del lote contra el canónico.** Antes de escribir, se comparan partidos, resultados, actas analizadas,
   participaciones, eventos, técnicos y árbitros. Si el origen trae **menos** que el canónico, la unidad se **aparta**
   (no se degrada el canónico) y se apunta el motivo.
3. **Idempotencia.** Reimportar no duplica: la importación es por grupos y actualiza, no inserta a ciegas.
4. **Evidencia y huella.** Cada descarga conserva su hash y su estado; un acta que no cuadra con su calendario se
   aparta con aviso (`acta_apartada_por_no_cuadrar`).
5. **Codificación comprobada.** Se detectan dobles codificaciones y caracteres de reemplazo antes de publicar
   (`scripts/lib/codificacion.mjs`); CyL está limpia y los problemas globales se documentan aparte.
6. **Lo que no se puede cerrar, se dice.** Las ediciones sin origen o con identidad dudosa están contadas y
   documentadas; no se rellenan para engordar el porcentaje.


### Reglas de coherencia aplicadas (panel de calidad)

Además de la validación de la importación, el canónico se audita con tres reglas calculadas **desde los partidos**
de cada grupo:

| Regla | Qué detecta | Descuadre |
|---|---|---|
| PJ = V + E + D | partidos jugados que no cuadran con los resultados | `descuadre_pj` |
| puntos = 3·V + E | puntuación inventada o mal sumada | `descuadre_puntos` |
| Σ goles a favor = Σ goles en contra | goles perdidos o duplicados | `descuadre_goles` |

Se ejecuta con `scripts/claude/panel-calidad.ps1 -Temporada <temporada>`, que cuenta los grupos **OK/KO** y deja el
detalle en JSON. Medido el 11/11/2026: **2026-27 · 260 grupos, 260 OK, 0 KO** y **2018-19 · 507 grupos, 507 OK,
0 KO**. En las tres competiciones principales los tres descuadres dan **0** (grupos 44, 2939 y 3947).

Si un grupo tuviera descuadre, la ficha **no publica la tabla como oficial**: muestra el aviso de calidad y la tabla
calculada. Y si la tabla oficial de la federación no coincide con los resultados, la ficha la marca **«por conciliar»**
con el motivo (por ejemplo: «la federación publicó su tabla de la jornada 1 y los resultados llegan a la 7»), en vez
de enseñar dos cifras que se contradicen.


### Panel de calidad en la ficha (lo que ve el aficionado)

La ficha de competición enseña las reglas **en la propia página**, no solo en un informe: actas, última
actualización y el resultado de cada regla (OK/KO). Ejemplo real del grupo 2939 (1ª Div. Provincial Juveniles ·
Primera-Salamanca, jornada 7 de 26):

| Dato | Valor |
|---|---|
| Actas | **41/48 (85 %)** |
| Última actualización | **08/11** |
| PJ = V+E+D | **OK** (descuadre 0) |
| Puntos = 3V+E | **OK** (descuadre 0) |
| ΣGF = ΣGC | **OK** (descuadre 0) |
| Tabla oficial | **Por conciliar**: la federación publicó la de la jornada 1 y los resultados llegan a la 7; se muestra la calculada |

Si alguna regla fallara, el panel lo diría con el descuadre exacto y la tabla **no** se publicaría como definitiva.

## 5 · Lo que demuestra este caso

- Un ETL real desde fuentes federativas heterogéneas (HTML, PDF, paquetes, APIs) hasta un **modelo relacional
  normalizado** de ~123 M de filas.
- Una **métrica de cobertura honesta** (grupo a grupo, con estados) y su uso para decidir qué recolectar.
- Una **regla de calidad que se puede auditar**: por qué un porcentaje sube, baja o se estanca.
- Y una web de consulta que solo lee del canónico con rol de solo lectura, con la clasificación **recalculada desde
  los partidos** y verificada contra ellos (Alba 38 goles en contra y 7 partidos en el grupo 2939; suma de jugados =
  2 × partidos con resultado en las tres competiciones principales).
