# Plataformas de publicación de datos: baloncesto y voleibol territorial (España)

Fecha de consulta: 30/09/2026. Solo búsquedas y lecturas de páginas sueltas, sin scraping ni login.

Limitaciones de la investigación:
- Hacia el final el proxy de WebFetch devolvió 429/403 y "budget". Varias entidades quedan por tanto "(sin verificar)".
- WebFetch respeta robots.txt. Cuando devuelve "ROBOTS_DISALLOWED" no siempre es una prohibición real: a veces era un fallo al leer el robots.txt (SSL caducado, timeout, 503).
- No he revisado los Términos de Uso / Aviso Legal de ninguna plataforma. Es una tarea pendiente antes de construir adaptadores.

---

## 1. BALONCESTO

### 1.1 Hallazgo principal
Hay dos plataformas dominantes, más un grupo de sistemas propios.

**A) FEB "Competiciones" (ASP.NET, alojada por la FEB).** Aloja los resultados de varias federaciones autonómicas bajo un mismo patrón de URL:
`competiciones.feb.es/autonomicas/{Resultados|Calendarios|Equipos}.aspx?a={idFFAA}&c={idCompeticion}&med=0`

Los `a=` que he visto:

| `a=` | Entidad |
|---|---|
| 2 | Andalucía |
| 3 | Aragón |
| 5 | Baleares |
| 7 | Cantabria |
| 9 | Castilla y León |
| 12 | Extremadura |
| 14 | Madrid |
| 17 | Navarra |
| 18 | La Rioja |
| 30 | Huesca |
| 32 | Zaragoza |
| 71 | Bizkaia |

- Los `a=` de Zaragoza y Huesca vienen del enlace de FAB (fabasket.com/resultados).
- Los demás salen de resultados de búsqueda y no he visto la página de cada una.
- Estado: el de Aragón muestra temporada actual (Copa Aragón, ligas regionales, sociales). El de Madrid mostraba una LF-2 de 2019/20, así que es un archivo antiguo; en CyL solo vi competiciones FEB (Copa España, Primera/Segunda/Tercera FEB), no las regionales. Hay que verificar qué entidades siguen activas.
- Datos en `/autonomicas`: resultados, clasificación, calendarios, equipos, próximos partidos, rachas. No vi estadística individual ni acta en esas páginas.

**B) FEB "Baloncesto en Vivo" / Competiciones FEB (`baloncestoenvivo.feb.es`, `competiciones.feb.es/estadisticas/`).**
- Aloja las competiciones FEB. Puestos de escala amateur: Liga EBA, Tercera FEB, LF-2, Segunda FEB, Liga U, y categorías base de Campeonatos de España (Mini, Infantil, Cadete, Junior). Los resultados de la temporada 2025/26 están indexados.
- Patrones de URL:
  - `baloncestoenvivo.feb.es/resultados/ligaeba/{jornada}/{temporada}`
  - `.../resultados/tercerafeb/...`
  - `.../estadisticas/ligaeba/...`
  - `competiciones.feb.es/estadisticas/partido/{id}`
  - `.../estadisticas/BoxScore.aspx?p={id}`
- Datos: resultados, calendario, rankings y estadísticas. Los enlaces a página de partido con box score están confirmados en Primera FEB, LEB Oro y por indexación de BoxScore. Para Liga EBA y Tercera FEB deducido, sin verificar.
- Pie legal: Política de privacidad, cookies y Aviso Legal de la FEB.

**C) Gesdeportiva (Indalweb, Almería).** Es un sistema específico de baloncesto: gestión de licencias, competiciones, acta digital, estadísticas, OTT. Fuente: https://www.gesdeportiva.es/es/. Es la plataforma con más federaciones en la muestra.

### 1.2 Tabla baloncesto

| Entidad | Plataforma | URL ejemplo | Datos públicos | Robots / notas |
|---|---|---|---|---|
| FEB (Liga EBA, Tercera FEB, LF2, base nacional) | FEB Competiciones (propia) | https://baloncestoenvivo.feb.es/resultados/ligaeba/57/2025 | Resultados, calendario, rankings, estadísticas y página de partido | robots.txt de baloncestoenvivo y competiciones.feb.es: 404. `www.feb.es/robots.txt` solo tiene `Mediapartners-Google: Allow /`. ToS sin verificar |
| Galicia (FEGABA) | Gesdeportiva (widget iframe) | https://fegaba.com/es/resultados-y-clasificaciones/ (iframe `widgetsfegaba.gesdeportiva.es/widget/informacion/general-delegacion/1`) | Resultados y clasificación; acta y estadística probables, sin verificar | fegaba.com robots: `Disallow:` vacío, sitemap Yoast |
| Canarias (FCB) | Gesdeportiva | https://gesdeportiva.fcbaloncesto.es/competiciones-6/FederacionCanaria (enlazado desde fcbaloncesto.es) | Resultados y clasificación | Web WordPress; robots sin revisar |
| Asturias (FBPA) | Gesdeportiva (crédito en pie) | https://www.fbpa.es/competicion-17432/ | Resultados y clasificación | robots.txt: permite todo excepto rutas técnicas y de cliente. También enlaza a fbcyl.es para la 1ª Nacional femenina |
| Murcia (FBRM) | Gesdeportiva / Indalweb (crédito en pie) | https://www.fbrm.org/competicion-430/la-fede- ; https://www.fbrm.org/resultados-clubes | Resultados, clasificación, resultados por club | robots sin revisar |
| Madrid (FBM) | Gesdeportiva (software de gestión desde 2018, acta digital desde 2025/26, FBMTV/OTT). Ha usado también NBN23 (sin verificar el alcance) | https://www.fbm.es/es/horarios-y-resultados | Resultados y clasificación. Estadística por partido vía acta digital, sin verificar | El fetcher fue bloqueado por robots.txt, no pude leerlo. Asumir restrictivo hasta verificar. Fuente: https://www.gesdeportiva.es/es/noticia-7611/la-federacion-de-baloncesto-de-madrid-usara-nuestra-acta-digital-a-partir-de-la-proxima-temporada-20252f2026 |
| Andalucía (FAB) | Indalweb/Gesdeportiva (dice ser "proveedor tecnológico"; acta digital propia). Además figura `a=2` en FEB | https://www.andaluzabaloncesto.org/es/resultados-clubes ; https://competiciones.feb.es/autonomicas/resultados.aspx?a=2 | Resultados, clasificación, resultados por club | La página principal fue bloqueada por robots para el fetcher (sin verificar el contenido). Fuente: https://www.andaluzabaloncesto.org/almeria/delegacion-noticia-4-24009/indalweb-seguir%C3%A1-siendo-el-proveedor-tecnol%C3%B3gico-de-la-fab.aspx |
| Castilla y León (FBCyL) | Muy probablemente Gesdeportiva. Patrón `/competiciones/resultados/5430`, sin verificar. También figura `a=9` en FEB | https://www.fbcyl.es/competiciones/resultados/5430 | Resultados y clasificación (sin verificar el detalle) | robots.txt: no pude leerlo (proxy) |
| Castilla-La Mancha (FBCLM) | Probable Gesdeportiva ("Acta Digital" en `actadigital.fbclm.net`), sin verificar | https://fbclm.net/resultados-y-clasificaciones/ | Resultados y clasificación | robots.txt: solo bloquea `/wp-admin/` (admin-ajax permitido) |
| Aragón (FAB) | FEB `autonomicas` (a=3; Zaragoza a=32; Huesca a=30) + otros: Teruel (deportescomarcateruel.es), Huesca minibasket (v3.hoyadehuesca.es) | https://competiciones.feb.es/autonomicas/?a=3 ; https://fabasket.com/resultados/ | Resultados, clasificación, calendarios, equipos, rachas | Un solo sitio cubre la comunidad más provincias, pero con fragmentos externos |
| Cantabria (FECAN) | FEB `autonomicas` (a=7), enlaces "En vivo FEB". Existe además un portal `competicionesfecan.optimalwayconsulting.com` (no accesible) | https://www.fecanbaloncesto.com/resultados-y-clasificaciones/ | Resultados y clasificación | Web WordPress. Portal optimalway: robots 503 en el momento |
| Extremadura (FExB) | FEB `autonomicas` (a=12) | https://competiciones.feb.es/autonomicas/resultados.aspx?a=12 | Resultados y clasificación | (sin verificar la vigencia) |
| Navarra (FNB) | FEB `autonomicas` (a=17) + web propia (Hispatek) con "Competiciones FEB" | https://www.fnbaloncesto.com/resultados-y-clasificaciones/ | Resultados y clasificación (sin verificar) | Crédito Hispatek (solo la web) |
| La Rioja (FRB) | FEB `autonomicas` (a=18) | http://competiciones.feb.es/autonomicas/Resultados.aspx?a=18&c=14631&med=0 | Resultados y clasificación | (sin verificar la vigencia) |
| Baleares (FBIB) | FEB `autonomicas` (a=5) + posible portal propio `competiciones.fbib.es` (certificado caducado al consultarlo; hay app FBIB) | https://competiciones.feb.es/autonomicas/resultados.aspx?a=5 ; https://competiciones.fbib.es/ | Resultados y clasificación (sin verificar) | Portal FBIB con SSL caducado: revisar antes de usarlo |
| Cataluña (FCBQ) | Sistema propio, sin verificar el proveedor (app "Bàsquet Català" con resultados y estadísticas oficiales) | https://www.basquetcatala.cat/competicions (403 al consultarlo) | Resultados, clasificación y estadística individual (hay datasets abiertos de estadística de jugadores 22/23 en Zenodo: https://zenodo.org/records/7854972) | robots.txt: permite `/apps/web/continguts/`, `/apps/web/vistes/`, `/apps/web/templates/`, `Disallow: /access-denied`; sitemap. Ojo: Playoff Informàtica menciona a la Federació Catalana de Basquetbol entre sus clientes (https://playoffinformatica.com/software-federaciones-deportivas/), sin confirmar para qué módulo |
| Comunitat Valenciana (FBCV) | Sistema propio (WordPress + backend `aw3.fbcv.es`, sin verificar el proveedor) | https://www.fbcv.es/competiciones/calendario-resultados-y-clasificacion/ | Calendario, resultados y clasificación | robots sin revisar |
| Bizkaia (FVB) | Sistema propio en `asp.bizkaiabasket.com` (designaciones) + entrada FEB a=71 | https://bizkaiabasket.com/es/resultados-y-clasificaciones/ ; https://competiciones.feb.es/autonomicas/Resultados.aspx?a=71&c=5789 | Resultados y clasificación | robots sin revisar |
| Gipuzkoa | Portal Kirolak.net de la Diputación, sin verificar | https://kirolak.gipuzkoa.eus/es/competiciones.asp?deportetmp=baloncesto ; https://www.gisaski.eus/es/competicion/resultados-clasificaciones/ | Resultados y clasificación (sin verificar) | Robots no accesible (timeout) |
| Araba y Federación Vasca | (sin verificar) | https://basketbasko.com/es/federacion-vasca-de-baloncesto/ | (sin verificar) | (sin verificar) |

### 1.3 Ranking de plataformas (baloncesto)

| Plataforma | Federaciones (cobertura observada) | Confianza |
|---|---|---|
| FEB "Competiciones" `/autonomicas` (ASP.NET, `a=`) | Andalucía, Aragón (+Zaragoza, Huesca), Baleares, Cantabria, CyL, Extremadura, Madrid (archivo), Navarra, Rioja, Bizkaia: unas 10 entidades con `a=`. Ojo: varias pueden estar en desuso, solo con competiciones FEB | Media. Existencia del `a=` verificada por búsqueda; vigencia y contenido por entidad no |
| Gesdeportiva / Indalweb | Galicia, Canarias, Asturias, Murcia, Madrid, Andalucía verificadas por pie/enlace/noticias; CyL y CLM probables. Unas 6 confirmadas, 8 con probables | Alta para las confirmadas |
| FEB "Baloncesto en Vivo" | FEB nacional (Liga EBA, Tercera FEB, LF2, base nacional) | Alta |
| Sistemas propios | Cataluña, Valencia, Bizkaia, y posiblemente Baleares y Gipuzkoa | Media |

Consecuencia: dos adaptadores (FEB `autonomicas`/`estadisticas` y Gesdeportiva) cubrirían la mayoría de las federaciones; Cataluña y Valencia requerirían adaptadores propios.

---

## 2. VOLEIBOL

### 2.1 Hallazgos principales
- **iSquad "Resultados Voleibol" (Toools Development):** `resultadosvoleibol.isquad.es`. Publica resultados y actas de competiciones de la RFEVB y de varias territoriales: Cataluña (`id_territorial=17`), Galicia y Aragón (menciones en la propia página). Otro territorial (`id_territorial=20`) aparece con "1ªdiv. senior f" pero no lo he identificado. También hay "1ª div. nacional femenina - liga regular" (nivel Primera Nacional) en iSquad.
  - Patrón: `competicion.php?id_superficie=1&seleccion=0&id_territorial=17&id_categoria=..&id_competicion=..`, `calendario.php?...`, `clasificacion.php?...`.
  - Datos públicos: resultados, actas, clasificación, sedes, árbitros, estadística por equipo y partido. Incluye categorías escolares/juveniles (infantil, cadete...). Fuente: https://resultadosvoleibol.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=17
  - Existe un dominio hermano `resultados-voleibol.isquad.es` (sin verificar).
  - robots.txt: 404 (sin restricciones declaradas). Además muestra un aviso de bloqueador de publicidad.
  - Aragón (FAVB) enlaza allí y el pie dice "Desarrollado por TOOOLS": https://favb.es/
- **Data Project (RFEVB):** `rfevb-web.dataproject.com/CompetitionHome.aspx?ID=153` (Superliga Masculina 2 25-26). Muestra clasificación, encuentros, estadística individual (puntos por set, saque, bloqueo, recepción, ataque) y matriz de resultados. Pie "Web Competition Site © 2026 Data Project Sport Software". robots.txt: `Disallow:` vacío. Es la plataforma de Superliga/Superliga 2; Primera División nacional está listada en esvoley.es, el sitio nuevo de la RFEVB (antes rfevb.com). No confirmé si la 1ª Nacional va en Data Project o en iSquad.
- **Sitios propios o de otros proveedores:** Extremadura usa VScorer ("Impulsado por VScorer", https://fedexvoleibol.com/clasificaciones). Andalucía tiene un "Portal público" con acta electrónica (`favoley.net`, "STL") y usó Federatio (`favoley.federatio.com`). Madrid tiene buscador de resultados en su web (desarrollo Fontventa), y el sitio de la RFEVB también es de Fontventa.

### 2.2 Tabla voleibol

| Entidad | Plataforma | URL ejemplo | Datos públicos | Robots / notas |
|---|---|---|---|---|
| RFEVB Superliga 2 (M/F) | Data Project | https://rfevb-web.dataproject.com/CompetitionHome.aspx?ID=153 | Clasificación, encuentros, estadística individual, matriz de resultados. Acta/box: sin verificar | robots: sin restricciones. `esvoley.es/robots.txt` bloquea solo `/umbraco/`, `/RFEVB/`, `/support/` |
| RFEVB Primera División Nacional | iSquad (probable) o Data Project (sin verificar) | https://resultadosvoleibol.isquad.es/competicion.php?id=1937&seleccion=0 | Resultados y clasificación; actas | robots iSquad: 404 |
| Cataluña (FCVB) | iSquad (`id_territorial=17`) | https://resultadosvoleibol.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=17 | Resultados, clasificación, actas, categorías base | Las categorías incluyen infantil y cadete |
| Galicia (FGVB) | iSquad (con provincias A Coruña, Lugo, Ourense, Pontevedra) | https://resultadosvoleibol.isquad.es/competicion.php | Ídem | Copa Xunta, 1ª/2ª/3ª división autonómica |
| Aragón (FAVB) | iSquad (pie "TOOOLS") | https://favb.es/ | Ídem | Sin más verificación |
| Comunitat Valenciana (FVBCV) | "Plataforma virtual de gestión" nueva (sin identificar proveedor) | https://fvbcv.com/comunicado-importante-a-clubes-implantacion-plataforma-virtual-de-gestion-de-resultados-y-clasificaciones/ | Resultados y clasificación (sin verificar) | (sin verificar) |
| Madrid (FMVB) | Web propia (Fontventa) con "buscador de resultados". `todovoleibol.com/madrid/...` aparece como fuente de equipos y clasificaciones, sin verificar | https://fmvoley.com/clasificaciones-y-resultados | Resultados y clasificación | (sin verificar) |
| Andalucía (FAVB) | Federatio (`favoley.federatio.com`) y portal público `favoley.net` con acta electrónica (STL) | https://www.favoley.net/ | Resultados, standings, actas electrónicas | (sin verificar) |
| Extremadura | VScorer | https://fedexvoleibol.com/clasificaciones | Clasificaciones (sin verificar el detalle) | (sin verificar) |
| Castilla y León (FVCL) | Plataforma sin identificar. URLs `/es/team/{id}`, `/en/tournaments`. Copa CyL y regional juvenil | https://fvcl.es/en/tournaments | Equipos y competiciones | 429 al consultarla |
| Castilla-La Mancha (FVCM) | (sin verificar) | https://fvcm.es/competiciones-nacionales-2/ | (sin verificar) | robots no accesible (timeout) |

### 2.3 Ranking de plataformas (voleibol)

| Plataforma | Federaciones | Confianza |
|---|---|---|
| iSquad (Toools) | RFEVB (parte), Cataluña, Galicia, Aragón: unas 3 territoriales más la RFEVB | Alta para las tres territoriales |
| Data Project | RFEVB Superliga/SL2 | Alta |
| Federatio, VScorer, STL portal, desarrollos propios | 1 cada una (Andalucía, Extremadura...) | Media |
| Sin identificar | Valencia, Madrid, CyL, CLM | Sin verificar |

---

## 3. Riesgo de datos de menores

- Los portales publican categorías base (Mini, Infantil, Cadete, Junior en FEB; infantil/cadete en iSquad de voleibol) con nombres de jugadores y actas de personas menores.
- Que sean datos públicos no exime del RGPD y la LOPDGDD: la publicación por la federación se ampara en su competencia, pero su reutilización por un tercero necesita base jurídica propia, minimización y limitación de finalidad.
- Recomendación: excluir o seudonimizar jugadores menores de 18 años (en España el consentimiento propio se admite desde 14 años). Guardar solo agregados de equipo para categorías base, o el dorsal sin nombre. Revisar Aviso Legal y Política de Privacidad de cada plataforma antes de tratar datos individuales.
- Los datasets tipo Zenodo o terceros (por ejemplo Basquet Hero) muestran que hay precedente de reutilización de estadística de jugadores, pero no dan base legal.
- El riesgo de derechos de base de datos (derecho sui generis) y de ToS es aparte, y no está resuelto aquí.

---

## 4. Prioridad sugerida de adaptadores

1. FEB Competiciones/Baloncesto en Vivo: cubre Liga EBA, Tercera FEB, LF2 y base nacional, con box score.
2. Gesdeportiva (baloncesto): 6 federaciones confirmadas (Galicia, Canarias, Asturias, Murcia, Madrid, Andalucía).
3. FEB `autonomicas` (`a=`): unas 10 entidades, pero comprobar cuáles siguen activas y con qué contenido.
4. iSquad (voleibol): cubre RFEVB parcial, Cataluña, Galicia, Aragón y categorías base.
5. Data Project: Superliga 2.
6. Sistemas propios (FCBQ, FBCV): coste alto y bajo reuso.

## 5. Fuentes principales
- https://www.gesdeportiva.es/es/
- https://competiciones.feb.es/autonomicas/?a=3
- https://baloncestoenvivo.feb.es/resultados/ligaeba/57/2025
- https://fegaba.com/es/resultados-y-clasificaciones/
- https://www.fbpa.es/
- https://www.fbrm.org/
- https://fabasket.com/resultados/
- https://www.basquetcatala.cat/robots.txt
- https://www.feb.es/robots.txt
- https://fbclm.net/robots.txt
- https://resultadosvoleibol.isquad.es/competicion.php?id_superficie=1&seleccion=0&id_territorial=17
- https://rfevb-web.dataproject.com/CompetitionHome.aspx?ID=153
- https://rfevb-web.dataproject.com/robots.txt
- https://esvoley.es/robots.txt
- https://fedexvoleibol.com/clasificaciones
- https://favb.es/
- https://www.favoley.net/
- https://fmvoley.com/clasificaciones-y-resultados
- https://fvbcv.com/comunicado-importante-a-clubes-implantacion-plataforma-virtual-de-gestion-de-resultados-y-clasificaciones/
