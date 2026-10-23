# Fútbol no federado en España: plataformas y ligas (investigación web, 30/09/2026)

Solo WebSearch/WebFetch, sin login ni scraping masivo. Todo lo no comprobado directamente va marcado "(sin verificar)". Nota metodológica: WebFetch resume con un modelo pequeño y varias SPA (Playooz, MyGol) no devolvieron contenido, así que algunos datos son inferidos de buscadores.

## 1. Hallazgo clave sobre Futormes

- Futormes (Salamanca), https://www.futormes.com/ . Entidad "FUTORMES SALAMANCA", sede en C/Juan de Villoria 27. Fuente: https://www.futormes.com/mod/shared/contacts.aspx
- Ofrece F11, F7 (fin de semana y entre semana) y fútbol sala, con más de 160 equipos.
- **Software: ServerSports**, "Software de Gestión de Competiciones Deportivas". Lo dice el pie de página. Es ASP.NET, con rutas `/mod/soccer/situation.aspx?itm=ID`, `/mod/soccer/team.aspx?itm=`, `/mod/soccer/match.aspx?itm=`, `/mod/soccer/player.aspx`, `/mod/shared/news.aspx`, `/mod/soccer/competitions.aspx`, `/mod/soccer/inscriptions_list.aspx`.
- Publica calendario, resultados, clasificación ("Situación"), fichas de equipo y de partido, noticias y una app gratuita.
- Goleadores, sanciones y estadística por jugador: no comprobado en el sitio. Ya existe `player.aspx`, y ServerSports lista goleadores y estadísticas como funciones del producto (sin verificar en Futormes concreto).
- **robots.txt de Futormes** (https://www.futormes.com/robots.txt) y de FutZaragoza (https://www.futzaragoza.com/robots.txt): `Disallow: /mod/soccer/player.aspx`, `/mod/soccer/team.aspx` y `/mod/soccer/match.aspx` para todos los bots. Bloquea también MJ12bot, BLEXBot y URLmetrica. Las páginas de clasificación (`situation.aspx`) y `competitions.aspx` no están vetadas.
- Futormes es multi-sede: Futormes Zamora (https://www.futormeszamora.com/) y Futcyl (http://www.futcyl.com/), que organiza campeonatos de Castilla y León de selecciones provinciales (Zamora, Ávila, Salamanca). Fuentes: https://www.futormes.com/mod/shared/news.aspx?itm=34729&sco=1 y http://www.futcyl.com/mod/shared/news.aspx?itm=36996&sco=1

## 2. Plataformas multi-liga

### ServerSports (la más relevante para el aficionado "clásico")

- Web: http://www.serversports.com/gestion-competiciones/ (el certificado SSL del host `www` falla en WebFetch). Ver https://serversports.com/servicios: copyright 2008-2026, más de 10 años, teléfono de Madrid. Dice "miles de usuarios a nivel internacional", sin cifras concretas.
- Cada cliente tiene dominio propio, y también demos en `demoXXX.serversports.net`. El patrón de URL es idéntico en todos: `/mod/soccer/situation.aspx?itm=ID`.
- App "ServerSports Competitions": más de 10.000 descargas, se activa con un código de la liga. Última actualización en 2017. https://play.google.com/store/apps/details?id=com.serversports.competitions
- Clientes verificados en las búsquedas o con pie de página:
  - Futormes (Salamanca) y Futormes Zamora.
  - FutZaragoza (F7 Zaragoza) y Liga de Delicias, patrocinador citado en su web.
  - ASOFUSA (fútbol sala de Valladolid, con "estadísticas de jugadores"). https://www.asofusa.com/mod/soccer/index.aspx
  - La Liga de las Empresas (Madrid, Málaga, Sevilla, Bilbao y Valencia "próximamente"; unas 150 empresas y 2.500 participantes). https://www.laligadelasempresas.com/mod/soccer/index.aspx
  - Estadio 7 (Las Palmas, liga +38). http://www.estadio7.com/mod/soccer/competitions.aspx
  - Vistos por el buscador (sin verificar en producción): F7 Giralda (Sevilla), ANFUTBOL7, Liga Fansport, Liga Corporativa, Business Sports Empresas, ADAC y "liga f-7 veteranos Fuentidueña de Tajo" (Madrid).
- Términos de uso: no localizados (sin verificar). No consta API pública.

### Clupik + Leverade (mayor plataforma "oficial/municipal")

- Clupik adquirió Leverade el 17/04/2024. Leverade tenía más de 2.000 organizadores de competiciones (federaciones, administraciones, ligas y torneos). Ambas digitalizan 15 federaciones nacionales. https://clupik.com/blog/clupik-adquiere-leverade/
- Clupik declara más de 100 ayuntamientos, diputaciones y gobiernos (Gobierno Vasco, Diputación de Huelva, Marbella, Elche, Conil, Alicante), 7 millones de deportistas y más de 100 deportes. https://clupik.com/admin-publica/ Son cifras de marketing (sin verificar de forma independiente).
- Leverade se sirve ahora desde clupik.pro: `leverade.com/robots.txt` devuelve el mismo contenido que clupik.pro. Es la web pública de datos, donde el buscador `https://clupik.pro/en/search` indexa "Managers" y "Competitions".
- Patrones de URL: `https://clupik.pro/{es|en}/manager/{ID}`, `/manager/{ID}/posts` y `https://clupik.pro/en/tournament/{ID}/summary`. Además existen pestañas de equipos, clasificación y estadísticas (sin verificar el detalle).
- Ejemplo real: Liga Comarcal de Fútbol Aficionado de Cartagena, gestionada con "Leverade Real Play", con 41 equipos y más de 600 aficionados. https://www.cartagena.es/detalle_noticias.asp?id=75011 También se cita a Marbella (ligas locales de F7, fútbol sala y otros deportes; sin confirmar plataforma).
- **robots.txt**: `Disallow: /admin/`, bloquea PetalBot y da un sitemap en https://clupik.pro/sitemap.xml. Es permisivo para bots generales.
- **Términos** (https://clupik.pro/en/terms): prohíben expresamente el web scraping "or any other technique to extract structured information", "harvesting bots, robots, spiders or scrapers" (sección 12.2.3) y reproducir contenido sin autorización (sección 13). Se reservan acciones técnicas y legales. Además, los organizadores deben obtener consentimiento para publicar datos personales, y el de padres o tutores para menores de 14 años (12.2.2).
- API: `api.leverade.com` devolvió 404 en la raíz. No encontré documentación pública de una API (sin verificar). Si la hubiera, requeriría acuerdo con Clupik.

### Competize

- Página de inicio (https://www.competize.com/es/): más de 20.000 entidades, más de 60 deportes, más de 1,2 M de deportistas, 100 países, desde 2010. Mercados: torneos/ligas, clubes, federaciones, ayuntamientos y otros. Ofrece "API REST" como modelo de integración a medida (contratado, no público).
- Patrón de URL público: `https://www.competize.com/es/league/view/{ID}`. Aparece "Juegos Deportivos Municipales Madrid" como `/league/view/811`, pero WebFetch devolvió vacío, así que su contenido no está verificado.
- **robots.txt** (https://www.competize.com/robots.txt): bloquea explícitamente **ClaudeBot, GPTBot y ChatGPT-User**. Además bloquea `/devs/`, `/docs/`, `/img/players/`, `/img/tickets/`, `/img/payments/`, login/registro y ficheros Excel y PDF. Googlebot y Bingbot están permitidos.
- Aviso legal: prohíbe "reproducción, almacenamiento permanente y difusión… o cualquier uso público o comercial" sin consentimiento escrito, y no sobrecargar el servicio. Solo pude verlo resumido por WebFetch (sin verificar el literal). Contacto: info@competize.com.

### Playooz (Ideanto)

- https://playooz.com/ (SPA que se renderiza con JS). Clientes citados: Elite Ligas Fútbol (Madrid), Liga Press, MLA Sport, universidades (UAB, Almería, Zaragoza), Asociación Española Unihockey.
- Webs que lo usan: https://www.ligasfutbolsiete.com/ (Ligas Fútbol 7 Madrid, con sede en Valladolid; ruta `/{liga}/clasificacion?roundId=..&groupId=..` y `/{liga}/resultados`) y https://www.ligaelitefutbol.com/ (`/competiciones`, `/leganes`, `/carabanchel`, `/zonasur`).
- Requiere renderizado JS y probablemente API interna JSON (sin verificar). Términos y robots no revisados.

### MyGol

- SPA React. Ejemplo: `https://futbol7amistad.mygol.es/tournaments/{id}?tab=calendar` y `/tournaments/{id}/matches/{id}`. Cliente: F7 y fútbol sala La Amistad, en Tenerife.
- Pestañas públicas: Calendario, Clasificación, Goleadores, Sanciones y Jugadores, con ficha por jugador. Es el único caso donde he confirmado sanciones y jugadores.
- Su robots.txt solo devolvió la shell JS, así que quedó sin verificar. Sin datos de escala.

### Software a medida o CMS y otros

- Toools/iSquad: es el software de las delegaciones federadas (p. ej. la provincial de Valladolid). Queda fuera del alcance.
- Internet Web Solutions (PHP `/clasificacion.php?grupo=`): Málaga Business Cup. https://www.futbol7malaga.com
- Lovable.dev (SPA): Seven League, A Coruña. https://www.sevenleague.org/
- WordPress + Joomla: Futbol Live Valencia (más de 300 equipos, afirma ser socio de SOCCA), Minifútbol Valencia y otros.
- Sin plataforma identificada: TotalF7 (Madrid Norte). Sí publica goleadores, tarjetas, sanciones y ficha de jugador. https://totalf7.com/
- MLA Sport (mlasport.com): usa Playooz.

## 3. Tabla liga → ciudad → plataforma

Leyenda datos: C=calendario, R=resultados, T=clasificación, G=goleadores, S=sanciones, J=estadística por jugador.

| Liga | Ciudad | Plataforma | URL | Datos públicos | Robots / ToS |
|---|---|---|---|---|---|
| Futormes | Salamanca | ServerSports | https://www.futormes.com/ | C, R, T; G/S/J sin verificar | `/mod/soccer/{player,team,match}.aspx` vetados en robots |
| Futormes Zamora / Futcyl | Zamora / CyL | ServerSports | https://www.futormeszamora.com/ | C, R, T | igual, sin verificar |
| ASOFUSA | Valladolid (futsal) | ServerSports | https://www.asofusa.com/mod/soccer/index.aspx | C, T, plantillas, J | sin verificar |
| FutZaragoza / Liga Delicias | Zaragoza | ServerSports | https://www.futzaragoza.com/ | C, R, T | mismo robots que Futormes |
| La Liga de las Empresas | Madrid, Málaga, Sevilla, Bilbao | ServerSports | https://www.laligadelasempresas.com/ | T, cuadros de copa | sin verificar |
| Estadio 7 | Las Palmas | ServerSports | http://www.estadio7.com/ | C, T (liga +38, desde 2002) | sin verificar |
| JDM Ayuntamiento Madrid | Madrid | Portal de datos abiertos + app no oficial | https://datos.madrid.es/dataset/211549-0-juegos-deportivos-actual | Partidos y clasificaciones, CC BY 4.0; sin nombres de jugadores | Licencia abierta; actualización semanal (miércoles) |
| App no oficial JDM | Madrid | Reutilización del dataset | https://www.jdmmadrid.es/ | C, R, T, estadísticas de equipo (F7, F11, sala) | Es reutilización, no fuente primaria |
| Liga Comarcal Fútbol Aficionado | Cartagena | Leverade/Clupik | https://www.cartagena.es/detalle_noticias.asp?id=75011 | T según prensa; URL pública no localizada | ToS de Clupik prohíbe scraping |
| Ligas locales F7 y fútbol sala | Marbella | plataforma sin verificar | https://www.marbella.es/actualidad/noticias/este-jueves-se-abre-el-plazo-de-inscripcion-de-las-ligas-locales-de-futbol-7-futbol-sala-baloncesto-tenis-y-frontenis.html | sin verificar | sin verificar |
| JJDDMM (IMD) | Sevilla | Portal propio, apps y PDFs | https://imd.sevilla.org/programas-deportivos/juegos-deportivos-municipales/deportes/futbol-7 | Resultados/clasificaciones en PDF y app `/app/jjddmm_resultados/`; la app dio "too many redirects" | sin verificar |
| Ligas Fútbol 7 / Élite | Madrid, Valladolid | Playooz | https://www.ligasfutbolsiete.com/ | C, R, T, jugadores (sin verificar) | Playooz sin revisar |
| REDF7 | Madrid | ligas.redfutbolsiete.com (plataforma sin verificar) | https://www.redfutbolsiete.com/ligas-futbol-7/ | app con horarios, clasificación y estadísticas; más de 7.000 jugadores | sin verificar |
| TotalF7 | Madrid Norte | a medida | https://totalf7.com/ | T, G, S, tarjetas, ficha de jugador | sin verificar |
| Futbol 7 La Amistad | Tenerife | MyGol | https://futbol7amistad.mygol.es/tournaments | C, T, G, S, J | robots no comprobable (SPA) |
| Málaga Business Cup | Málaga | Internet Web Solutions | https://www.futbol7malaga.com | C, R, T, plantillas | robots: 404 |
| Futbol Live | Valencia | WordPress | https://futbollive.es/ | más de 300 equipos, clasificaciones por división | sin verificar |
| Seven League | A Coruña | Lovable | https://www.sevenleague.org/ | T, C, R en vivo | sin verificar |
| Liga de la Amistad, Granada No Federado | Granada | La Preferente (colaborativo) | https://www.lapreferente.com/C23862-1/liga-de-la-amistad--granada/widget.html | T, G, R, estadísticas por jugador; datos de 1.696 colaboradores | robots.txt solo `User-agent: *`; ToS sin verificar |

No encontré información utilizable (cubierta solo por búsquedas genéricas) para Barcelona (catsports.net, Valldor7, BRAFA y Futbol Zone aparecen, sin revisar), Bilbao Kirolak, Palma, Pamplona, Logroño, Santander, Oviedo/Gijón (hay ligas F7 en Facebook, sin verificar), Granada (salvo La Preferente), Córdoba, Toledo, Albacete, Cáceres y Badajoz. Tampoco resultados en León, Burgos, Palencia, Segovia, Ávila y Soria más allá de circuitos escolares (Diputación de Burgos) y ligas federadas. Ver https://idj.burgos.es/deportes/circuitos-provinciales/xviii-circuito-provincial-escolar-de-futbol-7

## 4. Ranking de plataformas por número de ligas aficionadas en España

Estimación cualitativa, sin datos exactos publicados:

1. **Clupik/Leverade**: mayor cobertura declarada (más de 2.000 organizadores, más de 100 administraciones públicas). Prácticamente todos los municipales, comarcales y torneos que usan software ajeno a la federación. Es la de más escala y la más restrictiva legalmente.
2. **Competize**: 20.000+ entidades mundiales. Dominante en algunas federaciones y ayuntamientos, pero no pude cuantificar España ni ligas aficionadas de fútbol.
3. **ServerSports**: el mayor número de ligas aficionadas *independientes* localizadas (más de 8 clientes en 5 comunidades). Alto valor y bajo riesgo técnico (HTML servido por servidor).
4. **Playooz**: al menos 3-4 organizadores de F7 en Madrid.
5. **MyGol** y webs a medida: fragmentado.
6. **Datos abiertos municipales (Madrid)**: fuente única pero muy grande, con licencia abierta.
7. **La Preferente "No Federado"**: agregador colaborativo con cobertura potencialmente nacional.

## 5. Riesgos

- **Menores.** Madrid y Sevilla mezclan categorías escolares con senior; Clupik exige consentimiento de tutores para menores de 14 años. Recomendación: filtrar categorías de base/escolares, no almacenar nombres ni fotos de menores.
- **ToS.** Clupik/Leverade prohíbe expresamente el scraping y bots. Competize bloquea ClaudeBot y GPTBot en robots.txt y restringe reproducción y uso comercial. No conviene automatizar estas dos sin acuerdo escrito.
- **Datos personales.** La estadística por jugador (fichas, sanciones, goleadores) son datos personales bajo RGPD. Los organizadores privados publican con consentimiento propio, pero un tercero que los reutilice necesita base jurídica, minimización y derecho de supresión. Los datos abiertos de Madrid (CC BY 4.0, sin nombres) no plantean este problema.
- **Robots de ServerSports.** Los patrones `player.aspx`, `team.aspx` y `match.aspx` están vetados en Futormes y FutZaragoza, así que un adaptador respetuoso solo puede usar `situation.aspx` y `competitions.aspx` (clasificación y listado). Perdería el calendario detallado por partido.
- Cifras de marketing (Clupik, Competize) sin verificación independiente. Varias fuentes, incluida esta investigación, se apoyan en resúmenes automáticos de WebFetch.

## 6. Orden recomendado de adaptadores

1. **Datos abiertos Madrid (CSV, CC BY 4.0)**: cero riesgo legal, gran volumen. https://datos.madrid.es/dataset/211549-0-juegos-deportivos-actual y el histórico https://datos.madrid.es/dataset/300257-0-deportes-colectivos-historico
2. **ServerSports**: un solo adaptador cubre Futormes, FutZaragoza, ASOFUSA, La Liga de las Empresas, Estadio 7, etc. Empezar por `situation.aspx` y `competitions.aspx`. Antes, pedir permiso o revisar sus términos (sin verificar) y ofrecerles el acuerdo de reciprocidad que implique el proyecto.
3. **Playooz** y **MyGol**: requieren JS o API interna (sin verificar), y conviene contactar con cada organizador. MyGol ofrece más datos por jugador.
4. **La Preferente "No Federado"**: revisar los ToS antes. Su robots.txt no restringe nada, pero los datos son colaborativos y su fiabilidad la declaran ellos mismos como limitada.
5. **Clupik/Leverade y Competize**: solo con convenio o API contratada, por los ToS. Contactar con Clupik y con info@competize.com para una posible API o cesión de datos.
6. Webs a medida (TotalF7, Málaga Business Cup, Futbol Live, Seven League) y municipios sin plataforma común (Sevilla IMD en PDF): baja prioridad, coste alto por liga.

## Fuentes principales

- https://www.futormes.com/
- https://www.futormes.com/robots.txt
- https://www.futormes.com/mod/shared/contacts.aspx
- https://www.futzaragoza.com/robots.txt
- https://serversports.com/servicios
- https://www.competize.com/robots.txt
- https://www.competize.com/es/
- https://clupik.pro/en/terms
- https://clupik.pro/robots.txt
- https://clupik.pro/en/search
- https://clupik.com/blog/clupik-adquiere-leverade/
- https://clupik.com/admin-publica/
- https://www.cartagena.es/detalle_noticias.asp?id=75011
- https://datos.madrid.es/dataset/211549-0-juegos-deportivos-actual
- https://www.jdmmadrid.es/
- https://playooz.com/
- https://futbol7amistad.mygol.es/tournaments
- https://www.lapreferente.com/robots.txt
