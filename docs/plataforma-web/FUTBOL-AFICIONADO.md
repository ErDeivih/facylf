# Fútbol aficionado no federado en España: qué se recoge y qué falta

Objetivo de David (01/10/2026): **todas las competiciones de fútbol que existen fuera de las federaciones**
(ligas privadas de F7/F11/sala, veteranos, interempresas, universitarias, ligas y juegos municipales), como
Futormes (Salamanca) o ASOFUSA (Valladolid), con sus datos. Criterio de acceso: el mismo que con las
federaciones (una petición cada 5-8 s, una a la vez). Fuera, mientras no haya acuerdo: plataformas cuyos
términos prohíben la extracción (Clupik/Leverade/Xporty, Competize) y webs que lo impiden a propósito.

Catálogos de la búsqueda: `investigacion-multideporte/catalogo-futbol-aficionado.md` (30/09) y
`investigacion-multideporte/futbol-aficionado-2026-10-01-{norte,centro,sur,levante-plataformas}.md` (01/10).

## 1. Plataformas: adaptador, alcance y estado

| plataforma | adaptador | clientes en España | estado (01/10/2026, noche) |
|---|---|---|---|
| **ServerSports** (`/mod/soccer/*.aspx`) | `serversports` | 36 dominios en la lista (Futormes y Futormes Zamora, ASOFUSA, Solo Hay Fútbol, FutCyL, F7 Ávila, FutZaragoza, Liga de las Empresas, Business Sports y su web de empresas, Ligas F7 Madrid, A+7 Guadalajara, Estadio 7, F7 Sevilla/Giralda/Élite, Futsal Chiclana, Liga Ibérica, FitGalicia, Totana…) ; el 02/10 se añadieron 12 tras sondear sus portadas (ver §5) y se quitaron 4 sin DNS | **Corregido el 02/10, falta reiniciar** (ver §5): hasta ahora sólo se tenía la temporada en curso y la ficha de partido sin jugadores. Ahora: **todas las temporadas** (Futormes 2013-2026; hay ligas desde 2009) y **estadísticas por jugador** (goles, goles en propia, goles recibidos, tarjetas). Bunwer fallaba por el dominio sin `www` |
| **MyGol** (`*.mygol.es`, `*.mygolpro.com` o dominio propio con la misma API) | `mygol` | 33 organizaciones (Red F7 Madrid, Minifútbol Valencia, Asturias, Gijón, Avilés, Zaragoza, Lleida, Reus, Tarragona, Navarra, Castellón, Alicante, Vigo, Cádiz, Sevilla, Baleares, Canarias, **Málaga F7**, **Manresa**, **Terres de l'Ebre**, **AEMF**…) | Listo (prueba real del 01/10); entra al reiniciar el supervisor. Quitada miligafutbol9 (Chile) |
| **Playooz** (`api.playooz.com`, cabecera `X-Tenant-Host`) | `playooz` (nuevo) | Liga Fútbol Madrid, Ligas Fútbol Siete, Élite Ligas (Alcalá, Carabanchel, Pilar, Pozuelo, Villa Rosa…), En Vinya, Liga Press, Fútbol 7 Navarra, Lligues Universitàries, Esport Universitari, MLA, AIDEB, CDA | **Probado** (36 peticiones, 0 fallos) y en `adaptadores-activos.json` |
| **totalFútbol** (`totalfutbol.es/ges/laweb`) | `totalfutbol` (nuevo) | Collado Villalba, UFV y Escolapios (Pozuelo), UPM, UCJC, Las Rozas, Aravaca, Torrelodones, Paracuellos, Villaviciosa, Bomberos | **Probado** (40 peticiones, 0 fallos, 105 partidos) y activo. Los ids de campeonato son correlativos (1-520): entra el histórico entero |
| **Datos abiertos de Madrid (JDM)** | por hacer: lector de CSV (ver §4) | Juegos Deportivos y Torneos Municipales de Madrid (la mayor competición municipal: 8.000+ equipos) | **robots.txt veta la descarga automática** de `/api/` y de los ficheros. Licencia CC BY 4.0. Propuesta: David baja a mano cada miércoles `partidos_*.csv` y `clasificaciones_*.csv` a `descargas-manuales/madrid-jdm/` y un lector los importa |
| **Apúntamelo** (`apuntamelo.com`, API JSON `/obtener…`) | `apuntamelo` (nuevo) | 31 organizaciones: Tiki Taka BCN, Catalonia Sports, Clicsports, Viaró, Másters BRAFA, El Planter, Liga Brave, Promosportive, Cerdanya, Camprodon, Ripollès, Sabadellès (Cataluña), MLA Aragón, La Sagra y Liga F7 Seseña (Toledo), RC Sport interempresas, Liga de Empresas Andalucía, Elche F7, Futbol Live (Valencia), Goldemur, Saladares… | **Probado** (36 peticiones, 0 fallos, 2.397 partidos) y activo. Amistosos fuera; sin jugadores ni fotos |
| **WordPress + SportsPress** (`?sp_table=`, `?sp_calendar=`) | por hacer | Veteranos Vigo (30+ equipos), UD Cassà (verano) | Veteranos Vigo tiene la API REST cerrada: habría que leer su HTML (`?sp_table=`) |
| **La Preferente «No Federado» y «Veteranos»** (`lapreferente.com`, ISO-8859-1) | `lapreferente` (nuevo) | Las 17 comunidades + Ceuta/Melilla: cada página de competición trae en desplegables todas las ligas «No Federado» y «Veteranos» de su comunidad; se siembra con la Tercera Federación de cada una. Andalucía sola: 34 (peñas de Granada, veteranos de Córdoba, Huelva, Jaén, Málaga, Aljarafe, AFASA…). Temporadas **desde 2015-16** (antes 2023-24; cambiado el 02/10) | **Probado** (40 peticiones, 0 fallos) y activo. robots.txt permisivo. El motor admite ya `codificacion` por adaptador |
| **gesliga.com** | — | Superliga Veteranos Murcia; el resto, inactivo | Residual |
| **todotorneos.com** | — | Liga Universal F7 Aluche; casi todo lo demás es latinoamericano | Residual |
| **LeagueRepublic** | — | Veteranos de Asturias y de Cantabria | Su robots veta las páginas de liga: decidir |
| **Webs propias** | uno por sitio | **PortalRivas** (Rivas: F7 1ª-4ª con grupos, veteranos, F11, sala; jornadas por POST a `calendario-jornada-js.php`), **Vistahermosa F7** (Alicante; `index.php?op=GRUPO&idcomp=1…250`, histórico entero), **Fuenlabrada** (base de datos municipal `vercompeti.php` / `deporte.php?competi=N`, varios deportes), FAVAFUTSAL (sala, Álava), ADV Santiago (sala), Veteranos Vigo (SportsPress), F7 Majadahonda (Wix), Valdemoro (WordPress), FutbolSiete Euskadi (400+ equipos, datos sólo en su app) | Estructura vista el 01/10 (muestras en `descargas-sondeo-multideporte/scripts/`); siguientes por tamaño: Rivas, Vistahermosa, Fuenlabrada |
| **PDF municipales** | — | Cartagena, Torrejón, Navalcarnero, Parla, San Fernando, UJA | Sólo si se decide leer PDF |
| **Clupik/Leverade/Xporty, Competize** | **no** | LFV Valencia (F11), Elche, Molina de Segura, Cartagena, Marbella, Cabra, veteranos de Cataluña, Las Rozas, Fuengirola, Mijas, Badajoz… | Sus términos prohíben la extracción: **pedir acceso** |

## 2. Lo que queda por buscar

**Barrido de las 11 zonas: HECHO** (11/10/2026, noche; el detalle y las pruebas están en
`TAREA-LARGA-FUTBOL-AFICIONADO.md` §6). La lista que había aquí —Castilla y León, Castilla-La Mancha,
Extremadura, Canarias, Baleares, Ceuta, Melilla y parte de Cataluña, Navarra y Aragón— **está recorrida entera**,
y el resultado es **el mismo en las seis primeras zonas y en las cinco últimas: NADA QUE AÑADIR** ✓.

**Cómo se hizo, porque importa para repetirlo**: en vez de buscar en la web (que es lo que agotó el cupo de 200
búsquedas), se hizo **inventario sobre las colas locales de los 18 adaptadores** — `--busca <provincia>` y
`--ligas` sobre `descargas-multideporte/<adaptador>/cola.sqlite`—, que es **evidencia ya descargada y por tanto
0 peticiones nuevas** ✓. Y cada acierto se comprobó **por su URL o su host**, que es lo que decide:

- **casi todos los aciertos por nombre de provincia eran NOMBRES DE EQUIPO** dentro de ligas de otra provincia
  (Sevilla, Madrid, Valladolid, Salamanca, Gijón, Gandía…) o de plataformas nacionales ✓✗;
- y en `gesdeportiva`, `feb` y `owbasket` eran **BALONCESTO**, no fútbol ✗.

Sin esa comprobación se habrían «añadido» diez ligas fantasma. Las provincias que parecían hueco y **no lo eran**
(bien por estar ya en un adaptador, bien por estar ya en la lista del código): **Huesca**
(`ligacomarcalbajocinca`), **Navarra** (`fs5navarra`), **Bizkaia** (`futbolrapido.biz`), **Asturias** (los tres de
mygol + `ligaiberica`), **Barcelona, Lleida y Tarragona** (mygol), **Toledo** (Bargas) y **Guadalajara**
(`ligamas7`).

**Lo que SÍ sigue sin plataforma detectada** (anotado, no perseguido — §5 manda no esquivar vetos):

| provincia | qué hay, y por qué no se añade |
|---|---|
| **Palencia**, **Soria**, **Teruel**, **Ciudad Real**, **Gipuzkoa** | **cero coincidencias** en los 18 adaptadores. Lo que existe es **federado** (RFECyL, ya recogido) o **PDF municipal/de diputación** ([dipsoria.es](https://www.dipsoria.es/sites/dipsoria/files/public/uploads/deportes/Juegos_Escolares/Resultados/resultados_29a_jornada_09.04.2016._semifinales_deportes_colectivos.pdf), [tienda.rfcylf.es](https://tienda.rfcylf.es/wp-content/uploads/2020/03/Circular-n%C2%BA1-D.P.-Soria-PLAN-COMPETICIONAL-TEMPORADA-2014-15-1.pdf)) → **decisión de alcance de David**, no un lector por pueblo |
| **Girona** | no aparece en ningún adaptador; si existe liga aficionada allí, está en **Clupik/Leverade/Xporty o Competize**, que §5 veta → **pedir acceso** |
| **Granada**, **Huelva**, **Jaén** | no aparecen en ningún adaptador (sólo las barras de `aemf` y `lapreferente.com`, que son nombres de equipo). Ojo: **La Preferente sí trae «No Federado» y «Veteranos» de Andalucía**, así que lo que exista ahí **ya entra** por ese adaptador ✓ |

David: si conoces ligas de tu zona que no estén aquí, pásamelas — pero a fecha de hoy **el barrido no encuentra
nada razonable que añadir**.

## 3. Cómo se añade una liga

1. `node scripts/multideporte/busca-plataforma.mjs <url>` (por el enlace) dice qué plataforma usa.
2. Si es de una plataforma con adaptador, se añade a su lista (`LIGAS` de serversports, `ORGANIZACIONES` de
   mygol, `CLIENTES` de playooz…) y se encola con `recolector-multideporte.mjs sembrar --adaptador X` (sin
   peticiones); la pide el trabajador que ya corre. **No** `arrancar` a mano un adaptador activo: no hay cerrojo
   por adaptador y serían dos trabajadores pidiendo a los mismos sitios (corregido el 11/10/2026). El
   `arrancar --max 30` a mano es solo para probar un adaptador **nuevo** antes de darlo de alta.
3. Si es una plataforma nueva con varias ligas, adaptador nuevo con sus pruebas; si es una web suelta, a la
   lista de webs propias.

## 4. Madrid: Juegos Deportivos Municipales (datos abiertos)

Conjunto «Competiciones deportivas municipales de deportes colectivos. Temporada en curso»
(https://datos.madrid.es/dataset/211549-0-juegos-deportivos-actual), licencia CC BY 4.0, se actualiza cada
miércoles: `partidos_AAAAMMDD.csv` (~8,8 MB) y `clasificaciones_AAAAMMDD.csv` (~1,7 MB), más dos PDF con la
estructura. Hay otro con las temporadas anteriores. Su `robots.txt` veta la descarga automática (`/api/` y los
ficheros), así que **no se descarga solo**: David baja los dos CSV a mano a `descargas-manuales/madrid-jdm/` y
un lector (por escribir en cuanto haya un fichero de muestra) los importa. Los últimos publicados son del
29/06/2026 (fin de la 2025-26); la 2026-27 empezará a salir en octubre. El conjunto de participantes (nombres)
no se usa.

## 5. Auditoría del 02/10/2026 («¿se está haciendo bien?»)

David avisó de que Futormes lleva muchos años con muchos partidos y estadísticas y sólo teníamos la temporada
en curso. Era verdad, y no era lo único:

| fallo | efecto | arreglo (02/10) |
|---|---|---|
| ServerSports pedía las temporadas pasadas sólo si eran ≥ 2023 **y** sólo al revisitar la portada (cada 7 días); además la portada ya estaba leída con el código anterior | Ninguna temporada pasada se llegó a pedir: «sin trabajo» con 2.691 partidos de Futormes | Tipo nuevo `temporadas` (semilla propia): un POST del menú por temporada, cada uno con su clave (`temporada:<id>`). Comprobado contra la web: Futormes 2019 → 30 campeonatos; ASOFUSA 2016 → 32 |
| La ficha de partido sólo daba jornada, categoría y estado | Sin estadísticas | Ahora guarda por jugador id, nombre, dorsal, goles, goles en propia puerta, goles recibidos, amarillas y rojas, y los totales por equipo. **No** guarda edad, altura, peso, foto, apodo ni el motivo de la tarjeta. En categorías de menores (alevín, infantil, cadete, juvenil, sub-≤18…) ningún jugador, sólo totales |
| Las fichas ya descargadas (≈ 400) no tenían jugadores | — | `reinterpreta.mjs --adaptador serversports --tipo partido` las relee desde la evidencia, sin pedir nada |
| Las páginas de campeonatos de temporadas pasadas no traen el nombre | Campeonato «null» | Se toma del menú de la portada de esa temporada |
| El recolector sólo sembraba con la cola **vacía** | Toda liga añadida a un adaptador después del primer arranque no se pedía nunca (Business Sports Empresas, Málaga F7, Terres de l'Ebre, Manresa, AEMF…) | Siembra en cada arranque (es idempotente) |
| Evidencia de páginas POST nombrada por la URL | Las temporadas de una liga se pisaban la evidencia entre sí | Se nombra por la clave de la página |
| La Preferente: competiciones pasadas revisitadas cada 3 días y jornadas pasadas sin marcador cada 48 h para siempre | Peticiones tiradas | Pasadas: cada 90 días y sin revisita de jornadas |

**Coste del histórico**: Futormes son ~13 temporadas × ~2.700 partidos ≈ 35.000 fichas. Con una petición cada
5-8 s y una a la vez por adaptador, sólo Futormes son ~2,5 días y el conjunto de ligas ServerSports, una o dos
semanas. Se podría ir más rápido pidiendo a la vez a dominios distintos (cada liga es un sitio distinto), pero
eso cambia el ritmo de la flota: **decide David**.

**Para que entre en marcha** (lo hace quien lleve los arranques): parar `serversports`, ejecutar
`node scripts/multideporte/reinterpreta.mjs --adaptador serversports --tipo partido`, y volver a arrancar
`serversports`, `mygol` y `lapreferente` (los tres siembran lo nuevo al arrancar).

**Dominios ServerSports sondeados el 02/10** (`sondea-serversports.mjs`, una petición por portada). Añadidos:
7pa7 Córdoba (2016-2025), CNFS fútbol sala (2011-2026), Veterans Vallès-Maresme, Almería Cup/ADAC (2015-2026),
Fútbol 7 Mallorca (torneos por pueblos), JDM Segovia (F7 y sala), Liga Hespérides (Sevilla, 2015-2019, sólo en
su subdominio demo), ANF7 (Campeonato Nacional F7), AA Aldovea (Madrid, 2010-2026), AFES Gandía (F11),
Empubenco (Las Palmas, organismos y empresas) y Liga Delicias (Calatayud FS); Bunwer corregido (`www`).
Quitados por no tener DNS: By Sport, Aspe, F7 Asturias y Liga Febril (tampoco FS CDA, Red Fútbol Sala, AD
Empresarial ni 7pa7.com). Sin campeonatos ahora: Liga Empresas Córdoba, F7 Élite, Burlada; F7 Jerez no responde;
Tiki Taka da 404. Fuera de España (no se añaden): Liga Corporativa (México), Indesa y Liga FanSport (Colombia),
Sports Events (Argentina), INDEC.

**MyGol**: añadidas la **Fundación Eusebio Sacristán** (`fes.mygol.es`: Liga de la Federación de Peñas del Real
Valladolid, F7) y **Fútbol Rápido Bizkaia** (`futbolrapido.biz`, MyGol en dominio propio).

**Otras fuentes nuevas**: **siguetuliga.com** (≈ 1.100 ligas en `sitemapLigas.xml`: además de las federadas, ligas de usuarios: unas 45
de veteranos gallegos, 50 de sala locales, F7 de Lalín…; robots prohíbe URLs con `?`, `/api/` y `/ws/`; muchas
abandonadas); **myTorneo** (`mytorneo.com`, sólo Cáceres: 171 torneos de veteranos F7 desde 2023-24, HTML
sencillo, robots permite todo salvo `/img/` y `*/jugadores/*`); TotalF7 (Madrid, 4 sedes, web dinámica: sondeo
de navegador); torneodeportividad.es (FS Tenerife) es de la familia Leverade: no.

## 6. 02/10/2026 (tarde): más fuentes en marcha y más ritmo sin cargar a nadie

- **Nuevos adaptadores, ya en `adaptadores-activos.json`** (el supervisor los arranca solo en ≤ 10 min):
  `siguetuliga` (325 ligas aficionadas de adultos tras filtrar; prueba real: 24 páginas, 0 fallos, 3.661 partidos,
  fecha 83 %, marcador 99 %) y `mytorneo` (veteranos de Cáceres; prueba real: 25 páginas, 0 fallos, recorriendo
  provincias).
- **Carriles**: `serversports` pide a 3 ligas a la vez, `mygol` a 2 organizaciones; cada sitio sigue con una
  petición cada 5-8 s. El histórico de ServerSports pasa de 2-3 semanas a ~1. Entra al reiniciar `serversports`.
- **Calidad** (`calidad.mjs`): ServerSports, MyGol, totalFútbol, Apúntamelo, La Preferente y siguetuliga leen
  bien fecha, equipos y marcador (lo que falta es lo aún no jugado).
- Aparcado: software municipal «vercompeti.php» (Palencia, Fuenlabrada, UAM): datos por POST con CSRF y la
  temporada aún vacía.

## 7. 05/10/2026: dos webs propias más (con todo su histórico)

- **`portalrivas`** — ligas municipales de **Rivas-Vaciamadrid** (F11, F7 de 1.ª a 5.ª con grupos, F7 veteranos y
  fútbol sala), **desde 2009/2010**. API por POST de la propia web: `otras-fases-js.php` (fases de una categoría y
  temporada) y `calendario-js.php` (calendario completo de una fase: equipos con id, marcador, id de partido,
  fecha, hora y campo). «DESCANSA» se marca como descanso; «00:00» es hora sin fijar. Prueba real: 50 páginas,
  0 fallos, 1.314 enlaces encolados (categorías y fases de las 17 temporadas).
- **`vistahermosa`** — **Liga Vistahermosa F7 (Alicante)**: 127 competiciones (ligas desde 2018-19, copas y
  torneos de verano) sacadas del menú de la web; jornadas con marcador («---» = sin jugar). La web no publica
  fechas en esa página. Prueba real: 15 páginas, 0 fallos, 1.034 partidos.
- Ambos en `adaptadores-activos.json` (arrancan solos en ≤ 10 min).

**Vistas y aparcadas:** FAVAFUTSAL (Álava, sala): `resultados.php?campeonato=&jornada=`, pero la temporada
26/27 aún no tiene campeonatos publicados — se vuelve en noviembre. Navalcarnero (liga local F7) y la liga
comarcal de sala de Cartagena publican **sólo en PDF** o en noticias.

## 8. Listas que mantiene el barrido (`TAREA-LARGA-FUTBOL-AFICIONADO.md`)

Se anotan aquí; pedir acceso o avisar lo decide David.

### Pedir acceso (términos que prohíben la extracción, o bloqueo a automatismos)

| Plataforma / liga | Motivo | Ligas afectadas | Anotado |
|---|---|---|---|
| Clupik / Leverade / Xporty | términos 12.2.3 prohíben scraping y bots | LFV Valencia, Elche, Molina de Segura, Cartagena, Marbella, Cabra, veteranos de Cataluña, Las Rozas, Fuengirola, Mijas, Badajoz… | 30/09/2026 |
| Competize | términos; robots veta a ClaudeBot y GPTBot | 7 ligas | 30/09/2026 |

### Avisos de privacidad (datos personales expuestos sin login)

| Sitio | Qué expone | Anotado |
|---|---|---|
| iSquad tenis (`competicion/inscritos/datatable`) | DNI, correo, teléfono, fecha de nacimiento (también de menores) | 01/10/2026 |
| Avanza (tenis Madrid/Cataluña) y Pista Central (Valencia) | DNI, fecha de nacimiento, móvil, correo de inscritos | 01/10/2026 |
