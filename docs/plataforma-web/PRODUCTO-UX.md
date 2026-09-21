# Producto, navegación y experiencia de usuario

## 1. Usuarios y tareas

La interfaz se optimiza para preguntas, no para tablas de la base:

### Técnico o analista

- ¿Cómo juega el próximo rival y qué once utiliza?
- ¿Qué ocurre cuando marca o recibe primero?
- ¿Quiénes concentran goles, minutos y tarjetas?
- ¿Cómo cambia su rendimiento en casa/fuera y ante rivales fuertes?

### Responsable de captación

- Encontrar un jugador por nombre aunque falten tildes o haya una errata.
- Ver su trayectoria y separar cada equipo de una misma temporada.
- Compararlo con jugadores de categoría, edad deportiva o posición sólo cuando esos datos existan.
- Guardar candidatos y anotar una revisión privada en una fase posterior.

### Consulta general

- Elegir federación, temporada y competición con pocos pasos.
- Recorrer jornada, partido, acta, equipo, club o jugador manteniendo el contexto.
- Entender inmediatamente la cobertura y la procedencia.

## 2. Navegación global

Escritorio:

```text
Inicio | Competiciones | Partidos | Equipos | Jugadores | Comparar | Scouting
                                     [Buscar en todo…] [Federación] [Temporada]
```

Móvil: barra inferior para Inicio, Buscar, Competiciones, Scouting y Más. Los filtros avanzados se
abren en una hoja lateral, con resumen de filtros activos y botón claro para restablecer.

El contexto seleccionado se conserva en la URL y en un selector global opcional. Nunca debe hacer
que un enlace compartido cambie de significado.

## 3. Mapa de rutas objetivo

```text
/
/buscar?q=&federacion=&temporada=&tipo=
/federaciones
/federacion/[federacion]
/competiciones?...facetas
/competicion/[editionSlug]
/competicion/[editionSlug]/calendario
/competicion/[editionSlug]/jornada/[numero]
/competicion/[editionSlug]/clasificacion/[jornada]
/partido/[matchSlug]
/acta/[reportSlug]
/club/[clubSlug]
/equipo/[teamSeasonSlug]
/jugador/[personSlug]
/comparar/equipos?a=&b=
/comparar/jugadores?a=&b=
/scouting                 (privada, futura)
/cobertura                (calidad y procedencia)
```

Los slugs públicos pueden ser legibles, pero la resolución termina siempre en un ID canónico. Un
cambio de nombre crea redirección, no rompe enlaces.

## 4. Búsqueda global

El cuadro principal busca jugadores, equipos, clubes, competiciones, árbitros, técnicos y campos.

Comportamiento:

1. a partir de dos caracteres, sugerencias agrupadas por tipo;
2. coincidencia exacta y prefijo antes que similitud;
3. tolerancia a tildes, guiones, orden de apellidos y errores pequeños;
4. cada resultado muestra contexto: federación, temporada/categoría, club o provincia;
5. los homónimos nunca se presentan como una sola persona sin enlace confirmado;
6. teclado completo: flechas, Enter, Escape y foco visible;
7. consulta cancelable y con retraso breve; no se envía una petición por tecla sin control;
8. página completa de resultados con facetas y paginación por cursor.

Ejemplo de resultado útil:

```text
JUGADOR
Daniel García Martín
Castilla y León · Salamanca · C.D. Ribert Juvenil A · 2025-26
3 temporadas enlazadas · 41 partidos · cobertura alta
```

## 5. Filtros de competiciones

Facetas encadenadas:

- federación;
- temporada;
- estado y cobertura;
- ámbito: nacional/regional/provincial/ascenso/copa;
- provincia o zona;
- modalidad;
- género;
- categoría;
- nivel;
- texto de competición/equipo.

Las opciones muestran recuento y sólo ofrecen combinaciones existentes. El orden de selección no
debe obligar a empezar de nuevo. Los filtros activos son chips eliminables y forman parte de
`searchParams`, por lo que atrás/adelante y compartir enlace funcionan.

No cargar todas las opciones históricas en el HTML inicial: federación y temporada son pequeñas;
las facetas dependientes se consultan de forma agregada.

## 6. Página de competición

Cabecera:

- nombre, temporada, grupo/fase, federación, modalidad y zona;
- estado: activa/finalizada;
- cobertura visible y `completa hasta J…`;
- acceso a fuente y fecha de actualización;
- selector de grupo si una edición tiene varios.

Pestañas enlazables, no estado efímero:

1. Resumen
2. Clasificación
3. Jornadas
4. Calendario
5. Equipos
6. Jugadores
7. Estadísticas
8. Cobertura

Resumen recomendado:

- próxima/última jornada;
- clasificación compacta;
- forma de los equipos;
- máximos goleadores con denominador de cobertura;
- tendencia de goles y disciplina;
- incidencias de calendario, sanciones o datos incompletos.

## 7. Jornada y partido

La navegación anterior/siguiente mantiene competición y grupo. La jornada muestra todos los
partidos, clasificación oficial tras esa jornada y cambios de posición respecto a la anterior.

La ficha de partido incluye:

- resultado, estado, fecha/hora, campo y árbitros;
- línea temporal de goles, tarjetas y cambios;
- alineaciones separando titular, suplente y convocado sin condición;
- enlaces contextuales al equipo de esa temporada y a cada jugador;
- marcador oficial frente a desglose si no coinciden;
- calidad y procedencia en lenguaje humano.

Nunca se muestra `0-0` cuando el marcador es desconocido. Se usa “sin resultado publicado”.

## 8. Equipo y club

### Equipo-temporada

- competición y categoría exactas;
- posición y evolución por jornada;
- balance total/casa/fuera;
- resultados cronológicos y racha real por fecha;
- plantilla utilizada en ese contexto;
- once más repetido sólo con alineaciones fiables;
- goles por tramos, disciplina y cambios;
- rivales comparables y enlaces a enfrentamientos.

### Club

- equipos inscritos por temporada y competición;
- campos utilizados;
- continuidad histórica de denominaciones;
- resultados agregados por equipo, nunca una “plantilla de club” que mezcle categorías.

## 9. Perfil del jugador

Cabecera: nombre publicado, alias conocidos, federaciones/territorios, cobertura e identidad. Si el
enlace entre temporadas es probable pero no confirmado, no se presenta como hecho.

Contenido:

- resumen de carrera;
- línea temporal por temporada;
- dentro de cada temporada, bloque separado por equipo y competición;
- convocatorias, partidos demostrados, titularidades, minutos exactos/estimados, goles y tarjetas;
- evolución por jornada y medias sólo con denominador fiable;
- actas recientes;
- comparador con contexto equivalente.

La página explica que una convocatoria no equivale a jugar. Una aparición
`called_up_unknown` se etiqueta “condición no publicada”.

## 10. Visualizaciones útiles

Priorizar gráficos que contesten una pregunta:

| Pregunta | Visualización |
|---|---|
| ¿Cómo evolucionó en la tabla? | línea escalonada con eje de posición invertido |
| ¿Dónde gana/pierde puntos? | barras casa/fuera y fuerza del rival |
| ¿Cuándo marca o encaja? | histogramas por tramos de 15 minutos |
| ¿Quién juega conjuntamente? | matriz de coincidencia, sólo con alineación fiable |
| ¿Qué once repite? | tabla/mosaico con frecuencia, no dibujo táctico sin posiciones |
| ¿Cómo llega? | tira de últimos partidos ordenados por fecha |
| ¿Es disciplinado? | tarjetas por 90 cuando los minutos sean fiables; por aparición si no |
| ¿Cómo progresa un jugador? | small multiples por temporada/equipo |

Todo gráfico debe tener título que exprese la conclusión o pregunta, leyenda, unidades, versión en
tabla y explicación de cobertura. No usar radar por defecto: mezcla escalas y suele dificultar la
comparación.

## 11. Estados de interfaz

Cada vista debe diseñarse para:

- cargando con esqueleto estable;
- sin resultados por filtros;
- dato aún no publicado;
- cobertura parcial;
- dato a revisar;
- error recuperable con identificador de incidencia;
- móvil estrecho y texto largo;
- nombres repetidos o sin código.

No se muestra el estado técnico del worker en mitad de una ficha deportiva. La cobertura enlaza a
una vista de explicación si el usuario necesita detalle.

## 12. Accesibilidad y diseño

Objetivo WCAG 2.2 AA:

- HTML semántico, encabezados ordenados y enlaces con nombre útil;
- foco visible y navegación completa por teclado;
- objetivos táctiles mínimos y sin interacciones sólo por arrastre;
- contraste suficiente y color nunca como única señal;
- tablas con cabeceras y versión móvil que no pierda relaciones;
- gráficos con resumen textual/tabla;
- respetar `prefers-reduced-motion`;
- formularios con etiqueta, descripción de error y conservación del valor;
- no desplazar el contenido al cargar cifras o gráficos.

Fuente normativa: [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 13. Criterio de aceptación UX

Una persona nueva debe poder, sin instrucciones:

1. encontrar una competición de Salamanca en menos de tres interacciones;
2. abrir una jornada y su partido;
3. llegar del acta al jugador y volver conservando el contexto;
4. diferenciar equipo, club y categoría;
5. entender si una cifra es completa o estimada;
6. buscar un nombre sin escribir exactamente sus tildes.

Estas tareas se prueban en móvil y escritorio con datos completos, parciales y vacíos.
