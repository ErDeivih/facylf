# R2 - Plataformas y portales de resultados de fútbol aficionado no federado (España)

Fecha: 2026-10-01. Fuentes: solo WebSearch/WebFetch. «Verificado» = página abierta con WebFetch y patrón comprobado; «búsqueda» = visto solo en resultados de búsqueda.

**ESTADO: INCOMPLETO.** La investigación se cortó por «session limit» de las herramientas web tras 14 búsquedas y 13 fetches (varios fallaron por timeout de robots.txt o 403/404/410). Los puntos 4 y 5 no se llegaron a investigar.

## 1. Plataformas de gestión de ligas (nuevas, no listadas en conocidas.txt)

| Nombre | Web | Patrón URL público | Clientes en España | Verificado |
|---|---|---|---|---|
| Deporstar | deporstar.com | desconocido | sin confirmar (marketing en español, aparece primero en Google ES) | búsqueda |
| Klasifica | klasifica.com (klasifica-fe.vercel.app) | desconocido | sin confirmar; parece un proyecto pequeño | búsqueda |
| FLM System | flmsystem.com/es | desconocido | sin confirmar | búsqueda |
| Futzo | futzo.io | desconocido | mercado principal México | búsqueda |
| Fulbito / ligu.app | ligu.app | desconocido | sobre todo LatAm | búsqueda |
| Copa Fácil | app (iOS/Android) | solo app | sobre todo LatAm | búsqueda |
| bcoach | bcoach.app | publica un ranking de apps para torneos en 2026 (útil para descubrir otras) | - | búsqueda |

Ninguna de estas tiene clientes españoles confirmados. Ninguna merece adaptador por ahora.

## 2. Software municipal con portal público de competiciones

| Software / patrón | Patrón URL | Ayuntamientos / clientes | Verificado |
|---|---|---|---|
| Software de «vercompeti.php» (proveedor sin identificar: no hay firma en el pie) | `/vercompeti.php?tipc={0,1}` (lista), `/deporte.php?competi={ID 6 cifras}&tipc=PT&c=0` (clasificación/resultados) | **Fuenlabrada** (deportes.ayto-fuenlabrada.es, ya conocido; el fetch da timeout), **Palencia PMD** (www.pmdpalencia.com, NUEVO: ligas de ocio de fútbol sala absoluto mixto Oro/Plata/Bronce, competi=000794/000795/000796; no hay F7 ni F11) | Palencia: verificado |
| i2A Cronos (CronosWeb) | `https://{host}/CronosWeb/...` (en Fuensalida lleva a `/CronosWeb/Login`) | Fuensalida (deporte.fuensalida.es, NUEVO, pero solo se vio la pantalla de login), Boadilla y UMA ya conocidos. En el manual de la UMA la sección de competiciones está «en construcción»: no hay ruta pública confirmada | parcial |
| Madrid JDM: apps de terceros sobre datos abiertos | jdmmadrid.es: `/teams/`, `/matches/`, `/matches/results`, `/matches/fixtures` | Fausto Blasco, no oficial, temporada 2025/26 (46 JDM), con F7, F11 y FS. munimad.es (Antonio Martín Garre) es solo app. Ambos usan los datos abiertos de Madrid, que ya conocemos: no aportan una fuente nueva | jdmmadrid: verificado |
| Móstoles | campeonatosmunicipalesmostoles.org y mostoles.es/MostolesDeporte/.../clasificaciones-resultados | Móstoles (al menos infantil; adultos sin confirmar) | búsqueda (fetch con timeout) |
| Majadahonda | deportes.majadahonda.org/futbol-sala-populares | Majadahonda, fútbol sala popular | búsqueda |
| Alcobendas | alcobendas.org/es/temas/deportes/competiciones | calendarios 2025/26 | búsqueda (403) |
| Las Rozas / Torrejón | lasrozas.es/deportes/competiciones/juegos-municipales; deportes.ayto-torrejon.es/campeonatos-locales | Torrejón ya conocido (PDF) | búsqueda |
| Gesport SL | gesportsl.es/futb-resultados/ | empresa gestora de futbito (ciudad sin confirmar; timeout) | búsqueda |
| lcfs.es «Liga Comarcal» | lcfs.es/es/tournaments | devuelve 410 (dada de baja) | descartado |

No se investigaron: Deporweb, IDB, T-Innova/Deporsite (la búsqueda de Deporsite no devolvió portales de competiciones).

## 3. Redes nacionales interempresas y de F7

| Red | Patrón URL | Ciudades / sedes | Verificado |
|---|---|---|---|
| La Liga de las Empresas (laligadelasempresas.es, web corporativa; resultados en laligadelasempresas.com, ServerSports, ya conocido) | PDF de normativa por sede: `laligadelasempresas.es/wp-content/uploads/{CIUDAD}_Futbol7_2026_27.pdf` | Madrid, Bilbao, Sevilla, Málaga; F7, fútbol sala y pádel; temporada 2026/27 activa | verificado (home) |
| RC Sport (rcsport.es) | plataforma propia: `rcsport.es/liga-futbol-7-empresas/{id}-{slug-torneo}/{equipostorneo, ...}`, `rcsport.es/futbol7empresas/historial/`; además existe nueva.rcsport.es (web en migración, por eso los torneos antiguos dan 404) | Madrid seguro (p. ej. «colegio-el-prado»); «Liga Femenina F7 RC Interempresas Primavera 2026» (id 13). Apúntamelo también la lista | búsqueda (el torneo dio 404) |

No se investigaron Business Sports, Elite ni la Red F7 (de todos modos ya figuran como ServerSports/MyGol en conocidas.txt).

## 4. Ligas universitarias internas (Trofeo Rector)

Sin investigar. Solo un indicio: la UC3M publica «Liga y copa» en `uc3m.es/deporte/competiciones/liga_copa` (aparece en la búsqueda de `deporte.php?competi=`; puede que use el mismo patrón).

## 5. Agregadores

Sin investigar.

## Plataformas que merecen adaptador (provisional)

1. **Software de «vercompeti.php / deporte.php?competi=»**: dos ayuntamientos confirmados (Fuenlabrada y Palencia) con el mismo patrón; conviene buscar más instalaciones (posible UC3M).
2. **RC Sport (rcsport.es)**: plataforma propia de la red interempresas más grande de Madrid, con varios torneos por temporada.
3. **jdmmadrid.es**: no hace falta si ya se consumen los datos abiertos de Madrid.
4. **i2A CronosWeb**: solo si se encuentra una ruta pública de competiciones sin login.

## Segunda tanda

Fecha: 2026-10-02. Solo WebSearch/WebFetch: 37 búsquedas y 50 fetches (se agotó el cupo de fetches). «Verificado» = página abierta con WebFetch; «búsqueda» = visto solo en resultados de búsqueda; «bloqueado» = robots.txt o 403 impidieron abrirla.

### 2b. Software municipal o universitario con portal público de competiciones

| Nombre | Patrón URL | Clientes / ciudades | Verificado |
|---|---|---|---|
| Software «vercompeti.php» (fabricante **sin identificar**: no hay pie, generador ni créditos en Palencia; jarduera2.ehu.eus no se puede abrir por un robots.txt mal formado) | `/vercompeti.php?tipc=` (buscador de ligas, que carga los resultados por AJAX), `/deporte.php?competi={6 cifras}&tipc=&c=0` (clasificación), `/resul.php?c=0&competi=` (resultados), `/deportividad.php?competi=` (juego limpio) | Fuenlabrada (deportes.ayto-fuenlabrada.es), Palencia PMD (pmdpalencia.com: fútbol sala Oro/Plata/Bronce, baloncesto, golf y juegos escolares), **UAM, NUEVO** (infrdep.uam.es/vercompeti.php, «Ligas Internas», en la Oficina Virtual) | Palencia y UAM: verificado (en UAM la lista se carga por AJAX, así que no se ven los ID); Fuenlabrada: búsqueda (rutas resul.php y deportividad.php) |
| jarduera2.ehu.eus (UPV/EHU; aplicación propia o del mismo fabricante) | `/kirolak/index.php`, `/kirolak/zonaabo.php?idioma=castellano` (inscripción con LDAP) | UPV/EHU: campeonatos de campus de Bizkaia, Gipuzkoa y Álava, con fútbol sala y F7 masculino y femenino | bloqueado (robots.txt); la web de ehukirola no enlaza resultados |
| `zonaabo.php` (zona de abonados): misma huella que jarduera2 | `/zonaabo.php` | Plasencia (búsqueda; el fetch dio timeout). Puede ser el mismo fabricante que vercompeti.php: **sin confirmar** | búsqueda |
| T-Innova **Deporwin** (módulo «Campeonatosweb») | `http://{host}/instalacionesdeportivas/Campeonatosweb/Principal.aspx` y PDF en `/SIJA/deportes/clasificaciones_copa/...pdf` | UC3M (deporwin.uc3m.es, enlazado desde la página oficial de calendarios). La web comercial de T-Innova no menciona ningún módulo de competiciones. Coslada (pmdcoslada.org, que ahora redirige a encoslada.es) aparece ligada a «Campeonatosweb» solo en un listado SEO | UC3M: enlace verificado, pero el host no resuelve (DNS) desde fuera; Coslada: búsqueda |
| i2A Cronos | `http://i2acronos.uc3m.es/deporte` | UC3M lo enlaza como «Calendarios, resultados y clasificaciones LIGA», pero la portada solo muestra cookies y aviso legal (versión 25.01, «más de 400 centros») | verificado: sin contenido público |
| Sporttia (sporttia.com) | desconocido (módulo de competiciones con «ligas o playoff» y «calendarios, horarios y resultados») | Diputación de Sevilla: implantado en 80 municipios de la provincia desde finales de 2024 | verificado (nota de prensa); portal de resultados no localizado |
| Diputación de Toledo (CodeIgniter propio) | `deportes.diputoledo.es/`, `/clubes`, `/app` | solo competiciones de base (Somos Deporte 3-18, benjamín y prebenjamín); no hay adultos | verificado: descartado |
| Deporweb (deporweb.es) | ninguno | sin módulo de competiciones: solo reservas, cursos y accesos | verificado: descartado |
| Playoff Informàtica (Consells Esportius de Cataluña) | `{ce}.playoffinformatica.com/competicio`, `/CompeticioResultatsWeb.php?accio=accio_competicio_publica_resultats&idGrup={n}&idTemporada={n}`, `/CompeticioClassificacioWeb.php?...` | CE Anoia (ceanoia), CE Gironès (ceg), CE Sabadell (ces), CE Maresme (cemaresme). Casi todo es escolar; no se ha confirmado ninguna liga de adultos | **bloqueado**: el robots.txt prohíbe el acceso (incluso a /robots.txt). No hay que hacer adaptador |
| Gesport SL | gesportsl.es/futb-resultados/ | sin confirmar (timeout por segunda vez) | sin verificar |
| IDB | no se encontró nada | - | - |

Otras fuentes nuevas de adultos encontradas de paso:

| Nombre | Patrón URL | Ámbito | Verificado |
|---|---|---|---|
| Lligues d'Esports de Lleure Intermunicipals (Girona) | web.girona.cat/esports/esdeveniments/lligues-esports, que remite a esports.sarriadeter.cat | fútbol sala de ocio de adultos, organizado por Sarrià de Ter | verificado (sin enlace a resultados) |
| Lliga comarcal F7 «lleure» del Garraf | cegarraf.cat/index.php/noticies/... | F7 de ocio | búsqueda |
| **veteransfutbol.com** (Veterans Vallès-Maresme): **ServerSports, NUEVO** | `/mod/soccer/competitions.aspx`, `/mod/soccer/situation.aspx?itm={id}` | F11 de veteranos, 5 competiciones en 2026 (MutuaCat Divisió d'Honor, Lliga Èlit, Preferent, 1ª Divisió y Supercopa) | verificado |
| **futbolveterans.cat** (Agrupació Autònoma de Futbolistes Veterans de Catalunya): **Clupik/Leverade, NUEVO** | Clupik | Divisió Honor, Preferent A/B, 1a Divisió A/B | verificado (sus términos prohíben la extracción) |
| **ligaveteranosalicante.es** (Liga Veteranos Ciudad de Alicante, CD Betis Florida y Arbifutsal) | WordPress: `/scoretable`, `/fixture`, `/equipos/` | +35, décima edición en 2026/27 | verificado |
| **fut7veteranosbierzo.com** (Liga Veteranos F7 +35, Ponferrada) | Google Sites: `/liga-25-26/Clasificacion`, `/Calendario`, `/Jornadas` | temporada 2025/26 | verificado |
| Navalcarnero, Liga Local F7 2026/27 | navalcarnero.es/navalcarnero/deportes/ligafutbol7/ | F7 municipal de adultos (ya se conocían sus PDF) | búsqueda |
| anfutbol7.com (ANF7) | probablemente ServerSports (ya existe demoanfutbol7.serversports.net) | - | el DNS no resuelve |
| Universidad de Alicante, Lliga Nacional de Veterans F11 (no federados de +35) | sd.ua.es/va/esdeveniments/veterans/lliga-de-veterans-f11.html (página de 2019) | - | verificado (antiguo) |

### 3b. Redes nacionales interempresas y de F7

| Red | Patrón URL resultados | Sedes | Verificado |
|---|---|---|---|
| La Liga de las Empresas | laligadelasempresas.com (ServerSports): `/mod/soccer/situation.aspx?itm={id}`, p. ej. Mirasierra A-D con itm 15922-15928; los calendarios van en PDF en laligadelasempresas.es/wp-content/uploads/{CIUDAD}_Futbol7_2026_27.pdf | Madrid (F7, fútbol sala y pádel), Sevilla, Málaga (nueva), Bilbao (F7); Valencia «en construcción» | verificado |
| Business Sports | futbol.business-sports.es (F7 amateur) y torneosparaempresas.com (F7 empresas), ambos ServerSports y ya conocidos | Madrid («y toda España» sin concretar); F7, F11, pádel y golf | verificado |
| RC Sport (RC Sport 2000, Ocio y Deporte para empresas SL) | la web antigua `rcsport.es/liga-futbol-7-empresas/{id}-{slug}/{sede}` solo tiene fichas de sedes (temporadas 2021-2023); los resultados actuales no se ven en rcsport.es y RC Sport figura como organización de **Apúntamelo** (ya conocida). nueva.rcsport.es tiene un certificado TLS que no corresponde al dominio | Madrid, Barcelona, Sevilla, Bilbao, Vigo, Málaga, Valencia, Zaragoza y Alicante; F7, fútbol sala, básquet, pádel y vóley | verificado (home); resultados: a través de Apúntamelo (inferido) |
| Élite (futbol7elite.es) y Red F7 (redfutbolsiete.com, con resultados en ligas.redfutbolsiete.com, MyGol) | ya conocidas; Red F7 tiene además una «Liga de Veteranos F7» en Madrid (redfutbolsiete.com/proximas-competiciones/liga-veteranos) | Madrid | búsqueda |

### 4. Ligas universitarias internas

| Universidad | Competición / fútbol | Dónde publica (patrón) | Plataforma | Verificado |
|---|---|---|---|---|
| UCM | Trofeo Rector: F11, F7 y fútbol sala | PDF semanales: `ucm.es/file/futbol-11-masculino1-3`, `/file/futbol-7-masculino1`, `/file/futbol-sala-masculino1`; además una página de clasificación (`ucm.es/deportesucm/clasificacion-de-los-equipos-del-trofeo-rector`) | PDF en el CMS | verificado |
| UAM | Ligas Internas | infrdep.uam.es/vercompeti.php → deporte.php?competi= | **software vercompeti.php** | verificado |
| UC3M | Liga y Copa: F7 y fútbol sala | i2acronos.uc3m.es/deporte (sin contenido público), deporwin.uc3m.es Campeonatosweb y PDF | i2A Cronos + T-Innova Deporwin | parcial |
| URJC | ligas internas: F7, fútbol sala masculino y mixto | solo normativa en PDF (urjc.es/images/Intranet/deportes/competiciones/internas/...) | no se encontró dónde publica los resultados | verificado (noticia) |
| UPM | sin datos sobre competición interna (totalFútbol tiene sede en la UPM, ya conocido) | - | - | - |
| UGR | Trofeo Rector 2025: fútbol y fútbol sala masculino | `deportes.ugr.es/static/CADManagement/*/trofeo-rector-2025/{deporte-categoria}` (+ `/normativa`, `/equipos/`), con tablas HTML de fases y grupos | aplicación propia «CADManagement» | **verificado** |
| USAL | Trofeo Rector: fútbol y fútbol sala | deportes.usal.es/trofeo-rector-futbol-sala/ (secciones de calendario y resultados, juego limpio y goleadores; formato no visible) | WordPress | parcial |
| UNIZAR | Trofeo Rector(a): F7, fútbol y fútbol sala | `trofeorectora-unizar.es/{torneo_slug}/resumen` (p. ej. `/torneobienvenida_futbol7_26-27/resumen`), `/competiciones` | **SportZentral** (meta-author), la familia Playooz | **verificado** |
| UAB | Intracampus: F7 (martes y miércoles) | `competicions.uab.cat/{slug}/equip/{id}` (p. ej. `/intracampus25_f7dm/equip/253`), `/competicions` | Playooz/SportZentral (mismo patrón /equip/) | búsqueda (**dominio nuevo**) |
| UB, UPC | Lligues Universitàries: F7 y fútbol sala | lliguesuniversitaries.cat/{slug}/equip/{id} | Playooz (ya conocida) | búsqueda |
| UV | lliga interna de fútbol sala y F7 (campus Blasco Ibáñez, Burjassot y Tarongers) | noticias de resultados finales en uv.es; las ligas se coordinan por correo | ninguna pública | verificado |
| UPV | ligas internas (normativa de Alcoy) y Trofeo UPV | PDF en upv.es/entidades/ad/download/{n} | PDF | búsqueda |
| US (SADUS) | Campeonatos Universitarios | solo PDF de programación (sadus.us.es/wp-content/uploads/...); no publica resultados | PDF | verificado |
| UMA | Trofeo Rector: fútbol sala y F7 | uma.es/trofeo-rector/... (timeout); se sabe que usa i2A CronosWeb | i2A (ya conocido) | bloqueado |
| UMU | Torneo Rector: F7 y fútbol sala, del 24/11/2025 al 24/04/2026 | um.es/web/deportes/torneo-rector (normativa y cuadro de honor; no enlaza clasificaciones) | sin portal | verificado |
| UPV/EHU | campeonatos de campus: fútbol sala y F7 | jarduera2.ehu.eus/kirolak/ | propia o vercompeti | bloqueado |
| USC | ligas: fútbol sala (Santiago), F7 libre y fútbol sala libre (Lugo), temporada 2026/27 | **aplicacions.usc.es/deportes/publica/liga/lista.xhtml** (JSF; enlaza «Fixtures/Results/Tables») | aplicación propia | **verificado** |
| UA (Alicante) | ligas internas: fútbol 8 y fútbol sala | deportes.ua.es/ligasinternas/ y UACloud (con login) | propia | verificado |
| UBU (Burgos) | Trofeo Rector: fútbol sala | ubu.es/deportes/competicion-universitaria/competicion-interna-trofeo-rector/... | CMS | búsqueda |
| UAL (Almería) | Trofeo Rector: fútbol sala | ual.es/vida-universitaria/deportes/competiciones-internas/deporte/tr-futbol-sala | CMS | búsqueda |
| UNICAN | torneos internos (Rectora, Primavera, Campeón de Centros, Solidario) | web.unican.es/unidades/Deportes/competiciones/competiciones-universitarias-internas | sin portal visible | verificado (portada) |
| ULPGC | Trofeo Rector de deportes de equipo (noticia de 2024) | deportes.ulpgc.es | - | búsqueda |
| UDC, UNIOVI | solo fichas de fútbol sala (udc.es/.../futbol_sala/, deportes.uniovi.es) | - | - | búsqueda |
| UVa, ULE, UCLM, UEX, ULL, UIB, UVigo, UNAVARRA, UNIRIOJA | solo aparecen el Trofeo Rector autonómico (CyL) o el campeonato regional (CLM, Canarias). No se localizó ningún portal de liga interna | - | - | sin datos (cupo agotado) |

Conclusión: las universidades no tienen una plataforma común. Las que publican datos estructurados son UGR (CADManagement), USC (aplicación JSF), UAM (vercompeti.php), UNIZAR y UAB (SportZentral/Playooz) y UB/UPC (Playooz). El resto publica en PDF o no publica nada.

### 5. Agregadores

| Agregador | Qué cubre de no federado | Cómo lista las competiciones | robots.txt | Verificado |
|---|---|---|---|---|
| siguetuliga.com | mucho: ligas creadas por los usuarios (veteranos de Lugo, Ourense y A Costa, Agrupación de Veteranos de Santiago, Liga de Veteranos Madrid Norte (INSEPAL), Veterano de La Palma, ligas locales de fútbol sala...). La calidad es irregular: p. ej. Veteranos de Santiago tiene la última jornada en 2017 y su administrador es un usuario | `/region/{deporte}-{region}` → `/categoria/{deporte}-{region}-{categoria}` → `/liga/{slug}` + `/clasificacion`, `/calendario`, `/jugadores`, `/campos-de-liga`; `/equipo/{slug}`; `/futbol-sala-espana` | `Disallow: /*?`, /api/, /ws/, /rankings/, /administrar/...; bloquea bingbot y PetalBot por completo; sitemap.xml | verificado |
| ceroacero.es (zerozero) | veteranos de Galicia (Primera, Segunda y Tercera Galicia, con grupos por provincia), «Veteranos División de Honor Lugo Liga Local», «Copa Asociación Veteranos A Coruña (no oficial)»; equipos de veteranos en ligas senior | `/competicion/{slug}`, `/edicion/{slug-temporada}/{id}`, `/partido/{fecha}-{local}-{visitante}/{id}`; índice en /competiciones/futbol/espana | **403 a los bots** (antibot); no se pudo leer el robots.txt | búsqueda (403) |
| resultados-futbol.com → **BeSoccer** | casi nada: «Liga Veteranos Valencia» hasta 2020/21 | `besoccer.com/competition/{table,resultados,equipos}/{slug}/{año}` | resultados-futbol.com hace un 302 a besoccer.es; `Allow: /` salvo /scripts* y /ajax; bloquea ia_archiver y WebStripper; no tiene reglas para los bots de IA | verificado |
| futbolme.com | nada no federado en la navegación (de Primera a la regional autonómica, juvenil y femenino) | `/resultados-directo/torneo/{slug}/{id}/` | permisivo: solo bloquea /panelBack/, /json/, /x/... | verificado |
| Sofascore (NUEVO) | sección «Spain Amateur», que incluye la «Liga de Veteranos Madrid Norte» (id 21975) junto a la Tercera Federación | `sofascore.com/football/tournament/spain-amateur/{slug}/{id}` | sin comprobar (los términos prohíben la extracción) | búsqueda |
| todotorneos.com (ya conocido) | p. ej. Liga de Veteranos de Fútbol Sala de Ávila 2024/25 | `torneo/torneosmain.php?torneo={id}` | - | búsqueda |

## Plataformas que merecen adaptador (actualizado tras la segunda tanda)

1. **Software «vercompeti.php / deporte.php?competi= / resul.php»**: ya son 3 instalaciones confirmadas (Fuenlabrada, Palencia y UAM), quizá también la UPV/EHU. Los ID de 6 cifras son secuenciales y no hace falta login. Es el mejor candidato nuevo. El fabricante sigue sin identificarse.
2. **siguetuliga.com**: es el agregador con más ligas de veteranos y ligas locales, y se navega bien por /region/ → /categoria/ → /liga/. Su robots.txt permite las rutas sin parámetros. Hay que filtrar por fecha de la última jornada, porque muchas ligas están abandonadas.
3. **SportZentral/Playooz, ampliado**: hay que añadir trofeorectora-unizar.es y competicions.uab.cat al adaptador de Playooz que ya existe (mismo patrón `/{slug}/equip/{id}` y `/{slug}/resumen`).
4. **ServerSports, solo dominios nuevos**: veteransfutbol.com (Veterans Vallès-Maresme) entra en el adaptador existente.
5. **UGR CADManagement** y **USC aplicacions.usc.es**: son adaptadores pequeños, de un solo cliente cada uno, con HTML estructurado. Prioridad baja o media.
6. **RC Sport**: no hace falta un adaptador propio, porque sus resultados actuales parecen estar en Apúntamelo, que ya se conoce.
7. **ceroacero**: tiene veteranos de Galicia, pero bloquea a los bots con 403. Solo serviría como referencia manual.
8. **Descartados o en espera**: Playoff Informàtica (el robots lo prohíbe y casi todo es escolar), Deporweb, T-Innova/Deporwin (el host no es accesible), i2A Cronos (sin parte pública), Sporttia (no se encontró el portal), BeSoccer y futbolme (no cubren no federado), webs sueltas en Google Sites o WordPress (Ponferrada, Alicante), que se pueden añadir como fuentes individuales si se necesitan.
