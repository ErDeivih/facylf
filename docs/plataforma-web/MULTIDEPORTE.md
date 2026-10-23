# Multideporte y fútbol aficionado: estudio y plan (30/09/2026, ampliado por la tarde)

Objetivo de David: **todos los datos de España de los deportes mayoritarios, fuera del mundo profesional**
(baloncesto, voleibol, balonmano, tenis, pádel, fútbol sala y ligas de fútbol aficionado no federadas).
Criterio de acceso decidido por David: **como con las federaciones de fútbol**: peticiones espaciadas (4-8 s),
una a la vez, aunque robots.txt vete rutas. Excepción que se mantiene: **Clupik/Leverade y Competize**, cuyos
términos prohíben la extracción de forma expresa (Competize, además, veta a los bots de IA por su nombre):
primero se les pide acceso; si no contestan, se decide.

Catálogos completos con URLs y fuentes en `investigacion-multideporte/catalogo-*.md` (baloncesto,
voleibol+balonmano, tenis+pádel, fútbol aficionado) y los tres informes de la mañana.

## ★ Para retomar los otros deportes (dejado así el 01/10/2026, noche)

David pide centrarse ahora en el **fútbol aficionado** (ver `FUTBOL-AFICIONADO.md`). Los otros deportes quedan así:

| deporte | HECHO (adaptador y prueba real) | QUEDA POR HACER |
|---|---|---|
| **Balonmano** | `isquad-balonmano`: RFEBM + las 19 territoriales, en marcha | Leer las actas PDF (goles y sanciones por jugador); modelo canónico |
| **Voleibol** | `isquad-voleibol` (Cataluña, Galicia, Aragón, 1ª Nacional; 14.586 partidos), `fmvoley` (Madrid) | Valencia (FVBCV), Asturias, Andalucía (FAVoley: HTML/iframes), Data Project (Superliga 2) |
| **Baloncesto** | `feb` (nacional no profesional, box score), `gesdeportiva` (Madrid, Canarias, Asturias, Extremadura, Melilla), `owbasket` (Valencia, CyL, Rioja, CLM, Navarra, Baleares, País Vasco) | FEB autonómicas (Aragón a=3, Cantabria a=7…); temporadas anteriores de FBM; widget FEGABA (Galicia); **sin acuerdo no**: Cataluña (FCBQ), Andalucía (FAB, 403), Murcia (ofuscada) |
| **Tenis** | `isquad-tenis` (RFET + ~13 territoriales; menores con seudónimo) | **Aparcados por privacidad**: Avanza (Madrid, Cataluña) y Pista Central (Valencia) exponen DNI/fechas de nacimiento de inscritos. Ibertenis (Galicia), DeporteLocal FTM (ligas por equipos), FATCOM (Andalucía) por estudiar. Avisar a las federaciones de la exposición de datos |
| **Pádel** | — | FEP (`padelfederacion.es/…Prueba.asp?IdTorneo=`): sondear de nuevo (la URL de prueba dio 404) |
| **Fútbol sala federado** | ya entra por los recolectores de fútbol | Modalidad por dato de la fuente; columnas de faltas acumuladas (migración nueva); RFEF 2ª/2ªB bloqueada |
| **Común** | motor, supervisor, enlace de vigilancia, `busca-plataforma.mjs`, `sondeo-navegador.mjs` | **David: `reiniciar-multideporte.ps1`** (el supervisor sigue con el código viejo); modelo canónico multideporte (§4); avisos de privacidad (iSquad tenis, Avanza, Pista Central) |

## 0. El mapa en una tabla: plataforma → qué cubre → adaptador

| # | plataforma | deportes | cobertura | ¿HTML servido? | datos por partido |
|---|---|---|---|---|---|
| 1 | **iSquad resultados** (`resultados{voleibol,balonmano}.isquad.es`, ids de territorial comunes: 9999 estatal, 16 CLM, 17 Cataluña, 18 Euskadi, 19 Extremadura, 20 Galicia, 21 Madrid, 22 Murcia, 24 Ceuta, 25 Melilla, 26 Andalucía, 27 Aragón, 28 Asturias, 29 Baleares, 31 Navarra, 32 Rioja, 33 Valencia, 35 Cantabria, 36 CyL, 37 Canarias) | **balonmano (RFEBM + las 19)**, voleibol (Cataluña, Galicia, Aragón, 1ª Nacional) | la mayor de todas | sí (resultados y sets en el HTML; sondeado) | acta `acta_completa_pdf.php?id_partido=N` (balonmano: goles y sanciones por jugador) |
| 2 | **FEB Baloncesto en Vivo** | baloncesto nacional no profesional (EBA, 3ª FEB, LF2, Liga U, base) | España entera | sí | **box score** por jugador (`Partido.aspx?p=N`), histórico desde 1999 |
| 3 | **ServerSports** | fútbol aficionado, F7, sala | 33+ ligas en 20+ provincias (Futormes, FutZaragoza, ASOFUSA…) | sí (ASP.NET) | partido, equipo y ficha de jugador |
| 4 | **iSquad tenis** (`resultadostenis.isquad.es/{fed}/…`) | tenis | RFET + ~13 territoriales | parcial (lo dinámico va por AJAX) | cuadros, partidos, ranking |
| 5 | **FEB autonómicas** (`competiciones.feb.es/autonomicas/?a=N`) | baloncesto regional | 10 vivas (Andalucía, Aragón, Huesca, Zaragoza, Cantabria, CyL, Extremadura, Madrid, Murcia, Navarra) | sí | sólo marcador (sin acta) |
| 6 | **Gesdeportiva/Indalweb** | baloncesto | 8 federaciones (Andalucía, Madrid, Galicia, Canarias, Asturias, Murcia, Extremadura, Melilla) | sí | marcador; informes en PDF |
| 7 | **MyGol** (`*.mygol.es`) | fútbol aficionado | 29 ligas | no (SPA → su API JSON) | clasificación, sanciones, jugadores |
| 8 | **FEP pádel** (`padelfederacion.es/Paginas/fapN/Prueba.asp?IdTorneo=N`) | pádel | torneos de todas las territoriales (ids globales) | sí | cuadros |
| 9 | Data Project (RFEVB Superliga 2) · OWBasket (Rioja y quizá Navarra, CyL, CLM) · Playooz · La Preferente «No federado» · webs propias (FBCyL, FCBQ, FBCV, voleibol de Madrid/Valencia/Asturias, tenis SPA de Madrid/Cataluña/Valencia, Ibertenis, DeporteLocal FTM) | varios | una o pocas entidades cada una | varía | varía |
| — | Clupik/Leverade (17 ligas de fútbol aficionado, 7 federaciones de voleibol, tenis Murcia) · Competize (7 ligas) | — | — | — | **pendiente de pedir acceso** |

**Conclusión:** con 3 adaptadores (iSquad resultados, FEB en vivo, ServerSports) entran el balonmano de toda
España, el voleibol de medio país, el baloncesto nacional no profesional con estadística individual y la
mayor red de ligas aficionadas. Con 5 más (iSquad tenis, FEB autonómicas, Gesdeportiva, MyGol, FEP pádel) se
cubre casi todo lo demás.

## 0 bis. Cómo se recoge: el motor común (hecho hoy)

`scripts/multideporte/motor.mjs` + `recolector-multideporte.mjs`: cola reanudable en SQLite por plataforma
(`descargas-multideporte/<adaptador>/`), ritmo 5-8 s al azar con suelo de 4 s, una petición a la vez, pausa
de 1 h tras tres 403/429/5xx seguidos, evidencia comprimida de cada página, registros genéricos con huella
(detecta cambios), re-visitas programadas por tipo de página y la escalera de «sin publicar» de Cataluña.
Cada plataforma es un adaptador pequeño (`adaptadores/<nombre>.mjs`) que sólo siembra y lee. Pruebas:
`motor.test.mjs` (4/4).

## 1. La conclusión en una línea por deporte

| deporte | quién publica | plataformas que cubren más | adaptadores para cubrir la mayoría |
|---|---|---|---|
| **Fútbol sala** | las mismas 19 territoriales que ya recogemos (PNFG/iSquad/FCF/FFCV) + RFEF 2ª y 2ªB | ya las tenemos | **ninguno nuevo**: es cuestión de detectar la modalidad bien (ver §3) |
| **Voleibol** | RFEVB + territoriales | **iSquad** (Cataluña, Galicia, Aragón, parte de RFEVB) · Data Project (Superliga 2) | 1: iSquad voleibol (mismo proveedor que el fútbol) |
| **Tenis** | RFET + territoriales | **iSquad** (`resultadostenis.isquad.es`: RFET desde 2025, CyL, Aragón y ~20 territoriales enlazadas) | 1: iSquad tenis. El resto (Madrid, Cataluña, Valencia, Andalucía) son SPA propias |
| **Baloncesto** | FEB + 17 autonómicas | **Gesdeportiva/Indalweb** (Galicia, Canarias, Asturias, Murcia, Madrid, Andalucía; CyL y CLM probables) · **FEB `autonomicas`** (~10 entidades con `a=`) · FEB Baloncesto en Vivo (EBA, 3ª FEB, LF2, base nacional) | 2-3: Gesdeportiva + FEB. Cataluña y Valencia, propios |
| **Fútbol aficionado** | ligas privadas y municipales | **ServerSports** (Futormes Salamanca y Zamora, FutZaragoza, ASOFUSA Valladolid, Liga de las Empresas, Estadio 7…) · Clupik/Leverade y Competize (los más grandes, **pero prohíben la extracción**) · datos abiertos de Madrid | 1: ServerSports. Madrid por descarga manual |

**Lo más valioso del estudio:** iSquad (Toools) es el proveedor de nuestro fútbol y además de la RFET y de
media España del voleibol. El conocimiento que ya tenemos de esa plataforma se reutiliza.

## 2. Qué se puede y qué no (robots y términos)

| fuente | robots.txt | términos | decisión |
|---|---|---|---|
| iSquad (voleibol, tenis) | 404, sin reglas | prohíben reproducir contenido sin autorización (igual que en fútbol) | sondeo sí; recogida con el mismo criterio que el fútbol |
| FEB competiciones / en vivo | 404 | aviso legal FEB, sin revisar | sondeo sí |
| Gesdeportiva (webs de cada federación) | varía por federación; FBM Madrid bloqueó el lector | sin revisar | sondeo sí, federación a federación |
| Data Project (RFEVB) | `Disallow:` vacío | sin revisar | sondeo sí |
| ServerSports (Futormes…) | **veta `player.aspx`, `team.aspx`, `match.aspx`**; permite `situation.aspx` y `competitions.aspx` | no localizados | sólo clasificación y listado; **las fichas de partido no** |
| datos.madrid.es (JDM) | **veta la descarga automática de `/resource/`** (Crawl-delay 10) | **CC BY 4.0** | descarga **manual** semanal (miércoles) a una carpeta, o pedirlo al Ayuntamiento |
| Clupik / Leverade | permisivo | **12.2.3 prohíbe scraping y bots** | **no**, salvo convenio |
| Competize | **veta a ClaudeBot y GPTBot por nombre** | prohíbe reproducción | **no**, salvo convenio |
| TournamentSoftware (tenis) | veta `/tournament/`, `/ranking/`, `/player/` | — | no |
| RFFM (fútbol sala Madrid) | veta `/acta-partido/`, `/fichajugador/`, `/fichaequipo/` | — | lo que ya aplica el recolector de Madrid |
| resultados.rfef.es | bloquea el acceso automático | — | no |

`scripts/lib/robots.mjs` interpreta comodines (`*`, `$`) y grupos por agente: el lector de
`sondeo-isquad.mjs` usa `startsWith` y habría dado por permitida la descarga de datos.madrid.es.

## 3. Fútbol sala: el fallo encontrado y lo que falta

**Fallo corregido hoy.** `modalidadDesdeNombre` buscaba «sala» como subcadena: **toda competición con
«Salamanca» en el nombre quedaba como fútbol sala** (p. ej. «1ª División Provincial de Juveniles, Primera -
Salamanca»). Consecuencia en los informes: 5 jugadores por equipo y minutos «no calculables» en la provincia
que más nos importa. Ahora «sala» tiene que ser palabra entera (el catalán «ALEVÍ SALA» sigue funcionando).
Prueba: `packages/canonico/test/modalidad-nombre.test.ts`.
Lo ya importado no se corrige solo: `scripts/servidor/corrige-modalidad-sala.sh` enseña qué ediciones
cambiarían y sólo con `--aplicar` las corrige (misma regla que el código, en una transacción).

**Pendiente para un fútbol sala completo** (sin fuentes nuevas):

1. Modalidad por **dato de la fuente**, no sólo por nombre: RFFM la trae en `tipojuego` (3 = sala), iSquad en
   la superficie/competición. Hoy la modalidad sólo sale del nombre y con confianza 0,8.
2. Acta de sala: faltas acumuladas por parte, tiempos muertos, portero-jugador, cambios ilimitados (el parser
   ya reconoce el formato «5+9»). No hay columnas para faltas acumuladas: haría falta migración nueva.
3. RFEF 2ª y 2ªB de sala están en `resultados.rfef.es`, que bloquea el acceso automático: quedan fuera
   mientras no haya permiso. La 3ª División y la Primera Femenina de sala van por las territoriales: ya entran.

## 4. Cómo encaja en el canónico (propuesta, sin tocar migraciones aplicadas)

El esquema es de fútbol: `core.federation.adaptador in ('pnfg','isquad','fcf','ninguno')`,
`competition_edition.modalidad` con valores de fútbol y los partidos con goles. Propuesta para una migración
nueva (0023+), **no escrita todavía**:

- `core.deporte` (`futbol`, `baloncesto`, `voleibol`, `tenis`) y `deporte_id` en `competition_edition`
  (por defecto `futbol`, así nada de lo existente cambia).
- `core.federation` pasa a **entidad organizadora** con `tipo` (`federacion`, `liga_privada`, `municipal`)
  y deporte; se amplía la lista de adaptadores (`gesdeportiva`, `feb`, `dataproject`, `serversports`,
  `datos_abiertos`).
- Marcador: `goles_local/visitante` sirve de tanteo para baloncesto; el voleibol necesita **parciales por
  set** (`marcador_detalle jsonb`: `[[25,21],[23,25],…]`) y el tenis es **individual** (jugador contra
  jugador, sets y juegos), que no cabe en `team_entry`: se deja el último.
- Estadística individual por deporte en tablas propias (box score de baloncesto: puntos, rebotes, faltas…;
  voleibol: puntos por fundamento). Nada de columnas de fútbol reutilizadas con otro significado.
- Menores: **la misma política que en fútbol** (no se publican nombres de menores; en base, agregados de
  equipo). En tenis el ranking Sub-16/Sub-18 es de personas menores: no se guarda con nombre.

## 5. Estado (30/09/2026, 23:30)

1. ✅ Fallo de modalidad (Salamanca → «sala») corregido; el canónico actual no tiene ediciones dañadas.
2. ✅ Motor común (`motor.mjs`) + CLI + supervisor (`supervisor-multideporte.mjs`, tarea «FACyLF multideporte»).
   Las respuestas malas se cuentan **por sitio**: un dominio caído se aplaza una hora sin parar a los demás.
3. ✅ Enlace de vigilancia (tarea «FACyLF enlace Claude», cada 10 min): fotos del PC y del servidor y consultas
   de solo lectura en `estado/claude/`.
4. ✅ Sondeo profundo hecho: todas las plataformas grandes sirven HTML sin JavaScript salvo MyGol, Playooz y
   OWBasket (SPA → hay que sacar su API) y el pádel de la FEP (la URL de prueba dio 404).
5. ✅ **Adaptador iSquad** (`isquad-balonmano`, `isquad-voleibol`): navegación territorial → categoría →
   competición → grupo → jornadas, partidos con marcador y parciales; clasificaciones y actas PDF como
   evidencia. Probado en real: 50 páginas, 0 fallos, 130 categorías de balonmano y 37 de voleibol descubiertas.
6. ✅ **Adaptador ServerSports** (27 ligas de fútbol aficionado): campeonatos → situación → calendario completo
   de cada equipo → ficha de los partidos jugados. Probado en real: 7 dominios no responden (caídos o con
   certificado inválido; no se fuerza) y 2 sin campeonatos publicados; el resto encola bien.
7. ⏳ **FEB Baloncesto en Vivo**: el box score está en HTML (`Partido.aspx?p=N`), pero grupos y temporadas se
   eligen por «postback» de ASP.NET: el motor necesita peticiones POST con `__VIEWSTATE`. Es lo siguiente.
8. Después: iSquad tenis (lo dinámico va por AJAX), FEB autonómicas, Gesdeportiva, MyGol, pádel, lectura de
   actas PDF (balonmano: goles y sanciones por jugador) y el modelo canónico multideporte (§4).
9. Clupik/Leverade y Competize: pedirles acceso.

**Importador del servidor (fútbol):** la imagen es del 23/09 y no tiene el arreglo del 25/09; los grupos de
Andalucía 2025-26 entran enteros pero se cuentan como fallo y se repiten (15-20 min cada vez). Arreglo sin
reiniciar nada: `node scripts\claude\ejecuta-en-servidor.mjs scripts\servidor\actualiza-importador.sh`.
Aragón 2026-27: la clasificación oficial trae equipos que aún no han jugado («CALATORAO-AYTO.») y el
validador la rechaza; es la política de tabla oficial ya conocida, no un fallo nuevo.

## 5 bis. Avance del 01/10/2026 (mañana)

| adaptador | estado | prueba real |
|---|---|---|
| `isquad-balonmano` / `isquad-voleibol` | en marcha en el PC (tarea «FACyLF multideporte») | 200+200 páginas, 0 fallos; descubriendo competiciones y grupos |
| `serversports` | en marcha | 1.070 partidos en la primera sesión; 6 dominios caídos aplazados solos |
| `feb` (baloncesto nacional no profesional) | listo; entra con `reiniciar-multideporte.ps1` | 30 páginas, 0 fallos, 2.018 partidos; grupos por *postback* (POST) |
| `mygol` (29+ ligas aficionadas, API JSON) | listo; entra con `reiniciar-multideporte.ps1` | 25 páginas, 0 fallos, 2.116 torneos |

**Sondeo con navegador** (`sondeo-navegador.mjs`, Chrome sin cabeza que graba las llamadas de red): APIs
encontradas para MyGol, Playooz (`api.playooz.com`), iSquad tenis (`tenis.isquad.es/json/api/call.php/...` y
`json/ranking.php`), FTM tenis (`/app/api/portal.do`), FTCV tenis (`pistacentral.com.es/apiPistacentral/...`) y
voleibol de Madrid (`intranet.fmvoley.com/api/competiciones/...`). Sin API visible (HTML o iframes): FBM, FAB,
FEGABA, FAVoley. **La FCBQ (basquetcatala.cat) bloquea los navegadores automáticos**: no se esquiva.

**⚠ Datos personales en una API pública de tenis:** `competicion/inscritos/datatable` de iSquad devuelve DNI,
correo, teléfono y fecha de nacimiento de cada inscrito, también de niños. **No se recoge ni se guarda** (las
muestras del sondeo se han limpiado y el sondeo y el motor retiran DNI y correos de toda evidencia). Conviene
avisar a la RFET / Toools.

**Importador del servidor:** con el arreglo copiado siguen saliendo «fallos» en Andalucía: cada grupo tarda más
de 20 min (el corte) con el servidor a carga 14. Cambio preparado en `importar-masivo.mjs`: corte a 60 min
(configurable), se mata también al `tsx` hijo y el motivo dice código/corte/«entró entero». Propuesta aparte
(decide David): `cpu_shares` del importador de 256 a 1024 (`prioridad-importador.sh`).

## 5 ter. Avance del 01/10/2026 (mediodía)

- **Tenis iSquad** (`isquad-tenis`): calendario por federación → partidos por campeonato (POST). Prueba real:
  30 peticiones, 0 fallos, **2.656 torneos** descubiertos. Menores sin nombre (seudónimo no reversible); nunca
  licencias, fotos ni el endpoint de inscritos.
- **Voleibol de Madrid** (`fmvoley`): API JSON encadenada (tipo → competición → división → fase → grupo →
  jornada → partidos + clasificación). Prueba real: 40 peticiones, 0 fallos.
- Ambos añadidos a `adaptadores-activos.json` (el supervisor los arranca solo cuando se reinicie una vez con
  el código nuevo: `reiniciar-multideporte.ps1`).
- **Tenis Madrid/Cataluña (plataforma «Avanza», `api/*.do`)**: identificados los servicios (torneo, ranking,
  clasificación, jugador); falta el nombre exacto del servicio de torneos (`torneo.do` no existe).
- Limpieza: 13 páginas guardadas con correos/DNI limpiadas; motor y sondeos ya los retiran al guardar.
- Herramientas: `extrae-apis.mjs`, `contexto-api.mjs`, `prueba-llamada.mjs`, `limpia-evidencias.mjs`.

## 5 quater. Avance del 01/10/2026 (tarde)

- **Baloncesto Gesdeportiva** (`gesdeportiva`, nuevo; sustituye al `fbm` de la mañana): páginas ASP.NET con
  desplegables encadenados por «postback» (temporada → delegación → competición → categoría → fase → grupo, los
  que haya); la pestaña CALENDARIO del grupo trae todas las jornadas con marcador, fecha, hora y pista. Sitios:
  **Madrid (FBM), Canarias (desde 2023; tienen 47 temporadas), Melilla, Asturias y Extremadura**. Pruebas reales:
  FBM 45 peticiones → 2.624 partidos; Canarias 22 → 1.022. Fuera: competiciones FEB, Endesa/ACB e internacionales.
  Sólo equipos. **Murcia no**: oculta equipos y marcadores con `decodificar("&#…;")` (medida contra la lectura
  automática): no se descifra; decide David. FBM tiene además «Temporadas anteriores» en otra página (pendiente).
  El motor admite ya `identidad` en los POST (el __VIEWSTATE cambia entre visitas y duplicaba páginas) y
  `cabeceras` por adaptador.
- **ServerSports, temporadas pasadas**: el «postback» del menú de temporada funciona (Futormes 2023: 8 campeonatos
  con ids distintos). Entra en el adaptador `serversports` desde 2023 cuando se reinicie el supervisor.
  Pendiente comprobar si la etiqueta del menú («2023») es la temporada 2022-23 o la 2023-24.
- **OWBasket** (`owbasket`, nuevo; Optimal Way Consulting, API «ESB» en base64, sin sesión, clave pública escrita
  en cada web): **Valencia, Castilla y León (con sus 9 delegaciones provinciales), Rioja, Castilla-La Mancha,
  Navarra, Baleares y País Vasco**. Zonas → categorías por zona y temporada (desde 2023; FBCyL guarda desde 2016)
  → grupos → `FCBQWeb/getAllGamesByGrupWithMatchRecords/{grupo}` (todas las jornadas con marcador, parciales,
  pista y clasificación en una petición; sin datos de personas). Prueba real: 30 peticiones, 0 fallos, 617
  registros. La primera prueba se colgó: el filtro de correos del motor era cuadrático con textos largos sin
  espacios (1 MB de base64 → ~35 min). Corregido (longitudes acotadas) y el enlace mata ahora el árbol entero de
  procesos cuando corta una petición. Sus subdominios `competiciones.*` tienen el certificado caducado (no se
  fuerza); el ESB tiene uno válido.
- **Playooz** (Ligas Fútbol Siete): API limpia (`event/web/list` → `rounds` → `groups` → `fixtures`/`standings`/
  `result/matches`, cabecera `X-Tenant-Host`). Las dos ligas 2026-27 aún no han empezado y la web no lista
  temporadas pasadas: se vuelve en noviembre.
- **Tenis Madrid/Cataluña (Avanza) y Valencia (Pista Central): APARCADOS por privacidad.** Sus servicios públicos
  de consulta devuelven, sin iniciar sesión, los inscritos con **DNI, fecha de nacimiento, móvil y correo, también
  de menores** (Avanza: `pruebasTorneo`; Pista Central: ficha del torneo). Los ficheros de exploración se han
  limpiado y no se vuelven a pedir. Recomendación: avisar a FTM, FCT, FTCV y a los proveedores (como con iSquad).
  Además, el calendario de Avanza sólo lista torneos en curso o futuros.
- **Baloncesto de Andalucía (FAB)**: mismo tipo de web que FBM, pero responde **403 a peticiones automáticas**
  (sólo deja pasar navegadores): no se esquiva. Queda para pedir acceso, como la FCBQ.

**Baloncesto autonómico, recuento:** con adaptador escrito, **11 de 17 comunidades** (Gesdeportiva: Madrid y
Canarias con datos ya en prueba real; Asturias con la estructura comprobada pero sin calendarios publicados aún;
Extremadura pendiente de la página de la temporada actual; Melilla vacía esta temporada. OWBasket: Valencia,
Castilla y León, Rioja, Castilla-La Mancha, Navarra, Baleares y País Vasco). Aragón y Cantabria van por FEB autonómicas (adaptador pendiente).
Sin acuerdo no entran Cataluña (FCBQ bloquea la automatización), Andalucía (FAB, 403) y Murcia (ofuscada).
Galicia (FEGABA): widget de Gesdeportiva, por estudiar. El nacional no profesional ya entra por `feb`.

## 5 quinquies. 02/10/2026: carriles, calidad de lo extraído y adaptadores nuevos

**Carriles en el motor** (`motor.mjs`, con pruebas). Un adaptador con varios sitios puede pedir a varios a la vez
(`carriles: N`), pero **nunca dos peticiones al mismo sitio** y cada sitio y cada carril siguen esperando 5-8 s
entre petición y petición: ningún sitio recibe más que antes. Las respuestas malas siguen contando por sitio
(tres seguidas → ese sitio espera una hora). Activado en: `serversports` 3 (cada liga es un dominio),
`gesdeportiva` 3 (cada federación es un dominio) y `mygol` 2 (subdominios). El resto, 1 (un único sitio).

**Control de calidad** (`scripts/multideporte/calidad.mjs`, sólo lectura): por adaptador, qué parte de los
partidos trae fecha, los dos equipos y marcador, y qué claves usa. Primera pasada (02/10):

| adaptador | fecha | equipos | marcador | lectura |
|---|---|---|---|---|
| totalfutbol | 100 % | 100 % | 99 % | bien |
| lapreferente | 92 % | 100 % | 91 % | bien |
| gesdeportiva | 98 % | 100 % | 68 % | bien (lo que falta es lo no jugado) |
| owbasket | 100 % | 100 % | 36 % | bien (temporada empezando) |
| mygol | 100 % (`inicio`) | 100 % | 91 % | bien |
| apuntamelo | 99 % | 100 % | 30 % | bien (temporada empezando) |
| isquad-voleibol | 80 % | 100 % | 79 % | bien |
| isquad-balonmano | 20 % | 100 % | 9 % | bien: son jornadas futuras de 2026-27 aún sin fecha |
| isquad-tenis | 100 % | 32 % | 84 % | bien: en menores no se guarda el nombre (por diseño) |
| feb | 43 % | 100 % | 57 % | a mirar: partidos jugados sin fecha en el calendario (la fecha está en el box-score) |
| **fmvoley** | **0 %** | **0 %** | **0 %** | **corregido**: sólo guardaba el crudo. Ahora normaliza fecha, hora, pabellón, equipos con id, sets y parciales; sin finalizar no hay marcador (la API pone 0-0) y «DESCANSA…» se marca como descanso. Falta releer lo ya bajado con `reinterpreta.mjs --adaptador fmvoley --tipo partidos` |

`_html.mjs` decodifica ya las entidades con nombre del castellano y el catalán (`&aacute;`, `&ntilde;`…).

**Adaptadores nuevos de fútbol aficionado** (con pruebas):
- `mytorneo`: myTorneo (hoy sólo Cáceres, veteranos F7). Portada → provincias → ligas → jornadas, cruzando
  horarios y resultados. Sin jugadores (robots los excluye).
- `siguetuliga`: ligas de usuarios del agregador (≈ 340 de 1.552 tras filtrar: veteranos, ligas locales, peñas,
  F7, sala local…; fuera menores y otros deportes). Sólo URLs sin `?` (robots).
- Aparcado: el software municipal «vercompeti.php» (Palencia, Fuenlabrada, UAM): carga los datos por POST con
  CSRF-Protector y la temporada de Palencia aún sale vacía; se vuelve cuando haya datos para probar.

## 5 sexies. 05/10/2026: baloncesto autonómico con histórico (FEB «autonómicas»)

**`febauto`** (nuevo, con pruebas): la web antigua de la FEB donde las federaciones autonómicas publican (o
publicaban) sus competiciones, **con histórico desde 2004/05** — 20 federaciones (`a=`): Andalucía, Aragón,
Asturias, Baleares, Canarias, Cantabria, CyL, CLM, Extremadura, Galicia, Madrid, Melilla, **Murcia**, Navarra,
La Rioja, Valencia, País Vasco, Huesca, Zaragoza y Bizkaia. Temporadas por «postback» (los `c` de competición son
de cada temporada), calendario por GET con 10 jornadas por página («Jornadas posteriores» por postback) y los
demás grupos por postback. Sólo marcadores (no hay página de partido). **Fuera las nacionales** (LF, LEB, EBA,
Segunda/Tercera FEB, Copa de España…): salen repetidas en cada federación y las no profesionales ya entran por
`feb`. Importa sobre todo por **Murcia y Andalucía** (sus webs actuales están ofuscadas o bloquean) y por el
**histórico regional** de Aragón, CyL, Valencia, Rioja, País Vasco… Sondeo real: Aragón 2015 → 26 categorías;
Murcia 2010 → 18 (de pre-infantil a veteranos). Prueba real del adaptador: 40 páginas, 0 fallos, 481 calendarios
y 257 temporadas encolados. En `adaptadores-activos.json`.

**Actas PDF de balonmano** (pendiente): ya hay 1.716 descargadas como evidencia (`isquad-balonmano/evidencias/acta`).
Se leen bien con `pdftotext -layout` (cabecera, fecha, pabellón, árbitros, goles cada 5 min); falta un lector en
Node (o `pdftotext` en el PC) y decidir el tratamiento de menores antes de extraer jugadores.

## 5 septies. 05/10/2026 (tarde): menores, actas de balonmano y archivo en otro disco

**Decisión de David: se recoge todo, también de menores** (instancia privada; **no se publica**). En el
multideporte cambia esto (los partidos de base siguen marcados `menores: true` para que la capa que publique no
enseñe nombres):
- `serversports`: la ficha guarda también los jugadores de categorías de base.
- `feb`: el box score de los campeonatos de base guarda también los nombres.
- `isquad-tenis`: los partidos de menores llevan nombre (y el id del jugador, además del seudónimo).
- `siguetuliga`: entran también las ligas de menores (escolar, biberones, benjamín…): 400 ligas en vez de 325.
- **No cambia**: nunca se pide el endpoint de inscritos del tenis (DNI, teléfonos, fechas de nacimiento), y
  Avanza y Pista Central siguen aparcados por lo mismo. Ni DNI ni correos en ninguna evidencia.

**Lector de actas de balonmano** (`adaptadores/_acta-balonmano.mjs`, sin librerías: el PDF de TCPDF se lee
descomprimiendo sus flujos con zlib y colocando cada texto por coordenadas). Por acta: equipos y marcador,
fecha, hora, pabellón, y por jugador dorsal, cupo adicional, goles, amonestación, exclusiones de 2' y
descalificación (con su minuto), más técnicos, árbitros y delegado. Comprueba que la suma de goles cuadra con el
marcador. **Medido sobre las 1.716 actas ya descargadas: 0 errores, 32.224 jugadores, 1.117 cuadran exactas, 119
no** (actas que la propia federación publica incompletas, p. ej. un solo jugador con 19 goles) **y 487 vienen
sin alineaciones** (amistosos «EQUIPO FICTICIO»). El motor pasa ahora los bytes (`bruto`) a los lectores, y
`reinterpreta.mjs` también.

**Archivo en otro disco sin enlaces** (`scripts/multideporte/archivo.mjs`): si existe
`scripts/multideporte/archivo.json` con `{ "raiz": "E:\\facylf-archivo\\descargas-multideporte" }`, las
evidencias nuevas se escriben allí y las antiguas se siguen encontrando en su sitio (quien lee busca en las dos).
Sin ese fichero, todo igual que antes. Así la mudanza del multideporte no necesita `mklink`: se crea el JSON, se
reinicia, y lo ya guardado se copia a E: con calma (verificando) y sólo después se borra el original.

**Para aplicarlo**: `scripts/multideporte/aplica-menores-y-actas.ps1` (para los recolectores, relee desde la
evidencia actas de balonmano, fichas de ServerSports, box scores de la FEB, partidos de tenis y el sitemap de
siguetuliga, y los vuelve a lanzar).

## 6. Decisiones

- ✅ Acceso: mismo criterio que el fútbol (David, 30/09/2026).
- ✅ Menores: misma política que el fútbol (no se publican nombres de menores).
- Pendiente: el modelo del tenis y el pádel (partidos individuales y de parejas) cuando se llegue a ellos.
