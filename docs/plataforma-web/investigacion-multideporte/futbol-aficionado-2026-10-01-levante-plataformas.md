# Fútbol no federado: Comunitat Valenciana + clientes de plataformas en España

Fecha: 2026-10-01. Fuente: solo WebSearch/WebFetch. "Verificado = sí" significa que se abrió la página con WebFetch y se vio temporada activa; "no" = solo visto en título/URL de búsqueda (o la página no cargó).

## A) Comunitat Valenciana — competiciones nuevas (no estaban en conocidas.txt)

| Competición | Ciudad/provincia | Modalidad | URL resultados/clasificación | Plataforma | Verificado |
|---|---|---|---|---|---|
| Liga Vistahermosa Fútbol 7 (1ª, 2ª, 3ª G1, 3ª G2) — temp. 2026-27 | Alicante | F7 | https://www.ligavistahermosaf7.futbol/index.php?op=GRUPO&idcomp=247 (248, 249, 250) | Web propia PHP (`index.php?op=GRUPO&idcomp=N`) | sí |
| LFV – Liga de Fútbol Valencia (Segunda, Primera, Máster) — 19/09/2026–27/06/2027 | Valencia | F11 aficionado | https://www.lfv.es/tournaments/9552310-competiciones-lfv | Leverade (patrón `/tournaments/ID-slug`, marca blanca) | sí |
| Ligas Fútbol 7 BAMVOLEA Sport City + Copa F7 viernes / sábado — temp. 26-27 | Valencia | F7 | https://usuarios.sportcityvalencia.com/Page.aspx?id=8 | MatchPoint (software de instalaciones) | sí |
| Fútbol 7 Sénior / Copa Elche F7 (municipal) | Elche (Alicante) | F7 | https://competiciones.elche.es/en/tournament/1220910/ranking | Leverade (marca blanca `competiciones.elche.es`) | no (429 al abrir; sección vista) |
| Liga local de Castellón (6 equipos, en juego) | Castellón | fútbol (sin precisar) | https://www.xporty.com/tournaments/1287443-liga-local-de-castellon/events/1287446/rounds/1287453/standings/view | Xporty (Leverade) | sí (activa; temporada no indicada) |
| Fútbol 7 municipal Castelló | Castellón | F7 | https://www.castello.es/es/futbol-7 | Ayuntamiento (no se pudo abrir: robots) | no |
| Liga Amateur Fútbol 7 Torrevieja / LF7 Torrevieja | Torrevieja (Alicante) | F7 | https://liga-amateur-futbol-7-torrevieja.webnode.es/clasificacion/ ; http://www.lf7torrevieja.es/ (DNS caído) | Webnode | no (temporada no visible; probablemente inactiva) |
| Liga Comarcal de Fútbol Sala (Alcoi, enlazada por alcoi.org) | Alcoi (Alicante) | Sala | https://lcfs.es/es/ | Web propia | no (devuelve 410) |
| Liga Fútbol 7 Veteranos Benidorm (XVIII ed.) | Benidorm (Alicante) | F7 veteranos | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=220494 | todotorneos | no (lo publicado es 2016-17; enjore.com/es/league/32903 da 404) |
| Liga semanal de Fútbol 7 – Ciudad Deportiva Camilo Cano | La Nucía (Alicante) | F7 | https://www.ciudaddeportivacamilocano.com/noticias/i/12431/73/talleres-benidorm-lider-de-la-liga-semanal-de-futbol-7 | Noticias municipales | no |
| Liga amateur de fútbol 7 Sports and Fun | (Valencia, sin confirmar) | F7 | https://www.sportsandfun.es/liga-amateur-de-futbol-7/ | ? | no (timeout) |
| LFS 2k25 – Liga Fútbol Sagunto | Sagunto (Valencia) | ? | https://www.instagram.com/liga.futbol.sagunto/ | solo Instagram | no |
| Liga AKRA F-7 Alicante | Alicante | F7 | = alicante.mygol.es (ya conocida; Liga AKRA es el nombre comercial) | MyGol | corrección de nombre |
| NSLeagues F7 Ciudad Deportiva de Paterna | Paterna (Valencia) | F7 | https://www.xporty.com/tournaments/182939-nsleagues-f7-ciudad-deportiva-de-paterna-valencia | Xporty (además de nostresportleagues.com, ya conocida) | no |
| Minifútbol Valencia – Sala Patronato jueves | Valencia | Sala/minifútbol | https://futplaya.mygol.es/tournaments/151 | MyGol (subdominio futplaya ya conocido) | no (SPA, no renderiza) |
| RC Sport inter empresas Valencia (Champions Final Internacional Valencia 2025) | Valencia | F7 empresas | https://www.rcsport.es/liga-futbol-7-empresas/champions-final-internacional-valencia-2025/valencia/grupo-1--champions-final-internacional-valencia-2025- | propia (rcsport ya conocida; confirma sede Valencia) | no |

## B) Clientes nuevos por plataforma en España

### ServerSports (`/mod/soccer/competitions.aspx`, `situation.aspx`, `*.serversports.net`)
| Competición | Provincia | Modalidad | URL | Verificado |
|---|---|---|---|---|
| Business Sports Empresas (Liga F7 BS Apertura Empresas, 7 divisiones, 2026-27) | Madrid | F7 empresas | https://www.torneosparaempresas.com/mod/soccer/index.aspx | sí (dominio nuevo; misma org. que futbol.business-sports.es) |
| F7 Córdoba | Córdoba | F7 | http://www.f7cordoba.com/mod/soccer/competitions.aspx | no (el dominio ya no resuelve) |
| Liga Fansport (demo) | ? | F7 | http://demoligafansport.serversports.net/mod/soccer/index.aspx | no |
| Descartados (no España): 7pa7.com / futbol7pa7.com (Córdoba, Argentina, verificado), sportevents.com.ar, demofutbol-ar1, torneosencurso.ligafansport.com / demoligafansport (Liga Fan Sport, Bucaramanga, Colombia), ligacorporativa.com (Liga Corporativa F7, probablemente México – Grupo Danmich, sin verificar) | | | | |

Nota: serversports.com no publica lista de clientes (solo 3 testimonios: "Boglodites Sports", "Ramón Folguera", "BusinessSports"). Otros demos vistos: demofutbol.serversports.com, demoligastikitaka (= tikitakaf7, conocida), demof7giralda, demoadsercal (= Calderón Cinco / ligasfutbol7madrid), demoasofusa, demoanfutbol7.

### MyGol (`<cliente>.mygol.es/tournaments/N`, SPA: no se renderiza con WebFetch)
| Competición | Provincia | Modalidad | URL | Verificado |
|---|---|---|---|---|
| Asociación Española de Minifútbol (AEMF) | nacional | minifútbol / F7 | https://aemf.mygol.es/tournaments | no (SPA; listada en mygol.es/nuestros-clientes) |
| fes.mygol.es (solo panel /admin visto) | ? | ? | https://fes.mygol.es/admin | no |
| Minifútbol Valencia = subdominio futplaya (ya conocido): ligas F7 (Quatre Carreres, Malilla, La Torre, Benicalap, Alaquàs +35, Fonteta, Safranar) y sala (Patronato), temp. 2025-26 | Valencia | F7 / sala / veteranos +35 | https://futplaya.mygol.es/tournaments/236/matches (F7 Martes +35 Alaquàs), /tournaments/151 (Sala Patronato jueves) | no (aclaración: futplaya = Minifútbol Valencia; artículo Valencia Plaza 26/08/2025) |
| Dominios propios listados como clientes en mygol.es/nuestros-clientes: lligueslleida.com, minifutbolreus.com, fs5navarra.es, futbol7amistad.com (todos ya conocidos vía subdominio) | | | | |
| Descartados (no España): soccaportugal.mygol.es, minifootball.pt, minifootballcr.mygol.es (Costa Rica), miligafutbol9 (Chile, ya en conocidas pero es de Chile → corregir), area5football.com (Area 5 Football Centre, extranjero) | | | | |

Corrección a conocidas.txt: `miligafutbol9.mygol.es` enlaza a WWW.MILIGA.CL → es de Chile, no de España.

### Playooz (patrón `<dominio>/<slug-temporada>/clasificacion?roundId=N&groupId=N`; también `/classificacio`)
| Competición | Provincia | Modalidad | URL | Verificado |
|---|---|---|---|---|
| Liga Press by Santander (liga de periodistas) | Madrid | F7 | https://ligapressbysantander.com/ligapressbysantander/clasificacion | no (robots) — "Liga Press" figura como cliente en playooz.com |
| Lligues Universitàries (BCN) | Barcelona | F7 / sala universitaria | https://lliguesuniversitaries.cat/ | sí (la web se titula "Playooz") |
| Esport Universitari Catalunya – CCUFSM 2023 | Cataluña | sala universitaria | https://www.esportuniversitari.cat/ccufsm2023/classificacio | no |
| Universidad de Almería / Universidad de Zaragoza / UAB / Asociación Española Unihockey / CDI / Interseven 10 | Almería, Zaragoza, Barcelona… | universitarias, etc. | (sin URL pública encontrada) | no (solo logos en playooz.com) |

Clientes que playooz.com muestra en "Ya han confiado en Playooz": Asociación Española Unihockey, CDI, Élite Ligas Fútbol (= ligaelitefutbol.com, conocida), Fútbol Navarra (= futbol7navarra.com, conocida), Interseven 10, Liga Press, Lliges Universitaries, MLA Sport (conocida), UAB, Universidad de Almería, Universidad de Zaragoza, Valldor.

Ojo: el mismo patrón `/<slug>/clasificacion` lo usan webs con pie "SportZentral" (competicions.udg.edu — Lliga UdG F7 24/25, Girona; Fundació Valldor7 — F7, sala, sala fem., veteranos +33, Barcelona/UAB). SportZentral Software & Consulting SL figura "en liquidación/inactiva": Playooz parece su sucesor (mismo motor).

### todotorneos.com (`/torneo/torneosresultados.php?torneo=N`)
| Competición | Provincia | Modalidad | URL | Verificado |
|---|---|---|---|---|
| Liga «Universal» de Fútbol 7 Aluche — preinscripción y grupos A/B 2026-27 | Madrid | F7 | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=68184 | sí |
| Liga F7 Toledo Norte (creada 22-10-2024) | Toledo | F7 | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=357079 | no |
| KelmeCup (creado 11-01-2025) | ? | fútbol | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=358361 | no |
| XVIII Liga F7 Veteranos Benidorm | Alicante | F7 veteranos | https://www.todotorneos.com/torneo/torneosresultados.php?torneo=220494 | sí, pero INACTIVA (datos 2016-17) |

El buscador (https://www.todotorneos.com/paginas/buscartorneo.php?idmodalidad=1) lista 85 torneos de fútbol ordenados por fecha de alta; de 2025-26 casi todos son de Latinoamérica (L.D.B. La Joya, Lorica, Ciudad Dorada…). todotorneos es residual para España.

## Otras plataformas (patrón de URL y clientes vistos)

| Plataforma | Patrón de URL | Clientes vistos (España) | Nº |
|---|---|---|---|
| Leverade / Xporty | `<dominio>/tournaments/<ID>-<slug>`; marca blanca `competiciones.<ayto>.es/<lang>/tournament/<ID>/ranking`; `xporty.com/tournaments/<ID>-<slug>/events/<ID>/rounds/<ID>/standings/view` | LFV Liga de Fútbol Valencia (lfv.es), Ayto. Elche (competiciones.elche.es), Liga local de Castellón (xporty), NSLeagues F7 Paterna (xporty) | 4 |
| MatchPoint | `usuarios.<instalación>.com/Page.aspx?id=N` | Sport City Valencia (BAMVOLEA, ligas F7 26-27) | 1 |
| SportZentral (en liquidación) | `<dominio>/<slug>/clasificacion` | Universitat de Girona (competicions.udg.edu), Fundació Valldor7 (Barcelona), ligamunicipalf7toledo.es (conocida) | 3 |
| Web propia PHP "op=GRUPO" | `index.php?op=GRUPO&idcomp=N` | Liga Vistahermosa F7 (Alicante) | 1 |
| Webnode (web genérica) | `<liga>.webnode.es/clasificacion/` | Liga Amateur F7 Torrevieja (sin temporada visible) | 1 |
| gesliga.com | `gesliga.com/Clasificacion.aspx?Liga=N` | Impulsa Sport F7 (solo 2015-16, inactiva) | 1 (inactivo) |
| enjore.com | `enjore.com/es/league/<ID>/<slug>/` | Liga F7 Veteranos Benidorm (404) | 1 (caído) |
| marcadoresonline.com | `marcadoresonline.com/clasificacion/?torneo=N&deporte=1` | (visto en búsqueda, sin cliente identificado) | 0 |
| RC Sport (propia) | `rcsport.es/liga-futbol-7-empresas/<torneo>/<ciudad>/<grupo>` | sede Valencia confirmada (ya conocida) | — |

## Limitaciones
- Se agotó el presupuesto de WebSearch (200/200 en la sesión) y después WebFetch devolvió "session limit"; no se pudo verificar KelmeCup, Toledo Norte ni ampliar Castellón/Gandía/Orihuela/Vila-real/Sagunto.
- MyGol es una SPA: WebFetch no ve los torneos (solo títulos de búsqueda).
- Páginas no abiertas por robots/timeout: castello.es, lf7torrevieja.es (DNS), ligainterempresas.com, sportsandfun.es, ligapressbysantander.com, serversports.net demos (certificado).

