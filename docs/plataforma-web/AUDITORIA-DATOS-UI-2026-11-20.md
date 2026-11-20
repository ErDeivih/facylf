# Auditoría de datos y plan de interfaz · 20/11/2026

## Datos disponibles

| Tabla | Filas |
|---|---:|
| `core.match` | 2.610.279 |
| `core.team_entry` | 448.581 |
| `core.person` | 2.508.860 |
| `core.match_event` | 13.307.268 |
| `core.appearance` | 26.806.786 |
| `core.season` | 19 |

- Partidos con eventos: **907.089**.
- Partidos sin eventos: **1.703.190** (65 %). No es un fallo de la web: la federación no publica acta de todos.
- Partidos con categoría desconocida: **72.806** (2,8 %). La UI no debe asignarles una categoría inventada.
- Personas con al menos una aparición: **1.381.813** de 2,5 M.
- Veteranos: **4.774 equipos**, **26.474 partidos**, 17 temporadas; ya tienen categoría propia en la web.

## Qué se puede enseñar ya

- Competiciones, grupos, jornadas, clasificaciones, calendario y actas.
- Fichas de equipo, club, jugador, entrenador, árbitro y campo.
- Goleadores y rankings por modalidad, género y categoría.
- Comparador de jugadores, ojeo, estadísticas y modelo.
- Cobertura/calidad y estado del canónico.
- Predicción y proyección por grupo.
- Favoritos, cuenta, perfil y baja.

## Huecos de datos que la UI debe decir, no rellenar

- 65 % de partidos sin eventos: la ficha debe indicar «acta no publicada», nunca 0 goles.
- 72.806 partidos con categoría desconocida: no se les asigna una categoría.
- Fotos y escudos: sólo si existen y el modo lo permite.
- Minutos de jugadores: pueden faltar; no se convierten en 0.
- Alineaciones: no todos los partidos las traen.

## Plan de interfaz

1. **Hub `/explorar`**: hecho. Reúne competiciones, equipos, jugadores, estadísticas, modelo y provincias/categorías; la cabecera apunta ahí.
2. **Veteranos**: añadido a categorías estáticas, goleadores y sitemap.
3. **Fichas**: revisar equipo/club/jugador para que cada sección tenga estado vacío explícito y enlace a la fuente.
4. **Actas**: orden por minuto y aviso de cobertura; no prometer una cronología completa si no hay eventos.
5. **Móvil**: cabecera compacta, tablas con scroll explícito y objetivos táctiles.
6. **Datos**: enlazar `/explorar/datos` desde el hub y desde cada ficha cuando falte cobertura.
7. **Iteración**: medir 390/1280 y volver a preguntar «¿podría estar mejor?» después de cada bloque.

## Ingesta

No se ha tocado el ingestor. El estado operativo reciente está en `ESTADO-DEEPSEEK.md`: hay federaciones
delegadas al servidor y recolectores parados; eso explica huecos, no la interfaz. Cualquier cambio de
ritmo o arranque de workers es de Claude/David, no de esta tarea.
