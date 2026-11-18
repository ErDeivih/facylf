# Referencias de UI para fútbol · notas de diseño

Comparación de patrones públicos y qué se ha adoptado en Fondo Popular. No se copian marcas ni
código; se describen decisiones de información.

| Referencia | Patrón útil | Decisión en Fondo Popular |
|---|---|---|
| SofaScore <https://www.sofascore.com/> | Fila de partido con equipos apilados, marcador fijo a la derecha y estado en una sola línea | `Jornada` y `PartidosDeJornada` ya usan esa estructura; se añadieron etiquetas de zona |
| Flashscore <https://www.flashscore.com/> | Cabecera de competición muy compacta y tabla densa con scroll | Cabecera de competición y tabla con columnas fijas en móvil |
| Transfermarkt <https://www.transfermarkt.com/> | Ficha de club/equipo con jerarquía clara: plantilla, resultados, estadísticas | Ficha de equipo con secciones y plantilla; falta profundizar histórico |
| 365Scores <https://www.365scores.com/> | Filtros por competición y jornada visibles, sin esconder el estado vacío | Selector de competiciones y páginas estáticas por provincia/categoría |
| FBref <https://fbref.com/> | Tablas con denominadores explícitos y notas de cobertura | Se añadió el aviso de minutos posibles y el estado «sin datos» en actas |

## Lo que se corrigió tras la auditoría

- Un solo selector Total/Casa/Fuera, no dos contradictorios.
- Cabecera móvil de 168 px en vez de 281.
- Puestos de dos cifras sin solaparse con la columna fija.
- Aviso visible de scroll en la plantilla.
- Matriz de previa una sola vez.
- Cronología ordenada por minuto.
- Estados vacíos que distinguen «no publicado» de «fallo».

## Lo que queda como siguiente mejora

- Ficha de jugador con histórico de temporadas y minutos por puesto.
- Comparador de equipos con gráficos de forma y fuerza de calendario.
- Mapa de calor de resultados por tramo, con denominador.
