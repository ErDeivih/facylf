# Tenis y fútbol sala amateur en España: plataformas, acceso público y recomendaciones para el scraper

Todo lo de abajo sale de consultas puntuales de WebFetch/WebSearch a fecha 2026-09-30, sin login ni descargas masivas. Lo que no pude comprobar va marcado "(sin verificar)". Varios `robots.txt` no se pudieron leer, sobre todo en webs que son SPA; lo indico en cada caso.

## 1. Hallazgo principal

**La RFET ha migrado a iSquad (Toools, S.L.), el mismo proveedor de PNFG/iSquad en fútbol.** Desde finales de 2025, ranking nacional y campeonatos de España están en el "Portal de Competición RFET", `https://resultadostenis.isquad.es/`. Ese portal enlaza a las federaciones territoriales con ids del 1 al 20, por ejemplo `/{id}/federacion` (1 = RFET) y `/19` para Castilla y León.
- Fuentes: [noticia RFET](https://www.rfet.es/es/noticia/publicado-el-ranking-nacional-en-el-nuevo-portal-de-competicion-rfet), [FAQ ranking](https://www.rfet.es/es/ranking-nacional-faqs.html), [FTCYL](https://ftcl.es/).
- Un adaptador iSquad ya existente en el proyecto se puede reutilizar parcialmente para tenis, con el modelo de datos cambiado (jugador/sets en vez de equipo/goles).

## 2. Tenis: entidad, plataforma, URL y acceso

| Entidad | Plataforma | URL | Datos públicos | robots.txt / ToS |
|---|---|---|---|---|
| RFET (nacional) | iSquad "Resultados Tenis" | `resultadostenis.isquad.es` | Torneos, cuadros y resultados, ranking nacional (cierre mensual, publicado 15-20 días después) | Sin login para consultar (el HTML público no lo pedía). Login solo para jugador, club, árbitro y delegado en `tenis.misquad.es/login*.php`. robots.txt de `resultadostenis.isquad.es`: 404 (no hay). Términos de iSquad: ver punto 5 |
| RFET web | Drupal | `rfet.es` | Noticias, calendario "En Juego", enlaces al portal | robots.txt: solo `User-agent: *` y sitemap, sin `Disallow` ([robots](https://www.rfet.es/robots.txt)) |
| FTM Madrid | Portal propio (SPA, base `/app/`) | `competicion.ftm.es` | Ranking federados, calendario, ligas y interclubs (según la web FTM, sin verificar en detalle) | SPA que exige JavaScript. Solo pude leer la cabecera HTML. robots.txt (sin verificar) |
| FCT Cataluña | Misma familia SPA `/app/` | `portal.fctennis.cat/app/torneos/torneoliga/{id}/` (Lliga Catalana por equipos), `/app/calendario/mensual` | Torneos, ligas, calendario | La ficha de la liga pedía login (lectura poco fiable). robots.txt (sin verificar). Ranking histórico en `fctennis.cat/ranquing/` |
| FTCV Valencia | "Pista Central" (SPA) y Matchpoint | `ftcv.pistacentral.es/torneos`, `ftcv.matchpoint.com.es` | Torneos por id (`/torneos/299`) | SPA con JavaScript. robots.txt (sin verificar) |
| FAT Andalucía | Portal propio | `fatcom.fatenis.com`, ranking en `fatenis.com/tenisandalucia/` | Torneos, ranking, ligas por equipos | Algunas secciones piden login. robots.txt (sin verificar) |
| FTCYL Castilla y León | iSquad (`resultadostenis.isquad.es/19`), TournamentSoftware (histórico) e isquad.tv | [ftcl.es](https://ftcl.es/) | Temporada actual en iSquad, histórico en TournamentSoftware | Área privada en `misquad.es` |
| FAT Aragón | iSquad | [aragontenis.com/isquad](https://aragontenis.com/index.php/isquad/) | Clasificación nacional y competición | Adopta iSquad de la RFET |
| Galicia | Ibertenis | `ibertenis.com/tenis/torneos/{id}/` (contacto `fgtenis.net`) | Cuadros, resultados, horarios, listas de jugadores | Web de administración de torneos de tenis y pádel. Se presenta como interfaz de la plataforma oficial de la RFET (esto contradice a iSquad como plataforma oficial; sin verificar). Tiene login. robots.txt: no obtenido |
| País Vasco | Web propia (Joomla) | `fvtenis.eus` | Noticias y resultados de jugadores vascos | Sin plataforma de competición identificada (sin verificar) |
| TournamentSoftware | Plataforma de terceros | `tournamentsoftware.com` | Usada residualmente (FTCYL, histórico) | robots.txt: `Disallow` para `/tournament/`, `/ranking/`, `/player/`, `/sport/` y `/content/` ([robots](https://www.tournamentsoftware.com/robots.txt)). No usar |
| Playtomic | Reservas de pistas | n/a | No es competición federada | Fuera de alcance |

Notas:
- No encontré una "Liga Interclubs" RFET pública separada. El portal RFET lista campeonatos por equipos (veteranos +40/+60/+80, absoluto, junior) ([competiciones](https://www.rfet.es/es/competiciones.html)).
- Los identificadores y la estructura de las SPA `/app/` (FTM, FCT, FTCV) no se pudieron inspeccionar con WebFetch. Habría que revisar las llamadas de red del navegador de forma manual y puntual antes de decidir.

**Riesgo de menores.** Los rankings y torneos incluyen categorías Sub'16 y Sub'18, y alevín, infantil y cadete en los territoriales (por ejemplo, torneos alevín y cadete de Galicia, benjamín en la FTCV). Son datos personales de menores bajo RGPD y LOPDGDD. El FAQ de la RFET no trata la protección de datos de menores. Los términos de iSquad remiten a lopd@toools.es para derechos de acceso, rectificación y supresión.

## 3. Fútbol sala: entidad, plataforma y URL

| Entidad | Plataforma | URL | Datos públicos | robots.txt / notas |
|---|---|---|---|---|
| RFEF: Segunda División FS (16 equipos) y Segunda B FS (96 clubes, 6 grupos, 2026/27) | Portal de resultados RFEF | `resultados.rfef.es`, competición 33918407 ([RFEF](https://rfef.es/es/competiciones/segunda-division-fs)) | Actas, clasificaciones y calendario | **robots.txt bloquea el fetch automático** (`ROBOTS_DISALLOWED`). No scrapear. Alternativas: `solo-futsal.es`, `ceroacero.es`. Vídeos en "Futsal RFEF" |
| RFEF web | Drupal | `rfef.es` | Noticias y fichas | robots.txt: solo `Disallow` en rutas de administración de Drupal ([robots](https://www.rfef.es/robots.txt)) |
| RFEF: Tercera División FS y Segunda Femenina FS | Gestión territorial | Tercera FS aparece en `rffm.es` (`tipojuego=3`) | Clasificaciones en la federación territorial | (Sin verificar si toda la Tercera pasa por las territoriales; ver [normas RFEF FS aficionado](https://rfef.es/sites/default/files/pdf/01_nr_y_bc_de_futbol_sala_aficionado_version_actualizada_14_febrero_2022_2022.pdf).) |
| RFFM Madrid | Portal RFFM/Matchapp, misma plataforma que fútbol | `rffm.es/competicion/resultados-y-jornadas?temporada=..&tipojuego=3&competicion=..&grupo=..&jornada=..` | Resultados y clasificaciones | **`tipojuego=3` es fútbol sala** (deducido de URLs en buscador; `tipojuego=1` sería F11, sin verificar). robots.txt: `Disallow` en `/fichaequipo/`, `/fichajugador/` y `/acta-partido/` ([robots](https://www.rffm.es/robots.txt)). Las actas de RFFM están vetadas |
| RFAF Andalucía | Matchapp (`rfaf-strapi.matchapp.es`) | `.../competicion/resultados-y-jornadas` | (Sin verificar modalidades ni actas) | No pude cargar la página |
| RFGF Galicia | PNFG en `futgal.es/pnfg/...` | [ejemplo](https://futgal.es/pnfg/NNws_ShwNewDup?codigo=15358&cod_primaria=140&cod_secundaria=140) | (Sin verificar futsal) | Bloqueado por robots.txt para el fetch |
| FFCV Valencia | Novanet (clubes), isquad.es y web WordPress | [FFCV FS](https://ffcv.es/wp/blog/tag/competiciones-de-futbol-sala/) | Copa, Lliga de Promoció, Supercopa | Ver isquad.es más abajo |
| FCF Cataluña | Portal propio Next.js unificado | `fcf.cat/futbol-sala`, plan de competición ([PDF](https://files.fcf.cat/documentos/2526/PLACOMPETICIOFUTBOLSALA.pdf)) | Divisiones senior M/F y base completa (benjamín a juvenil), 4 delegaciones | robots.txt: `Disallow: /api/`, `/_next/` y `/*/cerca` ([robots](https://www.fcf.cat/robots.txt)). No usar `/api/` |
| Futsal Cataluña (portal antiguo) | Drupal | [futsal.cat](https://www.futsal.cat/) | Resultados, clasificaciones, sanciones | robots.txt 404. Web con temporadas 2018-2026 |
| isquad.es (genérico) | iSquad | `isquad.es/competiciones_publico_equipo.php?id_equipo=..&id_grupo=..&id_ambito=..` ([ejemplo 1ª Regional Juvenil FS](https://www.isquad.es/competiciones_publico_equipo.php?id_equipo=17506&id_grupo=768772&id_ambito=1)) | Ejemplos: 1ª Regional Juvenil FS (Peñíscola) y Copa de la Reina FS (Sala Zaragoza) | Etiqueta explícita "Fútbol Sala". Enlace "VER ACTA" |

Hallazgos clave:
1. En las páginas iSquad revisadas, la clasificación y los resultados de futsal usan las mismas columnas que fútbol (PJ, PG, PE, PP, GF, GC). No vi campos específicos de futsal (faltas acumuladas) en las tablas, solo en el acta (sin verificar).
2. Cataluña tiene tres puntos de entrada para futsal (`fcf.cat`, `futsal.cat` y el PDF de plan de competición). Conviene decidir cuál es canónico.
3. Duplicación potencial: la RFEF, las territoriales y agregadores como solo-futsal pueden publicar la misma competición.

**Diferencias típicas de fútbol sala en modelo de datos** (conocimiento general, sin verificar en las actas concretas):
- 5 jugadores por equipo, portero incluido, y cambios volantes sin límite (un jugador puede entrar y salir varias veces).
- Faltas acumuladas por parte (5 por mitad, la 6ª genera libre directo sin barrera).
- Doble penalti y penalti desde 10 m.
- Portero-jugador.
- Tiempo muerto, duración 2x20 min con cronómetro parado.
- Tarjetas azules o "expulsión temporal" (sin verificar por territorio).
- Categorías base con reglas propias.

## 4. Fútbol sala municipal

| Entidad | Plataforma | URL | Notas |
|---|---|---|---|
| Juegos Deportivos Municipales de Madrid | Datos abiertos del Ayuntamiento y app no oficial | [jdmmadrid.es](https://www.jdmmadrid.es/) alimentada desde el [portal de datos abiertos](https://datos.madrid.es/portal/site/egob/menuitem.c05c1f754a33a9fbe4b2e4b284f1a5a0/?vgnextoid=1d72f30d4a95b410VgnVCM2000000c205a0aRCRD&vgnextchannel=374512b9ace9f310VgnVCM100000171f5a0aRCRD&vgnextfmt=default) | Calendarios, resultados y clasificaciones de 10 deportes. Sin login. La app avisa de que no garantiza exactitud. El fetch del portal de datos abiertos quedó bloqueado por robots.txt; conviene revisar la licencia y el formato (CSV/JSON) manualmente. Es la mejor vía por ser open data |
| Móstoles, Sevilla (IMD), Málaga | Web municipal | [Móstoles](https://www.mostoles.es/MostolesDeporte/en/campeonatos-municipales-deporte-infantil/futbol-sala/clasificaciones-resultados/clasificaciones-resultados-campeonatos-municipales), [Sevilla](https://imd.sevilla.org/programas-deportivos/juegos-deportivos-municipales/deportes/futbol-sala), [Málaga](https://deporte.malaga.eu/juegos-deportivos/deportes-colectivos/futbol-sala/) | Formato heterogéneo (HTML/PDF). Cobertura ciudad a ciudad, alto coste de mantenimiento |
| Ligas privadas municipales (MuniMad) | Privada | [munimad.es](https://munimad.es/) | No federada. Sin verificar términos |

## 5. ToS y consideraciones legales (aplican a iSquad)

Los [Términos y Condiciones de iSquad/Toools](https://hub.misquad.es/wp-content/uploads/2021/02/iSquad_Te%CC%81rminos-y-Condiciones-Legales.pdf) (versión 2021, de la plataforma en general):
- Reservan la propiedad intelectual de la plataforma.
- Prohíben reproducir, distribuir y comunicar públicamente total o parcialmente los contenidos sin autorización escrita, y el uso comercial.
- Prohíben eludir dispositivos de protección y sobrecargar la plataforma.
- No mencionan scraping explícitamente.

Como el proyecto es privado, conviene una consulta jurídica sobre extracción sistemática. La vía más limpia es pedir a la RFET y a las territoriales acceso por convenio o API, o al menos limitar la frecuencia y el volumen.

## 6. Recomendaciones para fútbol sala en el scraper de fútbol

1. **Detectar la modalidad, no duplicar adaptadores.** En RFFM/Matchapp es un parámetro (`tipojuego=3`). En iSquad la etiqueta va en el nombre de la competición ("... Fútbol Sala ..."). Añadir el campo `modalidad` (F11, F7, FS) al esquema de competición y filtrar por él.
2. **Ampliar el modelo de acta** para futsal: `faltas_por_parte`, `tarjeta_azul` (si existe), `portero_jugador`, `tiempo_muerto` y `cambios` sin límite. El acta de fútbol tiene 11 titulares y 3 a 5 cambios, así que no asumir un máximo de suplentes ni de cambios.
3. **Respetar el `Disallow`.** RFFM veta `/acta-partido/`, `/fichajugador/` y `/fichaequipo/`; `resultados.rfef.es` bloquea el acceso automático; FCF veta `/api/`. Para Segunda/Segunda B FS se puede usar solo web RFEF (noticias/clasificaciones) o agregadores, con permiso. Registrar en una tabla `fuente_permitida` qué rutas están permitidas por federación.
4. **Prioridad de cobertura:** (a) iSquad/PNFG y FFCV, donde ya hay adaptador; (b) FCF con su portal Next.js unificado; (c) Madrid vía datos abiertos y RFFM sin acta; (d) Segunda B y Tercera por territorial; (e) municipal, empezando por Madrid.
5. **Deduplicar por competición y equipo** entre RFEF, territorial y agregadores (clave: federación + temporada + competición + grupo + jornada + local/visitante).
6. **Menores:** en base (alevín, infantil, cadete), guardar solo el agregado de equipo y no nombres completos de menores en el acta. Aplicar la misma política que ya tenga el proyecto para fútbol base.

## 7. Orden recomendado de adaptadores de tenis

1. **iSquad RFET** (`resultadostenis.isquad.es`), que cubre nacional y varias territoriales (CyL, Aragón y otras con id 1-20). Reutiliza el adaptador iSquad de fútbol.
2. **Territoriales que usan iSquad**, tras comprobar cuáles (FTCYL y FAT Aragón confirmadas). El resto (sin verificar) se ve en la lista de 19 federaciones del portal.
3. **Portales propios SPA:** FTM (`competicion.ftm.es`), FCT (`portal.fctennis.cat`), FTCV (`ftcv.pistacentral.es`) y FAT (`fatcom.fatenis.com`). Antes de decidir, revisar sus llamadas de red y su robots.txt.
4. **Ibertenis (Galicia)**, para una federación concreta y con estado ambiguo.
5. **Descartar:** TournamentSoftware (robots.txt bloquea las rutas útiles) y Playtomic (no federado).

Riesgos:
- **Menores y RGPD** (ranking con Sub'16 y Sub'18 e infantiles): hay que anonimizar o pseudonimizar y no publicar nombres completos de menores.
- **ToS de iSquad** con prohibición de reproducción y uso comercial.
- **SPA con JS**, que obliga a usar la API interna en vez de HTML, con mayor riesgo legal y de rotura.
- **Inestabilidad:** RFET migró en 2025 y hubo congelación del ranking por la transición. Los ids y la estructura pueden cambiar.
- **Ranking mensual** (con cierre y publicación a los 15-20 días): no hace falta scraping frecuente.
