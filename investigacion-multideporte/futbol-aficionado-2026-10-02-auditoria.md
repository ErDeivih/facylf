# Ronda 3 (02/10/2026) — fútbol aficionado: auditoría ServerSports + nuevas fuentes

## ServerSports: histórico y estadísticas (hecho en código, falta reinicio)
- Problema: el adaptador sólo pedía temporadas >= 2023 y sólo al revisitar la portada (cada 7 días); las
  colas existentes nunca llegaron a pedirlas → Futormes sólo tenía la temporada en curso.
- Comprobado contra la web real (petición 62): POST del menú de temporadas funciona sin sesión.
  Futormes 2019: 30 campeonatos; equipo con 34 partidos; ficha con 25/27 jugadores. Asofusa 2016: 32 campeonatos.
- Menú de temporadas en las portadas ya descargadas: hasta 18 temporadas (desde 2009); Futormes 2013-2026.
- Cambios: tipo `temporadas` (semilla nueva, misma URL, otra clave) → un POST por temporada con identidad
  `temporada:<id>`; temporadas pasadas sin revisita semanal (90 días); ficha de partido con jugadores (id, nombre,
  dorsal, goles, propia puerta, recibidos, amarillas, rojas), equipos y competición; sin edad/altura/peso/foto/
  apodo/motivo de tarjeta; en menores no se guarda ningún jugador (sólo totales).
- reinterpreta.mjs: relee las fichas ya descargadas con el adaptador nuevo (sin pedir nada).
- motor: evidencia de páginas POST nombrada por clave (antes las temporadas se pisaban entre sí).
- recolector: siembra SIEMPRE al arrancar (antes sólo con cola vacía → ligas añadidas después nunca entraban:
  business-sports-empresas, malagaf7, minifutbolterresdelebre, minifutbolcatcentral, aemf…).
- Pendiente: nombreCampeonato devuelve null en temporadas pasadas (el nombre va en el menú de sesión): sacar el
  nombre de la ficha de partido (lblPartidoInfoCompeticion) o de la portada del POST.
- Coste: Futormes ~13 temporadas × ~2.700 partidos ≈ 35.000 fichas; a 6,5 s y una petición a la vez por
  adaptador ≈ 2,6 días sólo Futormes; todas las ligas, del orden de 1-2 semanas. Paralelizar por dominio sería
  cambiar el ritmo: preguntar a David.

## La Preferente
- DESDE 2023-24 → 2015-16; competiciones de temporadas pasadas se revisitan cada 90 días (antes cada 3);
  jornadas de temporadas pasadas con partidos sin marcador ya no se revisitan cada 48 h para siempre.

## ServerSports: dominios que faltaban en el adaptador (estaban en conocidas.txt pero no en LIGAS)
ligaempresascordoba.com, aldoveafutbol7.com, futbolsalacda.com, ligas.redfutbolsala.com, cnfutbolsala.com,
afes.red, empubenco.com, torneosindesa.com
## ServerSports: dominios nuevos
- futbol7pa7.com / 7pa7.com — 7pa7 Córdoba (temporadas 2016-2025)
- ligacorporativa.com — Liga Corporativa (empresas; demoligacorporativa.serversports.net)
- ligadelicias.com — Liga Delicias Zaragoza / Liga Comarcal Calatayud FS
- f7jerez.com — F7 Jerez (Cádiz)
- veteransfutbol.com — Veterans Vallès-Maresme (F11 veteranos, Barcelona)
- almeriacup.es — ADAC / Almería Cup League (16.ª temporada)
- futbol7mallorcatorneos.es — Fútbol 7 Mallorca
- juegosmunicipales.imdsg.es — JDM Segovia (F7 y FS)
- demoligahesperides.serversports.net — Liga Hespérides (Sevilla), sólo en subdominio demo
- demoanfutbol7.serversports.net — ANF7 (anfutbol7.com no resuelve)
- fsempresas.es — AD Empresarial FS (DNS no resuelve desde aquí: probar)
- bunwer: el dominio bueno es https://www.bunwer.es (sin www fallaba). 14 temporadas 2013-2026, Madrid F11 veteranos.
- Fuera de España (no añadir): ligafansport (Colombia), sportevents.com.ar / demosportsevents (Argentina), INDEC.
- Muertos o sin comprobar: bysportfutbol7.com, aspefutbol7.com, futbol7asturias.com, futbolsalaburgos.es,
  ligafebril.com (indexados, ids viejos; «fetch failed» desde el PC) → sondear por http://www.

## MyGol con dominio propio
- futbolrapido.biz — Fútbol Rápido Bizkaia (Liga Bizkaia F7), «MyGol platform». Añadir.
- fes.mygol.es — organización «fes» (sin identificar): probar /api/tournaments.

## Otras fuentes nuevas
- siguetuliga.com: sitemapLigas.xml con ~1.100 ligas (federadas + ligas de usuarios: ~45 veteranos gallegos,
  ~50 FS locales gallegas, F7 Lalín…). robots: prohíbe /*? , /api/, /ws/ → sólo URLs sin parámetros
  (/liga/<slug>/calendario, /clasificacion). Ligas administradas por usuarios; muchas abandonadas. Candidato a
  adaptador (filtrar por slug y por última jornada).
- myTorneo (mytorneo.com): sólo Cáceres (171 torneos, veteranos F7 desde 2023-24). robots permite todo salvo
  /img/ y */jugadores/*. HTML: /caceres/veteranos/<liga>, /jornada-N.html. Candidato pequeño.
- totalf7.com (Madrid, 4 sedes): web propia dinámica (carga ligas por JS) → sondeo de navegador.
- torneodeportividad.es (FS Tenerife): patrón /tournaments/<id>-<slug>/events/… = familia Leverade → no (ToS).
- ADC Calagurris (Calahorra, La Rioja): adcalagurris.es/clasificacion-2026-2027 (no se pudo abrir).
- Cantabria: Liga de Fútbol de Veteranos (Asociación de Futbolistas Veteranos) sólo en prensa (cantabriadirecta).
- Logroño Deporte: torneos municipales (logronodeporte.es).
