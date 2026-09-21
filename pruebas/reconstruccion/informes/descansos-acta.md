# Inventario del acta de las filas de descanso

Generado: 2026-09-16T11:28:07.350Z

Cuenta las filas de `partidos` con un lado **exactamente** en el vocabulario de descanso de alguna
maqueta, y dice qué publica el acta de esa misma fila. El veredicto decide qué se puede hacer con la
fila, así que las cuatro clases son excluyentes y suman el total.

| veredicto | qué dice el acta | filas | consecuencia |
|---|---|---:|---|
| `sin-acta` | se retira | 1594 | se retira |
| `descanso` | se retira | 12 | se retira |
| `partido-real` | NO se retira | 18 | NO se retira: partido desplazado |
| `no-demuestra` | no se retira y no se decide | 4888 | no se retira y no se decide |
| **total** | | **6512** | |

## Por federación

| federación | filas | sin acta | descanso | partido real | no demuestra |
|---|---:|---:|---:|---:|---:|
| aragon | 17 | 13 | 0 | 0 | 4 |
| cantabria | 21 | 21 | 0 | 0 | 0 |
| castilla-la-mancha | 43 | 43 | 0 | 0 | 0 |
| cataluna | 829 | 0 | 0 | 0 | 829 |
| ceuta | 36 | 36 | 0 | 0 | 0 |
| euskadi | 552 | 539 | 12 | 0 | 1 |
| madrid | 3386 | 0 | 0 | 0 | 3386 |
| murcia | 2 | 2 | 0 | 0 | 0 |
| navarra | 293 | 293 | 0 | 0 | 0 |
| rioja | 647 | 647 | 0 | 0 | 0 |
| valencia | 686 | 0 | 0 | 18 | 668 |

## Por extractor y maqueta

La maqueta decide el vocabulario con el que se reconoce el descanso y la evidencia que autoriza a
descartar la fila. Un cambio en el vocabulario de una maqueta se atribuye aquí a las filas que produjo.

| maqueta | extractor | filas | sin acta | descanso | partido real | no demuestra |
|---|---|---:|---:|---:|---:|---:|
| `isquad` | recolector-valencia (código de equipo negativo) | 4072 | 0 | 0 | 18 | 4054 |
| `pnfg-clasica` | extraePartidos (tabla con dos enlaces `NFG_VisEquipos`) | 1059 | 1055 | 0 | 0 | 4 |
| `fcf` | extraePartidos (maqueta clásica) | 829 | 0 | 0 | 0 | 829 |
| `nova-widget` | extraePartidosWidget (subtabla por `tr` interna) | 552 | 539 | 12 | 0 | 1 |

## Partidos desplazados (18)

La fila pone el descanso y el acta de esa misma fila nombra dos equipos reales: **ahí hubo partido**,
así que la fila no se retira y lo que falta es recuperar el partido.

| fila | la cola dice | el acta dice | equipo que falta | ya en la jornada |
|---|---|---|---|---|
| t21 c29509571 g904325856 J1 ord 0 | Descansa vs C.D. L'Alcúdia de Crespins 'A' | Canals Promeses C.F. 'A' / C.D. L'Alcúdia de Crespins 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J2 ord 1 | Ciutat de Xàtiva C.F.B. 'C' vs Descansa | Ciutat de Xàtiva C.F.B. 'C' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J3 ord 1 | Descansa vs C.F.B. Castelló de La Ribera 'A' | Canals Promeses C.F. 'A' / C.F.B. Castelló de La Ribera 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J4 ord 2 | Ciutat d'Alzira F.B. 'A' vs Descansa | Ciutat d'Alzira F.B. 'A' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J5 ord 2 | Descansa vs Inter Xàtiva C.F.B. 'B' | Canals Promeses C.F. 'A' / Inter Xàtiva C.F.B. 'B' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J6 ord 3 | U.D. Carcaixent 'A' vs Descansa | U.D. Carcaixent 'A' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J7 ord 3 | Descansa vs Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' / Canals Promeses C.F. 'A' | · | no |
| t21 c29509571 g904325856 J8 ord 4 | C.D.S.B. Ontinyent 'C' vs Descansa | C.D.S.B. Ontinyent 'C' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J9 ord 4 | Descansa vs C.D. Albaidense 'A' | Canals Promeses C.F. 'A' / C.D. Albaidense 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J10 ord 5 | Ciutat de Xàtiva C.F.B. 'B' vs Descansa | Ciutat de Xàtiva C.F.B. 'B' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J11 ord 5 | Descansa vs Benigànim C.F. 'A' | Canals Promeses C.F. 'A' / Benigànim C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J12 ord 6 | C.D.S.B. Ontinyent 'B' vs Descansa | C.D.S.B. Ontinyent 'B' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J13 ord 6 | Descansa vs Inter Xàtiva C.F.B. 'A' | Canals Promeses C.F. 'A' / Inter Xàtiva C.F.B. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J14 ord 7 | U.E. L'Alcúdia 'A' vs Descansa | U.E. L'Alcúdia 'A' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J15 ord 7 | Descansa vs C.E. Alberic Sucemart 'A' | Canals Promeses C.F. 'A' / C.E. Alberic Sucemart 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J16 ord 0 | C.D. L'Alcúdia de Crespins 'A' vs Descansa | C.D. L'Alcúdia de Crespins 'A' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J17 ord 1 | Descansa vs Ciutat de Xàtiva C.F.B. 'C' | Canals Promeses C.F. 'A' / Ciutat de Xàtiva C.F.B. 'C' | Canals Promeses C.F. 'A' | no |
| t21 c29509571 g904325856 J18 ord 1 | C.F.B. Castelló de La Ribera 'A' vs Descansa | C.F.B. Castelló de La Ribera 'A' / Canals Promeses C.F. 'A' | Canals Promeses C.F. 'A' | no |

## Casos con acta que no demuestra nada

Filas cuyo acta no se pudo leer (sin pareja, ilegible o sin fila en la cola). **No se decide nada con
ellas**: no hay evidencia con la que decidir, y no saber no autoriza a borrar.

| fila | la cola dice | acta | estado del acta |
|---|---|---|---|
| t17 c4806659 g4806661 J1 ord 0 | DESCANSA vs BALSAS PICARRAL-U.D. | 667866 | pendiente |
| t17 c4806659 g4806661 J1 ord 1 | DESCANSA vs BALSAS PICARRAL-U.D. | 667866 | pendiente |
| t17 c5199164 g5199185 J1 ord 0 | ESCALERILLASDISTRITO 8-AT. vs DESCANSA | 693202 | pendiente |
| t17 c5199164 g5199185 J1 ord 1 | ESCALERILLASDISTRITO 8-AT. vs DESCANSA | 693202 | pendiente |
| t22 c58161888 g58161891 J2 ord 5 | Descans vs VILAFANT FC A | 4139791 | ·sin fila· |
| t22 c58161888 g58161891 J3 ord 1 | MONELLS, A.E. A vs Descans | 4139798 | ·sin fila· |
| t22 c58161888 g58161891 J4 ord 4 | Descans vs ALBONS CLUB FUTBOL A | 4139806 | ·sin fila· |
| t22 c58161888 g58161891 J5 ord 2 | SIURANA, U.E A vs Descans | 4139813 | ·sin fila· |
| t22 c58161888 g58161891 J6 ord 3 | Descans vs LA PERA, U.E. A | 4139821 | ·sin fila· |
| t22 c58161888 g58161891 J7 ord 4 | Descans vs FORTIA, C.E. A | 4139829 | ·sin fila· |
| t22 c58161888 g58161891 J8 ord 7 | JAFRE, U.D. A vs Descans | 4139838 | ·sin fila· |
| t22 c58161888 g58161891 J9 ord 5 | Descans vs MEDES L'ESTARTIT , F.C. A | 4139846 | ·sin fila· |
| t22 c58161888 g58161891 J10 ord 1 | FLAÇA, C.D. A vs Descans | 4139855 | ·sin fila· |
| t22 c58161888 g58161891 J11 ord 4 | Descans vs BORRASSA, F.C. B | 4144249 | ·sin fila· |
| t22 c58161888 g58161891 J12 ord 4 | VILADAMAT C.F. A vs Descans | 4139872 | ·sin fila· |
| t22 c58161888 g58161891 J13 ord 5 | Descans vs CAMALLERA, C.F. A | 4139880 | ·sin fila· |
| t22 c58161888 g58161891 J14 ord 4 | ESPORTIU VENTALLÓ, CLUB A vs Descans | 4139889 | ·sin fila· |
| t22 c58161888 g58161891 J15 ord 6 | Descans vs VERGES, C.F. A | 4139897 | ·sin fila· |
| t22 c58161888 g58161891 J16 ord 5 | Descans vs L'ARMENTERA, C.F. A | 4139903 | ·sin fila· |
| t22 c58161888 g58161891 J17 ord 7 | VILAFANT FC A vs Descans | 4139911 | ·sin fila· |
| t22 c58161888 g58161891 J18 ord 4 | Descans vs MONELLS, A.E. A | 4139918 | ·sin fila· |
| t22 c58161888 g58161891 J19 ord 0 | ALBONS CLUB FUTBOL A vs Descans | 4139926 | ·sin fila· |
| t22 c58161888 g58161891 J20 ord 3 | Descans vs SIURANA, U.E A | 4139933 | ·sin fila· |
| t22 c58161888 g58161891 J21 ord 4 | LA PERA, U.E. A vs Descans | 4139941 | ·sin fila· |
| t22 c58161888 g58161891 J22 ord 0 | FORTIA, C.E. A vs Descans | 4139949 | ·sin fila· |
| t22 c58161888 g58161891 J23 ord 4 | Descans vs JAFRE, U.D. A | 4139958 | ·sin fila· |
| t22 c58161888 g58161891 J24 ord 0 | MEDES L'ESTARTIT , F.C. A vs Descans | 4139966 | ·sin fila· |
| t22 c58161888 g58161891 J25 ord 5 | Descans vs FLAÇA, C.D. A | 4139975 | ·sin fila· |
| t22 c58161888 g58161891 J26 ord 6 | BORRASSA, F.C. B vs Descans | 4144241 | ·sin fila· |
| t22 c58161888 g58161891 J27 ord 4 | Descans vs VILADAMAT C.F. A | 4139992 | ·sin fila· |
| t22 c58161888 g58161891 J28 ord 2 | CAMALLERA, C.F. A vs Descans | 4140000 | ·sin fila· |
| t22 c58161888 g58161891 J29 ord 6 | Descans vs ESPORTIU VENTALLÓ, CLUB A | 4140009 | ·sin fila· |
| t22 c58161888 g58161891 J30 ord 1 | VERGES, C.F. A vs Descans | 4140017 | ·sin fila· |
| t22 c58161888 g58161898 J2 ord 2 | Descans vs SUNYER, C.F. | 4164796 | ·sin fila· |
| t22 c58161888 g58161898 J3 ord 6 | SEROS, C.F. A vs Descans | 4164802 | ·sin fila· |
| t22 c58161888 g58161898 J4 ord 2 | Descans vs SUDANELL, C.F. A | 4164809 | ·sin fila· |
| t22 c58161888 g58161898 J5 ord 4 | BALAFIA, C.F.U.E. B vs Descans | 4164815 | ·sin fila· |
| t22 c58161888 g58161898 J6 ord 3 | Descans vs AITONA CLUB ESP. DE FUTBOL | 4164822 | ·sin fila· |
| t22 c58161888 g58161898 J7 ord 6 | BORDETA DE LLEIDA, U.E. A vs Descans | 4164828 | ·sin fila· |
| t22 c58161888 g58161898 J8 ord 2 | Descans vs INTER LLEIDA MANGRANERS C.F. A | 4164835 | ·sin fila· |
| t22 c58161888 g58161898 J9 ord 3 | LLEIDA SEU VELLA , CF A vs Descans | 4164841 | ·sin fila· |
| t22 c58161888 g58161898 J10 ord 2 | Descans vs PARDINYES C.F. B | 4164848 | ·sin fila· |
| t22 c58161888 g58161898 J11 ord 2 | Descans vs AEM, S.E. B | 4164855 | ·sin fila· |
| t22 c58161888 g58161898 J12 ord 0 | ALCARRAS, F.C. B vs Descans | 4164863 | ·sin fila· |
| t22 c58161888 g58161898 J13 ord 1 | Descans vs ALMACELLES , C.E. F. A | 4164870 | ·sin fila· |
| t22 c58161888 g58161898 J14 ord 2 | Descans vs GARDENY, U.D. A | 4164880 | ·sin fila· |
| t22 c58161888 g58161898 J15 ord 2 | SUNYER, C.F. vs Descans | 4164887 | ·sin fila· |
| t22 c58161888 g58161898 J16 ord 2 | Descans vs SEROS, C.F. A | 4164893 | ·sin fila· |
| t22 c58161888 g58161898 J17 ord 3 | SUDANELL, C.F. A vs Descans | 4164900 | ·sin fila· |
| t22 c58161888 g58161898 J18 ord 3 | Descans vs BALAFIA, C.F.U.E. B | 4164906 | ·sin fila· |
| t22 c58161888 g58161898 J19 ord 3 | AITONA CLUB ESP. DE FUTBOL vs Descans | 4164913 | ·sin fila· |
| t22 c58161888 g58161898 J20 ord 2 | Descans vs BORDETA DE LLEIDA, U.E. A | 4164919 | ·sin fila· |
| t22 c58161888 g58161898 J21 ord 0 | INTER LLEIDA MANGRANERS C.F. A vs Descans | 4164926 | ·sin fila· |
| t22 c58161888 g58161898 J22 ord 2 | Descans vs LLEIDA SEU VELLA , CF A | 4164932 | ·sin fila· |
| t22 c58161888 g58161898 J23 ord 1 | PARDINYES C.F. B vs Descans | 4164939 | ·sin fila· |
| t22 c58161888 g58161898 J24 ord 5 | AEM, S.E. B vs Descans | 4164946 | ·sin fila· |
| t22 c58161888 g58161898 J25 ord 1 | Descans vs ALCARRAS, F.C. B | 4164954 | ·sin fila· |
| t22 c58161888 g58161898 J26 ord 6 | ALMACELLES , C.E. F. A vs Descans | 4164961 | ·sin fila· |
| t22 c58161888 g58161899 J2 ord 0 | ARTESA DE LLEIDA,C.E. vs Descans | 4164572 | ·sin fila· |
| t22 c58161888 g58161899 J3 ord 4 | Descans vs BELL-LLOC ATHLETIC CLUB | 4164585 | ·sin fila· |
| t22 c58161888 g58161899 J4 ord 6 | ARBECA, C.F. A vs Descans | 4164586 | ·sin fila· |
| t22 c58161888 g58161899 J5 ord 4 | Descans vs ALCOLETGE, AE. A | 4164599 | ·sin fila· |
| t22 c58161888 g58161899 J6 ord 6 | ALBESA, C.F. A vs Descans | 4164600 | ·sin fila· |
| t22 c58161888 g58161899 J7 ord 4 | Descans vs BENAVENT DE SEGRIA CE. A | 4164613 | ·sin fila· |
| t22 c58161888 g58161899 J8 ord 2 | CASTELLDANS, U.E. A vs Descans | 4164614 | ·sin fila· |
| t22 c58161888 g58161899 J9 ord 3 | Descans vs CF EL POAL A | 4164627 | ·sin fila· |
| t22 c58161888 g58161899 J10 ord 6 | BELLCAIRENC, C.F. A vs Descans | 4164628 | ·sin fila· |
| t22 c58161888 g58161899 J11 ord 2 | Descans vs MIRALCAMP, CF A | 4164641 | ·sin fila· |
| t22 c58161888 g58161899 J12 ord 3 | Descans vs ROSSELLO, C.F. A | 4164642 | ·sin fila· |
| t22 c58161888 g58161899 J13 ord 1 | BELLPUIG, C.F A vs Descans | 4164655 | ·sin fila· |
| t22 c58161888 g58161899 J14 ord 2 | FONDARELLA ,C.F. A vs Descans | 4164662 | ·sin fila· |
| t22 c58161888 g58161899 J15 ord 3 | Descans vs ARTESA DE LLEIDA,C.E. | 4164663 | ·sin fila· |
| t22 c58161888 g58161899 J16 ord 3 | BELL-LLOC ATHLETIC CLUB vs Descans | 4164676 | ·sin fila· |
| t22 c58161888 g58161899 J17 ord 4 | Descans vs ARBECA, C.F. A | 4164677 | ·sin fila· |
| t22 c58161888 g58161899 J18 ord 4 | ALCOLETGE, AE. A vs Descans | 4164690 | ·sin fila· |
| t22 c58161888 g58161899 J19 ord 4 | Descans vs ALBESA, C.F. A | 4164691 | ·sin fila· |
| t22 c58161888 g58161899 J20 ord 5 | BENAVENT DE SEGRIA CE. A vs Descans | 4164704 | ·sin fila· |
| t22 c58161888 g58161899 J21 ord 4 | Descans vs CASTELLDANS, U.E. A | 4164705 | ·sin fila· |
| t22 c58161888 g58161899 J22 ord 1 | CF EL POAL A vs Descans | 4164718 | ·sin fila· |
| t22 c58161888 g58161899 J23 ord 3 | Descans vs BELLCAIRENC, C.F. A | 4164719 | ·sin fila· |
| t22 c58161888 g58161899 J24 ord 0 | MIRALCAMP, CF A vs Descans | 4164732 | ·sin fila· |
| t22 c58161888 g58161899 J25 ord 2 | ROSSELLO, C.F. A vs Descans | 4164733 | ·sin fila· |
| t22 c58161888 g58161899 J26 ord 3 | Descans vs BELLPUIG, C.F A | 4164746 | ·sin fila· |
| t22 c58161888 g58161916 J2 ord 1 | UNIFICACIÓN BELLVITGE, U.D. B vs Descans | 4149764 | ·sin fila· |
| t22 c58161888 g58161916 J3 ord 3 | Descans vs CORNELLA, U.E. SAD B | 4149779 | ·sin fila· |
| t22 c58161888 g58161916 J4 ord 6 | Pª BARC. SANT FELIU LLOBREGAT A vs Descans | 4149780 | ·sin fila· |
| t22 c58161888 g58161916 J5 ord 3 | Descans vs CAN CLOTA- LA PLANA-CAN CERVERA F.C. A | 4149795 | ·sin fila· |
| t22 c58161888 g58161916 J6 ord 3 | CASABLANCA , F.C. A vs Descans | 4149796 | ·sin fila· |
| t22 c58161888 g58161916 J7 ord 3 | Descans vs Pª REC.SAN FELIU LLOBREGAT A | 4149811 | ·sin fila· |
| t22 c58161888 g58161916 J8 ord 6 | SANT ILDEFONS, U.E. B vs Descans | 4149812 | ·sin fila· |
| t22 c58161888 g58161916 J9 ord 3 | Descans vs ESPLUGUENC, C.F.A. B | 4149827 | ·sin fila· |
| t22 c58161888 g58161916 J10 ord 0 | GORNAL, U.D. C vs Descans | 4149828 | ·sin fila· |
| t22 c58161888 g58161916 J12 ord 2 | SANT JUST DESVERN CLUB FUTBOL B vs Descans | 4149844 | ·sin fila· |
| t22 c58161888 g58161916 J13 ord 4 | Descans vs SANT LLUIS ASSOCIACIÓ ESPORTIVA B | 4149859 | ·sin fila· |
| t22 c58161888 g58161916 J14 ord 2 | Descans vs LA FLORIDA C.F. C | 4149860 | ·sin fila· |
| t22 c58161888 g58161916 J15 ord 2 | ALMEDA, C.D. C vs Descans | 4149875 | ·sin fila· |
| t22 c58161888 g58161916 J16 ord 4 | ATHLETIC VILADECANS FUTBOL CLUB B vs Descans | 4149883 | ·sin fila· |
| t22 c58161888 g58161916 J17 ord 3 | Descans vs UNIFICACIÓN BELLVITGE, U.D. B | 4149884 | ·sin fila· |
| t22 c58161888 g58161916 J18 ord 0 | CORNELLA, U.E. SAD B vs Descans | 4149899 | ·sin fila· |
| t22 c58161888 g58161916 J19 ord 3 | Descans vs Pª BARC. SANT FELIU LLOBREGAT A | 4149900 | ·sin fila· |
| t22 c58161888 g58161916 J20 ord 6 | CAN CLOTA- LA PLANA-CAN CERVERA F.C. A vs Descans | 4149915 | ·sin fila· |
| t22 c58161888 g58161916 J21 ord 3 | Descans vs CASABLANCA , F.C. A | 4149916 | ·sin fila· |
| t22 c58161888 g58161916 J22 ord 1 | Pª REC.SAN FELIU LLOBREGAT A vs Descans | 4149931 | ·sin fila· |
| t22 c58161888 g58161916 J23 ord 3 | Descans vs SANT ILDEFONS, U.E. B | 4149932 | ·sin fila· |
| t22 c58161888 g58161916 J24 ord 3 | ESPLUGUENC, C.F.A. B vs Descans | 4149947 | ·sin fila· |
| t22 c58161888 g58161916 J25 ord 3 | Descans vs GORNAL, U.D. C | 4149948 | ·sin fila· |
| t22 c58161888 g58161916 J27 ord 4 | Descans vs SANT JUST DESVERN CLUB FUTBOL B | 4149964 | ·sin fila· |
| t22 c58161888 g58161916 J28 ord 6 | SANT LLUIS ASSOCIACIÓ ESPORTIVA B vs Descans | 4149979 | ·sin fila· |
| t22 c58161888 g58161916 J29 ord 4 | LA FLORIDA C.F. C vs Descans | 4149980 | ·sin fila· |
| t22 c58161888 g58161916 J30 ord 2 | Descans vs ALMEDA, C.D. C | 4149995 | ·sin fila· |
| t22 c58161888 g58161917 J2 ord 0 | ALMEDA, C.D. B vs Descans | 4150005 | ·sin fila· |
| t22 c58161888 g58161917 J3 ord 4 | Descans vs SECTOR MONTSERRATINA U.D. B | 4150020 | ·sin fila· |
| t22 c58161888 g58161917 J4 ord 4 | CAN CLOTA- LA PLANA-CAN CERVERA F.C. B vs Descans | 4150021 | ·sin fila· |
| t22 c58161888 g58161917 J5 ord 4 | Descans vs CASABLANCA , F.C. B | 4150036 | ·sin fila· |
| t22 c58161888 g58161917 J6 ord 7 | CASTELLDEFELS, U.E. C vs Descans | 4150037 | ·sin fila· |
| t22 c58161888 g58161917 J7 ord 4 | Descans vs ESCUELA F. BONAIRE C | 4150052 | ·sin fila· |
| t22 c58161888 g58161917 J8 ord 0 | Pª UNION D. MALAGA, CLUB B vs Descans | 4150053 | ·sin fila· |
| t22 c58161888 g58161917 J9 ord 4 | Descans vs SOL NACIENTE, FC A | 4150068 | ·sin fila· |
| t22 c58161888 g58161917 J10 ord 5 | MARIANAO POBLET UD C vs Descans | 4150069 | ·sin fila· |
| t22 c58161888 g58161917 J11 ord 3 | Descans vs SPORTING GAVA 2021, FUTBOL CLUB A | 4150084 | ·sin fila· |
| t22 c58161888 g58161917 J12 ord 6 | CAN ROCA, C.F. A vs Descans | 4150085 | ·sin fila· |
| t22 c58161888 g58161917 J13 ord 2 | Descans vs VISTA ALEGRE,U.D. C | 4150100 | ·sin fila· |
| t22 c58161888 g58161917 J14 ord 4 | Descans vs VILADECANS U.D. C | 4150101 | ·sin fila· |
| t22 c58161888 g58161917 J15 ord 1 | BEGUES, C.F. B vs Descans | 4150116 | ·sin fila· |
| t22 c58161888 g58161917 J16 ord 1 | CIUDAD COOPERATIVA, C.F. B vs Descans | 4150124 | ·sin fila· |
| t22 c58161888 g58161917 J17 ord 4 | Descans vs ALMEDA, C.D. B | 4150125 | ·sin fila· |
| t22 c58161888 g58161917 J18 ord 0 | SECTOR MONTSERRATINA U.D. B vs Descans | 4150140 | ·sin fila· |
| t22 c58161888 g58161917 J19 ord 4 | Descans vs CAN CLOTA- LA PLANA-CAN CERVERA F.C. B | 4150141 | ·sin fila· |
| t22 c58161888 g58161917 J20 ord 2 | CASABLANCA , F.C. B vs Descans | 4150156 | ·sin fila· |
| t22 c58161888 g58161917 J21 ord 4 | Descans vs CASTELLDEFELS, U.E. C | 4150157 | ·sin fila· |
| t22 c58161888 g58161917 J22 ord 3 | ESCUELA F. BONAIRE C vs Descans | 4150172 | ·sin fila· |
| t22 c58161888 g58161917 J23 ord 4 | Descans vs Pª UNION D. MALAGA, CLUB B | 4150173 | ·sin fila· |
| t22 c58161888 g58161917 J24 ord 4 | SOL NACIENTE, FC A vs Descans | 4150188 | ·sin fila· |
| t22 c58161888 g58161917 J25 ord 4 | Descans vs MARIANAO POBLET UD C | 4150189 | ·sin fila· |
| t22 c58161888 g58161917 J26 ord 1 | SPORTING GAVA 2021, FUTBOL CLUB A vs Descans | 4150204 | ·sin fila· |
| t22 c58161888 g58161917 J27 ord 3 | Descans vs CAN ROCA, C.F. A | 4150205 | ·sin fila· |
| t22 c58161888 g58161917 J28 ord 2 | VISTA ALEGRE,U.D. C vs Descans | 4150220 | ·sin fila· |
| t22 c58161888 g58161917 J29 ord 6 | VILADECANS U.D. C vs Descans | 4150221 | ·sin fila· |
| t22 c58161888 g58161917 J30 ord 4 | Descans vs BEGUES, C.F. B | 4150236 | ·sin fila· |
| t22 c58161888 g58161918 J2 ord 4 | Descans vs Pª BARC. SANT FELIU LLOBREGAT B | 4150252 | ·sin fila· |
| t22 c58161888 g58161918 J3 ord 5 | PAPIOL, U.E. A vs Descans | 4150259 | ·sin fila· |
| t22 c58161888 g58161918 J4 ord 5 | Descans vs LA PALMA CERVELLO, U.E. A | 4150267 | ·sin fila· |
| t22 c58161888 g58161918 J5 ord 1 | PALLEJA, C.F. B vs Descans | 4150274 | ·sin fila· |
| t22 c58161888 g58161918 J6 ord 3 | Descans vs CAN PARELLADA, C.D. C | 4150282 | ·sin fila· |
| t22 c58161888 g58161918 J7 ord 6 | ABRERA, A.E. B vs Descans | 4150289 | ·sin fila· |
| t22 c58161888 g58161918 J8 ord 2 | Descans vs CERVELLO, C.D. A | 4150297 | ·sin fila· |
| t22 c58161888 g58161918 J9 ord 3 | INCRESA ATLETICO CLUB FUTBOL A vs Descans | 4150304 | ·sin fila· |
| t22 c58161888 g58161918 J10 ord 3 | Descans vs Pª REC.SAN FELIU LLOBREGAT B | 4150312 | ·sin fila· |
| t22 c58161888 g58161918 J11 ord 7 | Pª BLANC BLAVA SANT FELIU LL. A vs Descans | 4150319 | ·sin fila· |
| t22 c58161888 g58161918 J12 ord 3 | Descans vs SANT JOAN DESPI-SAN PANCRACIO, FUTBOL CLUB A | 4150327 | ·sin fila· |
| t22 c58161888 g58161918 J13 ord 6 | SANT LLUIS ASSOCIACIÓ ESPORTIVA A vs Descans | 4150334 | ·sin fila· |
| t22 c58161888 g58161918 J14 ord 6 | CORBERA , C.F. B vs Descans | 4150342 | ·sin fila· |
| t22 c58161888 g58161918 J15 ord 4 | Descans vs ESPARREGUERA, C.E. A | 4150350 | ·sin fila· |
| t22 c58161888 g58161918 J16 ord 4 | Descans vs Pª BARC. SANT VICENÇ HORTS B | 4150364 | ·sin fila· |
| t22 c58161888 g58161918 J17 ord 7 | Pª BARC. SANT FELIU LLOBREGAT B vs Descans | 4150372 | ·sin fila· |
| t22 c58161888 g58161918 J18 ord 4 | Descans vs PAPIOL, U.E. A | 4150379 | ·sin fila· |
| t22 c58161888 g58161918 J19 ord 3 | LA PALMA CERVELLO, U.E. A vs Descans | 4150387 | ·sin fila· |
| t22 c58161888 g58161918 J20 ord 3 | Descans vs PALLEJA, C.F. B | 4150394 | ·sin fila· |
| t22 c58161888 g58161918 J21 ord 3 | CAN PARELLADA, C.D. C vs Descans | 4150402 | ·sin fila· |
| t22 c58161888 g58161918 J22 ord 2 | Descans vs ABRERA, A.E. B | 4150409 | ·sin fila· |
| t22 c58161888 g58161918 J23 ord 6 | CERVELLO, C.D. A vs Descans | 4150417 | ·sin fila· |
| t22 c58161888 g58161918 J24 ord 3 | Descans vs INCRESA ATLETICO CLUB FUTBOL A | 4150424 | ·sin fila· |
| t22 c58161888 g58161918 J25 ord 1 | Pª REC.SAN FELIU LLOBREGAT B vs Descans | 4150432 | ·sin fila· |
| t22 c58161888 g58161918 J26 ord 3 | Descans vs Pª BLANC BLAVA SANT FELIU LL. A | 4150439 | ·sin fila· |
| t22 c58161888 g58161918 J27 ord 4 | SANT JOAN DESPI-SAN PANCRACIO, FUTBOL CLUB A vs Descans | 4150447 | ·sin fila· |
| t22 c58161888 g58161918 J28 ord 4 | Descans vs SANT LLUIS ASSOCIACIÓ ESPORTIVA A | 4150454 | ·sin fila· |
| t22 c58161888 g58161918 J29 ord 4 | Descans vs CORBERA , C.F. B | 4150462 | ·sin fila· |
| t22 c58161888 g58161918 J30 ord 0 | ESPARREGUERA, C.E. A vs Descans | 4150470 | ·sin fila· |
| t22 c58161888 g58161919 J2 ord 5 | Descans vs ESPARREGUERA, C.E. B | 4150492 | ·sin fila· |
| t22 c58161888 g58161919 J3 ord 2 | VALLIRANA C.F. B vs Descans | 4150499 | ·sin fila· |
| t22 c58161888 g58161919 J4 ord 5 | Descans vs MEDIONA, C.F. A | 4150507 | ·sin fila· |
| t22 c58161888 g58161919 J5 ord 7 | FUNDACIO E. ATLETIC VILAFRANCA B vs Descans | 4150514 | ·sin fila· |
| t22 c58161888 g58161919 J6 ord 5 | Descans vs ATHLETIC CLUB ESPARREGUERA A | 4150522 | ·sin fila· |
| t22 c58161888 g58161919 J7 ord 0 | Pª BLAUGRANA CERVELLO A vs Descans | 4150529 | ·sin fila· |
| t22 c58161888 g58161919 J8 ord 5 | Descans vs CERVELLO, C.D. B | 4150537 | ·sin fila· |
| t22 c58161888 g58161919 J9 ord 5 | PAPIOL, U.E. B vs Descans | 4150544 | ·sin fila· |
| t22 c58161888 g58161919 J10 ord 4 | Descans vs CAPELLADES, C.F. B | 4150552 | ·sin fila· |
| t22 c58161888 g58161919 J11 ord 2 | SANT ESTEVE SESROVIRES, F.C. B vs Descans | 4150559 | ·sin fila· |
| t22 c58161888 g58161919 J12 ord 3 | Descans vs SANT ANDREU DE LA BARCA AGRUP. B | 4150567 | ·sin fila· |
| t22 c58161888 g58161919 J13 ord 6 | Descans vs TOUS, U.E. B | 4150575 | ·sin fila· |
| t22 c58161888 g58161919 J14 ord 0 | OLESA,C.F. A vs Descans | 4150584 | ·sin fila· |
| t22 c58161888 g58161919 J15 ord 5 | Descans vs CANYELLES ASSOC. ESP. CF. B | 4150592 | ·sin fila· |
| t22 c58161888 g58161919 J16 ord 5 | Descans vs INCRESA ATLETICO CLUB FUTBOL B | 4150604 | ·sin fila· |
| t22 c58161888 g58161919 J17 ord 5 | ESPARREGUERA, C.E. B vs Descans | 4150612 | ·sin fila· |
| t22 c58161888 g58161919 J18 ord 5 | Descans vs VALLIRANA C.F. B | 4150619 | ·sin fila· |
| t22 c58161888 g58161919 J19 ord 4 | MEDIONA, C.F. A vs Descans | 4150627 | ·sin fila· |
| t22 c58161888 g58161919 J20 ord 5 | Descans vs FUNDACIO E. ATLETIC VILAFRANCA B | 4150634 | ·sin fila· |
| t22 c58161888 g58161919 J21 ord 2 | ATHLETIC CLUB ESPARREGUERA A vs Descans | 4150642 | ·sin fila· |
| t22 c58161888 g58161919 J22 ord 5 | Descans vs Pª BLAUGRANA CERVELLO A | 4150649 | ·sin fila· |
| t22 c58161888 g58161919 J23 ord 1 | CERVELLO, C.D. B vs Descans | 4150657 | ·sin fila· |
| t22 c58161888 g58161919 J24 ord 4 | Descans vs PAPIOL, U.E. B | 4150664 | ·sin fila· |
| t22 c58161888 g58161919 J25 ord 0 | CAPELLADES, C.F. B vs Descans | 4150672 | ·sin fila· |
| t22 c58161888 g58161919 J26 ord 3 | Descans vs SANT ESTEVE SESROVIRES, F.C. B | 4150679 | ·sin fila· |
| t22 c58161888 g58161919 J27 ord 5 | SANT ANDREU DE LA BARCA AGRUP. B vs Descans | 4150687 | ·sin fila· |
| t22 c58161888 g58161919 J28 ord 4 | TOUS, U.E. B vs Descans | 4150695 | ·sin fila· |
| t22 c58161888 g58161919 J29 ord 5 | Descans vs OLESA,C.F. A | 4150704 | ·sin fila· |
| t22 c58161888 g58161919 J30 ord 1 | CANYELLES ASSOC. ESP. CF. B vs Descans | 4150712 | ·sin fila· |
| t22 c58161888 g58983723 J2 ord 0 | COLL DE NARGO, C.F. A vs Descans | 4231954 | ·sin fila· |
| t22 c58161888 g58983723 J3 ord 4 | Descans vs BUTSENIT, C.F. A | 4231967 | ·sin fila· |
| t22 c58161888 g58983723 J4 ord 1 | SANT RAMON , F.C. A vs Descans | 4231968 | ·sin fila· |

(se listan 200 de 4888; el JSON los lleva todos)

