# Cierre de CyL · tabla por temporada y qué se queda fuera

Foto del **10/11/2026, 09:40**, sobre el canónico del PC (el que sirve la web). Una edición está completa cuando
todos sus grupos tienen `ops.coverage_checkpoint.visibility_state='completa'`. La cifra de «ediciones» es la unión
de los dos canónicos: el servidor no tiene ninguna edición que no esté en el PC.

| Temporada | Ediciones | Completas | Grupos completos / total | Qué le falta y por qué |
|---|---:|---:|---:|---|
| 2012-13 | 2 | 2 | 2/2 | **cerrada** |
| 2013-14 | 46 | 5 | 85/231 | importación de actas hecha; faltan calendario/jornada/clasificación (recolección) |
| 2014-15 | 61 | 18 | 249/361 | **importada esta mañana** (357 de 358 grupos): pasó de 3 ediciones a 18 completas |
| 2015-16 | 65 | 9 | 148/311 | actas importadas; falta recolección de calendario/jornada |
| 2016-17 | 58 | 6 | 144/286 | **en cola de importación** (142 grupos con hueco, 13.067 actas) |
| 2017-18 | 60 | 10 | 143/247 | el hueco de actas bajó de 6.543 a 3 |
| 2018-19 | 61 | 8 | 143/270 | **en cola de importación** (124 grupos, 12.767 actas) |
| 2019-20 | 56 | 1 | 5/224 | **necesita recolección**: calendario, jornada y clasificación siguen pendientes en la cola |
| 2020-21 | 31 | 9 | 235/337 | **en cola de importación** (154 grupos, 3.610 actas) |
| 2021-22 | 66 | 12 | 138/280 | recolección |
| 2022-23 | 70 | 32 | 215/286 | importada con paquete fresco; lo que queda es recolección |
| 2023-24 | 83 | 24 | 169/296 | 21 grupos con actas importados; el resto de huecos no tiene actas: recolección |
| 2024-25 | 79 | 41 | 232/289 | la más cerca de cerrarse; recolección de lo que falta |
| 2025-26 | 71 | 20 | 166/301 | 16 grupos con actas importados; el resto, recolección |
| 2026-27 | 56 | 1 | 1/237 | temporada en curso (el PC la recolecta ahora) |
| **Total** | **865** | **198** | — | |

Al empezar el día eran **138 de 807**; el salto grande es 2014-15 (3 → 18 ediciones completas, 3 → 249 grupos
completos) más lo que ya venía de los paquetes frescos de 2024-25, 2022-23 y 2026-27.

## Lo que se queda fuera y por qué

- **Importación en curso**: 2020-21 (154 grupos), 2016-17 (142), 2018-19 (124), 2012-13 (1) y 2026-27 (187). Se
  reanuda sola cuando el worker del PC termina el último escaneo de actas (`tmp/reanuda-tras-escaneo.ps1`).
- **Recolección**: lo que no tiene actas en los paquetes ni calendario/jornada/clasificación en el canónico
  (2019-20 con 5 de 224 grupos es el caso extremo). Lo hace el recolector del PC, que ya tiene las 15 temporadas.
- **Identidad o calendario (22 ediciones)**: el acta no se corresponde con la fila del calendario; no se arregla
  importando. Están listadas con su motivo en la bitácora de operación.
- **Sin origen conocido (156 ediciones)**: 141 de la federación (grupos de relleno, copas sin actas, fases que el
  portal no carga) y 15 de La Preferente. **Son irreducibles con las colas actuales.**
- **2026-27** no se puede cerrar hasta que termine la temporada.

Techo teórico con todo lo recuperable: **521 de 807 (64,6 %)** según la auditoría del 09/11; hoy ya hay 198
completas y la importación en curso moverá las temporadas que faltan.

## Cómo reproducir la tabla

```powershell
$sql = Get-Content tmp\medir-canonico-cyl.sql -Raw
$sql | docker exec -i facylf-postgres psql -U facylf_publicador -d facylf -f -
# y los grupos completos por temporada:
Get-Content tmp\grupos-por-temporada.sql -Raw | docker exec -i facylf-postgres psql -U facylf_publicador -d facylf -f -
```

Verificación de 2014-15 tras importarla: 61 ediciones (0 duplicadas), 361 grupos, 27.901 partidos, 26.625 actas,
5.670 jornadas (`tmp/verifica-2014-15.sql`).
