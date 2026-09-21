# Contenido, glosario y microcopia

Estado: decisión de diseño, 14 de septiembre de 2026. La precisión de esta plataforma depende tanto
del texto como del SQL: un promedio correcto rotulado "goles por partido" cuando el denominador son
partidos con acta es un dato falso. Este documento fija las palabras.

## 1. Principios

1. **Decir qué falta y por qué.** "Sin datos" no basta; el usuario necesita saber si es que la
   federación no lo publica, si está pendiente de recoger o si en ese partido no hubo.
2. **Nunca un cero que signifique desconocido.**
3. **El denominador va en el texto.** Si no cabe, el número no se muestra.
4. **Lenguaje de fútbol, no de base de datos.** "Jornada 14", no "matchday_id 14".
5. **Segunda persona sólo para acciones** ("quita un filtro"), nunca para describir datos.
6. **Sin signos de exclamación, sin emojis, sin disculpas.** Es una herramienta de análisis.

## 2. Las tres ausencias

Estos textos son canónicos y se usan literalmente. Los produce el componente, a partir de
`source_capability` y `coverage_checkpoint` (ver [FEDERACIONES-MATRIZ.md](FEDERACIONES-MATRIZ.md)).

| Situación | Texto corto | Texto largo |
|---|---|---|
| la fuente no publica ese dato | **No publicado** | "Esta fuente no publica alineaciones para esta competición y temporada, así que no se pueden calcular estadísticas individuales." |
| pendiente de recoger | **Pendiente** | "Recogidas 14 de 30 jornadas. Los datos de las jornadas restantes aún no se han descargado." |
| no hay dato en ese caso concreto | **Sin datos en esta acta** | "El acta de este partido no recoge los cambios." |
| resultado no publicado | **Sin resultado** | "La federación aún no ha publicado el resultado de este partido." |

Prohibido para cualquiera de los cuatro casos: `0`, `-`, `N/D`, `null`, una celda vacía sin título
accesible.

## 3. Cobertura y calidad

| Estado | Etiqueta visible | Cuándo |
|---|---|---|
| `completa` | **Completa** | edición terminada y validada |
| `verificada_hasta_jornada` | **Completa hasta J14** | temporada en curso |
| `parcial_privada` | **Parcial** | hay huecos conocidos dentro del tramo |
| `oculta` | *(no se muestra la competición)* | descubrimiento o datos incoherentes |

| Calidad del acta | Etiqueta | Explicación al pasar el ratón |
|---|---|---|
| `correct` | **Correcta** | "Los eventos del acta cuadran con el resultado oficial." |
| `administrative` | **Administrativa** | "Resultado decidido por el comité, sin desarrollo deportivo normal." |
| `review` | **A revisar** | "El acta contiene datos que no cuadran; se conserva tal cual se publicó." |
| `partial` | **Parcial** | "La federación sólo publica una parte del acta." |
| `unavailable` | **No disponible** | "Se ha comprobado que la federación no ofrece el acta de este partido." |

"A revisar" nunca se traduce como "error": el dato de la fuente no se corrige, se señala.

## 4. Abreviaturas de columna

Se usan sólo en encabezados de tabla densa, siempre dentro de `<abbr title="...">`, y el glosario
completo está enlazado desde toda tabla.

| Abrev. | Significa | Denominador |
|---|---|---|
| PJ | Partidos jugados | partidos con participación demostrada |
| CONV | Convocatorias | apariciones en acta, condición incluida o no |
| TIT | Titularidades | sólo `starter` demostrado |
| SUP | Suplente | `substitute` demostrado |
| MIN | Minutos | exactos; si son estimados se marca `~` |
| G | Goles | eventos individualizados |
| PEN | Goles de penalti | subtipo publicado |
| PP | Propia puerta | se atribuye al rival en el marcador |
| TA / TR | Tarjetas amarilla / roja | eventos de disciplina |
| GF / GC | Goles a favor / en contra | marcador oficial |
| DG | Diferencia de goles | GF − GC |
| PTS | Puntos | clasificación oficial |
| J | Jornada | — |

`G/90` sólo se muestra cuando los minutos son fiables. Si son estimados, se muestra `G/PJ` con la
etiqueta "por partido", que no miente.

## 5. Cómo se nombra cada entidad

Confundirlas es el error de producto más caro y el más fácil de cometer.

| Entidad | Cómo se llama en pantalla | Ejemplo |
|---|---|---|
| `club` | **Club** | C.D. Ribert |
| `team_season` | **Equipo** (con su categoría) | C.D. Ribert Juvenil A · 2025-26 |
| `team_entry` | **Participación del equipo** en una competición | Ribert Juvenil A en Primera Provincial |
| `competition` | **Competición** (concepto) | Primera Provincial Juvenil |
| `competition_edition` | **Edición** = competición + temporada | Primera Provincial Juvenil 2025-26 |
| `phase_group` | **Grupo** o **Fase** | Grupo A |
| `person` | **Persona** en el modelo, **Jugador**/**Técnico**/**Árbitro** en pantalla según el rol |

Nunca se escribe "plantilla del club": una plantilla pertenece a un equipo-temporada. Nunca se
totalizan dos equipos de categorías distintas del mismo club en una sola cifra.

## 6. Identidad de personas

| Situación | Texto |
|---|---|
| enlace confirmado entre temporadas | *(nada; se muestra la trayectoria)* |
| enlace probable sin confirmar | "Podría ser la misma persona que **Daniel García Martín** (Salamanca, 2023-24). Sin confirmar." |
| homónimos separados | "Hay **3 personas** con este nombre. Se muestran por separado porque no hay pruebas suficientes para unirlas." |
| condición no publicada | "Convocado. La federación no publica si fue titular o suplente." |

Nunca "el mismo jugador", "su carrera completa" ni "todos sus partidos" cuando la identidad no está
confirmada. Nunca se expande un apodo a un nombre real que la fuente no publica.

## 7. Estados vacíos

Cada uno dice qué pasa y qué hacer, en ese orden.

- **Búsqueda sin resultados**: "No hay nada con *pereira* en Castilla y León, temporada 2025-26. Prueba a quitar la temporada o a buscar en todas las federaciones."
- **Filtros sin resultados**: "Ninguna competición cumple los 4 filtros. El filtro *género: femenina* deja 0 de 47." + botón "Quitar ese filtro".
- **Grupo sin partidos jugados**: "La competición ha empezado pero aún no hay ninguna jornada cerrada. El calendario ya está disponible."
- **Jugador sin minutos**: "Aparece en 3 convocatorias. Ninguna acta permite saber si jugó."
- **Error recuperable**: "No se ha podido cargar la clasificación. Vuelve a intentarlo. Incidencia `a3f92c`."

## 8. Formato

- **Fechas**: `dom 14 sep 2026`. Meses en minúscula y abreviados a tres letras, sin punto. Con día de
  la semana cuando ayuda a leer un calendario; sin él en una tabla densa.
- **Hora**: `18:30`, sólo si la fuente la publica. "Hora sin confirmar" si el calendario la marca
  como provisional.
- **Temporada**: `2025-26` siempre, con guion normal, nunca `2025/2026`.
- **Números**: `1.234`, `2,5`. Un decimal como máximo en promedios; cero decimales en recuentos.
- **Estimado**: `~2,4` y en el título accesible "valor estimado: los minutos de esta competición no
  son fiables".
- **Marcador**: `2-1`, con guion simple y sin espacios.
- **Porcentajes**: entero, `64 %`, con espacio antes del signo como manda la ortografía española.

## 9. Títulos

- Pestaña del navegador: `{entidad} — {contexto} — Observatorio`.
  Ej.: `Primera Provincial Juvenil · Grupo A · 2026-27 — Salamanca — Observatorio`.
- `h1` de una ficha: el nombre de la entidad, sin contexto repetido (el contexto está en la miga).
- Título de un gráfico: enuncia la conclusión o la pregunta, no la variable.
  "Dónde suma puntos el Ribert", no "Puntos por localía".

## 10. Lo que no se escribe nunca

- "Actualizado en tiempo real" (no lo es).
- "Todos los partidos de la historia de X" (nunca se tiene toda la historia).
- "Datos oficiales" a secas: es "datos publicados por la Federación de X, recogidos el 14 sep 2026".
- Un nombre de tabla, columna, worker o federación interna en una pantalla deportiva.
- Un mensaje que culpe al usuario ("has introducido un filtro incorrecto").
