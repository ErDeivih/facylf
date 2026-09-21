# Inventario de filas de descanso guardadas como partido

Generado por `scripts/inventario-descansos.mjs`. Total de casos: **5680**.

Una fila puede tener VARIAS señales, pero pertenece a UNA sola clase causal: la más específica.

## Recuento por clase

| clase | casos |
|---|---:|
| **A** descanso informativo puro | 165 |
| **B** descanso unido a un equipo real | 4729 |
| **C** partido desplazado | 699 |
| **D** duplicado de lectura | 4 |
| **E** marcador de estado pegado al descanso | 83 |
| **F** legítimo o no explicado | 0 |
| **total** | **5680** |

## Por federación y maqueta

| federación | casos |
|---|---:|
| madrid | 3386 |
| valencia | 686 |
| rioja | 647 |
| euskadi | 549 |
| navarra | 293 |
| castilla-la-mancha | 43 |
| ceuta | 36 |
| cantabria | 21 |
| aragon | 17 |
| murcia | 2 |

| maqueta | casos |
|---|---:|
| isquad | 4072 |
| pnfg-clasica | 1000 |
| nova-widget | 608 |

| certeza | casos |
|---|---:|
| demostrado | 4981 |
| probable | 699 |
| sin-determinar | 0 |

## Señales observadas

| señal | casos |
|---|---:|
| literal-de-descanso-en-un-lado | 5680 |
| acta-en-la-fila | 4089 |
| acta-que-no-demuestra-partido-real | 4075 |
| campo-real | 491 |
| marcador-publicado | 292 |
| literal-de-descanso-en-los-dos-lados | 223 |
| marcador-de-estado-pegado-al-descanso | 83 |
| marcador-0-0-de-plantilla-sin-otra-senal | 45 |
| arbitro-publicado | 6 |
| acta-compartida-con-otra-fila-de-la-jornada | 4 |
| pareja-repetida-en-la-jornada | 4 |
| partido-real-del-html-ausente-en-la-cola | 4 |

## Ejemplos por clase

### A · descanso informativo puro (165)

- `ceuta` t13 c1079553 g1079564 J3 ord 4 · maqueta pnfg-clasica
  - «Descansa» vs «Descansa» · acta NULL · marcador NULL · campo null
  - los dos lados son la palabra de descanso y la fila no lleva ningún dato de partido
- `ceuta` t13 c1079553 g1079564 J4 ord 2 · maqueta pnfg-clasica
  - «Descansa» vs «Descansa» · acta NULL · marcador NULL · campo null
  - los dos lados son la palabra de descanso y la fila no lleva ningún dato de partido
- `ceuta` t13 c1079553 g1079564 J7 ord 2 · maqueta pnfg-clasica
  - «Descansa» vs «Descansa» · acta NULL · marcador NULL · campo null
  - los dos lados son la palabra de descanso y la fila no lleva ningún dato de partido
- `ceuta` t13 c1079553 g1079564 J14 ord 4 · maqueta pnfg-clasica
  - «Descansa» vs «Descansa» · acta NULL · marcador NULL · campo null
  - los dos lados son la palabra de descanso y la fila no lleva ningún dato de partido
- `ceuta` t13 c1079553 g1079564 J15 ord 2 · maqueta pnfg-clasica
  - «Descansa» vs «Descansa» · acta NULL · marcador NULL · campo null
  - los dos lados son la palabra de descanso y la fila no lleva ningún dato de partido

### B · descanso unido a un equipo real (4729)

- `aragon` t10 c1045046 g1045436 J1 ord 0 · maqueta nova-widget
  - «HUESCA-S.D. ESCUELA DE FUTBOL "A"» vs «DESCANSA» · acta NULL · marcador NULL · campo null
  - un lado es el descanso y el otro un equipo real, sin ningún dato de partido: indica qué equipo descansa
- `aragon` t10 c1100897 g1107944 J1 ord 0 · maqueta nova-widget
  - «DESCANSA» vs «ALFINDEN-E.F.B. "C"» · acta NULL · marcador NULL · campo null
  - un lado es el descanso y el otro un equipo real, sin ningún dato de partido: indica qué equipo descansa
- `aragon` t12 c1883897 g1896087 J1 ord 1 · maqueta nova-widget
  - «PRADOS DEL REY BARRAGAN-C.D. "A"» vs «DESCANSA» · acta NULL · marcador NULL · campo null
  - un lado es el descanso y el otro un equipo real, sin ningún dato de partido: indica qué equipo descansa
- `aragon` t13 c2434244 g2434256 J1 ord 0 · maqueta nova-widget
  - «HELIOS-C.N. "A"» vs «DESCANSA» · acta NULL · marcador NULL · campo null
  - un lado es el descanso y el otro un equipo real, sin ningún dato de partido: indica qué equipo descansa
- `aragon` t13 c2446474 g2446477 J1 ord 0 · maqueta nova-widget
  - «PINA-C.D.» vs «DESCANSA» · acta NULL · marcador NULL · campo null
  - un lado es el descanso y el otro un equipo real, sin ningún dato de partido: indica qué equipo descansa

### C · partido desplazado (699)

- `cantabria` t12 c5600345 g5600350 J2 ord 0 · maqueta pnfg-clasica
  - «REAL RACING CLUB SAD» vs «Descansa» · acta NULL · marcador 4-0 · campo null
  - la fila lleva datos de un partido real (marcador 4-0)
- `ceuta` t13 c1079553 g1079564 J3 ord 1 · maqueta pnfg-clasica
  - «Descansa» vs «C.D. Natación Ceuta» · acta NULL · marcador 8-0 · campo null
  - la fila lleva datos de un partido real (marcador 8-0)
- `ceuta` t13 c1079553 g1079564 J3 ord 3 · maqueta pnfg-clasica
  - «Puerto Atlético» vs «Descansa» · acta NULL · marcador 6-1 · campo null
  - la fila lleva datos de un partido real (marcador 6-1)
- `ceuta` t13 c1079553 g1079564 J3 ord 5 · maqueta pnfg-clasica
  - «Descansa» vs «Natación Ceuta Atlético» · acta NULL · marcador 0-4 · campo null
  - la fila lleva datos de un partido real (marcador 0-4)
- `ceuta` t13 c1079553 g1079564 J4 ord 1 · maqueta pnfg-clasica
  - «C.D. Natación Ceuta» vs «Descansa» · acta NULL · marcador 3-9 · campo null
  - la fila lleva datos de un partido real (marcador 3-9)

### D · duplicado de lectura (4)

- `aragon` t17 c4806659 g4806661 J1 ord 0 · maqueta nova-widget
  - «DESCANSA» vs «BALSAS PICARRAL-U.D.» · acta 667866 · marcador 1-3 · campo "EL RABAL (antiguo Vadorrey)-C.M.F."
  - la jornada repite esta fila (2 veces la pareja, 2 con la misma acta): es un duplicado de lectura
  - **falta en la cola un partido que el HTML sí publica en esta jornada**
- `aragon` t17 c4806659 g4806661 J1 ord 1 · maqueta nova-widget
  - «DESCANSA» vs «BALSAS PICARRAL-U.D.» · acta 667866 · marcador 1-3 · campo "Descansa"
  - la jornada repite esta fila (2 veces la pareja, 2 con la misma acta): es un duplicado de lectura
  - **falta en la cola un partido que el HTML sí publica en esta jornada**
- `aragon` t17 c5199164 g5199185 J1 ord 0 · maqueta nova-widget
  - «ESCALERILLASDISTRITO 8-AT.» vs «DESCANSA» · acta 693202 · marcador 2-5 · campo "MARIANISTAS Pedro Iturmendi F7-1 (medio campo)"
  - la jornada repite esta fila (2 veces la pareja, 2 con la misma acta): es un duplicado de lectura
  - **falta en la cola un partido que el HTML sí publica en esta jornada**
- `aragon` t17 c5199164 g5199185 J1 ord 1 · maqueta nova-widget
  - «ESCALERILLASDISTRITO 8-AT.» vs «DESCANSA» · acta 693202 · marcador 2-5 · campo "PARQUE OLIVER-C.M.F. F7"
  - la jornada repite esta fila (2 veces la pareja, 2 con la misma acta): es un duplicado de lectura
  - **falta en la cola un partido que el HTML sí publica en esta jornada**

### E · marcador de estado pegado al descanso (83)

- `cantabria` t12 c5598405 g5598410 J2 ord 0 · maqueta pnfg-clasica
  - «(Clasificado) REAL RACING CLUB SAD» vs «Descansa» · acta NULL · marcador NULL · campo null
  - el literal de descanso lleva pegado un marcador de estado, así que la fuente lo trata como un nombre de equipo
- `cantabria` t12 c5598406 g5598414 J2 ord 0 · maqueta pnfg-clasica
  - «(Clasificado) Descansa» vs «R.S. GIMNASTICA» · acta NULL · marcador NULL · campo null
  - el literal de descanso lleva pegado un marcador de estado, así que la fuente lo trata como un nombre de equipo
- `cantabria` t12 c5598406 g5598414 J2 ord 2 · maqueta pnfg-clasica
  - «(Clasificado) Descansa» vs «C.D. CAYON» · acta NULL · marcador NULL · campo null
  - el literal de descanso lleva pegado un marcador de estado, así que la fuente lo trata como un nombre de equipo
- `cantabria` t12 c5598406 g5598414 J2 ord 3 · maqueta pnfg-clasica
  - «Descansa» vs «C.D. LAREDO (Ganador)» · acta NULL · marcador NULL · campo null
  - el literal de descanso lleva pegado un marcador de estado, así que la fuente lo trata como un nombre de equipo
- `cantabria` t13 c5905885 g5905886 J2 ord 0 · maqueta pnfg-clasica
  - «Descansa» vs «R.S. GIMNASTICA (Ganador)» · acta NULL · marcador NULL · campo null
  - el literal de descanso lleva pegado un marcador de estado, así que la fuente lo trata como un nombre de equipo

