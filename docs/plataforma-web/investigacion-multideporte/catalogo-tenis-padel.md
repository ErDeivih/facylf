# Catálogo de fuentes de datos de tenis y pádel amateur/regional en España (30/09/2026)

Metodología y límites (leer primero)
- Sólo WebSearch/WebFetch. `curl` a resultadostenis.isquad.es desde el sandbox devuelve 403 del proxy, así que NO se pudo ver HTML crudo ni el tráfico XHR. WebFetch pasa la página por un resumidor: los endpoints AJAX, `<script src>` y el HTML de las tablas dinámicas NO son visibles. Todo lo que dependa de eso queda marcado "(sin verificar)".
- El presupuesto de WebSearch (200) se agotó a mitad de la investigación; las federaciones de tenis de Aragón, Cantabria, Ceuta, Melilla, Extremadura y los padel de CyL/CLM/Canarias/Extremadura/Ceuta quedan con menos detalle.
- "Robots": el resumen de WebFetch de `/robots.txt`. Un 404 = no hay robots.txt (sin reglas). "ROBOTS_DISALLOWED" es el mensaje de la propia herramienta WebFetch; no es una lectura literal de las reglas.
- Cruce con el proyecto (`claude/multideporte-2026-09-30.md`): iSquad sin robots, términos prohíben reproducir sin autorización; TournamentSoftware veta `/tournament/`, `/ranking/`, `/player/`; Clupik/Leverade cl. 12.2.3 prohíbe scraping; Competize veta ClaudeBot/GPTBot por nombre.

---------------------------------------------------------------------
# PARTE A. TENIS
---------------------------------------------------------------------

## A.1 iSquad tenis (`resultadostenis.isquad.es`), la plataforma clave

Proveedor: TOOOLS, S.L. (mismo que iSquad fútbol/voleibol/balonmano). Capas: `tenis.isquad.es` / `hub.isquad.es/tenis/` (afiliaciones, gestión), `tenis.misquad.es` (logins jugador/club/juez, privado) y `resultadostenis.isquad.es` (público, sin login). Imágenes en `tenis.isquad.es/images/`. App móvil: "RFET" (`com.toools.isquad.tenis`).
Robots: `https://resultadostenis.isquad.es/robots.txt` = 404 (sin reglas). Términos: ver nota del proyecto.

### Estructura de URLs confirmada (abiertas con WebFetch)
Todas cuelgan de `/{idFed}/...`, con `idFed` = id de federación (tabla A.2). `idFed=1` es RFET; 2..20 son territoriales.

| Recurso | Patrón | Ejemplo abierto |
|---|---|---|
| Home / selector de 20 federaciones | `/` (enlaza `/{id}/federacion`) | https://resultadostenis.isquad.es/ |
| Portada de federación (secciones "abiertas a inscripción", "en disputa", "próximas"; la lista se carga por JS, sin enlaces en el HTML resumido) | `/{idFed}/federacion` | https://resultadostenis.isquad.es/19/federacion |
| Circuitos | `/{idFed}/circuitos` (en RFET `/1/circuitos`: Warriors Tour, Rafa Nadal Tour, Blue Tennis Cup, Babolat Cup, Mutua Madrid Open, etc.) | https://resultadostenis.isquad.es/1/circuitos |
| Calendario | `/{idFed}/calendario` | https://resultadostenis.isquad.es/19/calendario |
| Slots, Clubes, Normativa, FAQs, Recursos | `/{idFed}/slots`, `/clubes`, `/normativa`, `/faqs`, `/recursos` | https://resultadostenis.isquad.es/19/clubes |
| Competición (campeonato/torneo/circuito de prueba/campeonato por equipos). Pestañas: Info, Listas de entrada, Jugadores, Partidos, Cuadros, Orden juego total, Seguimiento, Resumen | `/{idFed}/campeonato/{idCampeonato}` | https://resultadostenis.isquad.es/20/campeonato/35032 (Canarias, II Torneo Ayuntamiento de Tinajo, 10-19/04/2026); https://resultadostenis.isquad.es/19/campeonato/32663 (CyL, Autonómicos individuales 2025 bloque I); https://resultadostenis.isquad.es/20/campeonato/34868 (Canarias, Campeonato por equipos cadete); https://resultadostenis.isquad.es/4/campeonato/32839 (País Vasco, III Circuito de dobles); https://resultadostenis.isquad.es/20/campeonato/35073, /34167 |
| Cuadro (una categoría/modalidad de un campeonato: singles/dobles/equipos, sexo, edad) | `/{idFed}/cuadro/{idCuadro}` | https://resultadostenis.isquad.es/20/cuadro/159545 (Sub-10 M), https://resultadostenis.isquad.es/19/cuadro/140839, https://resultadostenis.isquad.es/4/cuadro/142761 |
| Ranking | `/{idFed}/ranking/{cod}` con `cod` = `1m` individual masc., `1f` individual fem., `2m` dobles masc., `2f` dobles fem. | https://resultadostenis.isquad.es/1/ranking/1m ; https://resultadostenis.isquad.es/15/ranking/1m (Navarra; citado por fnt.es/clasificacion/) |
| Ficha de jugador | Se abre al pulsar el nombre en el ranking (URL exacta no observada) (sin verificar) | |

Hallazgos sobre el modelo:
- `idCampeonato` e `idCuadro` parecen ids globales autoincrementales (Canarias 35032/159545, CyL 32663/140839, PV 32839/142761). El `idFed` del path parece sólo contexto: en principio un campeonato de una federación debería enumerarse recorriendo ids (sin verificar si `/{otro idFed}/campeonato/{id}` resuelve igual).
- Un campeonato contiene N cuadros; los campeones y finalistas por categoría se ven en el HTML de la página del campeonato (servido en servidor). Ej.: "Sub-10 Masculino: Gianluca Dalla Costa Sigcho…". La página de `cuadro` trae en HTML: nombre del campeonato, organizador, club sede, superficie/bola, formato de sets, fechas de inscripción/sorteo/juego, árbitros y LISTA DE PARTICIPANTES (ej. 7 inscritos en Sub-10 M Tinajo; parejas en el Circuito de dobles PV).
- NO se vieron filas de partido, marcadores ni rondas en la salida de WebFetch para ninguna página de cuadro; las pestañas "Partidos", "Cuadros", "Orden juego total", "Seguimiento" y las tablas de ranking y la lista de competiciones de la portada se cargan por JavaScript/AJAX ("dynamic elements... loaded through JavaScript/AJAX" según el resumen del ranking). El endpoint AJAX es DESCONOCIDO (sin verificar). Rutas tipo `/campeonato/{id}/partidos` = 404.
- Selector de temporada: 2122, 2223, 2324, 2425, 2526, 2627 (hay histórico en el menú desde la temporada 21-22 pero los datos anteriores a la migración 2025 probablemente sean escasos: RFET migró en 2025 y la FTCL fue "pionera" con el Bloque I de los Autonómicos 2025). Idiomas es/ca/eu/gl/en/ar y 6 paletas (parámetro de estilo).
- Alcance por dato: individual, dobles, equipos (ej. campeonato de Canarias por equipos cadete con `cuadro` de clubes), circuitos.
- Menores: las categorías son Sub-10, Alevín Sub-12, Infantil Sub-14, Cadete Sub-16, Junior Sub-18, Absoluta, veteranos; ATENCIÓN: son personas menores con nombre completo visible en cuadros y clasificaciones (política de menores del proyecto aplica).
- Trampa: `resultadostenismesa.isquad.es` es la federación madrileña de TENIS DE MESA (FMTM); no es tenis.
- Para "adaptador iSquad tenis": necesitas capturar la red del navegador (DevTools o Playwright con `page.on('response')`) sobre `/19/campeonato/32663` y `/1/ranking/1m` para sacar los endpoints JSON/HTML parcial. Es la única tarea imprescindible antes de programar.

### A.2 iSquad: ids de federación (leídos de la home)
1 RFET · 2 Castilla-La Mancha · 3 Cataluña · 4 País Vasco · 5 Extremadura · 6 Galicia · 7 Madrid · 8 Murcia · 9 Ceuta · 10 Melilla · 11 Andalucía · 12 Aragón · 13 Asturias · 14 Baleares · 15 Navarra · 16 La Rioja · 17 Comunidad Valenciana · 18 Cantabria · 19 Castilla y León · 20 Canarias.
Estar en el listado NO implica que la federación publique allí todo su calendario (ver A.3).

## A.3 Tenis: entidad por entidad

Leyenda "plataforma": ISQ = iSquad; PC = SPA tipo "Pista Central"/`/app/` (ver A.4); ASP = sitio propio clásico.

| Entidad | Plataforma (resultados/cuadros) | URL | Patrón partido/cuadro + ejemplo | Ranking público | Histórico | Robots / acceso |
|---|---|---|---|---|---|---|
| RFET (nacional) | ISQ id 1 | https://resultadostenis.isquad.es/1/federacion | `/1/campeonato/{id}`, `/1/cuadro/{id}`; PDFs de cuadros/orden de juego en rfet.es/es/campeonatos-espana-*.html | Sí, HTML: `/1/ranking/1m|1f|2m|2f` (Ranking Nacional MAPFRE: cierre a fin de mes; en 2026 versión semanal los martes) https://www.rfet.es/es/ranking-nacional.html. Sólo 4 rankings (individual y dobles); sin ranking por edad visible (sin verificar) | Temporadas 2122..2627 en el selector; profundidad real (sin verificar) | rfet.es robots: `User-agent: *` + Sitemap (permitido). isquad: sin robots; público sin login |
| Andalucía (FAT) | FATCOM propio PHP (`fatcom.fatenis.com`) y también existe iSquad id 11 (uso real de ISQ no confirmado) | https://fatcom.fatenis.com/fatcom/public/main/homemov.php?op=5&idc={idCampeonato} ; circuitos: `home.php?op=5&idc=4` ; subdominios `fatcafi.fatenis.com` | Página de campeonato con cuadros/orden de juego/resultados como PDFs: `fatcom/adjuntos/campeonatos/{año}/doc_{idc}_{n}.pdf` (ej. https://fatcom.fatenis.com/fatcom/adjuntos/campeonatos/2021/doc_7938_4012.pdf). Menú op=1,2,4,6,7,15,18 con `idpan=1|2` | Sí: menú "ranking" y sección específica de menores en fatenis.com (PDF/HTML sin verificar) | Sí, desde 2021 por lo menos | robots `fatcom.fatenis.com/robots.txt` = 404. Acceso público. Error "Error al abrir recordset" si falta `idc` |
| Aragón | ISQ id 12 + WordPress aragontenis.com (rankings máster, cuadros en entradas) | https://aragontenis.com/index.php/isquad/ ; categorías `/category/ctos-aragon-equipos26/`, `/individual26/`, `/comp-nacional2025/` | Cuadros en posts/PDF del WP; ISQ para inscripción y resultados en directo | Ranking Máster Aragonés (posts/PDF) | 2025-2026 en categorías del WP | WP estándar (sin verificar robots) |
| Asturias (FEDETEPA) | ISQ id 13 (afiliación obligatoria desde 1/10/2025); web propia `fedetepa.com` con clasificaciones antiguas en PDF | https://www.fedetepa.com/isquad-2893.html ; https://www.fedetepa.com/clasificaciones-111 (PDF de 2014, obsoleto) | ISQ `/13/...` | ISQ `/13/ranking/1m` (asumido) | PDF sólo antiguo | sin verificar robots |
| Baleares (FTIB) | ISQ id 14 (afiliación obligatoria); ranking balear en la web propia | https://ftib.es/es/jugadores/ranking | Cuadros en ISQ `/14/...` (sin verificar) | Sí en ftib.es: Sub10, Alevín, Infantil, Cadete, Junior, Absoluto, M/F; descargable en Excel (nube) | ranking a fecha; histórico sin verificar | sin verificar robots |
| Canarias | ISQ id 20, ACTIVO (Tinajo, campeonatos por equipos, etc., temporada 25-26) | https://resultadostenis.isquad.es/20/federacion | `/20/campeonato/35032`, `/20/cuadro/159545` | ISQ `/20/ranking/1m` (asumido) | Desde nov-2024 (se promocionó ISQ) | público |
| Cantabria (FECAN) | ISQ id 18 (sin verificar uso) + web propia con PDFs ("LR2 2026 resultados") | https://fecantenis.com/equipos-y-resultados/ (fetch de la home dio timeout) | Liga Regional 25/26 por equipos en PDFs de resultados | Sin verificar | PDF por jornada | sin verificar |
| Castilla-La Mancha | ISQ id 2 (declarado plataforma de resultados/rankings) | https://resultadostenis.isquad.es/2/federacion ; https://fedetenisclm.es/plataforma-rfet/ | `/2/campeonato/{id}` | ISQ | 2025-26 | público |
| Castilla y León (FTCL) | ISQ id 19, PIONERA, live score desde Bloque I 2025 | https://resultadostenis.isquad.es/19/federacion ; https://ftcl.es/la-ftcl-pionera-en-la-implementacion-de-la-nueva-plataforma-de-gestion-isquad/ | `/19/campeonato/32663`, `/19/cuadro/140839` (Autonómicos individuales 2025 bloque I, Sub-10..Veteranos) | ISQ `/19/ranking/1m` | Desde 2025 | público |
| Cataluña (FCT) | SPA propia `portal.fctennis.cat/app/` ("Portal FCT", desde 3/9/2025; sustituye a la oficina virtual antigua `old.fctennis.cat/portalfct/`). También figura ISQ id 3 (portada sin competiciones visibles) | https://portal.fctennis.cat/ ; menú: torneos, rankings, lligues, equips; sin login para lo público | `/app/torneos/torneoliga/{id}/` (ej. https://portal.fctennis.cat/app/torneos/torneoliga/3558/, 2491, 4196, 3557 = Lliga Catalana per Equips per Comarques); `/app/liga`, `/app/liga/torneoequipos` | Sí, sección "rankings" (URL exacta sin verificar) | ids hasta 4196; hay ediciones anteriores (ej. 2491) | robots sin verificar (el fetch sólo devolvió el shell: SPA, `<base href="/app/">`). Datos vía API JSON del SPA (endpoint sin verificar) |
| Comunidad Valenciana (FTCV) | SPA "Pista Central": `ftcv.pistacentral.es` (tenant de Pista Central, JS obligatorio, tema #1976d2) | https://ftcv.pistacentral.es/page/torneos/calendario ; menú torneos/rankings/ligas/equipos | Rutas `/page/torneos/...` (detalle sin verificar). Ranking CV por categorías en ftcv.es (estático): https://www.ftcv.es/area-deportiva/ranking/ ; equipos: guía PDF + `campeonatos@ftcv.es` | Sí: ranking CV Benjamín/Alevín/Infantil/Cadete/Junior/Absoluto M/F, "a cierre 31 jul 2026", documentos estáticos en ftcv.es | Archivo en `ftcv.es/area-deportiva/ranking/` | robots del tenant: sin datos |
| Extremadura | ISQ id 5 (portal "Competición y resultados" enlaza a resultadostenis.isquad.es) + PDFs y posts en fextenis.com | https://www.fextenis.com/ | PDFs de campeonatos en la web; ISQ para lo demás | Ranking nacional vía rfet.es | posts | sin verificar |
| Galicia (FGT) | "Ibertenis" (`ibertenis.com` público; `oficina.fgtenis.net` = backoffice con login, rechazado). También ISQ id 6 (sin verificar el reparto) | https://www.ibertenis.com/tenis/torneos/ ; https://www.ibertenis.com/tenis/ligas/ ; jugadores https://www.ibertenis.com/tenis/jugadores/{id}/ | Torneo `/tenis/torneos/{id}/` (ej. 1344 = Galicia Head Tour 2025, 1469 = TnR Master 2026); cuadros por categoría `/tenis/torneos/{id}/cuadros?cat={catId}`; `/horarios`; `/inscritos/`; liga `/tenis/ligas/{id}/`, `/inscritos`, `/categorias/{id}` | Rankings de club/liga (p.ej. "Ranking del Sporting Club Casino de La Coruña 25-26") dentro de `ligas`; ranking federativo sin verificar. Aviso: "ibertenis.com es meramente informativa; los resultados oficiales están en el sistema nacional" | Sí: ~1.460 torneos (73 págs.), 18.792 págs. de jugadores; ficha con "histórico, evolución, head-to-head" | robots: sin datos (el fetch devolvió vacío); público sin login |
| Madrid (FTM) | (1) SPA `competicion.ftm.es/app/` (calendario, campeonatos, ranking, login) = mismo esqueleto que FCT/FTCV; (2) LIGAS por equipos en `deportelocal.com/ftm/` (ASP clásico); (3) ISQ id 7 sólo afiliación | https://competicion.ftm.es/app/ranking ; https://competicion.ftm.es/app/calendario/campeonatos ; https://competicion.ftm.es/app/calendario/mensual ; https://www.deportelocal.com/ftm/ | DeportelLocal: clasificación/jornadas `partidos.asp?id_categoria={id}&jornada={n}` (ej. http://www.deportelocal.com/ftm/partidos.asp?id_categoria=2413&jornada=7), equipo `equipos_ficha.asp?id_equipo={id}&idG={id_categoria}`, calendario `calendario.asp?id_competicion=344&id_categoria=2413`, semana `partidos_semana.asp?ctoEq=0`, listado `index.asp?ctoEq=0`. Ids vigentes: 350 LIV Liga Juvenil 26-27, 344 XIII Liga Absoluta por Equipos 2026, 343 XVII Liga de Promoción, 345/346 Young Senior/Supersenior, 347-349 intersemanales, 348 Dobles Sen. F., 332 LIII Juvenil 25-26 | Ranking FTM: `competicion.ftm.es/app/ranking` (datos por API del SPA, sin verificar) + normativa PDF | Histórico DeportelLocal sí (ids 2108, 2130, 2227, 2269, 2372 desde 2024) | deportelocal.com robots: `User-agent: *` Disallow `/ftm/backend/`, `/ftm/extranet/` etc. (`/ftm/partidos.asp` permitido). Público. SPA competicion.ftm.es: robots sin verificar |
| Murcia | Clupik (Leverade) `competiciones.fedetenismurcia.com` ("La Liga de Todos"); ISQ id 8 sólo afiliación | https://competiciones.fedetenismurcia.com/en/ | `/club/{id}`, `/players/{id}`, `/tournament/{id}/summary` | Clasificación en vivo por puntos, sin login | temporadas anteriores (sin verificar) | robots: `Disallow: /admin/` + PetalBot. PERO los términos de Clupik/Leverade prohíben scraping (nota del proyecto): NO recolectar sin convenio |
| Navarra (FNT) | ISQ id 15 embebido en fnt.es | https://fnt.es/resultados/ ; https://fnt.es/clasificacion/ | Resultados por edad en https://fnt.es/alevin-resultados/, /infantil-resultados/, /cadete-resultados/, /junior-resultados/, /absoluto-resultados/, /veteranos-resultados/, /resultados-fnt/, /clasificacion-circuitos/, /envio-de-resultados/ | `/15/ranking/1m` (y 1f/2m/2f) | ISQ | público |
| País Vasco (FVT) | ISQ id 4, ACTIVO (Circuito de dobles Jolaseta 2025) | https://resultadostenis.isquad.es/4/campeonato/32839 | `/4/cuadro/142761` | ISQ `/4/ranking/1m` | 2025 en adelante | público. La home fvtenis.eus no dio datos |
| La Rioja | ISQ id 16 ("Competición y ranking" en frtenis.es) | https://www.frtenis.es/ | ISQ | ISQ | ISQ | público |
| Ceuta | ISQ id 9 (listada; contenido sin verificar). Web propia sin identificar | https://resultadostenis.isquad.es/9/federacion | (sin verificar) | (sin verificar) | (sin verificar) | (sin verificar) |
| Melilla | ISQ id 10 (listada; contenido sin verificar) | https://resultadostenis.isquad.es/10/federacion | (sin verificar) | (sin verificar) | (sin verificar) | (sin verificar) |

### A.4 Familia SPA `/app/` (Cataluña, Madrid, Valencia; Andalucía NO)
- competicion.ftm.es, portal.fctennis.cat y ftcv.pistacentral.es comparten: `<base href="/app/">` (FTM, FCT) o raíz (FTCV), menú torneos/rankings/ligas/equipos, rutas `/app/torneos/torneoliga/{id}`, `/app/liga`, `/app/calendario/{campeonatos|mensual}`, `/app/ranking`, `/app/login`. FTCV lo llama "Pista Central". Mismo código de base con tenants distintos (inferencia por estructura; proveedor común sin verificar). Consecuencia: UN adaptador con `baseUrl` parametrizable podría cubrir Cataluña, Madrid y Valencia una vez descubierta la API.
- No se pudo ver ninguna API (WebFetch devuelve sólo el shell). Sin verificar si los datos salen de `/api/...` sin token.

---------------------------------------------------------------------
# PARTE B. PÁDEL
---------------------------------------------------------------------

## B.1 FEP central (`www.padelfederacion.es`, ASP clásico), la fuente maestra

Hallazgo principal: la FEP aloja un backend único con espacio de ids GLOBAL de torneo (`IdTorneo`) para competiciones FEP Y de varias territoriales (probado: 28544 = Circuito Veteranos Mérida (Extremadura), 29093 = Grand Slam Oro FMP (Madrid), 29102 = 6ª Prueba Circuito Andaluz Veteranos (Andalucía); todos resuelven bajo el mismo path `/Paginas/fapN/`). Madrid enlaza sus torneos con `idTorneoFEP` (mismo id).

| Recurso | URL | Notas |
|---|---|---|
| Ficha de prueba | `https://www.padelfederacion.es/Paginas/fapN/Prueba.asp?IdTorneo={id}` | HTML server-rendered: nombre, organizador, fechas, sede, cuota, categorías, juez árbitro |
| Cuadros y horarios | `.../Prueba_Cuadros.asp?IdTorneo={id}` | HTML con selector masculino/femenino; el contenido de los cuadros se carga tras seleccionar (POST/AJAX sin verificar) |
| Inscritos | `.../Prueba_Inscritos.asp?IdTorneo={id}` | lista de parejas (sin verificar formato) |
| Formulario / multimedia / busco pareja | `Prueba_Formulario.asp`, `Prueba_Multimedia.asp`, `Prueba_BuscoPareja.asp` | |
| Ranking único FEP absoluto | https://www.padelfederacion.es/Ranking_Absoluto | Tabla filtrable M/F y licencia; posición, licencia, nombre, nº torneos, puntos, evolución; actualización semanal (miércoles); mejores 13 torneos en 12 meses. Carga dinámica (endpoint sin verificar) |
| Ranking menores | https://www.padelfederacion.es/Ranking_Menores | Categorías Benjamín, Alevín, Infantil, Cadete, Junior, M/F; columnas categoría, posición, nombre, puntos. MENORES CON NOMBRE |
| Ranking equipos absolutos | https://www.padelfederacion.es/Ranking_Equipos_Absolutos | 1ª y 2ª categoría M/F, años 2017-2024 (histórico) |
| Ranking silla de ruedas / veteranos | `/Ranking_Silla_Ruedas`, `/Ranking_Veteranos` | |
| Campeonatos (lista de 37: por parejas y equipos, absoluto/menores/veteranos, 2014-2026) | https://www.padelfederacion.es/Campeonatos | filas con `javascript:irCamp({id})` (ids 28127..28927); URL destino de `irCamp` no visible (sin verificar). `/Campeonato?id=` y `/Campeonato/{id}` = 404 |
| Calendarios | `/CalendarioFEP`, `/Calendario_Menores_FFAA`, `/Calendario_Veteranos_FFAA`, `/CalendarioFT` (selector de 18 federaciones territoriales) | PDF nacional en `padelfederacion.es/refs/docs/CALENDARIO NACIONAL 2026 ...pdf` |
| Datos de federaciones | `/Datos_Federacion.asp?Id={n}` | Sirvió para sacar las webs autonómicas (B.3) |

Robots: `https://www.padelfederacion.es/robots.txt` = 404 (sin reglas). Público sin login (login sólo para extranet/Portal del Federado).
Idea de adaptador: recorrer `IdTorneo` (rango ~26000-30200 en 2026) sobre `Prueba.asp` para el catálogo y usar `Prueba_Cuadros.asp` para los cuadros. Cubre FEP + Andalucía + Madrid (parcial) + Extremadura + Murcia (Murcia enlaza `padelfederacion.es/Paginas/Murcia/`) y otras que usen el mismo backend (sin verificar cuáles).

## B.2 Plataformas de terceros y agregadores (tenis + pádel)

| Plataforma | Qué es | URL / patrón | Público | Robots / términos | Entidades |
|---|---|---|---|---|---|
| Ibertenis | Plataforma para tenis Y pádel, sobre todo Galicia | https://www.ibertenis.com/padel/torneos/ (251 torneos, 51 págs.), `/padel/torneos/{id}/`, `/cuadros`, `/inscritos`, `/horarios`, `/padel/ligas/`; tenis igual (ver A.3) | Sí | robots sin datos | Clubes gallegos, FGT (tenis), organizadores locales |
| Sport2fit | Red social + gestión de competiciones; backend de la Federación Gallega de Pádel | `https://www.sport2fit.com/edicion/{slug}-{id}` (ej. `.../campeonato-gallego-absoluto-campeonato-gallego-absoluto-xunta-de-galicia-2026-850`; ligas p. ej. `...-liga-gallega-por-equipos-de-clubes-2025-zona-norte-786`); login `sport2fit.com/login_fgp`; ranking FGP en https://www.fgpadel.com/ranking-padel-galicia (CSV descargable, rankings FGP, LGEC ELO, edad, circuito gallego, veteranos +35..+55) | Sí en web de FGP; página de edición devuelta como ROBOTS_DISALLOWED por WebFetch | Bloqueado según WebFetch; NO recolectar `/edicion/` (sin verificar regla exacta) | FGP (Galicia) |
| Sunpad (`sistemasunpad.com`) | Gestión federativa y "nivel" del jugador | `fprm.sistemasunpad.com` (Murcia), enlazado desde fpadelib.es (Baleares) | Parcial | sin verificar | Murcia, Baleares |
| TPC Matchpoint | Software de gestión de instalaciones/federaciones con app propia | app Aragón `es.tpc.matchpoint.appclient.federacionaragonesadepadel`; rankings aragoneses alojados en padelfederacion.es | app | sin verificar | Aragón (apps) |
| 15iguales | Rankings, ligas y torneos amateur de tenis, pádel y squash (clubes y ayuntamientos, muy Madrid) | `padel.15iguales.com/{slug}` (ej. `/ranking-padel-urjc-a`, `/liga-padel-siemens-barcelona`, `/torneo-padel-generali-2019`); `tenis.15iguales.com/{slug}` (ej. `/ranking-de-tenis-alcorcon`, 40+ rankings) | Sí, sin login | robots: `User-agent: *  Disallow: /op/*` (páginas públicas permitidas) | Municipios/clubes/empresas; NO federativo |
| Playtomic (torneos) | Listado público de torneos de pádel/tenis por ubicación, fecha, precio | https://playtomic.io/tournaments | Listado sí; visibilidad de cuadros/resultados sin verificar | playtomic.com/robots.txt devolvió 403 (sin verificar) | Amateur/comercial, sin datos federativos |
| Clupik / Leverade | SaaS de ligas amateur y federaciones (Murcia tenis) | `competiciones.fedetenismurcia.com/en/` | Sí | Términos prohíben scraping: no, salvo convenio | Ver tenis Murcia |
| Competize | SaaS de ligas de tenis y pádel | https://www.competize.com/en/sports/tennis (patrón público sin verificar) | Sí | Veta ClaudeBot/GPTBot; no, salvo convenio | Amateur |
| PadelCV | Web de la federación valenciana con "Rankings" | https://padelcv.com/rankings/ (fetch: timeout de robots) | (sin verificar) | (sin verificar) | Comunitat Valenciana |
| Playtomic, Padel Manager, Tie-Break, LetsPadel, Padelmania, Rankingpadel, TournamentSoftware/Tournament.io (visto en el proyecto) | No se pudo abrir ni confirmar Padel Manager, Tie-Break, LetsPadel, Padelmania, "rankingpadel" con las herramientas disponibles (búsquedas agotadas) | (sin verificar) | | | |

## B.3 Pádel: federaciones territoriales

FEP tiene 19 comunidades + Ceuta y Melilla (ids de `Datos_Federacion.asp`). Webs y plataforma detectada:

| Entidad | Web | Plataforma detectada | URLs útiles / patrones | Ranking público | Robots / acceso |
|---|---|---|---|---|---|
| Andalucía (FAP) | https://www.fap.es | WordPress + backend FEP `padelfederacion.es/Paginas/fapN/...` (inscripción, cuadros, inscritos) | Ejemplo https://www.padelfederacion.es/Paginas/fapN/Prueba.asp?IdTorneo=29102 ; "Liga FAP por Equipos" (8 provincias), "Liga por Parejas" | Ranking FAP absoluto, menores, veteranos | fap.es robots: Disallow `/wp-admin/` + sitemap `https://fap.es/sitemap_index.xml` (permitido) |
| Aragón | https://arapadel.com | Sitio ASP.NET propio (`/Pages/{id}-{slug}`) + TPC Matchpoint (apps); rankings en padelfederacion.es | https://arapadel.com/Pages/27-ranking ; /Pages/26-liga (gestor de ligas) ; /Pages/205-torneos_y_campeonatos ; /Pages/55-historico_de_pruebas (cuadros y horarios) ; /Pages/56-pruebas_abiertas ; /Pages/28-calendario_2026 ; /Eventos.aspx | Absoluto, menores, veteranos | sin verificar |
| Asturias | https://www.fppastur.com | ASP.NET propio (mismo estilo que Madrid) | `/torneos.aspx`, `/pagina.aspx?u=Calendario`, `/pagina.aspx?u=Historico-de-pruebas`, `/pagina.aspx?u=Rankings`, `/pagina.aspx?u=Ligas`, `/noticias.aspx`, `/pagina.aspx?u=Calendario-de-Menores-2026` | Sí, `Rankings` | sin verificar |
| Baleares | https://www.fpadelib.es | Web propia + Sunpad externo | Carteles, noticias; rankings absoluto/veteranos/menores en la propia web | Sí | sin verificar |
| Canarias | https://canariaspadel.es/ | (timeout de robots; sin verificar) | | (sin verificar) | (sin verificar) |
| Cantabria | https://www.federacioncantabradepadel.com | Web propia (+ extranet en padelfederacion.es) | Rankings, Torneos y Campeonatos, Ligas, Calendario | Sí | sin verificar |
| Castilla y León | (no se resolvió: `Datos_Federacion` dio 500) | (sin verificar) | | | |
| Castilla-La Mancha | (idem) | (sin verificar) | | | |
| Cataluña (FCP) | https://www.fcpadel.cat | SPA/CMS propio `competicio` | `https://www.fcpadel.cat/competicio/circuits/{circuit-open|circuit-absolut|circuit-menors|circuit-veterans}/2026/{evento}/informacio`; `/competicio/rankings` = 404 | Ranking por circuito dentro de cada circuito (URL sin verificar) | robots: `User-Agent: * Allow: /` (permitido) |
| Ceuta | https://www.fpadelceuta.com | Web pequeña; plataforma no identificada | Campeonatos / Torneos | (sin verificar) | (sin verificar) |
| Extremadura | https://www.fexpadel.com | (timeout; sin verificar). Sus torneos (ej. IdTorneo 28544) están en el backend FEP | https://www.padelfederacion.es/Paginas/fapN/Prueba.asp?IdTorneo=28544 | (sin verificar) | (sin verificar) |
| Galicia (FGP) | https://www.fgpadel.com | Sport2fit + web informativa | ranking-padel-galicia, torneos-padel-galicia, ligas-de-padel-en-galicia, calendario-eventos-padel-en-galicia | Sí (CSV, ELO LGEC, veteranos) | Sport2fit bloqueado a WebFetch |
| Madrid (FMP) | https://www.fmpadel.com | ASP.NET propio; ids enlazados con FEP | `/calendario.aspx`, `/torneos.aspx`, `/ligas.aspx`, `/inscripcionesAbiertas.aspx`, `/ranking.aspx`, `/pagina.aspx?u=ranking-veteranos`, `/pagina.aspx?u=ranking-menores`, `/ranking_flash.aspx`, `/pagina.aspx?u=palmares`; ficha de torneo `if_torneos.aspx?tipo=INSCRIPCION&idTorneo={idFMP}&idTorneoFEP={idFEP}` (ej. idTorneo=1158, idTorneoFEP=30176). Ligas 2026-27: Veteranos, Veteranas, Nocturna Veteranas, Veteranos Senior, Menores M/F; histórico de ligas 2013-2026 en desplegable | Absoluto, veteranos, menores, flash (histórico "puntos y datos históricos de jugadores") | fmpadel.com/robots.txt = 404 (sin reglas). Detalle de liga con cuenta/privado según WebFetch |
| Melilla | https://www.padelmelilla.com | Web propia | Campeonatos, Inscripciones abiertas, Calendario 2026, Marcador (live), Rankings M/F/veteranos/mixto (con fecha 14/09/26) | Sí | sin verificar |
| Murcia | https://www.federacionpadelmurcia.com | Web propia + backend FEP (`padelfederacion.es/Paginas/Murcia/`) + Sunpad | "VER CUADROS" → padelfederacion.es/Paginas/Murcia/ | Sí (Ranking) | sin verificar; Navarra retornó ROBOTS_DISALLOWED |
| Navarra | https://www.federacionnavarradepadel.com | (WebFetch: URL disallowed por robots) | | (sin verificar) | Bloqueado |
| País Vasco (FVP) | https://www.fvpadel.com | Web propia: torneos, calendario, ranking, estadísticas, menores; ligas "Liga-Kopa Vasca" | (sin verificar patrones) | Sí, incluye menores | sin verificar |
| La Rioja | dentro de padelfederacion.es | Backend FEP | | (sin verificar) | |
| Comunitat Valenciana | https://www.padelcv.com | (timeout; sin verificar); `padelcv.com/rankings/` | | Sí | (sin verificar) |

---------------------------------------------------------------------
# PARTE C. RESUMEN "PLATAFORMA -> ENTIDADES"
---------------------------------------------------------------------

Tenis
- iSquad tenis (`resultadostenis.isquad.es`): RFET (1) + CLM (2) + PV (4) + Extremadura (5) + Madrid (7, sólo afiliación) + Murcia (8, sólo afiliación) + Aragón (12) + Asturias (13) + Baleares (14) + Navarra (15) + La Rioja (16) + Cantabria (18) + CyL (19) + Canarias (20). Ceuta (9) y Melilla (10) listadas. Galicia (6), Cataluña (3), Valencia (17), Andalucía (11) y Madrid (7) figuran en la home pero publican sus competiciones en plataformas propias o mixtas (confirmar contando `/{id}/campeonato/*` una vez se tenga el endpoint AJAX).
- SPA `/app/` (Pista Central/FCT/FTM): Cataluña, Madrid, Valencia.
- DeportelLocal (ASP): ligas por equipos de Madrid (FTM).
- FATCOM (PHP + PDF): Andalucía.
- Ibertenis: Galicia (y clubes de tenis y pádel gallegos).
- Clupik/Leverade: Murcia (no recolectar).
- WordPress + PDF: Aragón, Cantabria, Asturias (clasificaciones antiguas), Extremadura (posts), FTIB (ranking Excel), FTCV (ranking estático).
- TournamentSoftware: usado por circuitos ITF/Tennis Europe; veta `/tournament/`, `/ranking/`, `/player/` (proyecto). No es amateur territorial.
- 15iguales, Competize: amateur municipal/club, no federativo.

Pádel
- Backend FEP `padelfederacion.es/Paginas/fapN/Prueba*.asp`: FEP, Andalucía, Madrid (ids enlazados), Extremadura, Murcia, Cantabria (extranet), La Rioja (sin web propia) (parte sin verificar).
- ASP.NET "aspx" propios con mismo aspecto: Madrid (fmpadel.com), Asturias (fppastur.com), Aragón (arapadel.com, `/Pages/{id}-{slug}`).
- Sport2fit: Galicia (bloqueado).
- Ibertenis pádel: clubes gallegos.
- Sunpad: Murcia, Baleares.
- TPC Matchpoint: Aragón (apps).
- WordPress: Andalucía (fap.es).
- CMS propio: Cataluña (fcpadel.cat), Melilla, País Vasco, Cantabria, Baleares.
- 15iguales, Playtomic, Competize, Clupik: amateur/comercial.

---------------------------------------------------------------------
# PARTE D. PLAN DE ADAPTADORES POR COBERTURA
---------------------------------------------------------------------

| # | Adaptador | Deporte | Cobertura | Riesgo/estado | Prioridad |
|---|---|---|---|---|---|
| 1 | iSquad tenis (`resultadostenis.isquad.es`) | Tenis | RFET + ~13 territoriales (todas salvo posiblemente Cataluña, Valencia, Andalucía, Madrid/Galicia parcial); individual, dobles, equipos, circuitos, rankings 1m/1f/2m/2f | Bloqueante: obtener los endpoints AJAX con un navegador real (no verificado). Robots sin reglas; términos prohíben reproducir. Menores con nombre: política del proyecto | 1 |
| 2 | Backend FEP `padelfederacion.es` (`Prueba.asp` + `Prueba_Cuadros.asp` + rankings) | Pádel | FEP + varias territoriales (Andalucía, Madrid, Extremadura, Murcia...). Es la cobertura más amplia en pádel | Cuadros tras selector (POST/AJAX sin verificar); rankings dinámicos; menores | 2 |
| 3 | SPA `/app/` parametrizable (FCT, FTM, FTCV) | Tenis | Cataluña, Madrid, Valencia = las 3 grandes con datos NO en iSquad | Hay que descubrir la API JSON; un adaptador con 3 `baseUrl` | 3 |
| 4 | DeportelLocal FTM | Tenis | Ligas por equipos de Madrid con jornadas, equipos, resultados; HTML clásico, fácil de parsear, robots permite | Bajo. Histórico desde 2024+ | 4 (rápido de hacer) |
| 5 | Ibertenis | Tenis + pádel | Galicia amateur (clubes) + FGT; HTML server-rendered, URLs claras (`/tenis|padel/torneos|ligas/{id}/`, `/cuadros?cat=`) | Robots sin datos; contenido "informativo" | 5 |
| 6 | fmpadel.com / fppastur.com / arapadel.com (mismo estilo aspx, posible adaptador único con plantillas) | Pádel | Madrid, Asturias, Aragón (rankings, ligas) | Ligas/cuentas privadas parcialmente | 6 |
| 7 | FATCOM (Andalucía tenis) | Tenis | Andalucía; cuadros en PDF | Requiere parseo PDF | 7 |
| 8 | fcpadel.cat, fgpadel/sport2fit (bloqueado), padelmelilla, FVP | Pádel | Cataluña, Galicia, Melilla, PV | Sport2fit fuera por robots | 8 |
| 9 | 15iguales | Ambos | Ligas municipales/clubes (Madrid) | robots permite lo público; datos no federativos | 9 |
| 10 | Clupik/Leverade (Murcia), Competize, TournamentSoftware, Playtomic | Ambos | | Prohibido/vetado: sólo convenio | 0 (excluir) |
| - | PDF/WordPress (Aragón, Cantabria, Asturias, Extremadura, FTIB, FTCV rankings) | Tenis | Cobertura de nicho | Coste alto por poca cobertura | último |

Orden efectivo sugerido: 1 (iSquad tenis, con sondeo de red primero), 2 (FEP pádel), 4 (DeportelLocal, victoria rápida), 3 (SPA /app/), 5 (Ibertenis), 6, 7, 8, 9.

## Menores (Sub-12..Sub-18)
- Tenis: categorías en cuadros iSquad (Sub-10, Alevín Sub-12, Infantil Sub-14, Cadete Sub-16, Junior Sub-18), rankings territoriales por edad en FTIB (Excel) y FTCV (estático); ranking nacional RFET sólo individual/dobles sin filtro de edad visible; FATCOM tiene sección "ranking de menores"; Navarra publica resultados por categoría de edad; Madrid tiene Liga Juvenil (`deportelocal`, ids 332/350).
- Pádel: `Ranking_Menores` de FEP (Benjamín..Junior), rankings de menores de FMP, FAP, arapadel, fpadelib, FVP; Circuito Menores (fcpadel.cat `circuit-menors`), Liga Menores FMP.
- Todos publican nombre y apellidos de menores en abierto; el proyecto decide no publicar nombres de menores (guardar sólo agregados de equipo).

## Pendiente de verificar con navegador real (prioridad alta)
1. Endpoints AJAX de iSquad tenis (partidos, cuadros, ranking, listado de competiciones por `idFed`, ficha de jugador).
2. Si `/{idFed}/campeonato/{id}` es independiente del `idFed`.
3. API JSON del SPA `/app/` (FCT/FTM/FTCV) y robots.
4. Cómo carga `Prueba_Cuadros.asp` y `Ranking_*` de la FEP; destino de `irCamp()`.
5. Reparto real ISQ vs propio en Andalucía, Galicia, Cataluña, Valencia, Madrid, Ceuta, Melilla.
6. Webs y plataformas de pádel de CyL, CLM, Canarias, Extremadura, Ceuta, Navarra (robots), Valencia.
7. Robots de Ibertenis, competicion.ftm.es, portal.fctennis.cat, ftcv.pistacentral.es.

## Fuentes (todas abiertas con WebFetch)
https://resultadostenis.isquad.es/ · /19/federacion · /1/circuitos · /20/campeonato/35032 · /20/cuadro/159545 · /19/campeonato/32663 · /20/campeonato/34868 · /4/campeonato/32839 · /4/cuadro/142761 · https://www.rfet.es/es/ranking-nacional.html · https://www.rfet.es/es/campeonatos-espana-juveniles-individual.html · https://hub.isquad.es/tenis/ · https://fnt.es/resultados/ · https://fnt.es/clasificacion/ · https://ftib.es/es/jugadores/ranking · https://www.ftcv.es/area-deportiva/ranking/ · https://ftcl.es/la-ftcl-pionera-en-la-implementacion-de-la-nueva-plataforma-de-gestion-isquad/ · https://www.federacioncanariadetenis.es/campeonatoscanarias/isquad-la-nueva-era-del-tenis-digital/ · https://competicion.ftm.es/app/ranking · https://portal.fctennis.cat/app/torneos/torneoliga/3558/ · https://fctennis.cat/portal-fct-nou-aplicatiu-de-gestio-de-competicio-i-llicencies/ · https://ftcv.pistacentral.es/ · https://fatcom.fatenis.com/fatcom/public/main/homemov.php?op=5&idc=8508 · https://www.deportelocal.com/ftm/ · http://www.deportelocal.com/ftm/partidos.asp?id_categoria=2413 · https://www.deportelocal.com/robots.txt · https://www.ibertenis.com/ · https://www.ibertenis.com/tenis/torneos/1344/ · https://ibertenis.com/tenis/ligas/ · https://competiciones.fedetenismurcia.com/en/ · https://www.padelfederacion.es/Ranking_Absoluto · /Ranking_Menores · /Campeonatos · /CalendarioFEP · /Paginas/fapN/Prueba.asp?IdTorneo=29102, 29093, 28544 · https://www.fmpadel.com/ · /torneos.aspx · /ligas.aspx · https://www.fap.es/ · https://www.fcpadel.cat/ · https://www.fgpadel.com/ranking-padel-galicia · /torneos-padel-galicia · /ligas-de-padel-en-galicia · https://arapadel.com/Pages/27-ranking · https://www.fppastur.com/ · https://www.15iguales.com/ · https://padel.15iguales.com/ · https://tenis.15iguales.com/ · https://www.competize.com/en/sports/tennis · https://playtomic.io/tournaments
