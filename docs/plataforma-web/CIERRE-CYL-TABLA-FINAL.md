# Cierre de Castilla y León · tabla por temporada y qué se queda fuera

Foto del **10/11/2026, 12:10**, sobre el canónico del PC (el que sirve la web). Una edición está **completa**
cuando todos sus grupos tienen `ops.coverage_checkpoint.visibility_state='completa'` (definición de la auditoría
del 09/11). La cifra de ediciones es la del canónico del PC, que ya contiene todo lo que tenía el servidor.

| Temporada | Ediciones | Completas | Grupos completos / total | Lectura |
|---|---:|---:|---:|---|
| 2012-13 | 3 | 2 | 2/3 | prácticamente cerrada |
| 2013-14 | 46 | 5 | 85/231 | recolección de calendario/jornada/clasificación |
| 2014-15 | **61** | **18** | **249/361** | importada el 10/11 (357 de 358 grupos) |
| 2015-16 | 65 | 9 | 148/311 | recolección |
| 2016-17 | 58 | 6 | 167/286 | importada el 10/11 (142 grupos) |
| 2017-18 | 60 | 10 | 143/247 | recolección |
| 2018-19 | 61 | 9 | 172/270 | importada el 10/11 (124 grupos) |
| 2019-20 | 56 | 1 | **5/224** | el hueco más grande: su calendario/jornada/clasificación sigue pendiente en la cola |
| 2020-21 | 31 | 16 | 309/337 | importada el 10/11 (154 grupos) |
| 2021-22 | 66 | 12 | 138/280 | recolección |
| 2022-23 | 70 | 32 | 215/286 | importada con paquete fresco; el resto, recolección |
| 2023-24 | 83 | 24 | 169/296 | 21 grupos con actas importados; el resto de huecos no tiene actas |
| 2024-25 | 79 | 41 | 232/289 | la más cerca de cerrarse |
| 2025-26 | 71 | 20 | 166/301 | 16 grupos con actas importados; el resto no tiene |
| 2026-27 | 57 | 1 | 1/239 | temporada en curso (el PC la recolecta ahora) |
| **Total** | **867** | **206** | — | **23,8 %** de las ediciones completas |

Al empezar el día eran **138 de 807**. El universo pasó de 807 a **867** por el propio cierre: 2014-15 tenía 3
ediciones (sólo La Preferente) y hoy tiene 61 → **+58**; y los paquetes frescos crearon **+2** ediciones nuevas
(2012-13 y 2026-27 pasaron de 2 y 56 a 3 y 57). En total +60, de ahí 867.

## Lo que se importó hoy (paquetes del servidor, idempotente y reanudable)

| Temporada | Grupos importados | Estado |
|---|---:|---|
| 2014-15 | 357 de 358 | cerrada (el grupo que falta falla por identidad) |
| 2020-21 | 154 | hecho; grupos completos 235 → **309** de 337 |
| 2016-17 | 142 | hecho; grupos completos 144 → **167** de 286 |
| 2018-19 | 124 | hecho; grupos completos 143 → **172** de 270 |
| 2026-27 | 187 | hecho (temporada en curso; no cierra ediciones) |
| 2012-13 | 1 | hecho |
| 2023-24 / 2025-26 | 21 | sólo los grupos con actas: el resto de sus huecos no las tiene |

## Lo que se queda fuera y por qué

- **Recolección pendiente**: es el motivo principal del hueco que queda (2019-20 con 5 de 224 grupos es el caso
  extremo). Lo hace el recolector del PC, que ya tiene las 15 temporadas y está trabajando.
- **Importación**: terminada el 10/11 a las 10:35. Queda un solo grupo que falla siempre por identidad/calendario
  (2024-25 `21734954`); se reejecuta y se documenta, no se fuerza.
- **Identidad o calendario (22 ediciones)**: el acta no se corresponde con la fila del calendario; no se arregla
  importando.
- **Sin origen conocido (156 ediciones)**: 141 de la federación (grupos de relleno, copas sin actas, fases que el
  portal no carga) y 15 de La Preferente. **Irreducibles con las colas actuales.**
- **2026-27** no se puede cerrar hasta que termine la temporada.

Techo teórico con todo lo recuperable: **521 de 807 (64,6 %)** según la auditoría del 09/11. Hoy hay 206 completas
(eran 138 esta mañana) y la recolección sigue moviendo grupos cada hora.

## Cómo se reproduce esta tabla

```powershell
$sql = Get-Content tmp\medir-canonico-cyl.sql -Raw
$sql | docker exec -i facylf-postgres psql -U facylf_admin -d facylf -At -F '|'
Get-Content tmp\grupos-por-temporada.sql -Raw | docker exec -i facylf-postgres psql -U facylf_admin -d facylf -At -F '|'
```

Verificación de 2014-15 tras la importación (`tmp/verifica-2014-15.sql`): 61 ediciones sin duplicados, 361 grupos,
27.901 partidos, 26.625 actas y 5.670 jornadas.

> Nota: el ciclo diario (`scripts/ciclo-diario-cyl.ps1`) puede enseñar otra cifra si cuenta la visibilidad de la
> edición (`core.competition_edition.visibility_state`) en vez de todos sus grupos; la cifra de referencia es la de
> esta tabla.

## Por qué 2026-27 no puede completarse todavía (medido el 10/11/2026)

La temporada en curso es la que el recolector trabaja primero y, sin embargo, no puede cerrar ediciones: el criterio
de «edición completa» exige **todos** sus grupos en `completa` en `ops.coverage_checkpoint`, y un grupo no lo está
hasta que tiene calendario, todas sus jornadas con resultado y las actas correctas. En una temporada a medias eso es
imposible por definición.

Estado de los grupos de Castilla y León en 2026-27 (298 grupos):

| Estado del grupo | Grupos |
|---|---:|
| `verificada_hasta_jornada` | 208 |
| `parcial_privada` | 75 |
| `oculta` | 12 |
| `completa` | **3** |

De los 295 que no están completos, a **270 les faltan resultados**, a **258 les faltan partidos por conocer**, y **129
tienen actas a revisar**. Es decir: el trabajo pendiente no es «recoger más actas sueltas» sino **que la temporada
avance** (jornadas que todavía no se han jugado) y que las actas pendientes se parseen.

Consecuencia para el cierre: las ganancias de cobertura de estos días tienen que venir de **temporadas antiguas**, que
el recolector visita después de agotar la actual. Por eso el contador puede quedarse quieto aunque el worker esté
pidiendo: está completando la temporada en curso, que aún no se puede cerrar.

## Qué falta de verdad en las temporadas en rotación (10/11/2026)

Con la rotación puesta en las temporadas antiguas, medido en `ops.coverage_checkpoint` (solo Castilla y León):

| Temporada | Grupos | Completos | Faltan resultados | Solo faltan actas | Faltan partidos del calendario |
|---|---:|---:|---:|---:|---:|
| 2012-13 | 3 | 2 | 1 | 0 | 1 |
| 2013-14 | 231 | 85 | 127 | 0 | 121 |
| 2014-15 | 518 | 332 | 172 | 0 | 162 |
| 2015-16 | 446 | 189 | 242 | 0 | 231 |
| 2016-17 | 498 | 250 | 239 | 0 | 211 |
| 2018-19 | 540 | 256 | 274 | 0 | 242 |
| 2019-20 | 353 | 32 | 321 | 0 | 305 |

**La columna que importa es la de resultados: en ninguna de estas temporadas hay un solo grupo al que solo le falten
actas.** Es decir, recoger actas sueltas no desbloquea grupos; lo que desbloquea son **jornadas con resultados y
calendario**, que es justo la mayor parte de lo que queda en la cola (en 2018-19, 3.488 jornadas pendientes frente a
1.926 actas; en 2014-15, 4.007 frente a 998).

Conclusión para la rotación: va bien encaminada, pero la métrica a mirar no es «cuántas actas se han guardado» sino
**cuántas jornadas con resultados** entran. Y el contador 206/867 no se moverá hasta que esas jornadas se importen,
que va por el ciclo diario o el empaquetado de temporada.

## Calidad de las actas que están entrando (muestreo del 10/11/2026)

Con `scripts/claude/audita-actas-muestra.mjs <temporada> <n>` (solo lectura de la cola) se revisa una muestra de
las actas recién guardadas: si el JSON parsea, si los goles cuadran con el marcador, si hay árbitro y si las
alineaciones traen 11 titulares.

| Muestra | JSON roto | Goles descuadrados | Sin árbitro | Menos de 11 titulares |
|---|---:|---:|---:|---:|
| 2018-19 (recién recogida, 45 actas) | 0 | 1 | 62 % | 40 % |
| 2015-16 (dato antiguo, 30 actas) | 0 | 0 | **100 %** | **100 %** |

Lectura: **la recolección de ahora trae mejor calidad que el dato viejo** (el árbitro aparece en el 38 % de las actas
de 2018-19 frente al 0 % de las de 2015-16), que es lo esperable al leer actas completas en vez de resúmenes. Los
puntos a vigilar son la falta de árbitro (viene así del origen) y las alineaciones cortas, que en juveniles puede ser
normal en algunos grupos pero conviene revisar cuando el grupo esté completo. El único descuadre de goles
(`C.D. Villamayor 2-2 C.D. Hervás Helmántica`: 3 goles anotados para un 2-2) es del origen y queda como caso a mirar,
no se toca el dato.
