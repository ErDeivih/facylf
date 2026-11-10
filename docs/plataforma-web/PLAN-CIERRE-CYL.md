# Cómo se cierra Castilla y León · estado y maquinaria

Actualizado: **10/11/2026, 09:45**. Este documento reúne lo que hace falta para terminar el cierre de CyL y para
publicarlo, sin depender de la memoria de una sesión: qué hay, qué falta, qué está automatizado y cómo se comprueba.

## 1 · De dónde salen los datos y por qué hay dos máquinas

- **PC (canónico de referencia, el que sirve la web)**: PostgreSQL en `127.0.0.1:5433` (contenedor `facylf-postgres`).
  Tiene **todas las temporadas** (2012-13 → 2026-27) y es donde se consolida todo.
- **Servidor**: recolecta 8 temporadas (2020-21, 2022-23, 2024-25, 2026-27 y las antiguas pares) y tiene su propio
  canónico, **que no se usa para publicar** (está en la migración 0015 y le faltan 4 temporadas). Sus datos llegan al
  PC por **paquetes de temporada** (`extrae-temporada-cola.mjs` → `scp` → `importar-temporada.ps1`), sin reimportar
  lo que ya está completo.
- **La cola del PC** (`E:\facylf-datos\descargas-federacion\recolector-local\cola-v2.sqlite`) es la que usa el
  recolector local. Ahora tiene **las 15 temporadas asignadas**, con 2026-27 primero.

## 2 · Cómo se cierra una temporada

Una edición está **completa** cuando todos sus grupos tienen `ops.coverage_checkpoint.visibility_state = 'completa'`.
Hay dos palancas distintas y conviene no confundirlas:

1. **Importar** los datos ya recogidos en la cola del servidor (actas, jornadas, clasificaciones). Es lo que hace el
   importador de paquetes; sólo puede meter lo que el paquete trae.
2. **Recolectar** lo que no existe todavía: calendarios, jornadas y clasificaciones que el portal publica y nadie ha
   pedido aún. Es lo que hace el worker del PC. Un grupo con las actas importadas pero sin calendario **no** pasa a
   completo (caso extremo: 2019-20 tiene 5 de 224 grupos completos aunque sus actas estén casi todas).

## 3 · Estado medido (10/11 09:45)

**198 de 865 ediciones completas** (al empezar el día eran 138 de 807). Grupos completos por temporada:

| Temporada | Completas / ediciones | Grupos completos / total | Lo que le queda |
|---|---:|---:|---|
| 2012-13 | 2/2 | 2/2 | nada: cerrada |
| 2013-14 | 5/46 | 85/231 | recolección (calendario/jornada/clasificación) |
| 2014-15 | **18/61** | **249/361** | importada el 10/11 (358/358 grupos); el resto, recolección |
| 2015-16 | 9/65 | 148/311 | actas importadas; recolección |
| 2016-17 | 6/58 | 144/286 | **en cola de importación** (142 grupos) |
| 2017-18 | 10/60 | 143/247 | actas casi completas; recolección |
| 2018-19 | 8/61 | 143/270 | **en cola de importación** (124 grupos) |
| 2019-20 | 1/56 | **5/224** | recolección: es el hueco más grande en grupos |
| 2020-21 | 9/31 | 235/337 | **importación en curso** (154 grupos) |
| 2021-22 | 12/66 | 138/280 | recolección |
| 2022-23 | 32/70 | 215/286 | importada; resto recolección |
| 2023-24 | 24/83 | 169/296 | 21 grupos con actas importados; el resto no tiene actas |
| 2024-25 | 41/79 | 232/289 | la más cerca; recolección |
| 2025-26 | 20/71 | 166/301 | 16 grupos con actas importados; el resto no tiene actas |
| 2026-27 | 1/56 | 1/237 | temporada en curso (la recolecta el PC ahora) |

## 4 · Lo que falta por importar (paquetes ya comprobados: abren y traen datos)

| Temporada | Grupos con hueco | Partidos en el paquete | Actas hechas |
|---|---:|---:|---:|
| 2020-21 | 154 | 9.034 | 8.461 |
| 2016-17 | 142 | 28.247 | 27.309 |
| 2018-19 | 124 | 27.525 | 27.034 |
| 2012-13 | 1 | 2 | 1 |
| 2026-27 | 187 | 8.512 | 7.949 |

El importador va por 2020-21 y sigue el orden de `tmp/importa-grupos-servidor.ps1`. Es **reanudable**: apunta cada
grupo hecho en `tmp/importa-grupos-hechos.txt` con la fecha del paquete, y sólo salta lo que ya hizo con ese paquete.

## 5 · Qué no se puede cerrar (y no es un fallo)

- **22 ediciones con acta que no cuadra con el calendario** (identidad): no se arreglan importando; necesitan
  resolución de identidad caso a caso.
- **156 ediciones sin origen conocido**: 141 de la federación (grupos de relleno, copas sin actas, fases que el
  portal no carga) y 15 de La Preferente. **Irreducibles con las colas actuales.**
- **2026-27**: no se cierra hasta que termine la temporada.
- Techo teórico con todo lo recuperable: **521 de 807 (64,6 %)** según la auditoría del 09/11; hoy se han superado
  las 198 completas y la importación en curso moverá más.

## 6 · Maquinaria (todo en el repositorio)

| Pieza | Para qué |
|---|---|
| `scripts/claude/trae-federacion-servidor.ps1` | trae al PC paquetes de temporada del servidor (extrae, scp, importa) |
| `tmp/importa-grupos-servidor.ps1` | importa sólo los grupos con hueco, reanudable, paquetes frescos |
| `tmp/gaps-de-paquete.mjs` · `tmp/comprueba-paquetes.mjs` | miden huecos por paquete y comprueban que los ficheros abren |
| `scripts/claude/publica-canonico.ps1` | **refresco completo y cotejado** de la base publicada (T1=T2 y 98/98 tablas) |
| `tmp/espeja-para-pages.mjs` | regenera la foto estática publicada en GitHub Pages |
| `tmp/medir-canonico-cyl.sql` · `tmp/grupos-por-temporada.sql` | las dos consultas de cobertura |
| `tmp/reejecuta-fallos.ps1` | reejecuta grupos fallidos y guarda el motivo completo |

## 7 · Pedido de publicación (cuando termine la importación)

1. `powershell -File scripts\claude\publica-canonico.ps1 -BaseNueva facylf_canonico_4`
   (congela escritores → volcado → T1=T2 → restaura → coteja → apunta la web; no borra nada).
2. Regenerar la foto de Pages: `node tmp\espeja-para-pages.mjs http://127.0.0.1:3001 tmp/site-pages /fondo-popular-demo`
   y `git push` en `tmp/site-pages`.
3. `pnpm test` completo con la importación parada y `pnpm recolector:test`.
4. Actualizar `docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md` y el `resumen:` de `ESTADO-AGENTE.md`.
