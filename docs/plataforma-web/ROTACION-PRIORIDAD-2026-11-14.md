# Rotación reordenada: de la temporada viva hacia atrás hasta 2020-21

**Fecha:** 14/11/2026. **Decisión de David:** las temporadas **2020-21, 2021-22, 2022-23, 2023-24, 2024-25,
2025-26 y 2026-27** tienen prioridad; el resto de la historia espera. Se aplica **sin bajar pausas ni duplicar
peticiones**: el reparto entre las dos máquinas sigue siendo disjunto, una temporada por máquina.

## 1 · Reparto aplicado (disjunto)

| Máquina | Temporadas asignadas (en orden de ataque) | Fichero |
|---|---|---|
| **PC** (más rápido) | `2026-27 · 2025-26 · 2024-25 · 2023-24` (después, las antiguas de siempre: 2014-15, 2013-14, 2012-13) | `E:\facylf-datos\descargas-federacion\recolector-local\temporadas-asignadas.txt` |
| **Servidor** | `2022-23 · 2021-22 · 2020-21 · 2019-20 · 2018-19 · 2017-18 · 2016-17 · 2015-16` | `/srv/data/facylf/descargas-federacion/recolector-local/temporadas-asignadas.txt` |

- **Ninguna temporada está en las dos listas** (comprobado el 14/11): la ventana 2020-21 … 2026-27 queda cubierta
  entera y sin solaparse.
- El PC se queda las temporadas con más trabajo pendiente porque **es ~3 veces más rápido** (ver §2).
- Copias de seguridad de las dos listas: `temporadas-asignadas.txt.antes-prioridad-20261114b` (PC) y
  `temporadas-asignadas.txt.antes-prioridad-20261114` (servidor). Volver atrás es copiar el `.antes-*` encima.
- El contenedor `facylf-federacion-1` se reinició el 14/11 a las ~11:20 para que el worker leyera la lista nueva.
  En el PC la lista nueva entra **en el siguiente arranque del worker** (el supervisor lo relanza solo).

## 2 · Ritmo medido hoy (14/11/2026, ventana de 24 h, UTC)

| Medida | PC (CyL) | Servidor (CyL) |
|---|---:|---:|
| Peticiones | 3.599 | 1.587 |
| Mediana por petición | **1.084 ms** | **43.806 ms** |
| Hueco mediano entre peticiones | **12.000 ms** | ~20 s (no calculable por una orden descendente; media 54 s de inicio a inicio) |
| Ritmo de inicio a inicio | **2,50 peticiones/min** | **1,11 peticiones/min** |
| Trabajos hechos en 24 h | **4.434** | **2.350** |
| Fallos (peticiones) | 5 de 3.599 (0,14 %) | ver nota |
| Cola pendiente | 39.056 | 33.020 |

El servidor tarda 40 veces más por petición porque el portal le responde en 43 s de mediana (antes se midieron
64-120 s); por eso el PC hace el 65 % de los trabajos con menos de la mitad de peticiones.

## 3 · ¿Cuántos días faltan?

**a) Lo que ya está descubierto en la cola** (trabajos pendientes de las temporadas asignadas):

| Máquina | Pendientes de su parte de la ventana | Días al ritmo de hoy |
|---|---:|---:|
| PC (2026-27, 2025-26, 2024-25, 2023-24) | 3.530 + 1.895 + 5.787 + 2.192 = **13.404** | **3,0 días** |
| Servidor (2022-23, 2021-22, 2020-21) | 1 + 4.763 + 0 = **4.764** | **2,0 días** |
| **Las dos en paralelo** | — | **~3 días** para vaciar la cola conocida |

**b) Cerrar la ventana «con todos los datos»** (ediciones incompletas según el canónico del 14/11):

| Temporada | Completas / totales | Faltan |
|---|---:|---:|
| 2020-21 | 34 / 76 | 42 |
| 2021-22 | 41 / 137 | 96 |
| 2022-23 | 58 / 145 | 87 |
| 2023-24 | 58 / 163 | 105 |
| 2024-25 | 68 / 198 | 130 |
| 2025-26 | 70 / 206 | 136 |
| 2026-27 | 2 / 88 | 86 |
| **Total** | **331 / 1.013** | **682** |

Coste observado por edición: 2022-23 → 45.739 trabajos hechos / 58 completas ≈ **789**; 2025-26 →
52.863 / 70 ≈ **755**. Con ~750 trabajos por edición: **682 × 750 ≈ 511.500 trabajos** al ritmo combinado de
**6.784 trabajos/día** (PC 4.434 + servidor 2.350) ⇒ **≈ 75 días de recolección**. Rango razonable según el coste
por edición (400-800): **40-90 días**, es decir **6-9 semanas** si las dos máquinas no se caen y el portal responde.

> **La cifra que importa:** la cola *conocida* se vacía en ~3 días, pero **eso no cierra las temporadas**: al ir
> descubriendo jornadas y actas aparecen más trabajos. Cerrar 2020-21 … 2026-27 con todos los datos es un trabajo
> de **~2-3 meses**, no de días.

## 4 · Qué NO se ha tocado

- Pausas, reintentos e idempotencia de los recolectores: **igual que estaban** (hueco mediano del PC: 12 s).
- Una sola pasada por máquina, sin workers nuevos, sin paralelizar federaciones.
- El servidor sólo cambia su lista de temporadas de CyL; el resto de su flota sigue como estaba.
