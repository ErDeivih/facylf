# Catálogo de fuentes de datos: voleibol y balonmano amateur/regional en España

Fecha de la investigación: 2026-09-30. Método: solo WebFetch (resumen por modelo pequeño, no HTML crudo) y WebSearch.

Limitaciones a tener en cuenta:
- El proxy bloquea `curl` a `*.isquad.es` (403 CONNECT). Todo lo de iSquad se leyó con WebFetch, que devuelve resúmenes y no el HTML crudo. Los enlaces "Acta / Previo / Estad." de las tablas de partidos salen como `#` (se rellenan con JS), así que sus URL exactas se dedujeron por otras vías.
- El presupuesto de WebSearch (200 llamadas) se agotó a mitad de la investigación. Las federaciones que quedaron sin buscar figuran como "(sin verificar)".
- Clupik/Leverade (`clupik.pro`, `fvcl.es`, `fedvasvol.com`) devolvió HTTP 429 a WebFetch tras las primeras peticiones. No se pudo ver ninguna página de partido de Clupik.
- Varios dominios dieron "robots.txt fetch failed / disallowed" en la herramienta (`fcvb.es`, `frivoley.com`, `voleibolib.net`, `fvcm.es`, `fmbm.*`). Esto es un fallo de la herramienta, no una prohibición real comprobada.

---

## 1. Hallazgo principal: iSquad es una plataforma común y los `id_territorial` son globales

Dominios (mismo software, un dominio por deporte):
- `resultadosvoleibol.isquad.es`, alias `resultados-voleibol.isquad.es` (aparece indexado en Google). Voleibol playa: `resultadosvoleibolplaya.isquad.es`.
- `resultadosbalonmano.isquad.es`. RFEBM lo enlaza desde `rfebm.com` y desde `rfebm.com/competiciones/competicion.php?...` (proxy o iframe).
- Gestión y actas en PDF: `voleibol.isquad.es` y `balonmano.isquad.es`. Área de jugadores: `*.misquad.es`. Hub: https://hub.isquad.es/ (lista los otros deportes iSquad: fútbol, rugby, pelota, hockey, etc.).

Los `id_territorial` son los mismos en voleibol y balonmano. Se comprobaron con `calendario_partidos.php?id_territorial=N` (nombre de la federación en la cabecera) en ambos dominios. Patrón de la comprobación: https://resultadosbalonmano.isquad.es/calendario_partidos.php?id_territorial=36 devuelve "FED. TERRIT. DE CASTILLA Y LEON".

| id_territorial | Federación (nombre en iSquad) | Verificado en voleibol | Verificado en balonmano |
|---|---|---|---|
| 9999 | Ámbito estatal: RFEBM / RFEVB | sí (cabecera RFEVB) | sí |
| 16 | Castilla-La Mancha | sí | sí |
| 17 | Cataluña | sí | sí |
| 18 | Euskadi (Vasca) | sí | sí |
| 19 | Extremadura | sí | sí |
| 20 | Galicia | sí | sí |
| 21 | Madrid | sí | sí |
| 22 | Región de Murcia | sí | sí |
| 24 | Ceuta | sí | sí |
| 25 | Melilla | sí | sí |
| 26 | Andalucía | sí | sí |
| 27 | Aragón | sí | sí |
| 28 | Principado de Asturias | sí | sí |
| 29 | Baleares | sí | sí |
| 31 | Navarra | sí | enlace de fbnavarra a id=31 |
| 32 | La Rioja | sí | sí |
| 33 | Comunitat Valenciana | sí | enlace de fbmcv a id=33 |
| 35 | Cantabria | sí | sí |
| 36 | Castilla y León | sí | sí |
| 37 | Canarias | sí | sí |
| 15, 23, 30, 34, 38 | sin uso (la página cae a la cabecera genérica RFEBM) | (23 y 30 dan error 500 en voleibol) | sin uso |

Que un `id_territorial` exista en iSquad no significa que esa federación publique ahí. Es una tabla maestra de territoriales. Hay que comprobar cada una con competiciones reales (ver tablas por deporte).

### Estructura de URL de iSquad (mismo esquema en los dos dominios)

Página principal de competición y filtros:
- `competicion.php?id_superficie=1&seleccion=0&id_territorial=N`
  - `id_superficie`: 1 = pista (voleibol y balonmano). En voleibol, 2 = playa, 5 = master pista, 7 = escolar pista (visto en los enlaces de Galicia). En balonmano, 2 = playa.
  - `seleccion`: 0 = clubes, 1 = selecciones.
- `competicion.php?id=<id_fase>&seleccion=0` (p. ej. https://resultadosvoleibol.isquad.es/competicion.php?id=1937&seleccion=0, "1ª División Nacional Femenina, Liga regular", temporada 25/26, con clubes de Galicia, Asturias y Euskadi).
- Con más filtros: `competicion.php?id_superficie=1&seleccion=0&id_categoria=181&id_competicion=554&id=2611&id_temp=2526&id_territorial=17&id_ambito=0`.
  - `id_temp=2526` es la temporada (2025/26). Se ve también `2627`.
  - `id_ambito`: 0 = territorial, 1 = estatal.
- Otras vistas, todas con los mismos parámetros:
  - `competicion_completa.php` (resultados globales)
  - `clasificacion.php`
  - `clasificacion_completa.php`
  - `calendario.php`
  - `calendario_partidos.php` (agenda)
  - `partidos_equipos.php`
  - `pabellones.php`
  - `listado_clubs.php`
  - `listado_arbitros.php`
  - `equipo.php?id_equipo=X&id=<id_fase>` (ficha del equipo)
  - `club.php?id_club=X&id=...`
  - `ultimos_resultados.php` y `iframe_partidos_live.php?id_territorial=17` (marcadores en directo; visto en balonmano)
- Estadísticas (balonmano, verificado): `estadisticas.php?seleccion=0&id=<id_fase>` muestra el ranking de goleadores (jugador, equipo, goles, partidos, media). En voleibol, `estadisticas.php` devolvió error 500 (sin verificar que exista).
- Listado de actas disciplinarias (balonmano, verificado): `listado_actas_comite.php?seleccion=0&id=<id_fase>` enlaza a PDF en `https://balonmano.isquad.es/documentos/comite_competicion/1/CC_Temp_2526_Acta_87.pdf`. Estos son actas del comité de competición, no actas de partido.
- Historial de temporadas: voleibol, selector 2021/22 a 2026/27. Balonmano, selector 2018/19 a 2026/27.
- La tabla de partidos de balonmano tiene las columnas: Equipos | Marcador | Fecha | Lugar | Estado | Previo | Streaming | Estad. | Directo | Acta | Crónica. La de voleibol muestra el resultado por sets y los enlaces "Previo" y "Acta".
- Las tablas se cargan con JS. Con bloqueador de anuncios la página muestra "Su navegador utiliza un bloqueador de publicidad que impide que esta página funcione correctamente". Para un scraper hay que renderizar (Playwright) o descubrir los endpoints XHR. No pude ver los scripts con esta herramienta.

### Patrón del acta de partido en iSquad (tarea 3)

Patrón: `https://<deporte>.isquad.es/acta_completa_pdf.php?id_partido=<N>`. Es el PDF de acta, servido desde el dominio de gestión (no desde `resultados*`). El `id_partido` es global de iSquad. Los ids inválidos devuelven una plantilla en blanco con HTTP 200.

Balonmano (verificado):
- https://balonmano.isquad.es/acta_completa_pdf.php?id_partido=1105848
  - Federación Andaluza, 2ª División Nacional Masculina, GAB Jaén 25 - 36 La Salle, 29/11/2020.
  - Por jugador: dorsal, nombre, G (goles), A (asistencias), sanciones (2 min), D/DD (descalificaciones) y marcas de tiempo.
  - Además: árbitros, anotadores, delegado de campo, oficiales de equipo.
  - Pie: "acta parcial de carácter informativo carente de las descripciones arbitrales".
- https://balonmano.isquad.es/acta_completa_pdf.php?id_partido=1280513
  - Federación Territorial Gallega, Liga Prata juvenil 2022/23, LINEA21 25 - 28 Meaño, 19/02/2023.
  - Mismos campos, con goleadores por jugador.
- Rango de ids visto: 1.10M (2020) a 1.28M (2023). El id actual será mayor (sin verificar).
- Hay estadística de goles por jugador en el acta y en `estadisticas.php` (top scorers por fase).

Voleibol (verificado un caso):
- https://voleibol.isquad.es/acta_completa_pdf.php?id_partido=60000
  - 1ª Div. Alevín F, primera fase, Galicia, 23/11/2025 10:00, pabellón "PM A PINGUEJA - PISTA 2".
  - KORBIS FENESTRA A 3-2 ALDEBARAN ALEVIN FEMENINO (parciales 18/25, 25/21, 20/25, 25/23, 15/12), árbitro Iago Sánchez Castaño.
- El acta de voleibol es el modelo de anotación clásico de 5 sets (rotaciones I-VI, libero, sanciones, firmas). Tiene columnas T, S, G, PTOS por jugador pero en ese caso sin nombres de jugador rellenados.
  - No hay estadística individual útil en voleibol iSquad. Solo se obtienen parciales por set, árbitro, pabellón y fecha.
- Los ids 100000, 200000, 300000 y 1100000 devolvieron plantilla en blanco. 5000, 10000 y 20000 también. 60000 es real. El rango real de ids de voleibol queda por acotar (sin verificar).
- La URL de "Acta" de la tabla de partidos aparece como `#` (JS). Hipótesis razonable: apunta a `acta_completa_pdf.php?id_partido=...` (sin verificar). El `id_partido` habrá que sacarlo del JS o del XHR de la tabla.
- Rugby usa un prefijo distinto: `http://rugby.isquad.es/rugby_acta_completa_pdf.php?id_partido=1017`. No aplica a estos deportes.

### robots.txt de iSquad
- `resultadosvoleibol.isquad.es/robots.txt` y `resultadosbalonmano.isquad.es/robots.txt` devuelven 404, es decir, no hay restricciones declaradas.
- Términos de uso no revisados. Buen comportamiento: tasa baja y caché.

---

## 2. VOLEIBOL

### 2.1 Tabla por entidad

Leyenda de plataforma: iSquad, Clupik (Leverade, "Powered by Clupik"), propia.

| Entidad | id_terr. iSquad | Plataforma de resultados (verificada) | URL de resultados | Patrón de partido/acta | Stats jugador | Historial | Notas y robots |
|---|---|---|---|---|---|---|---|
| RFEVB Superliga / Superliga 2 / Liga Iberdrola | 9999 | Data Project (esvoley.es enlaza a rfevb-web.dataproject.com; la home solo mostró 2020/21, sin verificar que sea la vigente) | https://rfevb-web.dataproject.com/ | `CompetitionMatches.aspx?ID=&PID=`, `MatchStatistics.aspx?mID=` | sí (`PlayerDetails.aspx?TeamID=&PlayerID=&ID=`: puntos, saque, bloqueo, recepción, ataque) | varias temporadas por ID de competición | robots.txt: `Disallow:` vacío (todo permitido) |
| RFEVB Primera División Nacional (F/M, grupos A-D), Superliga 2 grupos | no está en 9999 | Web de RFEVB: CMS Umbraco (Fontventa) con calendario propio ("Num. partido: 199031", mismo formato que fmvoley.com) | https://esvoley.es/voleibol/competiciones-femeninas/primera-division-femenina/grupo-a (también /grupo-b, -c, -d), https://esvoley.es/voleibol/competiciones-femeninas/superliga-2-femenina | número de partido en el calendario; sin URL de acta verificada (sin verificar) | sin verificar | "historical records" en cada competición (sin verificar cómo) | robots.txt de esvoley.es: `Disallow: /umbraco/, /RFEVB/, /support/`, sitemap en https://esvoley.es/sitemap |
| Primera Nacional grupo Noroeste | 20 (Galicia) | iSquad. Ej. `competicion.php?id=1937` "1ª Div. Nacional Femenina, liga regular" 2025/26 con equipos de Galicia, Asturias y Euskadi. Otros grupos de Primera Nacional en iSquad, sin verificar | https://resultadosvoleibol.isquad.es/competicion.php?id=1937&seleccion=0 | ver sección 1 | no | 2021/22 - 2026/27 | ver sección 1 |
| Andalucía (FAV) | 26 (vacío) | Clupik en https://favoley.es (`/en/tournaments`, `/en/calendar`, `/en/clubs`, 8 delegaciones provinciales). Antes/además: portal público STL `favoley.net/publico` y federatio | https://favoley.es/en/tournaments ; https://www.favoley.net/publico/seccion.php?seccion=competiciones (19 competiciones 2026/27, ids tipo `AN1AF26-1`) ; https://favoley.federatio.com/resultados.asp (legado, robots no comprobable) | favoley.net: `seccion.php?seccion=competicion&id=<ID>`; acta electrónica ("ACTA ELECTRÓNICA DE VOLEIBOL" mencionada en noticias); Clupik: ver patrón Clupik abajo | Clupik sí (sin verificar), favoley.net sin verificar | favoley.net muestra la temporada 2026/27 (falta ver antiguas) | favoley.net/robots.txt: 404. Al probar `id=AN1AF26-1` dio "competición no encontrada o no publicada". Estado de migración favoley.net a Clupik, sin verificar |
| Aragón (FAVB) | 27 (con datos) | iSquad (verificado: 2026/27 Copa Aragón, 1ª/2ª/3ª Autonómica; FAVB dice usar iSquad). Existe además `clupik.pro/en/manager/230550` (legado o paralelo, sin verificar) | https://resultadosvoleibol.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=27 ; web https://www.favb.es/ | iSquad: ver sección 1 | no | 2021/22 - 2026/27 | ver sección 1 |
| Asturias (FVBPA) | 28 (vacío) | Plataforma "Táctica TIC" (pie de página; tacticatic.com) en su propia web | https://www.fvbpa.com/competiciones-senior ; ej. https://www.fvbpa.com/editions/346/calendars | `/editions/{id}/calendars?day={jornada}&edition_group_id={g}`; clasificación `?tab=clasification`; calendario completo `?tab=full_calendar&team_id=` ; no se vio acta | sin verificar | ids de edición numéricos (344, 346...) | Sitio también tiene `playa.voleyasturias.com`. `voleyasturias.com` parece dominio genérico (GoDaddy), no es la federación |
| Baleares | 29 (vacío) | Sin verificar. Web https://www.voleibolib.net/ (robots bloquea la lectura desde la herramienta) | sin verificar | sin verificar | sin verificar | sin verificar | (sin verificar) |
| Canarias | 37 (vacío) | Clupik (la web indica "Leverade platform"; app `io.clupik.fcanvb`) | https://www.fcanvb.es/ (filtros por isla Tenerife/Gran Canaria/Lanzarote/Fuerteventura; "Liga Canaria Sénior 2026/27") | Clupik: ver abajo | Clupik: ver abajo | por torneo | ver Clupik |
| Cantabria | 35 (vacío) | Clupik | https://www.voleibolcantabria.com/ | Clupik | Clupik | por torneo | ver Clupik |
| Castilla-La Mancha | 16 (vacío) | Sin verificar. Web https://fvcm.es/ (robots bloquea lectura) | sin verificar | sin verificar | sin verificar | sin verificar | (sin verificar) |
| Castilla y León (FVCL) | 36 (vacío) | Clupik (verificado por pie de página "Leverade/Clupik") | https://fvcl.es/es/tournaments ; ej. https://fvcl.es/es/tournament/1118691/information (2ª División CyL femenina 2021/22) | `/es/tournament/{id}/summary`, `/ranking`, `/information` ; marcador `https://fvcl.es/calendar` | sin verificar | torneos de 2021/22 en adelante | ver Clupik |
| Cataluña (FCVB) | 17 (con datos, la más completa) | iSquad (verificado). Web WordPress https://fcvolei.cat | https://resultadosvoleibol.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=17 ; ej. https://resultadosvoleibol.isquad.es/competicion.php?id=3563&seleccion=0 (Lliga catalana, grupo Divisió d'Honor, comp. 554, cat. 181, temp. 2526) | ver sección 1 (acta PDF en `voleibol.isquad.es`) | no (parciales por set, pabellón, árbitro) | 2021/22 - 2026/27 | robots de fcvolei.cat: WordPress estándar, sitemap `sitemap_index.xml`. 2026/27 ya visible (partidos desde 19/09/2026), incluye Andorra |
| Ceuta | 24 (vacío) | Sin verificar. Web https://www.fcvb.es/ (no se pudo leer) | sin verificar | sin verificar | sin verificar | sin verificar | (sin verificar) |
| Comunitat Valenciana (FVBCV) | 33 (vacío) | Web propia WordPress con plataforma nueva (backend `appweb.fvbcv.com`, escudos en `https://appweb.fvbcv.com/backend/escudos/30/<club>.png`). Los partidos aparecen en tablas de la página de competición | https://fvbcv.com/competiciones/ ; ej. https://fvbcv.com/competiciones/1a-division-senior-femenino-2026-2027/ (slug por competición y temporada) | tabla con fecha, local, visitante, resultado, pabellón, árbitros; sin URL de acta vista | sin verificar | sufijo de temporada en el slug (2025-2026, 2026-2027...) | robots.txt de fvbcv.com: 404. Hay que ver si la tabla se carga desde un API de `appweb.fvbcv.com` (sin verificar) |
| Euskadi (FVBV) | 18 (vacío) | Clupik (pie "Powered by Clupik"; app `io.clupik.fedvasvol`) | https://fedvasvol.com/es/ ; https://fedvasvol.com/en/calendar | `https://fedvasvol.com/es/tournament/{tid}/match/{mid}/results` (ej. tournament 1219157, match 130660294/130660339, Euskal Liga 2 F) | sin verificar (429) | por torneo | Existe una app comunitaria que hace scraping (github.com/Mazinger2007/VoleyApp-fedvasvol): la federación no ofrece API oficial |
| Extremadura | 19 (vacío) | Clupik (`clupik.pro/manager/292000/tournaments`) mediante `competicion.fedexvoleibol.com`. La premisa de VScorer no se pudo confirmar | https://competicion.fedexvoleibol.com/es/league/view/85883 (Campeonato de Extremadura) ; https://competicion.fedexvoleibol.com/es/competition/overview/79231 (Juvenil F) | `/es/competition/overview/{id}` y `/es/league/view/{id}` (ejemplo 79225 Senior F, 79252 Infantil F). URL de partido: sin verificar | sin verificar | por competición | WebFetch no pudo leer `competicion.fedexvoleibol.com` (fallo de robots.txt). Sin verificar qué software real usa |
| Galicia (FGVB) | 20 (con datos) | iSquad (verificado). Web WordPress hecha por Tooools (la misma empresa que iSquad) | https://resultadosvoleibol.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=20 | ver sección 1. Ejemplo real: https://voleibol.isquad.es/acta_completa_pdf.php?id_partido=60000 | no | 2021/22 - 2026/27 | ver sección 1 |
| Madrid (FMV) | 21 (vacío) | Propia: `fmvoley.com` más "Acta Digital" `acta.fmvoley.com` y "Área Federados" `portal-federado.fmvoley.com` | https://fmvoley.com/clasificaciones-y-resultados (buscador por tipo de competición, competición y grupo) | "Num. partido: 199031" en la fila del calendario; tabla con Pos, Equipo, Pts, Jug, Gan, Ga3, Ga2, Per, Per1, Per0, Emp, NP, JFav, JCon, PFav, PCont, Sanc | no vista | `fmvoley.com/voleibol/rankings-finales`, y `feelvolley.es/2019-20/...` para históricos antiguos | robots.txt de fmvoley.com: 404. No se pudo abrir `acta.fmvoley.com` (robots.txt demasiado grande), sin verificar URL pública de acta |
| Murcia | 22 (vacío) | Clupik | https://www.fvbrmurcia.com/ (2ª Div. Reg. Sénior M/F y juveniles) | Clupik | Clupik | por torneo | app `io.clupik.fvbrmurcia` |
| Navarra | 31 (vacío; temporada mostrada 2025/26) | Propia (fenavoley.com/contenido/... ). Solo se vio que los resultados se alojan en la propia web y no hay plataforma externa; sin más detalle | https://www.fenavoley.com/ (además la ficha en deportenavarro.com/federacion/voley) | sin verificar | sin verificar | sin verificar | (sin verificar). Tener en cuenta que "Navarvoley B" también compite en la Euskal Liga (Clupik de fedvasvol) |
| La Rioja | 32 (vacío) | Sin verificar. Web https://www.frivoley.com/ (no se pudo leer) | sin verificar | sin verificar | sin verificar | sin verificar | (sin verificar) |
| Melilla | 25 (vacío) | Sin verificar; esvoley.es no lista web propia de la federación | sin verificar | sin verificar | sin verificar | sin verificar | (sin verificar) |

Nota: "vacío" en el id iSquad significa que la página de competición de 2026/27 mostró solo el menú y la tabla sin partidos, es decir, esa federación no publica ahí (o aún no ha cargado la temporada). No se descartó que alguna cargue más tarde.

### 2.2 Patrón Clupik (Leverade) — común a Andalucía, Euskadi, CyL, Canarias, Cantabria, Murcia, Extremadura (y legado de Aragón)
- Cada federación tiene su dominio propio con "Powered by Clupik" y además `clupik.pro/manager/{id}/tournaments` (Aragón 230550, Extremadura 292000).
- Rutas observadas: `/{idioma}/tournaments`, `/{idioma}/tournament/{tid}/{summary|ranking|information}`, `/{idioma}/tournament/{tid}/match/{mid}/results`, `/tournament/{tid}/calendar/print/{n}` (ej. Andalucía `https://clupik.pro/tournament/1101189/calendar/print/2979735`), y estadística de jugador `https://clupik.pro/es/players/{pid}/match-statistic/{n}` (así que hay estadísticas por jugador, sin verificar el contenido).
- robots.txt de `clupik.pro`: `Disallow: /admin/` para todos y `Disallow: /` solo para PetalBot. Sitemap: https://clupik.pro/sitemap.xml.
- Al cabo de unas pocas peticiones WebFetch recibió 429. Hay limitación de tasa: hay que ir lento y con caché.
- Se sospecha que existe una API JSON pública de Leverade (`api.leverade.com`, formato JSON:API), pero no pude verificarlo (sin verificar). Si existe, sería mucho más fiable que scrapear HTML.

### 2.3 Resumen "plataforma → entidades" (voleibol)

- iSquad (`resultadosvoleibol.isquad.es`): Cataluña (17), Galicia (20), Aragón (27), más grupos de Primera Nacional/RFEVB que cuelguen de esas territoriales (p. ej. id fase 1937). Es la única con actas PDF descargables.
- Clupik/Leverade: Andalucía, Euskadi, Castilla y León, Canarias, Cantabria, Murcia, Extremadura (y posible legado de Aragón). Siete federaciones con un solo adaptador.
- Data Project: RFEVB Superliga / Superliga 2 (`rfevb-web.dataproject.com`).
- Web RFEVB (`esvoley.es`, Umbraco): Primera Nacional y otros. Misma numeración de partido que Madrid.
- Propias, una por federación: Madrid (`fmvoley.com` + `acta.fmvoley.com`), Comunitat Valenciana (`fvbcv.com` + `appweb.fvbcv.com`), Asturias (Táctica TIC), Andalucía legado (`favoley.net`, STL), Navarra (`fenavoley.com`).
- Sin verificar: Baleares, Castilla-La Mancha, Ceuta, La Rioja, Melilla.

---

## 3. BALONMANO

RFEBM usa iSquad como plataforma común para el ámbito estatal y casi todos los territoriales. Los territoriales enlazan iSquad desde su web como "Balonmano Pista/Playa". Afiliaciones y gestión: `balonmano.isquad.es/afiliaciones/login.php`. Panel federado: `hub.misquad.es/misquad-balonmano/`. Retransmisiones: `isquad.tv` (`fecanbm.isquad.tv`, `fchandbol.tv`).

### 3.1 Competiciones estatales (id_territorial=9999)
Página: https://resultadosbalonmano.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=9999 (temporadas 2018/19 a 2026/27).
Competiciones listadas (2025/26): Campeonato Estatal de División de Honor Élite Femenina, División de Honor Masculina, División de Honor Plata Masculina, División de Honor Oro Femenina, Primera División Masculina, División de Honor Plata Femenina, Liga Guerreras Iberdrola, Supercopa de España Femenina, y campeonatos estatales de base (ej. "Campeonato Estatal Cadete Masculino, 2ª fase o fase de sector, sector G" `competicion.php?id=1035649`).
Nota: la Liga ASOBAL / Liga Profesional la gestiona ASOBAL (`asobal.es`), no verificado si publica en iSquad. Es competición profesional, fuera del alcance amateur.

### 3.2 Tabla por entidad

Todas comparten el patrón iSquad de la sección 1. El patrón de acta es `https://balonmano.isquad.es/acta_completa_pdf.php?id_partido=N` con goles por jugador (G), asistencias (A) y sanciones (verificado en Andalucía y Galicia). Las páginas `estadisticas.php?seleccion=0&id=<fase>` dan el ranking de goleadores.

Estado de la columna "Datos en iSquad" = lo que mostró `competicion.php?id_superficie=1&seleccion=0&id_territorial=N`.

| Entidad | id_terr. | Web de la federación | Datos en iSquad (2026/27 salvo indicación) | Ejemplo verificado | Historial | Notas |
|---|---|---|---|---|---|---|
| RFEBM | 9999 | https://www.rfebm.com/ | sí, competiciones estatales | https://resultadosbalonmano.isquad.es/competicion.php?id=1035649&seleccion=0 (equipos `equipo.php?id_equipo=204612&id=1035649&id_superficie=1`) | 2018/19 - 2026/27 | robots.txt de rfebm.com: `Disallow: /competiciones/` (aplica al proxy `rfebm.com/competiciones/competicion.php?...`; usar directamente iSquad, que no tiene robots) |
| Andalucía (FAB) | 26 | https://fandaluzabm.org/ | sí (Camp. Andalucía Alevín F, Benjamín M, Infantil F, Copa Andalucía, Selecciones provinciales; temporada 2025/26 con partidos finalizados) | https://balonmano.isquad.es/acta_completa_pdf.php?id_partido=1105848 (2020) | desde 2018/19 en el selector | Confirma iSquad; la web incrusta `resultadosbalonmano.isquad.es` |
| Aragón (FARBM) | 27 | https://farbm.com/ | tabla vacía al consultar (2026/27); FARBM declara usar iSquad y miSquad | sin verificar con datos | sin verificar | (sin verificar datos) |
| Asturias (FBMPA) | 28 | https://fbmpa.es/ | sí (Torneo Nacional Infantil F/M, Copa Principado, amistosos; jornada 3 con resultados, Acta, Estad., Crónica) | enlace a `https://www.rfebm.com/competiciones/competicion.php?seleccion=0&id_territorial=28` | sí | |
| Baleares (FBHB) | 29 | https://fbhb.es/ | sí (Campeonatos de Baleares federados, Copa Delegación Eivissa, Copa Federación Mallorca, Liga Balear Juvenil M, 2ª Nacional M; ronda 1 el 25/10/2026) | sin verificar | sí | |
| Canarias (FECANBM) | 37 | https://www.fecanbm.es/ | sí (Copa Alevín Mixto, Liga Cabildo Cadete F, Liga Territorial M/F, etc.; tablas aún vacías) | sin verificar | sí | `fecanbm.isquad.tv` |
| Cantabria (FCBM) | 35 | (enlace no leído; web de la federación sin verificar) | sí (Copa Cantabria Sénior F, 1ª División F, 2ª División M, cadete F/M, infantil F; 2025/26 con jornada 3 pendiente) | sin verificar | sí | |
| Castilla-La Mancha | 16 | (sin verificar) | sí (Sénior M 1ª Territorial, Juvenil M 1ª y 2ª Territorial, Liga Regional CM, Liga Territorial F, Sector Asociado) | sin verificar | sí | |
| Castilla y León (FBMCYL) | 36 | (sin verificar) | solo confirmado el nombre "FED. TERRIT. DE CASTILLA Y LEON" en `calendario_partidos.php?id_territorial=36` (agenda vacía) | sin verificar | sin verificar | (sin verificar datos) |
| Cataluña (FCH) | 17 | https://www.fchandbol.cat/ | sí (`iframe_partidos_live.php?id_territorial=17`). Además históricos en `http://handbol.playoffinformatica.com/competicio` y sitio antiguo `cathandbol.cat` (resultats i classificacions) | sin verificar | iSquad + Playoff Informàtica (histórico) | Playoff Informàtica es otra plataforma (segundo adaptador, sin verificar detalle) |
| Ceuta | 24 | (sin verificar) | sin verificar (id existe, cabecera "FEDERACIÓN TERRITORIAL CEUTA DE BALONMANO") | sin verificar | sin verificar | |
| Comunitat Valenciana (FBMCV) | 33 | https://fbmcv.es/balonmano-pista/ | enlace explícito a `resultadosbalonmano.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=33` | sin verificar | sin verificar | |
| Euskadi (FTVBM) | 18 | (sin verificar) | tabla vacía al consultar (2026/27 y 2025/26). Puede que use otra plataforma | sin verificar | sin verificar | (sin verificar; comprobar si usa web propia) |
| Extremadura | 19 | (sin verificar) | tabla vacía | sin verificar | sin verificar | (sin verificar) |
| Galicia (FTGBM) | 20 | (sin verificar) | sí (acta 2022/23 Liga Prata juvenil) | https://balonmano.isquad.es/acta_completa_pdf.php?id_partido=1280513 | sí | |
| La Rioja | 32 | (sin verificar) | sí (2ª Nacional M, Copa de Balonmano, Final Supercopa; primer partido 04/10/2026) | sin verificar | sí | |
| Madrid (FMBM) | 21 | (web `fmbm.*` no legible; sin verificar) | sí (Campeonato Autonómico de Liga M/F, Trofeo Comunidad de Madrid, Cadete/Infantil/Juvenil; temporada mostrada 2025/26, jornada 3 pendiente) | sin verificar | sí | |
| Melilla | 25 | (sin verificar) | sin verificar | sin verificar | sin verificar | |
| Murcia | 22 | (sin verificar) | tabla vacía al consultar (2026/27) | sin verificar | sin verificar | (sin verificar datos) |
| Navarra (FNBM) | 31 | https://fnavarrabm.com/balonmano-pista/ | enlace explícito a `competicion.php?id_superficie=1&seleccion=0&id_territorial=31` | sin verificar | sin verificar | |

Comprobaciones: Asturias, Andalucía, Baleares, Cantabria, Canarias, CLM, La Rioja, Madrid y Cataluña mostraron competiciones reales en `competicion.php`. Euskadi, Extremadura, Murcia, Aragón y CyL mostraron tabla vacía (probablemente temporada aún sin cargar, pero no confirmado).

### 3.3 Resumen "plataforma → entidades" (balonmano)
- iSquad (`resultadosbalonmano.isquad.es`): RFEBM (estatal) y las 19 territoriales listadas arriba (todas tienen `id_territorial`). Datos confirmados en 10 de ellas: Andalucía, Asturias, Baleares, Canarias, Cantabria, Castilla-La Mancha, Galicia, La Rioja, Madrid y Cataluña. Enlaces explícitos en Valencia y Navarra. Aragón, Euskadi, Extremadura, Murcia, CyL, Ceuta y Melilla quedan "sin verificar datos".
- Playoff Informàtica: solo Cataluña, para históricos de pista (sin verificar el alcance).
- ASOBAL: Liga Profesional (fuera de alcance amateur).

---

## 4. Plan de adaptadores, ordenado por cobertura

1. Adaptador iSquad multideporte (voleibol + balonmano). Un solo código para 2 dominios y ~20 territoriales más el estatal. El deporte se fija con el host. Es la mayor cobertura.
   - Entrada: `competicion.php` por `id_territorial` × `id_temp`. Salida: fases (`id`), clasificaciones, calendario, resultados por partido.
   - Actas: `acta_completa_pdf.php?id_partido=N` en `balonmano.isquad.es` (goles/asistencias/sanciones por jugador) y en `voleibol.isquad.es` (parciales por set, sin stats individuales).
   - Riesgo principal: las tablas se cargan con JS. Hay que usar navegador headless o localizar el XHR. Ningún `robots.txt` (404), pero limitar tasa y cachear. No se pudo comprobar términos de uso.
   - Balonmano además tiene `estadisticas.php` (top goleadores por fase).
   - Voleibol: 3 territoriales con datos (Cataluña, Galicia, Aragón) más grupos de Primera Nacional.
2. Adaptador Clupik/Leverade (solo voleibol): Andalucía, Euskadi, CyL, Canarias, Cantabria, Murcia, Extremadura. Siete federaciones. Probar primero si existe la API JSON de Leverade (sin verificar). Si no, scraping de `/tournament/{id}/...`. Cuidado con el 429 (ir lento, caché) y con `Disallow: /admin/`.
3. Adaptador Data Project (voleibol, RFEVB Superliga/Superliga 2): la única fuente con estadística individual detallada (`MatchStatistics.aspx?mID=`, `PlayerDetails.aspx`). Bajo volumen, alta calidad. robots.txt permite todo.
4. Adaptador web RFEVB / Madrid (voleibol): `esvoley.es` (Primera Nacional, grupos A-D) y `fmvoley.com` comparten el formato "Num. partido". Un adaptador cubre las dos. Falta ver si `acta.fmvoley.com` expone actas públicas.
5. Adaptadores sueltos de una sola federación (voleibol):
   - `fvbcv.com` (Comunitat Valenciana, con backend `appweb.fvbcv.com`; revisar si expone un API).
   - `fvbpa.com` (Asturias, Táctica TIC, `/editions/{id}/calendars`).
   - `favoley.net` (Andalucía legado, STL).
   - `fenavoley.com` (Navarra).
6. Playoff Informàtica (balonmano, históricos de Cataluña): baja prioridad, solo si se quiere historia anterior a iSquad.
7. Pendientes de investigar (voleibol): Baleares (`voleibolib.net`), Castilla-La Mancha (`fvcm.es`), Ceuta (`fcvb.es`), La Rioja (`frivoley.com`), Melilla. Para balonmano: confirmar Aragón, Euskadi, Extremadura, Murcia, CyL, Ceuta y Melilla cuando cargue la temporada 2026/27.

## 5. URLs citadas (comprobadas o leídas)

iSquad:
- https://resultadosvoleibol.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=17 (y `=20`, `=27`, `=9999`)
- https://resultadosvoleibol.isquad.es/competicion.php?id=1937&seleccion=0
- https://resultadosvoleibol.isquad.es/competicion.php?id=3563&seleccion=0
- https://resultadosvoleibol.isquad.es/calendario.php?seleccion=0&id=2060
- https://resultadosvoleibol.isquad.es/equipo.php?id_equipo=4160&id=1937
- https://voleibol.isquad.es/acta_completa_pdf.php?id_partido=60000
- https://resultadosbalonmano.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=9999
- https://resultadosbalonmano.isquad.es/competicion.php?id=1035649&seleccion=0
- https://resultadosbalonmano.isquad.es/estadisticas.php?seleccion=0&id=1035649
- https://resultadosbalonmano.isquad.es/listado_actas_comite.php?seleccion=0&id=1035649
- https://resultadosbalonmano.isquad.es/calendario_partidos.php?id_territorial=36
- https://balonmano.isquad.es/acta_completa_pdf.php?id_partido=1105848
- https://balonmano.isquad.es/acta_completa_pdf.php?id_partido=1280513
- https://hub.isquad.es/

Federaciones y otras plataformas:
- https://esvoley.es/federacion/federaciones-autonomicas (lista oficial de webs autonómicas de voleibol)
- https://esvoley.es/voleibol/competiciones-femeninas/primera-division-femenina (y `/grupo-a`, `/superliga-2-femenina`)
- https://rfevb-web.dataproject.com/ (y `/robots.txt`)
- https://favoley.es/en/ ; https://www.favoley.net/publico/seccion.php?seccion=competiciones ; https://favoley.federatio.com/resultados.asp
- https://fedvasvol.com/es/ ; https://github.com/Mazinger2007/VoleyApp-fedvasvol
- https://fvcl.es/es/tournament/1118691/information
- https://www.fcanvb.es/ ; https://www.voleibolcantabria.com/ ; https://www.fvbrmurcia.com/
- https://clupik.pro/robots.txt ; https://clupik.pro/tournament/1101189/calendar/print/2979735
- https://www.favb.es/ ; https://www.volei.gal/ ; https://fcvolei.cat/
- https://fmvoley.com/clasificaciones-y-resultados ; https://acta.fmvoley.com/
- https://fvbcv.com/competiciones/
- https://www.fvbpa.com/competiciones-senior ; https://www.fvbpa.com/editions/346/calendars
- https://www.fenavoley.com/
- https://www.rfebm.com/ (y `/robots.txt`)
- https://fandaluzabm.org/ ; https://farbm.com/ ; https://fbmpa.es/ ; https://fbhb.es/ ; https://www.fecanbm.es/
- https://fbmcv.es/balonmano-pista/ ; https://fnavarrabm.com/balonmano-pista/ ; https://fbmpa.es/balonmano-pista/
- https://www.fchandbol.cat/ ; http://handbol.playoffinformatica.com/competicio
