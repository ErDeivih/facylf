# Inferencia histórica de movimientos entre divisiones

Generado por `scripts/prediccion/infiere-arrastres.mjs`. Cada fila compara los clubes de una división
en dos temporadas consecutivas. **No es una verdad oficial**: sirve para ver si el número directo del
reglamento necesita arrastre y para detectar temporadas con movimientos anómalos.

## aficionados · primera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2012-13 → 2013-14 | 4 → 204 | 1 | 201 | C.D. Cebrereña |
| 2013-14 → 2014-15 | 204 → 200 | 40 | 36 | C.D Gabemar Aliste · C.D Muga de Sayago · C.D Tecozam |
| 2014-15 → 2015-16 | 200 → 200 | 32 | 32 | Atlético Barraco C.F. · C.D. Piedralaves · C.D. Alfoz de Quintanadueñas |
| 2015-16 → 2016-17 | 200 → 191 | 27 | 18 | Pedro Bernardo C.F. · C. D. Matarrosa · C.D. Dehesas |
| 2016-17 → 2017-18 | 191 → 182 | 31 | 22 | C.D. Burgalés · C.D. Laciana · C.D.F. Peña |
| 2017-18 → 2018-19 | 182 → 185 | 19 | 22 | Deportivo Club Arenal · Frias C.F. · Real Burgos C.F. S.A.D. "B" |
| 2018-19 → 2019-20 | 185 → 192 | 21 | 28 | C.D. Casillas · C.D. Cuevas · C.D. Alba Castellae |
| 2019-20 → 2020-21 | 192 → 58 | 136 | 2 | Atlético Barraco C.F. · C. D. Navatalgordo · C.D. Guisando |
| 2020-21 → 2021-22 | 58 → 210 | 3 | 155 | C.D. Castilla - Palencia · C.D. Tres Columnas · C.D. Tsacianiegu |
| 2021-22 → 2022-23 | 210 → 197 | 32 | 19 | C.D. Becerril · Real Burgos C.F. S.A.D. · Unami C.P. |
| 2022-23 → 2023-24 | 197 → 202 | 41 | 46 | C.D. Cebrereña · C.D. Colegios Diocesanos · C.D. La Granja |
| 2023-24 → 2024-25 | 202 → 202 | 35 | 35 | C.F. Briviesca Norpetrol · Racing Lermeño C.F. · C.D. Mijares de Fútbol |
| 2024-25 → 2025-26 | 202 → 190 | 43 | 31 | C.D. Colegios Diocesanos · C.F. Burgohondo · D.C. Piedralaves |
| 2025-26 → 2026-27 | 190 → 190 | 29 | 29 | C.D. Casillas · Moraleja C.F. · Salamanca C.F. UDS "B" |

## aficionados · segunda

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 88 → 71 | 34 | 17 | C.D. Caucense · C.D. Chañe · C.D. Eresma |
| 2014-15 → 2015-16 | 71 → 47 | 38 | 14 | C. y D. Leonesa S.A.D. "B" · C.D. Berciano-Villadepalos · S.D. Ponferradina S.A.D. "B" |
| 2015-16 → 2016-17 | 47 → 49 | 18 | 20 | Atlético Paramés · C.D. Huracan Z · C.D.F. Peña |
| 2016-17 → 2017-18 | 49 → 38 | 19 | 8 | C. D. Garaballes · C.D. Sahagún Promesas · C.D.F. Eria |
| 2017-18 → 2018-19 | 38 → 36 | 9 | 7 | Atlético Pinilla · C.D. Caboalles de Abajo · C.D. Laciana |
| 2018-19 → 2019-20 | 36 → 38 | 10 | 12 | Boñar C.F. · C.D.F. Santovenia de La Valdoncina · C.D. IE University Athletics |
| 2021-22 → 2022-23 | 41 → 49 | 16 | 24 | C.D. La Bañeza · León C.F. · Lliones F.C. |
| 2022-23 → 2023-24 | 49 → 48 | 18 | 17 | C. D. Navatalgordo · D.C. Piedralaves · Deportivo Club Arenal |
| 2023-24 → 2024-25 | 48 → 62 | 13 | 27 | U.D. Serranillos · Atlético Trobajo H · C. y D. Leonesa S.A.D. "C" |
| 2024-25 → 2025-26 | 62 → 64 | 23 | 25 | La Adrada C.F. · Real Ávila C.F. S.A.D. Promesas · Atlético Bembibre "B" |
| 2025-26 → 2026-27 | 64 → 63 | 19 | 18 | C.F. El Tiemblo · C.P. Piedralaves · Casavieja C.F. |

## aficionados · tercera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2015-16 → 2016-17 | 16 → 23 | 4 | 11 | C.D. Don Bosco · C.D. Rueda "B" · C.D.F. El Sequillo |
| 2016-17 → 2017-18 | 23 → 18 | 8 | 3 | C.D. Atlético Peñaflor · C.D. Juventud Rondilla "B" · C.D. Torrelobaton |
| 2017-18 → 2018-19 | 18 → 18 | 5 | 5 | C.D. Cabezón · C.D. Renedo de Esgueva · C.D. Rioseco "B" |
| 2018-19 → 2019-20 | 18 → 18 | 4 | 4 | Betis C.F. "B" · C.D. Medinense · C.D. San Agustín Valladolid "B" |
| 2021-22 → 2022-23 | 22 → 24 | 6 | 8 | C.D. Cigales · C.D. Parquesol · C.D. Laguna "B" |
| 2022-23 → 2023-24 | 24 → 22 | 7 | 5 | Atlético de Laguna · C.D. Iscar · C.D. La Seca |
| 2023-24 → 2024-25 | 22 → 25 | 6 | 9 | Atlético Portillo · C.D.F. Mojados "B" · C.D. Cigales |
| 2024-25 → 2025-26 | 25 → 27 | 5 | 7 | C.D. La Seca · C.D. San Nicolás · Villanubla C.F. |
| 2025-26 → 2026-27 | 27 → 31 | 6 | 10 | C.D. ADEV Zafiro · C.D. Juventud Rondilla "B" · C.D. Unión Arroyo "B" |

## aficionados · tercera-federacion

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 20 → 20 | 5 | 5 | Atlético Astorga F.C. · Racing Lermeño C.F. · Real Valladolid C.F. S.A.D. |
| 2014-15 → 2015-16 | 20 → 20 | 5 | 5 | Arandina C.F. · C.D. La Granja · C.D. Villa de Simancas |
| 2015-16 → 2016-17 | 20 → 20 | 4 | 4 | C.D. Becerril · C.D. Palencia Balompié · Ciudad Rodrigo C.F. |
| 2016-17 → 2017-18 | 20 → 20 | 4 | 4 | C.D. Mirandés S.A.D. "B" · C.D. Villamuriel · C.D. Villaralbo |

## alevin · desconocida

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2024-25 → 2025-26 | 17 → 14 | 14 | 11 | Atlético Benavente F.S. Automóviles Jáñez · Burgos C.F. S.A.D. Femenino · C.D. Calasanz de Soria |

## alevin · primera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 25 → 153 | 3 | 131 | C.D. Valverde · Unión F.S. Segovia · C.D. San Jose Obrero |
| 2014-15 → 2015-16 | 153 → 139 | 35 | 21 | C.D. Juan de Yepes · El Pradillo C.F. · C.D. Intrepidos de La Vega |
| 2015-16 → 2016-17 | 139 → 121 | 36 | 18 | C.F.S. Zamora · Arévalo C.F. · Atlético Candeleda |
| 2016-17 → 2017-18 | 121 → 121 | 18 | 18 | C.D. Juan de Yepes · P. Casa Social Católica · Atlético Benavente F.S. |
| 2017-18 → 2018-19 | 121 → 122 | 17 | 18 | C.D. Mirandés Promesas Charca · C.D. San Pedro · Atlético Templario |
| 2018-19 → 2019-20 | 122 → 130 | 15 | 23 | Burgos U.D. · C.D. Internacional Vista Alegre · Atlético Bembibre |
| 2021-22 → 2022-23 | 138 → 132 | 23 | 17 | Capiscol C.F. · Vadillos C.F. · Villarcayo Nela C.F. |
| 2022-23 → 2023-24 | 132 → 141 | 30 | 39 | Burgos C.F. Promesas · Gª Segoviana C.F. · Zamora Club de Futbol S.A.D. |
| 2023-24 → 2024-25 | 141 → 149 | 27 | 35 | C.D. Mirandés Promesas Charca · C.F. Briviesca Norpetrol · C.D. Juventud Villaquilambre Caja Rural |
| 2024-25 → 2025-26 | 149 → 142 | 38 | 31 | C.D. Milagrosa-Las Nieves · D.C. Piedralaves · Arandina C.F. |
| 2025-26 → 2026-27 | 142 → 149 | 23 | 30 | Arévalo C.F. · Atlético Candeleda · C.P. Piedralaves |

## alevin · segunda

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2014-15 → 2015-16 | 177 → 137 | 76 | 36 | El Pradillo C.F. "B" · C.D. F. La Fanega · C.D. Quintanar |
| 2015-16 → 2016-17 | 137 → 139 | 34 | 36 | C.D. Juan de Yepes · C.D. Las Navas · Real Ávila C.F. S.A.D. "B" |
| 2016-17 → 2017-18 | 139 → 135 | 34 | 30 | Arévalo C.F. · Deportivo Arenas C.F. "B" · C.D. Alfoz de Quintanadueñas |
| 2017-18 → 2018-19 | 135 → 137 | 32 | 34 | C.D. Juan de Yepes · El Barco C.F. · C.D. Burgalés |
| 2018-19 → 2019-20 | 137 → 138 | 29 | 30 | C.D. Aranda Riber · C.D. Arcos de la LLana · Vadillos C.F. "B" |
| 2021-22 → 2022-23 | 134 → 126 | 38 | 30 | C.D. Groggys s Gamonal "B" · C.D. Grupo Antolín "B" · C.D. Internacional Vista Alegre |
| 2022-23 → 2023-24 | 126 → 137 | 29 | 40 | Atlético Candeleda · Burgos C.F. Promesas "B" · Burgos U.D. |
| 2023-24 → 2024-25 | 137 → 138 | 33 | 34 | Arévalo C.F. · C.D. Milagrosa-Las Nieves "B" · Deportivo Arenas C.F. "B" |
| 2024-25 → 2025-26 | 138 → 132 | 36 | 30 | Arandina C.F. "B" · C.D. Mirandés Promesas Charca · C.D.B. Condado de Castilla |
| 2025-26 → 2026-27 | 132 → 135 | 24 | 27 | Atlético Candeleda "B" · C.F. El Tiemblo · C.D. Arcos de la Llana |

## alevin · tercera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2014-15 → 2015-16 | 38 → 139 | 6 | 107 | C.D. Las Navas · C.D. San Cristóbal Castilla · C.D. La Salle |
| 2015-16 → 2016-17 | 139 → 155 | 20 | 36 | C.D. Burgalés "B" · Racing Lermeño C.F. · C.D. Grupo Antolín "B" |
| 2016-17 → 2017-18 | 155 → 28 | 134 | 7 | C.D. Bosco de Arévalo "C" · C.D. Colegios Diocesanos "C" · C.D. Juan de Yepes "B" |
| 2017-18 → 2018-19 | 28 → 158 | 2 | 132 | C.D. Barrio El Zurguen · C.D.F. Chamberí "B" |
| 2018-19 → 2019-20 | 158 → 157 | 24 | 23 | C.D. Las Navas "C" · P. Casa Social Católica "B" · Capiscol C.F. "B" |
| 2021-22 → 2022-23 | 138 → 166 | 25 | 53 | C.D. Milagrosa - Las Nieves "B" · F.C. El Hoyo de Pinares · Pedro Bernardo C.F. |
| 2022-23 → 2023-24 | 166 → 169 | 37 | 40 | Arévalo C.F. · Atlético Candeleda "B" · Deportivo Arenas C.F. "B" |
| 2023-24 → 2024-25 | 169 → 180 | 26 | 37 | C.D. Burgalés "B" · C.D. Alba Castellae · C.D. Cuatrovientos "B" |
| 2024-25 → 2025-26 | 180 → 170 | 38 | 28 | Atlético Candeleda "B" · C.F. El Tiemblo "B" · Arandina C.F. "C" |
| 2025-26 → 2026-27 | 170 → 158 | 33 | 21 | C.P. Piedralaves · Arévalo C.F. "B" · C.D. COLEGIOS DIOCESANOS F "F" |

## benjamin · desconocida

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2024-25 → 2025-26 | 12 → 12 | 10 | 10 | C.D. Colegios Diocesanos · C.D. Diego de Colmenares · C.D. San Pedro Buprocon |

## benjamin · primera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 40 → 141 | 12 | 113 | C.D. Camarzana y Los Valles · C.D. Intrepidos de La Vega · Independiente de Segovia "B" |
| 2014-15 → 2015-16 | 141 → 140 | 28 | 27 | El Pradillo C.F. · C.F.S. La Bañeza · C.D. Groggys s Gamonal |
| 2015-16 → 2016-17 | 140 → 142 | 19 | 21 | C.D. Juan de Yepes · C.D. Grupo Antolín · C.D. San Pedro |
| 2016-17 → 2017-18 | 142 → 122 | 37 | 17 | P. Casa Social Católica · Atlético Benavente F.S. · C.F.S. La Bañeza |
| 2017-18 → 2018-19 | 122 → 122 | 19 | 19 | C.D. Juan de Yepes · C.D. Zona Norte · C.D. Tardajos F. |
| 2018-19 → 2019-20 | 122 → 121 | 20 | 19 | P. Casa Social Católica · C.F. Briviesca · Deportiva C.F. |
| 2021-22 → 2022-23 | 133 → 128 | 19 | 14 | C.D. Arcos de la LLana · C.D. Groggys s Gamonal · C.D.B. Condado de Castilla |
| 2022-23 → 2023-24 | 128 → 126 | 31 | 29 | Burgos C.F. Promesas · C.D. Burgalés · C.D. San Pedro |
| 2023-24 → 2024-25 | 126 → 130 | 17 | 21 | C.D.F. Padre Claret · C.D. Milagrosa-Las Nieves · Arandina C.F. |
| 2024-25 → 2025-26 | 130 → 121 | 33 | 24 | Burgos C.F. S.A.D. Femenino · Deportiva C.F. · Atlético Benavente F.S. |
| 2025-26 → 2026-27 | 121 → 125 | 23 | 27 | C.D. Arcos de la Llana · C.D. Groggys's Gamonal · C.D.F. Peña |

## benjamin · segunda

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2014-15 → 2015-16 | 175 → 133 | 75 | 33 | C.D. Juan de Yepes "B" · P. Casa Social Católica "B" · C.D. Alfoz de Quintanadueñas |
| 2015-16 → 2016-17 | 133 → 137 | 29 | 33 | Burgos U.D. "B" · C.D. Alba Castellae · C.D. Tardajos F. |
| 2016-17 → 2017-18 | 137 → 137 | 35 | 35 | Arévalo C.F. · C.D. Juan de Yepes · C.D. Burgalés |
| 2017-18 → 2018-19 | 137 → 136 | 29 | 28 | P. Casa Social Católica · C.F. Briviesca "B" · Capiscol C.F. |
| 2018-19 → 2019-20 | 136 → 135 | 29 | 28 | El Barco C.F. · C.D. Arcos de la LLana · C.D. Casco Viejo "B" |
| 2021-22 → 2022-23 | 113 → 127 | 27 | 41 | C.D. Milagrosa - Las Nieves "B" · Alcázar C.D. · C.D. Alfoz de Quintanadueñas "B" |
| 2022-23 → 2023-24 | 127 → 128 | 36 | 37 | F.C. El Hoyo de Pinares · Arandina C.F. "B" · Burgos C.F. Promesas "B" |
| 2023-24 → 2024-25 | 128 → 137 | 27 | 36 | C.D. Bosco de Arévalo "B" · Deportivo Arenas C.F. "B" · Burgos C.F. S.A.D. Femenino |
| 2024-25 → 2025-26 | 137 → 129 | 40 | 32 | C.F. El Tiemblo · Arandina C.F. · C.D. Tardajos |
| 2025-26 → 2026-27 | 129 → 110 | 42 | 23 | Arévalo C.F. · C.P. Piedralaves · F.C. El Hoyo de Pinares |

## benjamin · tercera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2014-15 → 2015-16 | 33 → 114 | 13 | 94 | C.D. Bosco de Arévalo · P. Casa Social Católica "C" · C.D. Alba Castellae "B" |
| 2015-16 → 2016-17 | 114 → 121 | 21 | 28 | C.D. Juventud del Círculo Católico "C" · C.D.B. Condado de Castilla · C.F. Briviesca "B" |
| 2016-17 → 2017-18 | 121 → 25 | 101 | 5 | C.D. Colegios Diocesanos "C" · C.D. Las Navas "B" · C.D. Linko "C" |
| 2017-18 → 2018-19 | 25 → 110 | 6 | 91 | C.D. Barrio El Zurguen · C.D. Peñaranda Bracamonte "B" · C.D. Salesianos Salamanca |
| 2018-19 → 2019-20 | 110 → 134 | 22 | 46 | Arévalo C.F. "B" · C.D. Alba Castellae "B" · C.D. Tardajos F. "B" |
| 2021-22 → 2022-23 | 102 → 129 | 19 | 46 | F.C. El Hoyo de Pinares · Pedro Bernardo C.F. · C.D. Nuestra Señora de Belén |
| 2022-23 → 2023-24 | 129 → 148 | 32 | 51 | C.D. Bosco de Arévalo "C" · Deportivo Arenas C.F. "B" · Burgos C.F. Promesas "C" |
| 2023-24 → 2024-25 | 148 → 134 | 41 | 27 | Atlético Candeleda · C.F. El Tiemblo · Burgos U.D. "B" |
| 2024-25 → 2025-26 | 134 → 123 | 39 | 28 | Arévalo C.F. · D.C. Piedralaves · F.C. El Hoyo de Pinares |
| 2025-26 → 2026-27 | 123 → 126 | 37 | 40 | C.D. Las Navas · Deportivo Arenas C.F. "B" · C.D. Bosco de Arévalo "B" |

## cadete · desconocida

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|

## cadete · primera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 133 → 130 | 26 | 23 | C.D. Cebrereña "A" · Alcázar C.D. · C.D. Florentino Diaz Reig |
| 2014-15 → 2015-16 | 130 → 128 | 22 | 20 | C.D. Zacomfi · C.D. Piedralaves · C.F. El Tiemblo |
| 2015-16 → 2016-17 | 128 → 124 | 21 | 17 | C.D. Futuro Cuéllar · C.D. Grupo Antolín · Racing Lermeño C.F. |
| 2016-17 → 2017-18 | 124 → 125 | 19 | 20 | C.D. San José · F.C. El Hoyo de Pinares · C.D. Groggys s Gamonal |
| 2017-18 → 2018-19 | 125 → 125 | 18 | 18 | C.D. Cebrereña · Alcázar C.D. · Atlético Templario |
| 2018-19 → 2019-20 | 125 → 120 | 16 | 11 | C.D. San Lazaro · El Barco C.F. · C.D. San Pedro |
| 2021-22 → 2022-23 | 111 → 125 | 13 | 27 | C.D. Alfoz de Quintanadueñas · C.D. Casco Viejo · C.D. Ejido |
| 2022-23 → 2023-24 | 125 → 124 | 39 | 38 | C.D. San Lorenzo · Gª Segoviana C.F. "B" · Zamora Club de Futbol S.A.D. |
| 2023-24 → 2024-25 | 124 → 137 | 28 | 41 | Gimnástica Medinense · Salamanca C.F. U.D.S. "B" · C.D. Burgalés |
| 2024-25 → 2025-26 | 137 → 136 | 27 | 26 | C.D. Milagrosa-Las Nieves · Alcázar C.D. · C.F. Briviesca Norpetrol |
| 2025-26 → 2026-27 | 136 → 144 | 17 | 25 | C.D. Aranda Riber · C.D. Groggys's Gamonal · Atlético Bembibre |

## cadete · segunda

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 95 → 108 | 19 | 32 | C.D. Arenas de Vega de Espinareda · C.D. Santa Marta · C.D. F. La Fanega "B" |
| 2014-15 → 2015-16 | 108 → 80 | 40 | 12 | Real Ávila C.F. S.A.D. "C" · Capiscol C.F. · Racing Lermeño C.F. |
| 2015-16 → 2016-17 | 80 → 81 | 23 | 24 | F.C. El Hoyo de Pinares · A.D. Pradoluengo C.F. · Arandina C.F. "B" |
| 2016-17 → 2017-18 | 81 → 69 | 34 | 22 | C.D. Cebrereña · P. Casa Social Católica "B" · Real Ávila C.F. S.A.D. "B" |
| 2017-18 → 2018-19 | 69 → 70 | 20 | 21 | Arévalo C.F. · El Barco C.F. · Burgos U.D. "B" |
| 2018-19 → 2019-20 | 70 → 73 | 17 | 20 | C.D. Milagrosa - Las Nieves · C.D. Zona Norte · Burgos C.F. Promesas "B" |
| 2021-22 → 2022-23 | 89 → 93 | 25 | 29 | Arévalo C.F. · Atlético Candeleda · C.D. Cebrereña |
| 2022-23 → 2023-24 | 93 → 103 | 38 | 48 | C.D. Las Navas · C.D. Milagrosa - Las Nieves "B" · Burgos C.F. Promesas "C" |
| 2023-24 → 2024-25 | 103 → 101 | 34 | 32 | Alcázar C.D. · C.D. Condado de Castilla · U.D. Trespaderne |
| 2024-25 → 2025-26 | 101 → 116 | 27 | 42 | C.D. Milagrosa-Las Nieves "B" · C.D. Sotillo · C.D. Alfoz de Quintanadueñas |
| 2025-26 → 2026-27 | 116 → 120 | 30 | 34 | Deportivo Arenas C.F. "B" · Atlético de Laguna Lince "B" · C.D. Arcos de la Llana |

## cadete · tercera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2014-15 → 2015-16 | 7 → 51 | 2 | 46 | A.D. Pradoluengo C.F. · C.D. Mirandés Promesas Charca "B" |
| 2015-16 → 2016-17 | 51 → 55 | 18 | 22 | Burgos C.F. Promesas "C" · C.D. Casco Viejo "C" · C.D. San Felices "C" |
| 2016-17 → 2017-18 | 55 → 63 | 22 | 30 | C.D. Alfoz de Quintanadueñas · C.D. San Cristóbal Castilla "B" · C.D. San Pedro "B" |
| 2017-18 → 2018-19 | 63 → 70 | 21 | 28 | C.D. Internacional Vista Alegre "C" · C.D. Juventud del Círculo Católico "B" · Atlético Reino de León |
| 2018-19 → 2019-20 | 70 → 68 | 22 | 20 | C.D. Burgalés · C.D. Grupo Antolín "B" · C.D. San Cristóbal Castilla |
| 2021-22 → 2022-23 | 56 → 68 | 15 | 27 | Burgos C.F. Promesas "C" · C.D. Trabajadores de Bridgestone "B" · Polideportivo Salas |
| 2022-23 → 2023-24 | 68 → 75 | 17 | 24 | C.D. San Agustín Recoletos · C.D. Mirandés Promesas Charca "C" · U.D. Trespaderne |
| 2023-24 → 2024-25 | 75 → 86 | 14 | 25 | Burgos U.D. "B" · C.D. Burgalés "B" · C.D. Groggys's Gamonal "C" |
| 2024-25 → 2025-26 | 86 → 87 | 22 | 23 | Arandina C.F. "C" · C.D. Juventud del Círculo Católico "C" · Polideportivo Salas |
| 2025-26 → 2026-27 | 87 → 98 | 15 | 26 | Arévalo C.F. · Ávila Atlético · C.P. Piedralaves |

## infantil · primera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 142 → 138 | 25 | 21 | C.D. Piedralaves "A" · C.D. Fabero · C.D. Toreno |
| 2014-15 → 2015-16 | 138 → 135 | 22 | 19 | C.D. Cebrereña · C.D. San Cristóbal Castilla · Racing Lermeño C.F. |
| 2015-16 → 2016-17 | 135 → 121 | 28 | 14 | C.D. Palencia Balompié · C.F. El Tiemblo · C.D. San Felices |
| 2016-17 → 2017-18 | 121 → 119 | 20 | 18 | C.D. Ave María · C.D. Grupo Antolín · Vadillos C.F. |
| 2017-18 → 2018-19 | 119 → 119 | 20 | 20 | Arévalo C.F. · C.D. Milagrosa - Las Nieves · Alcázar C.D. |
| 2018-19 → 2019-20 | 119 → 118 | 18 | 17 | El Barco C.F. · C.D. Alfoz de Quintanadueñas · C.D. Burgalés |
| 2021-22 → 2022-23 | 122 → 131 | 17 | 26 | C.D. Casco Viejo "B" · C.D. Juventud del Círculo Católico · Atlético Pinilla |
| 2022-23 → 2023-24 | 131 → 139 | 35 | 43 | Gª Segoviana C.F. "B" · Burgos C.F. Promesas "B" · C.D. San Pedro |
| 2023-24 → 2024-25 | 139 → 145 | 27 | 33 | C.D. Don Bosco · C.D. Internacional Vista Alegre · C.D. Burgalés "B" |
| 2024-25 → 2025-26 | 145 → 124 | 42 | 21 | C.D. Milagrosa-Las Nieves · Burgos U.D. · C.D. Alfoz de Quintanadueñas |
| 2025-26 → 2026-27 | 124 → 130 | 19 | 25 | Arandina C.F. · C.D. Groggys's Gamonal · C.D. La Morenica Aldebi |

## infantil · segunda

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 73 → 101 | 24 | 52 | C.D. Casco Viejo "B" · C.D. Florentino Diaz Reig · C.D. Groggys s Gamonal |
| 2014-15 → 2015-16 | 101 → 99 | 34 | 32 | Real Ávila C.F. S.A.D. "B" · C.D. Grupo Antolín · C.D. Mirandés Promesas Charca "B" |
| 2015-16 → 2016-17 | 99 → 102 | 36 | 39 | Alcázar C.D. · C.D. San Cristóbal Castilla · C.D. Trabajadores de Bridgestone |
| 2016-17 → 2017-18 | 102 → 91 | 41 | 30 | C.D. Alfoz de Quintanadueñas · C.D. San Pedro "B" · Racing Lermeño C.F. |
| 2017-18 → 2018-19 | 91 → 84 | 27 | 20 | C.D. Las Navas · C.D. Milagrosa - Las Nieves "B" · El Barco C.F. |
| 2018-19 → 2019-20 | 84 → 86 | 25 | 27 | C.D. Bosco de Arévalo · P. Casa Social Católica "B" · C.D. Arcos de la LLana |
| 2021-22 → 2022-23 | 86 → 92 | 25 | 31 | Atlético Candeleda · C.D. Cebrereña · C.D. Las Navas |
| 2022-23 → 2023-24 | 92 → 96 | 33 | 37 | Burgos C.F. Promesas "C" · Burgos C.F. S.A.D. · C.D. Juventud del Círculo Católico "B" |
| 2023-24 → 2024-25 | 96 → 92 | 27 | 23 | C.D. Bosco de Arévalo "B" · C.D. Milagrosa-Las Nieves · C.D. Condado de Castilla |
| 2024-25 → 2025-26 | 92 → 107 | 29 | 44 | Arévalo C.F. · C.D. Las Navas "B" · Arandina C.F. "B" |
| 2025-26 → 2026-27 | 107 → 113 | 34 | 40 | C.D. Sotillo · C.P. Piedralaves · F.C. El Hoyo de Pinares |

## infantil · tercera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 52 → 51 | 22 | 21 | Burgos C.F. Promesas "D" · C.D. Aranda Riber · C.D. F. La Fanega "B" |
| 2014-15 → 2015-16 | 51 → 62 | 14 | 25 | C.D. Burgalés · C.D. Casco Viejo "C" · C.D. San Cristóbal Castilla "B" |
| 2015-16 → 2016-17 | 62 → 82 | 19 | 39 | Burgos U.D. "C" · C.D. Alfoz de Quintanadueñas · C.D. San Felices |
| 2016-17 → 2017-18 | 82 → 91 | 20 | 29 | C.D. Burgalés · C.D. Trabajadores de Bridgestone · C.D.B. Condado de Castilla |
| 2017-18 → 2018-19 | 91 → 101 | 22 | 32 | C.D. Arcos de la LLana · C.D. Groggys s Gamonal · C.D. Mirandés Promesas Charca "B" |
| 2018-19 → 2019-20 | 101 → 104 | 24 | 27 | Burgos U.D. "C" · C.D. Alba Castellae · C.D. Juventud del Círculo Católico "B" |
| 2021-22 → 2022-23 | 88 → 100 | 20 | 32 | C.D. Milagrosa - Las Nieves · Pedro Bernardo C.F. · C.D. Nuestra Señora de Belén |
| 2022-23 → 2023-24 | 100 → 117 | 20 | 37 | Avila Atlético · C.D. Bosco de Arévalo "B" · Deportivo Arenas C.F. "B" |
| 2023-24 → 2024-25 | 117 → 128 | 23 | 34 | C.D. Las Navas "B" · C.D. Milagrosa-Las Nieves "B" · C.F. El Tiemblo |
| 2024-25 → 2025-26 | 128 → 105 | 40 | 17 | Arévalo C.F. "B" · D.C. Piedralaves · F.C. El Hoyo de Pinares |
| 2025-26 → 2026-27 | 105 → 101 | 17 | 13 | C.F. El Tiemblo · C.D. Alfoz de Quintanadueñas "B" · C.D. Tardajos "B" |

## juvenil · liga-nacional

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 16 → 16 | 4 | 4 | C.D. Colegios Diocesanos · C.D. Zona Norte · Salamanca C.F. U.D.S. |
| 2014-15 → 2015-16 | 16 → 16 | 4 | 4 | Betis C.F. · C. y D. Leonesa S.A.D. · C.D. Calasanz de Soria |
| 2015-16 → 2016-17 | 16 → 16 | 5 | 5 | Atlético Bembibre · C.D. Arces · C.D. Colegios Diocesanos |
| 2016-17 → 2017-18 | 16 → 16 | 4 | 4 | Burgos U.D. · C.D. Munibar Pizarrales · C.D. Quintanar-Palacio |
| 2017-18 → 2018-19 | 16 → 16 | 5 | 5 | Arandina C.F. · C.D. Isoba · C.D. Navega |
| 2018-19 → 2019-20 | 16 → 16 | 5 | 5 | Burgos C.F. S.A.D. · Burgos U.D. · C.D. Calasanz de Soria |
| 2019-20 → 2020-21 | 16 → 19 | 1 | 4 | C. y D. Leonesa S.A.D. |
| 2020-21 → 2021-22 | 19 → 18 | 5 | 4 | C.D. La Salle · Gª Segoviana C.F. · Atlético Pinilla |
| 2021-22 → 2022-23 | 18 → 16 | 7 | 5 | Burgos C.F. Promesas · C. y D. Leonesa S.A.D. "B" · C.D. Guijuelo |
| 2022-23 → 2023-24 | 16 → 16 | 5 | 5 | C.D. Isoba · C.D. Numancia de Soria S.A.D. · C.D. Zona Norte |
| 2023-24 → 2024-25 | 16 → 16 | 5 | 5 | Burgos U.D. · C.D. Mirandés Promesas Charca · C.D.F. Peña |
| 2024-25 → 2025-26 | 16 → 16 | 3 | 3 | S.D. Ponferradina S.A.D. · Unionistas de Salamanca C.F. · Zamora C.F. S.A.D. |
| 2025-26 → 2026-27 | 16 → 16 | 3 | 3 | C.D. San Agustín Valladolid · C.D.I. de la Amistad Deltacinco · Victoria C.F. |

## juvenil · primera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 126 → 124 | 23 | 21 | Arandina C.F. · Atlético Bembibre · Independiente de Segovia |
| 2014-15 → 2015-16 | 124 → 131 | 19 | 26 | C.D. Concepcionistas Segovia · C.D. El Espinar Arlequin · C.D. Eresma |
| 2015-16 → 2016-17 | 131 → 124 | 26 | 19 | Atlético Candeleda · C.F. Briviesca · C.D. Nuevo Recreo Industrial |
| 2016-17 → 2017-18 | 124 → 124 | 18 | 18 | Atlético Barraco C.F. · C.D. Groggys s Gamonal · C.D. Casa de Asturias en León |
| 2017-18 → 2018-19 | 124 → 101 | 37 | 14 | C.D. Las Navas · C.F. El Tiemblo · C.D. Casco Viejo |
| 2018-19 → 2019-20 | 101 → 119 | 20 | 38 | C.D. Cebrereña · El Barco C.F. · Real Ávila C.F. S.A.D. |
| 2019-20 → 2020-21 | 119 → 13 | 109 | 3 | Arévalo C.F. · C.D. Bosco de Arévalo · C.D. Colegios Diocesanos "C" |
| 2020-21 → 2021-22 | 13 → 117 | 3 | 107 | F.S. Alhambra de Guijuelo · Laguna F.S. V.V. · Trepalio León Sala |
| 2021-22 → 2022-23 | 117 → 121 | 30 | 34 | C.D. Las Navas · C.D. Milagrosa - Las Nieves · F.C. El Hoyo de Pinares |
| 2022-23 → 2023-24 | 121 → 118 | 35 | 32 | C.D. Bosco de Arévalo · Burgos C.F. Promesas "B" · C.D. San Cristóbal Castilla |
| 2023-24 → 2024-25 | 118 → 126 | 22 | 30 | C.D. Inter Sala ALCÁNTARA DECORACIÓN "B" · C.D. Salatormes FLOR DE ESGUEVA · C.D. San Roque Carbajosa de La Sagrada |
| 2024-25 → 2025-26 | 126 → 132 | 27 | 33 | Arévalo C.F. · C.D. Milagrosa-Las Nieves "B" · Arandina C.F. "B" |
| 2025-26 → 2026-27 | 132 → 136 | 22 | 26 | C.D. Isoba · C.D.I. de la Amistad Saborea "B" · C.F. El Tiemblo |

## juvenil · segunda

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 72 → 71 | 22 | 21 | Atlético Pincia · C.D. Caboalles de Abajo · C.D. Cuatrovientos |
| 2014-15 → 2015-16 | 71 → 65 | 21 | 15 | Arandina C.F. "B" · C.D. Belorado · C.D. Casco Viejo "B" |
| 2015-16 → 2016-17 | 65 → 66 | 14 | 15 | Alcázar C.D. · Burgos U.D. "C" · C.D. Aranda Riber |
| 2016-17 → 2017-18 | 66 → 53 | 24 | 11 | A.D. Pradoluengo C.F. · C.D. Groggys s Gamonal · C.D. San Pedro |
| 2017-18 → 2018-19 | 53 → 52 | 14 | 13 | Burgos C.F. Promesas "C" · C.D. Alba Castellae · Racing Lermeño C.F. |
| 2018-19 → 2019-20 | 52 → 52 | 13 | 13 | C.D. Juventud del Círculo Católico · C.D. San Cristóbal Castilla · C.D. San Felices |
| 2021-22 → 2022-23 | 54 → 56 | 13 | 15 | C.D. Mirandés Promesas Charca "B" · U.D. Trespaderne · Vadillos C.F. "B" |
| 2022-23 → 2023-24 | 56 → 57 | 18 | 19 | Arandina C.F. "C" · C.D. Aranda Riber · C.D. San Pedro "B" |
| 2023-24 → 2024-25 | 57 → 61 | 19 | 23 | Burgos International Football · C.D. Burgalés · C.D. Condado de Castilla |
| 2024-25 → 2025-26 | 61 → 65 | 19 | 23 | C.D. Casco Viejo "B" · C.D. Grupo Antolín "B" · C.D. Trabajadores de Bridgestone |
| 2025-26 → 2026-27 | 65 → 67 | 23 | 25 | C.D. Arcos de la Llana · C.D. Belorado · C.D. San Cristóbal Castilla |

## juvenil · tercera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2015-16 → 2016-17 | 10 → 22 | 2 | 14 | C.D. Juventud Rondilla "B" · C.D. Renedo de Esgueva |
| 2016-17 → 2017-18 | 22 → 39 | 9 | 26 | Real Salamanca Monterrey C.F. "B" · Salamanca C.F. U.D.S. "B" · C.D. Jose Luis Saso |
| 2017-18 → 2018-19 | 39 → 42 | 13 | 16 | C.D.F. La Robla "B" · Atlético Templario "B" · C.D. Fabero |
| 2018-19 → 2019-20 | 42 → 39 | 14 | 11 | Atlético Trobajo H · C.D. Loyola · C.D. Ribera Carrizo |
| 2021-22 → 2022-23 | 35 → 45 | 12 | 22 | C.D. Coyanza · C.D.F. Valles del Esla · C.D. La Morenica Aldebi "B" |
| 2022-23 → 2023-24 | 45 → 50 | 13 | 18 | C.D. Cerecedo · C.D. Cuatrovientos "B" · C.D. Fabero "B" |
| 2023-24 → 2024-25 | 50 → 66 | 13 | 29 | C. D. Casa de Asturias en León "B" · C.D. Loyola · C.D.F. San Andrés "B" |
| 2024-25 → 2025-26 | 66 → 68 | 23 | 25 | Burgos International Football "B" · C.D. Belorado · Capiscol C.F. "B" |
| 2025-26 → 2026-27 | 68 → 71 | 20 | 23 | C.D. Aranda Riber "B" · C.D. Internacional Vista Alegre "C" · C.D.B. Condado de Castilla |

## prebenjamin · desconocida

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2024-25 → 2025-26 | 2 → 2 | 1 | 1 | C.D. Cuatrovientos |

## prebenjamin · primera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 43 → 159 | 12 | 128 | C.D. Coca · C.D. Concepcionistas Segovia · C.D. Segosala "B" |
| 2014-15 → 2015-16 | 159 → 128 | 60 | 29 | El Pradillo C.F. · Atlético Santa Cristina · C.D. Intrepidos de La Vega |
| 2015-16 → 2016-17 | 128 → 120 | 24 | 16 | C.D. Las Navas · C.D. Zona Norte · P. Casa Social Católica |
| 2016-17 → 2017-18 | 120 → 122 | 22 | 24 | Arévalo C.F. · Benavente Promesas C.F. · C.D. Groggys s Gamonal |
| 2017-18 → 2018-19 | 122 → 118 | 21 | 17 | C.D. Juan de Yepes · C.D. Trabajadores de Bridgestone · C.D. Divina Pastora León |
| 2018-19 → 2019-20 | 118 → 111 | 22 | 15 | C.D. Milagrosa - Las Nieves · C.D.B. Condado de Castilla · C.D. Bosco |
| 2021-22 → 2022-23 | 118 → 123 | 12 | 17 | Arandina C.F. · C.D. Coyanza · León C.F. |
| 2022-23 → 2023-24 | 123 → 125 | 28 | 30 | F.C. El Hoyo de Pinares · Burgos C.F. Promesas · C.D. San Pedro |
| 2023-24 → 2024-25 | 125 → 127 | 19 | 21 | C.D. Milagrosa-Las Nieves · C.D. Arcos de la Llana · C.D. Coyanza |
| 2024-25 → 2025-26 | 127 → 116 | 28 | 17 | Burgos C.F. S.A.D. Femenino · C.D. Grupo Antolín · C.F. Briviesca Norpetrol |
| 2025-26 → 2026-27 | 116 → 116 | 17 | 17 | C.D. Bosco de Arévalo · Burgos U.D. · C.D. San Felices |

## prebenjamin · segunda

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2013-14 → 2014-15 | 10 → 63 | 1 | 54 | Racing Zamora |
| 2014-15 → 2015-16 | 63 → 109 | 24 | 70 | Arévalo C.F. "B" · P. Casa Social Católica "B" · Burgos C.F. S.A.D. |
| 2015-16 → 2016-17 | 109 → 106 | 27 | 24 | C.D. Juan de Yepes "B" · C.D. Aranda Riber · C.D. Arcos de la LLana |
| 2016-17 → 2017-18 | 106 → 96 | 33 | 23 | C.D. Las Navas · P. Casa Social Católica · Burgos U.D. |
| 2017-18 → 2018-19 | 96 → 103 | 23 | 30 | Arévalo C.F. · C.D. Bosco de Arévalo "B" · C.D. Tardajos F. |
| 2018-19 → 2019-20 | 103 → 90 | 41 | 28 | C.D. Zona Norte · C.D. Grupo Antolín · C.D. Internacional Vista Alegre "B" |
| 2021-22 → 2022-23 | 81 → 86 | 27 | 32 | C.D. Zona Norte · F.C. El Hoyo de Pinares · C.D. Groggys s Gamonal |
| 2022-23 → 2023-24 | 86 → 91 | 32 | 37 | C.D. Milagrosa - Las Nieves "B" · Burgos C.F. Promesas "B" · Villarcayo Nela C.F. |
| 2023-24 → 2024-25 | 91 → 98 | 33 | 40 | C.D. Las Navas · C.D. Linko "B" · C.D. Juventud del Círculo Católico "B" |
| 2024-25 → 2025-26 | 98 → 93 | 33 | 28 | D.C. Piedralaves · Alcázar C.D. · C.D. Arcos de la Llana |
| 2025-26 → 2026-27 | 93 → 92 | 33 | 32 | Arévalo C.F. · Atlético Candeleda · Ávila Atlético "B" |

## prebenjamin · tercera

| Temporada | Clubes | Salen | Entran | Ejemplos de salida |
|---|---:|---:|---:|---|
| 2014-15 → 2015-16 | 10 → 69 | 6 | 65 | C.D. Aranda Riber · C.D. Arcos de la LLana · C.D. Internacional Vista Alegre |
| 2015-16 → 2016-17 | 69 → 77 | 21 | 29 | C.D. Alba Castellae "B" · C.D. Groggys s Gamonal · C.D. Tardajos F. "B" |
| 2016-17 → 2017-18 | 77 → 70 | 30 | 23 | C.D. Colegios Diocesanos "C" · C.D. Linko "C" · P. Casa Social Católica |
| 2017-18 → 2018-19 | 70 → 19 | 59 | 8 | Arandina C.F. "B" · C.D. Alfoz de Quintanadueñas "B" · C.D. Aranda Riber "B" |
| 2018-19 → 2019-20 | 19 → 66 | 8 | 55 | Alba de Tormes C.F. · C.D. Calvarrasa de Abajo · C.D.F. Helmántico |
| 2021-22 → 2022-23 | 51 → 72 | 14 | 35 | Atlético Paramés · C.D. Bosco · C.D. La Bañeza "B" |
| 2022-23 → 2023-24 | 72 → 73 | 28 | 29 | C.D. Zona Norte "B" · Deportivo Arenas C.F. · C.D. La Virgen del Camino "C" |
| 2023-24 → 2024-25 | 73 → 50 | 36 | 13 | Atlético Candeleda · Ávila Atlético "B" · C.D. Bosco de Arévalo "B" |
| 2024-25 → 2025-26 | 50 → 53 | 12 | 15 | Atlético Mansillés · Atlético Trobajo H "B" · C.D. Cerecedo "B" |
| 2025-26 → 2026-27 | 53 → 49 | 20 | 16 | C.D. La Virgen del Camino "C" · C.D. San Lorenzo · C.D.F. La Robla |
