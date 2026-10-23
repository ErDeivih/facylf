# Catalogo de ligas de futbol aficionado NO federado en Espana, por plataforma

Fecha de la investigacion: 2026-09-30. Metodo: solo WebSearch y WebFetch, paginas sueltas, sin logins.

Limitaciones:
- El presupuesto de WebSearch de la sesion (200 llamadas) se agoto a mitad de la tarea 3. La busqueda ciudad por ciudad quedo incompleta. Las provincias sin cobertura estan listadas al final.
- Muchos WebFetch fallaron por robots.txt / certificados SSL con hostname incorrecto (ligacorporativa.com, ligasf7sangregorio.com, ligasfutbol7madrid.com, bunwer.es, futbolsalaburgos.es, mlasport.com, etc.). Es una pista de que varios sitios pequenos tienen certificados mal configurados: el scraper tendra que tolerarlo.
- Clupik devolvio 429 (rate limit) tras 2 peticiones seguidas. Prever throttling.
- Todo lo marcado "(sin verificar)" sale solo del titulo o URL de un resultado de busqueda, o de una lista de terceros.
- Descartados por no ser de Espana (aparecian con la misma huella ServerSports): 7pa7.com y futbol7pa7.com (Cordoba, Argentina), Liga Fansport (Colombia), Bogota League, TdeA Futbol, Sports Events (Argentina), Total Sport Colombia, UNAFUT, AA Futbol Sala (probable Argentina), Demo D-AR, Liga Corporativa (ligacorporativa.com; Facebook la sitúa en Mexico, sin verificar), ligaveteranospremiermx.mygol.es (Mexico), ligaempresarialportugal.mygol.es (Portugal), miligafutbol9.mygol.es (Chile).

---

## 1. Ranking de plataformas (nº de ligas espanolas encontradas)

| # | Plataforma | Ligas encontradas (Espana) | Nota |
|---|---|---|---|
| 1 | ServerSports (ASP.NET) | 33 (mas ~8 sin verificar) | Paginas HTML renderizadas en servidor. Mejor candidato para el primer scraper. |
| 2 | MyGol (`*.mygol.es`) | 29 | SPA de JavaScript. Hay que localizar la API JSON que consume o renderizar con navegador. |
| 3 | Clupik / Leverade (`clupik.pro`, dominios blancos tipo `competiciones.elche.es`, `futbolveterans.cat`) | 17 | IDs numericos. Tiene ficha de jugador (`/players/{id}`). Rate limit 429. |
| 4 | Web propia / CMS / otros (WordPress, Joomla, ASP propio) | 14 | Un scraper por sitio. Poca rentabilidad salvo futbolsiete.com (Euskadi). |
| 5 | Portales municipales (Madrid open data, IMD Sevilla, Movil/PDF) | 10 | Madrid es el unico con datos abiertos estructurados. |
| 6 | Playooz (`/{slug}/clasificacion?roundId=&groupId=`) | 7 | SPA: el HTML solo trae metadatos. Hay que sacar la API. |
| 7 | Competize (`competize.com/{es,en}/competition|league|event/view/{id}`) | 7 | HTML renderizado. Tambien es marca blanca (`juegosmunicipales.lasrozas.es`). |
| 8 | La Preferente "No Federado" | ~10 ligas etiquetadas (todas Andalucia) | Agregador. Ver seccion 4. |
| 9 | todotorneos.com | 5 vistos (sin verificar la cifra total) | Plataforma antigua de PHP, `torneosresultados.php?torneo=ID`. |
| 10 | SportZentral | 1 (Toledo) | Marca blanca del Patronato de Toledo. Puede haber mas. |
| - | Agregadores federados/mixtos (siguetuliga.com, futbolme, gestorligas.com) | no contados | siguetuliga mezcla federado y modesto. |

Total de filas unicas en la tabla de abajo: unas 125 (incluyendo las sin verificar). Objetivo de 80+ cumplido, pero con cobertura geografica desigual.

### Que adaptadores dan mas cobertura

1. ServerSports: 1 adaptador cubre 33+ ligas en 20+ provincias. Los datos son publicos y por jugador (`player.aspx`), con goleadores, porteros, fair play y MVP. Prioridad 1.
2. MyGol: 1 adaptador cubre 29+ ligas (Asturias, Madrid, Cadiz, Vigo, Canarias, Baleares, Navarra, Cataluna, Valencia, Aragon). Tiene paginas de clasificacion, calendario, sanciones (`/tournaments/{id}/sanctions`), ranking de equipos (`/teamsranking`). Prioridad 2, pero exige ingenieria inversa de la API.
3. Clupik/Leverade: 17 ligas, muchos ayuntamientos y asociaciones de futbol sala gallegas. Tiene ficha de jugador y estadisticas. Prioridad 3.
4. Playooz + Competize: 14 ligas entre los dos, sobre todo Madrid y Navarra (Playooz) y municipales de Malaga/Madrid/Murcia/Badajoz (Competize). Se hace despues.
5. Madrid open data (JDM): un solo adaptador, la mayor liga municipal del pais (8.000+ equipos), pero sin goleadores ni sanciones.
6. La Preferente No Federado: un adaptador da ligas de Andalucia con plantillas por equipo y goleadores.

---

## 2. Tabla de ligas

Leyenda de datos: C = clasificacion, R = resultados, T = calendario, G = goleadores, S = sanciones, J = por jugador (ficha o plantilla). "n/d" = no confirmado.

### 2.1 ServerSports
Patron: `/mod/soccer/competitions.aspx`, `/mod/soccer/situation.aspx?itm=ID`, `/mod/soccer/match.aspx?itm=ID`, `/mod/soccer/team.aspx?itm=ID`, `/mod/soccer/player.aspx?itm=ID`. Extras compartidos: `/mod/shared/news.aspx`, `/installations.aspx`, `/documents.aspx`, `/galleries.aspx`, `/contacts.aspx`, `/surveys.aspx`, `/page.aspx?itm=ID`, `/mod/download.aspx?doc=ID`. Para clientes sin dominio propio, existe `demo{nombre}.serversports.net` (ej. `demoligahesperides`, `demof7giralda`, `demoanfutbol7`, `demoadac`, `demoadsercal`, `demoligastikitaka`).
Datos confirmados en Futormes Zamora: C, T, R, G, porteros, fair play, MVP/MVT, equipo con menos goles, fichas de jugador (`player.aspx?itm=`), equipo y partido.

| Liga | Ciudad / provincia | Deporte | URL | Datos |
|---|---|---|---|---|
| Futormes | Salamanca | F11/F7/sala | https://www.futormes.com/mod/soccer/competitions.aspx | C R T G J (mismo motor) |
| Futormes Zamora | Zamora | F7/F11 incl. veteranos | https://www.futormeszamora.com/mod/soccer/competitions.aspx | C R T G porteros J (confirmado) |
| Futcyl | Castilla y Leon (provincia sin verificar) | F7/sala | https://www.futcyl.com/mod/soccer/index.aspx | C R T G J |
| FutZaragoza | Zaragoza | F7/F11 | https://www.futzaragoza.com/mod/soccer/competitions.aspx | C R T G J |
| ASOFUSA | Valladolid | futbol sala | http://demoasofusa.serversports.net/mod/soccer/competitions.aspx | C R T G J |
| Solo Hay Futbol (XIII Liga F7, senior, 2026) | Valladolid | F7 y sala | https://www.solohayfutbol.com/mod/soccer/competitions.aspx | C R T G J |
| La Liga de las Empresas | Espana (ciudad sin verificar; tambien laligadelasempresas.es) | F7 empresas | https://www.laligadelasempresas.com/mod/soccer/index.aspx | C R T G J |
| Estadio 7 | Las Palmas | F7 | http://www.estadio7.com/mod/soccer/competitions.aspx | C R T G J |
| F7 Giralda | Sevilla | F7 | http://www.futbol7giralda.com/mod/soccer/competitions.aspx | C R T G J |
| F7 Sevilla | Sevilla | F7 | http://www.f7sevilla.com/mod/soccer/competitions.aspx | C R T G J |
| F7 Elite Sevilla | Sevilla | F7 | https://www.futbol7elite.es/mod/soccer/index.aspx | C R T (noindex; en vivo) J n/d |
| Liga Hesperides | Sevilla (Andalucia) | F7/F11 veteranos +35 | http://demoligahesperides.serversports.net/mod/soccer/competitions.aspx (ahora tambien en MyGol) | C R T G J |
| ANFUTBOL7 (Asoc. Nacional de Futbol 7) | Puertollano (Ciudad Real); ambito nacional | F7 | http://demoanfutbol7.serversports.net/mod/soccer/index.aspx | C R T |
| ADAC | Andalucia (sin verificar); La Preferente lista "Liga ADAC Isendi Farma" | F7/F11 | http://demoadac.serversports.net/mod/soccer/situation.aspx?itm=13833 | C R T G |
| Business Sports | Madrid | F7 empresas | https://futbol.business-sports.es/mod/soccer/index.aspx | C R T G J |
| LIGAS A+7 | Guadalajara y El Casar | F7 | https://www.ligamas7.com/mod/soccer/competitions.aspx | C R T G J |
| Calderon Cinco / Ligas Futbol 7 Madrid (Meco y otras sedes) | Madrid | F7 veteranos y otras | http://www.ligasfutbol7madrid.com/mod/soccer/competitions.aspx | C R T G |
| Futbol Totana "Enrique Ambit Palacios" | Totana (Murcia) | F11 municipal | http://ligadefutbol.totana.es/mod/soccer/competitions.aspx | C R T (goleadores n/d) |
| Liga Empresas Cordoba | Cordoba | F7 empresas | https://www.ligaempresascordoba.com/ | C R T G |
| Liga Febril | Murcia (sin verificar la ciudad exacta) | F7 | http://www.ligafebril.com/mod/soccer/index.aspx | C R T |
| F7 Aspe | Aspe (Alicante) | F7 | http://www.aspefutbol7.com/mod/soccer/index.aspx | C R T G |
| Liga Iberica | Gijon (Asturias) | F7 | https://www.ligaiberica.es/mod/soccer/competitions.aspx | C R T G (historico desde 2015) |
| Futbol 7 Asturias | Asturias | F7 | http://www.futbol7asturias.com/mod/soccer/index.aspx | C R T G |
| Futsal Chiclana | Chiclana (Cadiz) | sala | https://www.futsalchiclana.com/mod/soccer/index.aspx | C R T |
| ZaSport / F7 Avila (incl. liga sala veteranos Benavente) | Avila y Benavente (Zamora) | F7 y sala | https://www.f7avila.com/mod/soccer/index.aspx | C R T G, fichas de jugadores en PDF |
| Campeonato Burlada | Burlada (Navarra) | futbol | http://www.cptoburlada.net/mod/soccer/competitions.aspx | C R T |
| Ligas Tiki Taka F7 | Valencia | F7 | https://www.tikitakaf7.com/mod/soccer/index.aspx | C R T G |
| FS Burgos | Burgos | futbol sala | http://www.futbolsalaburgos.es/mod/soccer/index.aspx | C R T (sin verificar) |
| Bunwer | Espana (ciudad sin verificar) | F7 | https://bunwer.es/mod/soccer/competitions.aspx | C R T |
| By Sport | Espana (ciudad sin verificar) | F7 | http://www.bysportfutbol7.com/mod/soccer/situation.aspx?itm=6110 | C R T J (existe `player.aspx`) |
| FitGalicia | Galicia | F7/futbol | https://www.fitgalicia.com/mod/soccer/competitions.aspx | C R T |
| Aldovea F7 | Madrid (San Sebastian de los Reyes) (sin verificar que sea ServerSports; el enlace `mod/download.aspx` sugiere que si) | F7 | http://www.aldoveafutbol7.com/ | n/d |
| Liga Fansport / Liga Corporativa / demos varias | (ver descartados) | - | - | - |

ServerSports sin verificar ciudad o pais (huellas vistas en buscador): futbolsalacda.com, ligas.redfutbolsala.com (Red Sports), cnfutbolsala.com (CNFS), afes.red (AFES/CODA), empubenco.com, torneosindesa.com (INDESA; "Baby Futbol", parece latinoamericano), guresport.com (sin verificar), `demoligastikitaka`. Conservar como candidatos a comprobar.

Nota sobre multideporte: la busqueda `mod/basket/` no devolvio ningun cliente; ServerSports publica solo `mod/soccer/` en los resultados vistos. La app de iPad "ServerSports Competitions" (INET Quality Services) confirma que el producto expone clasificacion, goleadores, porteros y comparativas equipo/jugador, pero no se encontro lista oficial de clientes (serversports.com falla por certificado).

### 2.2 MyGol
Patron: `https://{cliente}.mygol.es/` (portada), `/tournaments`, `/tournaments/{id}`, `/tournaments/{id}/matches`, `/tournaments/{id}/matches/{matchId}`, `/tournaments/{id}/sanctions`, `/tournaments/{id}/rankings`, `/tournaments/{id}/teamsranking`, `/awards/{id}`, `/content/{id}`. Es una SPA de React ("You need to enable JavaScript"): el HTML no trae datos. Hay que descubrir el backend JSON. Datos publicos: C, R, T, S, ranking de goleadores y equipos, premios. mygolpro.com es la web comercial y no publica directorio de clientes.

| Liga | Ciudad / provincia | Deporte | URL | Datos |
|---|---|---|---|---|
| Liga F7 Aviles | Aviles (Asturias) | F7 | https://ligaf7aviles.mygol.es/tournaments | C R T S G |
| Liga Futbol 7 Gijon | Gijon | F7 | https://ligaf7gijon.mygol.es/tournaments | C R T S G |
| Asoc. Asturiana Minifutbol | Asturias | F7 | https://f7asturias.mygol.es/tournaments | C R T |
| Red Futbol Siete (REDF7) | Madrid (20+ sedes: Hortaleza, Vallecas, Fuencarral, Vicalvaro, Valdebernardo, Alcobendas...) | F7 fin de semana, entre semana, veteranos +30 | https://redsports.mygol.es/tournaments (tambien ligas.redfutbolsiete.com/tournaments) | C R T S |
| Futbol 7 Leganes | Leganes (Madrid) | F7 | https://futbol7leganes.mygol.es/tournaments | C R T |
| Deportes Ocio y Cultura (DOC) | (sin verificar) | F7/sala | https://doc.mygol.es/ | C R T |
| Liga Hesperides | Sevilla | F7/F11 veteranos +35 | https://ligahesperides.mygol.es/tournaments/13 | C R T |
| Ligas GDA (Gaditana de Deporte Aficionado) | Cadiz (provincia) | F11 veteranos +34 y otras | https://ligasgda.mygol.es/ | C R T |
| ADVETARUCAS | Cadiz/Andalucia (sin verificar) | F11 veteranos | https://advetarucas.mygol.es/tournaments/6 | C R T |
| Agrupacion Deportiva Vigo (Vigo en Xogo) | Vigo (Pontevedra) | F7 senior, sala, copa | https://vigoenxogo.mygol.es/tournaments | C R T S |
| Asoc. Amigos del Futbol Sala Castellon (AFSCS) | Castellon (incl. Lliga Local Vila-real) | sala y F7 | https://afscs.mygol.es/tournaments | C R T S ranking equipos |
| ACADEE - Tus Ligas Canarias (Eventos 8 Islas) | Las Palmas y Telde; Canarias | F7, F11, sala | https://tusligascanarias.mygol.es/tournaments | C R T rankings |
| Futsal Vilanova (Associacio FS Casernes) | Vilanova i la Geltru (Barcelona) | sala | https://futsalvilanova.mygol.es/tournaments/6 | C R T |
| Liga Maxal | Baleares | F7/F11 | https://ligamaxal.mygol.es/tournaments | C R T |
| Asoc. Aragonesa Deporte Laboral y de Empresas | Zaragoza / Aragon | F7/sala empresas | https://laboralyempresas.mygol.es/tournaments | C R T |
| Zaragoza (portal) | Zaragoza | (sin verificar) | https://zaragoza.mygol.es/tournaments | C R T |
| Minifutbol Valencia (FutPlaya) | Valencia | F7 | https://futplaya.mygol.es/tournaments | C R T |
| Liga AKRA F7 Alicante | Alicante | F7 | https://alicante.mygol.es/tournaments | C R T |
| FS5 Navarra | Navarra | futbol sala 5 | https://fs5navarra.mygol.es/tournaments | C R T rankings |
| Minifutbol Reus | Reus (Tarragona) | F7 | https://minifutbolreus.mygol.es/tournaments/1 | C R T |
| Minifutbol Catalunya / Tarragones | Tarragona | F7 | https://minifutboltarragones.mygol.es/tournaments | C R T |
| Lligues Lleida | Lleida | futbol | https://lligueslleida.mygol.es/tournaments | C R T |
| Liga Comarcal Bajo Cinca | Huesca (Bajo Cinca) | futbol | https://ligacomarcalbajocinca.mygol.es/ | C R T |
| Futbol Inclusivo | (sin verificar) | futbol inclusivo | https://futbolinclusivo.mygol.es/tournaments | C R T |
| Liga One | (sin verificar) | futbol | https://ligaone.mygol.es/tournaments | C R T |
| Liga Real Universitaria | (sin verificar) | universitario | https://futbolreal.mygol.es/tournaments | C R T |
| Ligas Futbol Zone | (sin verificar) | futbol | https://ligasfutbolzone.mygol.es/tournaments | C R T |
| Liga Futbol Sala La Amistad | (sin verificar) | sala | https://futbol7amistad.mygol.es/tournaments/54 | C R T |
| Grupo POD (Liga Veteranos Futbol) | (sin verificar) | veteranos | https://ligaveteranosfutbol.mygol.es/ | C R T |
| Liga CSA - Minuto Cero | (sin verificar) | futbol | https://minutocero.mygol.es/tournaments/32/sanctions | C R T S |

### 2.3 Clupik / Leverade
Patron: `https://clupik.pro/{es|en}/manager/{alias|id}/tournaments`, `/tournament/{id}/ranking`, `/tournament/{id}/statistics`, `/tournament/{id}/information`, `/tournament/{id}/match/{id}/results`, `/team/{id}`, `/club/{id}`, `/players/{id}`. Buscador general: https://clupik.pro/en/search. Marcas blancas (mismo motor con dominio propio): `competiciones.elche.es`, `futbolveterans.cat`. Datos publicos: C, R, T, estadisticas (goleadores), sanciones por division (confirmado en AAFVC), ficha de jugador y plantillas. Rate limit agresivo (429).

| Liga | Ciudad / provincia | Deporte | URL | Datos |
|---|---|---|---|---|
| Agrupacio Autonoma de Futbolistes Veterans de Catalunya (5 divisiones) | Cataluna | F11 veteranos (no federado) | https://futbolveterans.cat/en/tournament/1270608/ranking | C R T S J |
| Liga Local Futbol 7 y Sala (Ayto. Elche) | Elche (Alicante) | F7 sala senior | https://competiciones.elche.es/en/tournament/1220910/ranking/3400602 | C R T |
| Liga Local de Futbol Sala de Elche | Elche | sala | https://clupik.pro/manager/181/tournaments | C R T |
| Ayto. Cartagena | Cartagena (Murcia) | varios deportes | https://clupik.pro/en/manager/112/tournaments | C R T |
| Cieza Futbol Sala | Cieza (Murcia) | sala | https://clupik.pro/es/manager/113/tournaments | C R T |
| Delegacion de Deportes Ayto. Marbella | Marbella (Malaga) | varios | https://clupik.pro/en/manager/542024/tournaments | C R T |
| Delegacion Deportes Ayto. Cabra (Liga Local F7 XVIII; Liga Futbol Sala XLI) | Cabra (Cordoba) | F7 y sala | https://clupik.pro/en/manager/deportecabra/posts (tabla: https://clupik.pro/en/tournament/1288603/ranking/3566844) | C R T estadisticas |
| Liga Local Futbol Sala Sabiote | Sabiote (Jaen) | sala veteranos | https://clupik.pro/es/manager/ligasabiote/tournaments | C R T |
| Veteranos F7 Miajadas | Miajadas (Caceres) | F7 veteranos | https://clupik.pro/es/manager/ligaf7miajadas/tournaments | C R T |
| Torneo Social Futbol Sala Ayto. Estella-Lizarra | Estella (Navarra) | sala | https://clupik.pro/en/manager/futbolsalaestella/tournaments | C R T |
| Ayto. Valverde de la Virgen | Valverde de la Virgen (Leon) | futbol | https://clupik.pro/en/manager/lavirgendelcamino/tournaments | C R T |
| Asoc. Galega de Futbol Sala Delegacion Lugo (Liga Local de Lugo) | Lugo | sala | https://clupik.pro/en/tournament/522465/ranking | C R T estadisticas J |
| Asoc. Galega de Futbol Sala Delegacion Ourense (A Bola Veteranos, F7 Celanova) | Ourense | sala y F7 veteranos | https://clupik.pro/tournament/556219/match/61883633/results | C R T |
| Asoc. Galega de Futbol Sala Delegacion Vigo | Vigo (Pontevedra) | sala | https://clupik.pro/en/manager/139462/information | C R T |
| Servizos Deportivos Galicia SL (VIII Torneo sala liga polo titulo) | Galicia | sala | https://clupik.pro/en/tournament/7861/ranking | C R T |
| COARNOS (Torneo de la Liga) | Galicia (sin verificar) | futbol base | https://clupik.pro/en/tournament/385589/ranking | C R T |
| ASIJEMIN (Liga Minera Futbol 11) | (sin verificar) | F11 | https://clupik.pro/en/tournament/772077/ranking | C R T |
| Agrupacion Deportiva de la Sierra (Futbol 7 Alevin) | (sin verificar) | F7 base | https://clupik.pro/en/tournament/1231863/ranking | C R T |

### 2.4 Playooz
Patron: `https://{dominio}/{slug-liga}/{resultados|clasificacion|goleadores|sanciones|equipos|jugadores|resumen}` con parametros `?roundId=&groupId=`. Secciones confirmadas en la navegacion: Resultados, Clasificacion, Goleadores, Sanciones, Equipos, Jugadores. El HTML devuelto solo lleva metadatos y titulo "Playooz": los datos se cargan por JavaScript y habra que capturar las llamadas XHR/API. Descarga de app: `/download?id=93&languageCode=es`.

| Liga | Ciudad / provincia | Deporte | URL | Datos |
|---|---|---|---|---|
| Ligas Futbol 7 (incl. Diario-Empresas, Fin de semana, Boadilla del Monte, Alcobendas-Sanse) | Madrid | F7 | https://ligasfutbolsiete.com/competiciones | C R T G S J |
| En Vinya / Ligas Futbol 7 (envinya.es) | Madrid | F7 | https://www.envinya.es/ligafindesemana2024-2025/clasificacion | C R T G S J |
| Liga Elite Futbol (Zona Sur diario 25-26) | Madrid | F7 | https://www.ligaelitefutbol.com/zonasurdiario25-26/clasificacion | C R T G S J |
| Futbol 7 Navarra (Liga Fin de Semana, Entre Semana, pretemporada) | Navarra (Pamplona) | F7 | https://www.futbol7navarra.com/ligafindesemana2026/clasificacion | C R T G S J |
| MLA Sport (Liga Futbol Siete 2023-24) | (sin verificar) | F7 | https://mlasport.com/ligaf72324/clasificacion | C R T |
| AIDEB Competiciones (F7 Liga 21-22) | (sin verificar) | F7 | https://www.aidebcompeticiones.com/f7-liga_21-22/clasificacion | C R T |
| Campeonatos CDA (Futbol 7; Campeonato de Espana Intercomunidades) | Multi-region (Zaragoza 2023, Gandia 2024) | F7 | https://www.campeonatoscda.com/f7_2024/equipos | C R T equipos |

### 2.5 Competize
Patron: `https://www.competize.com/{es|en}/competition/view/{id}[-slug]`, `/league/view/{id}`, `/event/view/{id}`, `/team/view/{id}`, `/matches/view/{id}`, `/results`. Marca blanca: `juegosmunicipales.lasrozas.es`. Datos: C, R, T, goleadores, porteros, MVP, fair play (confirmado en Badajoz).

| Liga | Ciudad / provincia | Deporte | URL | Datos |
|---|---|---|---|---|
| Juegos Municipales Las Rozas (Futbol 7, Futbol Sala) | Las Rozas (Madrid) | F7 y sala | https://juegosmunicipales.lasrozas.es/en/league/view/130663-futbol-7 | C R T |
| Ligas de Futbol Sala y 7 de Fuengirola | Fuengirola (Malaga) | sala y F7 | https://www.competize.com/en/event/view/28922 | C R T |
| Liga Municipal de Mijas de F7 | Mijas (Malaga) | F7 | https://www.competize.com/es/league/view/27256 | C R T |
| Ligas Municipales Ayto. Mula | Mula (Murcia) | varios | https://www.competize.com/en/event/view/212331 | C R T |
| Campeonato Futbol-7 Ciudad de Badajoz | Badajoz | F7 | https://www.competize.com/en/competition/view/2 | C R T G porteros MVP fair play (confirmado; ejemplo antiguo, Invierno 2018) |
| Liga F. Sala Veteranos 24-25 / Senior 25-26 | (sin verificar) | sala | https://www.competize.com/en/competition/view/337921 | C R T |
| Liga Salesiana de Futbol | (sin verificar) | futbol | https://www.competize.com/en/competition/view/31836/0 | C R T |

### 2.6 SportZentral y otros CMS propios
| Liga | Ciudad / provincia | Deporte | Plataforma | URL | Datos |
|---|---|---|---|---|---|
| Liga Municipal F7 Toledo (Patronato, Division de Honor a 3a) | Toledo | F7 | SportZentral | https://www.ligamunicipalf7toledo.es/ligaf72526/clasificacion | C R T G equipos (`/resultados`, `/goleadores`, `/resumen`, `/equipos`) |
| Futbol 7 Toledo (ligas y torneos) | Toledo | F7 | Wix + todotorneos (sin verificar) | https://futbol7toledo.wixsite.com/ligasfutbol7 | n/d |
| Liga F7 Toledo Norte (base) | Toledo | F7 | todotorneos.com | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=357080 | C R |
| XI Liga Futbol 7 Benidorm | Benidorm (Alicante) | F7 | todotorneos.com | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=292421 | C R |
| Liga de Futbol 7 Ciudad de Trujillo | Trujillo (Caceres) | F7 | todotorneos.com | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=13676 | C R |
| Futbol 7 Las Rozas | Las Rozas (Madrid) | F7 | todotorneos.com | https://www.todotorneos.com/torneo/torneosmain.php?torneo=151647 | C R |
| III Torneo Reino de Leon de Futbol 7 | Leon | F7 | todotorneos.com | https://www.todotorneos.com/torneo/torneosmain.php?torneo=140275 | C R |
| FutbolSiete (Bizkaia y Gipuzkoa; 400+ equipos, 25+ anos) | Bizkaia (Arrigorriaga, Zamudio), Gipuzkoa (Trintxerpe, Usurbil...) | F7 | ASP propio | https://www.futbolsiete.com/Inicio/Ver_Zona.asp?CodZona=2 | C R T G, ficha de equipo |
| TotalF7 (Hortaleza, Las Rosas, Valdebebas, El Canaveral) | Madrid | F7 | web propia | https://totalf7.com/ | C (ancla `#clasificacion`), normas |
| Futbol Live (San Jose, Marcelino Quatre, Patronato, Paterna) | Valencia | F7, sala, F11 | WordPress (ColorMag) | https://futbollive.es/ | C R (paginas `/sjl-2`, `/sml`, `/pl`) |
| Nostresport Leagues | Valencia | F7 (Lunes-Viernes) | web propia | https://www.nostresportleagues.com/futbol/ | C R |
| RC Sport - RC Inter Empresas (9 ciudades: Madrid, Barcelona, Sevilla, Bilbao, Vigo, Malaga, Valencia, Zaragoza, Alicante) | multi-ciudad | F7 y sala empresas | web propia (plataforma de resultados sin verificar) | https://www.rcsport.es/liga-futbol-7-empresas/ | C R (por sede) |
| Fundacio Valldor7 (Ligas F7 Veteranos) | Barcelona | F7 veteranos | web propia (sin verificar) | https://fundaciovalldor7.com/futbol-7-veteranos/ | n/d |
| Futbol7Barcelona (Joomla + Joomleague) | Barcelona | F7 | Joomla 1.5 | https://futbol7barcelona.com/ | inactivo (redirige a padel) |
| MalagaF7 | Malaga | F7 | sin verificar | https://www.malagaf7.com/ | n/d |
| Deporte y Empresa Malaga | Malaga | F7 empresas | sin verificar | https://www.deporteyempresa.com/ | n/d |
| Ligas F7 Andalucia | Andalucia | F7 | sin verificar | https://www.ligasf7andalucia.com/blog/categories/granada | n/d |
| Copa Relampago F7 Cordoba | Cordoba | F7 | sin verificar | https://www.coparelampago.com/ | n/d |
| Fut7 Granada | Granada | F7 | sin verificar (Facebook) | https://www.facebook.com/Fut7granada/ | n/d |
| Torneosfutbolsiete.com | Madrid | F7 | sin verificar (probable Playooz) | (sin URL confirmada) | n/d |
| Englobasports | Gijon, Oviedo, Cuencas, Oriente (Asturias) | F7 | sin verificar (existe gestorligas.com/liga-10131 Oviedo) | (sin URL) | n/d |
| NavaSport | Puertollano (Ciudad Real) | F7 | sin verificar | (sin URL) | n/d |
| Lual Sport - Futbol Sagra | Toledo (La Sagra) | F7 | sin verificar | (sin URL) | n/d |
| Futbol Base Leon | Leon | F7 | sin verificar | (sin URL) | n/d |
| ERESF7 Liga AMA 7 | Guadalajara | F7 | sin verificar (posible ServerSports, mismo territorio que LIGAS A+7) | (sin URL) | n/d |
| AFSI Extremadura | Badajoz | sala/F7 | sin verificar | (sin URL) | n/d |
| Asoc. Zaragozana de Cultura y Deporte Laboral (Futbol 7) | Zaragoza | F7 laboral | web propia + MyGol | http://www.deportelaboralaragon.org/futbol-7/ | C R T |

Las seis ultimas entradas del bloque ANF7 (Englobasports, torneosfutbolsiete, NavaSport, Lual Sport, Futbol Base Leon, ERESF7, AFSI) vienen de la lista de ligas asociadas de https://anfutbol7.es/la-comunidad-del-futbol-siete-en-espana/ (la portada dice "15 ligas asociadas"; la pagina solo mostro 10: Navarra, Madrid, Asturias, Vigo, Malaga, Guadalajara, Valladolid, Ciudad Real, Toledo, Leon).

### 2.7 Portales municipales / juegos deportivos municipales
| Ciudad | Portal | Deporte | URL | Datos y formato |
|---|---|---|---|---|
| Madrid | Juegos Deportivos Municipales (47a edicion 2026/27) | F11, F7, sala, otros | Datos abiertos: https://datos.madrid.es/portal/site/egob/ (conjunto "Competiciones deportivas municipales de deportes colectivos. Temporada en curso") | C R T por grupo, actualizado a diario segun terceros. Sin goleadores ni sanciones. La ficha de datos.madrid.es esta bloqueada por robots.txt para WebFetch: formato exacto (CSV/JSON/XML) sin verificar |
| Madrid | jdmmadrid.es (app no oficial sobre los datos abiertos) | mismos | https://www.jdmmadrid.es/ | `/teams/`, `/matches/results`, `/matches/fixtures`; 46 JDM 2025/26; 8.000+ equipos |
| Madrid | MuniMad (app oficial) | mismos | https://munimad.es/ | 28.743 partidos, 4.993 equipos; sin API publica documentada |
| Sevilla | IMD - Juegos Deportivos Municipales (F7, sala) | F7 y sala | https://imd.sevilla.org/programas-deportivos/juegos-deportivos-municipales/deportes/futbol-7 y app https://imd.sevilla.org/app/jjddmm_resultados/ | Clasificaciones en PDF por temporada (`/clasificaciones/2023-2024/`); app de resultados (WebFetch dio "too many redirects": sin verificar el formato) |
| Sevilla (provincia) | Diputacion - Juegos Deportivos Provinciales F7 | F7 | https://www.dipusevilla.es/temas/deportes/juegos-deportivos-provinciales/futbol-7/ | sin verificar |
| Valencia | Fundacion Deportiva Municipal | F7 | https://www.fdmvalencia.es/es/actividades/futbol-7/ | sin verificar si publica resultados |
| Las Rozas | Juegos Municipales (Competize marca blanca) | F7, sala | https://juegosmunicipales.lasrozas.es/en/league/view/130663-futbol-7 | C R T |
| Mostoles | Moostoles Deporte - campeonatos municipales | F7, sala (base) | https://www.mostoles.es/MostolesDeporte/en/campeonatos-municipales-deporte-infantil/futbol-7/clasificaciones-resultados/clasificaciones-resultados-serie-basica | C R en HTML |
| Fuenlabrada | Web de Deportes - ligas municipales | varios | https://deportes.ayto-fuenlabrada.es/vercompeti.php | sin verificar (WebFetch fallo por timeout) |
| Navalcarnero | Liga Local Futbol 7 2026/27 | F7 | https://navalcarnero.es/navalcarnero/deportes/ligafutbol7/ | solo PDF |
| Majadahonda | Deportes - Futbol 7 y Sala Populares | F7/sala | https://deportes.majadahonda.org/futbol-7 | sin verificar |
| Jumilla | Liga Local de Futbol Sala - Clasificaciones | sala | https://jumilla.org/ayuntamiento/clasificacion.asp | C (ASP propio) |
| Las Torres de Cotillas | Liga de futbol 7 municipal | F7 | https://www.lastorresdecotillas.es/actividad-fisica-liga-de-futbol-7 | sin verificar |
| Almassora | Reglamento F7 municipal (CMS digitalvalue) | F7 | https://cdn.digitalvalue.es/almassora/ | sin verificar |
| Totana | Liga Fútbol "Enrique Ambit Palacios" | F11 | ServerSports (ver 2.1) | C R T |
| Elche, Cabra, Marbella, Cartagena, Estella, Mula, Fuengirola, Mijas, Toledo, Badajoz | ver secciones Clupik, Competize y SportZentral | | | |

### 2.8 La Preferente "No Federado" (ver seccion 4 para detalle)
| Liga | Provincia | URL |
|---|---|---|
| Liga de Penas Costa Tropical (17 equipos) | Granada | https://www.lapreferente.com/C21468-1/liga-de-pe%C3%B1as-costa-tropical |
| Liga de la Amistad - Granada | Granada | https://www.lapreferente.com/C20451-1/liga-de-la-amistad--granada/widget.html |
| Liga Andaluza 25 (11 equipos, veteranos/locales) | Cordoba | https://www.lapreferente.com/index.php?comp=20559 (y comp=23016, comp=28150) |
| Liga de Empresas Los Gallardos | Almeria | https://www.lapreferente.com/index.php?comp=4809 |
| Campeonato AFASA Futbol 11 | Andalucia (sin verificar) | https://www.lapreferente.com/index.php?comp=14166 |
| Campeonato AFASA Futbol 7 | Andalucia (sin verificar) | https://www.lapreferente.com/index.php?comp=14185 |
| Liga Local de La Carolina | Jaen | https://www.lapreferente.com/index.php?comp=9033 |
| Liga Local de Andujar Grupo B (y futbol7andujar.com) | Jaen | https://www.lapreferente.com/index.php?comp=7041 |
| Liga ADAC Isendi Farma | Andalucia (sin verificar) | https://www.lapreferente.com/index.php?comp=7920 |
| Equipos "Veteranos de..." No Federado (Puente Genil, Baena, Aguilar, La Rambla, Osuna) | Cordoba/Sevilla | https://www.lapreferente.com/E28650/veteranos-de-puente-genil-no-federado |

Tambien aparecen sin etiqueta "No Federado" (posiblemente federadas, sin verificar): Campeonato Provincial Sevilla Veteranos (comp=20098), Primera Division Aljarafe Veteranos (comp=20085), Veteranos Almeria (comp=18928), Liga Veteranos Malaga (C2045-1).

---

## 3. Cobertura por provincia (lo encontrado)

| Comunidad / provincia | Ligas encontradas (plataforma) |
|---|---|
| Madrid | Red F7 (MyGol), Business Sports (SS), Calderon Cinco (SS), Ligas Futbol 7 / En Vinya / Elite (Playooz), TotalF7 (propia), Futbol 7 Leganes (MyGol), Las Rozas JDM (Competize) y F7 Las Rozas (todotorneos), Aldovea (sin verificar), JDM Madrid (open data), Mostoles, Fuenlabrada, Navalcarnero, Majadahonda, RC Inter Empresas |
| Barcelona | Futsal Vilanova (MyGol), Veterans de Catalunya (Clupik), Valldor7 (sin verificar), RC Sport |
| Tarragona | Minifutbol Reus, Minifutbol Tarragones (MyGol) |
| Lleida | Lligues Lleida (MyGol) |
| Girona | sin resultado |
| Valencia | Tiki Taka F7 (SS), Minifutbol Valencia (MyGol), Futbol Live, Nostresport Leagues, FDM Valencia |
| Alicante | Liga AKRA F7 (MyGol), F7 Aspe (SS), Elche (Clupik), Benidorm (todotorneos) |
| Castellon | AFSCS Castellon y Vila-real (MyGol), Almassora |
| Murcia | Totana (SS), Liga Febril (SS), Cartagena, Cieza (Clupik), Mula (Competize), Jumilla, Las Torres de Cotillas |
| Sevilla | F7 Giralda, F7 Sevilla, F7 Elite (SS), Liga Hesperides (SS/MyGol), IMD JJDDMM |
| Cadiz | Ligas GDA, ADVETARUCAS (MyGol), Futsal Chiclana (SS) |
| Cordoba | Liga Empresas Cordoba (SS), Cabra (Clupik), Liga Andaluza 25 (La Preferente), Copa Relampago |
| Malaga | Marbella (Clupik), Fuengirola y Mijas (Competize), MalagaF7, Deporte y Empresa |
| Granada | Liga Penas Costa Tropical, Liga de la Amistad (La Preferente), Fut7 Granada |
| Almeria | Liga de Empresas Los Gallardos (La Preferente) |
| Jaen | Sabiote (Clupik), La Carolina, Andujar (La Preferente) |
| Huelva | sin resultado |
| Baleares | Liga Maxal (MyGol) |
| Las Palmas / Canarias | Estadio 7 (SS), ACADEE Tus Ligas Canarias (MyGol) |
| Santa Cruz de Tenerife | posiblemente cubierto por ACADEE "8 Islas" (sin verificar) |
| Asturias | Liga Iberica, F7 Asturias (SS), F7 Aviles, F7 Gijon, Asturiana Minifutbol (MyGol), Englobasports |
| Galicia (Vigo, Lugo, Ourense, A Coruña, Pontevedra) | Vigo en Xogo (MyGol), AGAFS Lugo/Ourense/Vigo (Clupik), FitGalicia (SS), Siguetuliga Galicia F7 (A Coruna, Pontevedra Liga Metropolitana, Lalin, Ourense, Lugo) |
| Navarra | Futbol 7 Navarra (Playooz), FS5 Navarra (MyGol), Burlada (SS), Estella (Clupik) |
| Bizkaia / Gipuzkoa | FutbolSiete (propia) |
| Zaragoza | FutZaragoza (SS), Laboral y Empresas (MyGol), Zaragoza (MyGol) |
| Huesca | Liga Comarcal Bajo Cinca (MyGol) |
| Salamanca, Zamora | Futormes, Futormes Zamora (SS) |
| Valladolid | Solo Hay Futbol, ASOFUSA (SS) |
| Avila | F7 Avila / ZaSport (SS) |
| Burgos | FS Burgos (SS, sin verificar) |
| Leon | Valverde de la Virgen (Clupik), Torneo Reino de Leon (todotorneos), Futbol Base Leon |
| Guadalajara | LIGAS A+7, ERESF7 |
| Toledo | Liga Municipal F7 Toledo (SportZentral), Toledo Norte (todotorneos), Lual Sport |
| Ciudad Real | ANFUTBOL7 y NavaSport (Puertollano) |
| Caceres | Miajadas (Clupik), Trujillo (todotorneos) |
| Badajoz | Campeonato F7 Ciudad de Badajoz (Competize), AFSI Extremadura |

Sin resultados por agotarse el presupuesto de busqueda (no significa que no existan): Alava, Cantabria, La Rioja, Girona, Huelva, Albacete, Cuenca, Segovia, Soria, Teruel, Palencia, Ceuta, Melilla, y las ciudades grandes por separado (Hospitalet, Badalona, Terrassa, Sabadell, Vitoria, Santander, Logrono, San Sebastian, Pamplona municipal, etc.). Las ligas de Cataluña muy probablemente pasan por Consell Esportiu / FCF y no son "aficionado libre".

---

## 4. La Preferente "No Federado"

- Seccion existe como categoria dentro del menu Futbol: "No Federado" con subniveles Senior, Juvenil, Cadete, Infantil, Alevin, Benjamin, Prebenjamin, Bebe y las mismas en Femenino. Confirmado en las paginas de https://www.lapreferente.com/index.php?comp=21468 y ?comp=20559.
- Cobertura: en todo lo revisado, solo aparecen ligas no federadas en Andalucia ("Futbol de Andalucia"): Cordoba, Granada, Malaga, Sevilla, Almeria, Jaen. En Castilla y Leon y Galicia la busqueda solo devolvio ligas federadas. No se encontro ninguna lista completa con el numero total: el menu no la expone en el HTML extraido. Contadas: unas 10 ligas etiquetadas mas equipos sueltos "... No Federado" (Chauchina, Lachar, C.F. Dynos, Airsat Stylo Autorecambios, etc.).
- Patrones de URL:
  - Competicion: `https://www.lapreferente.com/index.php?comp={idCompeticion}` o `https://www.lapreferente.com/C{idCompeticion}-1/{slug}`
  - Widget: `https://www.lapreferente.com/C{id}-1/{slug}/widget.html`
  - Buscador de partidos: `.../C{id}-1/{slug}/buscadorPartidos.html`
  - Equipo: `https://www.lapreferente.com/E{idEquipo}/{slug}` o `E{idEquipo}C{idCompeticion}-1/{slug}`
  - Estadisticas: `index.php?IDequipo={id}&comp={id}&seccion=estad&tipo1=GF&tipo2=general`
- Datos publicos (confirmado en Liga de Penas Costa Tropical): clasificacion, resultados por jornada, Goleadores/Porteros, Juego Limpio (fair play/disciplina), plantillas por equipo con datos de jugador. Es decir, hay goleadores y por jugador.
- Ojo: La Preferente agrega ligas de terceros a mano, con IDs de competicion no correlativos; no hay endpoint listado. Para descubrir ligas nuevas hay que rastrear el menu por provincia.

---

## 5. Notas tecnicas utiles para el scraper

- ServerSports: HTML clasico ASP.NET. Semilla: `/mod/soccer/competitions.aspx` -> enlaces a `situation.aspx?itm=`. El parametro `itm` es global (IDs entre 1 y ~15.000 para competiciones; IDs de partido/jugador de 6-7 cifras) y repetido en URLs (`itm=X&itm=X`), normal. Footer o titulo `Nombre :: Seccion` identifica el cliente. Los dominios de demo en `*.serversports.net` y los dominios propios sirven el mismo motor.
- MyGol: buscar el JSON de `*.mygol.es` (mismo backend para todos los subdominios). Un adaptador sirve para los 29 clientes.
- Playooz: mismo esquema en todos los dominios, un adaptador. Solo metadatos en HTML.
- Clupik: `clupik.pro` es la vista publica; los IDs de torneo son globales. Respetar 429.
- Competize: paginas con `competition|league|event` + ID global; los slugs son opcionales.
- Madrid open data: la unica fuente oficial estructurada; la pagina de datos.madrid.es prohibe WebFetch por robots, pero el portal ofrece descarga de datos (comprobar terminos).

## 6. Fuentes principales (URLs citadas arriba)
ServerSports: http://www.serversports.com/ , https://apps.apple.com/us/app/-/id910982530 ; MyGol: https://mygolpro.com/es ; Clupik: https://clupik.com/en/leagues-tournaments/ ; Competize: https://www.competize.com/blog/torneos-ligas/ ; ANF7: https://anfutbol7.es/ ; La Preferente: https://www.lapreferente.com/ ; JDM Madrid: https://www.jdmmadrid.es/ y https://munimad.es/ ; Siguetuliga: https://www.siguetuliga.com/categoria/futbol-7 ; y las URLs de cada fila.
