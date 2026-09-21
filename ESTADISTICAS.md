# Estadísticas y visualizaciones

La web calcula las estadísticas directamente desde SQLite. Cada grupo muestra su cobertura de
jornadas, actas, calendario y clasificación. Mientras la colección es parcial, los paneles se
presentan como provisionales; al llegar al 100 %, pasan automáticamente a datos completos.

## Recorrido disponible en la web

- filtros combinables por temporada, últimas cinco temporadas, categoría, ámbito, provincia,
  fútbol/fútbol sala y competición masculina/femenina;
- accesos rápidos a Salamanca, regionales/nacionales, juveniles y fases de ascenso;
- calendario completo y selector de jornada;
- clasificación recalculada con los resultados disponibles hasta la jornada elegida;
- enlace desde cada partido a su acta, alineaciones, eventos y cuerpos técnicos;
- fichas de equipo aisladas por temporada, competición y grupo;
- jugadores de una competición con búsqueda por nombre/equipo y ordenación por partidos,
  minutos, goles o tarjetas.

En las fichas de jugador se distinguen **convocatorias** y **partidos jugados**. Un suplente
no suma un partido si el acta no registra su entrada ni existe otro evento que demuestre su
participación. El desglose se hace por temporada, equipo, competición y grupo; nunca se
reparte la estadística entre todos los equipos de un club.

## Competición y clasificación

- clasificación reconstruida jornada a jornada;
- evolución de posición y puntos de cada equipo;
- mapa de calor de puntos acumulados;
- goles a favor, en contra y diferencia;
- comparativa visual de ataque y defensa;
- rendimiento como local y visitante;
- rachas de victorias, empates y derrotas;
- porterías a cero, ambos marcan y partidos con más de 2,5 goles;
- distribución de goles por tramos de minuto;
- liderato, ascenso, descenso y cambios de posición entre jornadas;
- resultados directos entre dos equipos y balance histórico.

## Equipos y clubes

- puntos por partido y porcentaje de victorias;
- medias de goles marcados y recibidos;
- mejor y peor racha;
- frecuencia de remontadas y partidos decididos por un gol;
- rendimiento contra equipos de la parte alta, media y baja;
- trayectoria del equipo entre temporadas;
- historial nominal del club, con confirmación posterior de cambios de denominación;
- jugadores, técnicos, campos y árbitros asociados a sus partidos.

## Jugadores

- convocatorias, apariciones, titularidades y suplencias;
- goles totales y por partido;
- tarjetas amarillas, dobles amarillas y rojas;
- minutos estimados a partir de titularidades, entradas y salidas;
- goles y tarjetas por 90 minutos cuando la estimación tenga cobertura suficiente;
- minutos de los goles y distribución por tramos;
- continuidad entre temporadas usando nombre, provincia, club y equipo;
- recorrido por clubes/equipos y temporadas;
- rachas goleadoras y participación en victorias, empates y derrotas.

Los minutos se marcan siempre como **estimados**. La duración base se adapta a la categoría y
los cambios corrigen el intervalo jugado. No se inventan minutos cuando el acta no publica la
sustitución.

## Técnicos, árbitros y campos

- partidos y temporadas por entrenador o miembro del cuerpo técnico;
- equipos dirigidos y balance de resultados;
- partidos arbitrados, goles y tarjetas por partido;
- distribución de designaciones por competición;
- partidos por campo, equipos que lo utilizan y medias de goles;
- rendimiento local por instalación.

## Datos que no deben inferirse

Las actas no proporcionan de forma fiable posesión, tiros, tiros a puerta, asistencias, pases,
distancia recorrida ni ocasiones. Por tanto, no se calculan xG, mapas de tiro ni estadísticas de
posesión. Si en el futuro aparece una fuente real para estos campos, se incorporarán como un
conjunto de datos separado y con su propia cobertura.

## Reglas de identidad y comparación

- El código federativo visible es la identidad principal de un jugador. Un nombre igual no
  fusiona dos perfiles automáticamente.
- Si el código cambia entre temporadas, el sistema sólo propone una posible continuidad:
  primero exige nombre normalizado igual, después provincia compatible, después mismo club y,
  como señal más fuerte, el mismo equipo o una categoría consecutiva. Los homónimos y apodos
  cortos permanecen separados hasta una revisión humana.
- Una misma persona puede tener varios equipos en una temporada. Sus totales anuales suman los
  contextos, pero la ficha conserva cada combinación temporada + equipo + competición + grupo.
- La identidad de club se deriva de un nombre federativo coincidente. Sólo se eliminan sufijos
  inequívocos de filial escritos entre comillas; no se usa similitud difusa para mezclar clubes.
- Los rankings globales son exploratorios mientras la cobertura sea parcial. Para comparar o
  estudiar rivales se priorizan los rankings de una competición y temporada concretas.
