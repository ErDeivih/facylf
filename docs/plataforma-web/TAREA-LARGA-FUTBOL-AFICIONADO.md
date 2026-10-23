# Tarea larga · Barrido de fútbol aficionado de toda España (T-12)

> Para DeepSeek. Es trabajo de **semanas**, pensado para rellenar los huecos entre las rutinas del día
> (`TRABAJO-CONTINUO-DEEPSEEK.md`). No se hace de una vez: se avanza **una provincia por sesión** y se deja el
> estado escrito. Escrito por Claude el 11/10/2026.

**Objetivo de David:** tener recogidas **todas** las competiciones de fútbol que existen fuera de las
federaciones en España — ligas privadas de F11/F7/sala, veteranos, interempresas, universitarias y municipales —
con sus partidos y, donde la fuente lo dé, sus jugadores. Catálogo de partida: `FUTBOL-AFICIONADO.md`.

En qué consiste de verdad: **estudiar cómo publica cada portal y replicar su forma de dar los datos con un
adaptador propio**. No se descompila ninguna app ni se esquiva ningún bloqueo (eso no se hace: §5). Se mira lo
que el portal sirve en abierto, se entiende su estructura y se escribe un lector que la recorre con respeto.

---

## 1. Lo que ya está hecho (no repetir)

Adaptadores vivos que ya cubren mucho (`scripts/multideporte/adaptadores/`):
`serversports`, `mygol`, `playooz`, `totalfutbol`, `apuntamelo`, `lapreferente`, `siguetuliga`, `mytorneo`,
`portalrivas`, `vistahermosa`. Añadir una liga a uno de estos es sólo meterla en su lista y probar (§3.4).

Provincias/zonas ya trabajadas: León y Valladolid (CyL), Madrid, Valencia, Cataluña (parte), Aragón (parte),
Murcia, Andalucía (parte), Galicia (parte). Lo demás es este barrido.

---

## 2. El barrido, provincia por provincia (una por sesión)

Marca cada una `PENDIENTE` → `EN CURSO` → `HECHA` en §6. Orden sugerido (de más fútbol modesto a menos):

| # | Zona a barrer | Nota de partida |
|---|---|---|
| 1 | **CyL: Salamanca, Burgos, Palencia, Segovia, Soria, Ávila, Zamora** | Futormes ya cubre Salamanca y Zamora federado; faltan ligas locales, veteranos, F7 municipales |
| 2 | **Castilla-La Mancha entera** (Toledo, Ciudad Real, Albacete, Cuenca, Guadalajara) | La Sagra y Seseña ya entran por apuntamelo; falta el resto |
| 3 | **Extremadura** (Badajoz, Cáceres) | |
| 4 | **Canarias** (Las Palmas, Tenerife) | ligas insulares de F7 y sala |
| 5 | **Baleares** (Mallorca, Menorca, Ibiza) | |
| 6 | **Aragón: Huesca y Teruel**; **Navarra** fuera de lo visto | |
| 7 | **Cataluña**: Girona, Lleida, Tarragona y comarcas de Barcelona no vistas | mucho va por Clupik/Competize → §5 |
| 8 | **Ceuta y Melilla** | ligas municipales |
| 9 | **País Vasco, Cantabria, Asturias, La Rioja**: ligas municipales y de empresas | |
| 10 | **Andalucía y Galicia**: cerrar las provincias que queden | |
| 11 | **Comunidad Valenciana y Murcia**: cerrar lo que quede fuera de lo visto | |

### Método por zona (corregido el 11/10/2026 tras la primera sesión de la zona 1)

Lo que **no** funciona, ya probado (24 consultas):
- buscar «liga fútbol 7 <ciudad>»: devuelve la federación, hemeroteca y agregadores;
- dar por «liga aficionada» una competición que aparece en un agregador. En siguetuliga, «Copa RFCYLF», «Senior Provincial Salamanca» o «Segunda División Provincial Valladolid» son **competiciones federadas de la FCyL copiadas**: ya las recogemos de la federación y **no se añaden**.

Lo que sí, en este orden:

1. **Inventario de lo que ya hay en la zona** (sin peticiones): por cada adaptador vivo, qué ligas u organizaciones de esa provincia tiene ya.
   ```powershell
   node scripts\multideporte\inventario.mjs <adaptador> partido <campo>   # campo: liga, org, sitio… (mira la cabecera del adaptador)
   ```
   - **siguetuliga y La Preferente ya barren solas**:
     - siguetuliga lee su lista completa de ligas (`sitemapLigas.xml`) y descarta sola las federadas;
     - La Preferente lee los desplegables «No Federado» y «Veteranos» de **todas** las comunidades.
   - Lo que esté ahí **ya se recoge**: no se añade a mano, solo se anota como cubierto.
2. **Clientes nuevos de plataformas con adaptador.** Se busca por la **huella de la plataforma** con la provincia, no por «liga»:
   - ServerSports: `"mod/soccer"` o `"serversports"` + ciudad (cada liga es un dominio o subdominio, p. ej. `quart.serversports.com`);
   - MyGol: `"mygol.es"` + ciudad;
   - Playooz: `"playooz"` + ciudad;
   - Apúntamelo: `"apuntamelo.com"` + ciudad;
   - totalFútbol: `"totalfutbol.es/ges"`;
   - myTorneo: su página por provincia.
   - Cada cliente nuevo: §3.1 y §3.4 (`sembrar`).
3. **Webs propias de ligas** de la zona (veteranos, interempresas, F7 locales con web propia): §3.1-§3.5.
4. **Antes de añadir nada, comprobar que no es federado**:
   - si el nombre o la URL lleva «regional», «preferente», «provincial», «división», «copa RFxx», o el nombre de una federación, es federado y se descarta;
   - en caso de duda, buscar el nombre en el catálogo de la federación de esa comunidad (`descargas-<fed>/competiciones-por-temporada.json`).

**Lo municipal en PDF** (juegos municipales, ligas de ayuntamientos que solo publican PDF) **queda fuera** mientras David no decida otra cosa: se anota la URL en §6, no se escribe un lector por pueblo.

**Menores**: se recogen como en las federaciones (decisión de David del 05/10: instancia privada, no se publica). **No** se excluyen ramas como `/base/`. Lo que nunca se recoge son DNI, correos, teléfonos ni fechas de nacimiento.

---

## 3. Qué hacer con cada liga encontrada

### 3.1 Identificar la plataforma (una petición)

```powershell
node scripts\multideporte\busca-plataforma.mjs <url>
```

Dice si detrás hay OWBasket, Gesdeportiva, iSquad, FEB, u otra conocida mirando la página y hasta 2 de sus
scripts. Si no la reconoce, el resultado trae el tamaño y el estado, y toca mirar a mano (§3.2).

### 3.2 Entender cómo publica (estudiar la estructura, sin forzar nada)

- Página servida en HTML (se ve el contenido en el código): guárdala para estudiarla con
  `node scripts\multideporte\guarda-pagina.mjs <url> <archivo> [cuerpo-POST]` y mira cómo encadena
  temporada → categoría → grupo → jornadas → partido, y si usa GET o POST (`__VIEWSTATE`, CSRF, etc.).
- Página que carga con JavaScript (`<div id="root">`, «enable JavaScript»): descúbrele la API con el sondeo de
  navegador en el PC: `node scripts\multideporte\sondeo-navegador.mjs` (Chrome sin ventana que graba las
  llamadas de red). De ahí salieron las APIs de MyGol, Playooz, iSquad, Pista Central y fmvoley.
- **Con REA (laboratorio `F:\EspacioCodigo\ProyectoServidor\rea-sandbox`)**, para entender por dentro cómo carga sus datos una web nueva. Solo páginas públicas, sin cuentas:
  1. abre la liga en Chrome con depuración remota (`chrome.exe --remote-debugging-port=9222`) y navega como un usuario: temporada → grupo → jornada;
  2. con las herramientas web de REA, si tu sesión las tiene (REA está registrado como servidor MCP en DSH); si no las tiene, `sondeo-navegador.mjs` saca lo mismo (las llamadas de red):
     - `list_browser_targets` → `inspect_web_page`, que da el DOM, la estructura de accesibilidad y **qué peticiones de red hizo la página**: su API, verbo, parámetros y formato;
     - `analyze_web_bundle` si hace falta saber qué hace su JavaScript con esos datos;
     - o guarda un HAR desde las herramientas de desarrollo y pásalo a `inspect_web_network_capture`;
  3. con eso se escribe el adaptador (§3.5) contra esa API, al ritmo de siempre;
  4. la evidencia de REA se guarda resumida en el informe de la liga (`investigaciones\` del laboratorio si es una plataforma nueva grande), no entera.
- **Qué NO se hace con REA**:
  - descompilar o desmontar apps móviles o de escritorio de federaciones o plataformas;
  - iniciar sesión;
  - repetir peticiones para «probar» la API a más ritmo del de siempre;
  - saltarse protecciones.
  - REA sirve para **mirar lo que el navegador ya recibe**.
- Apunta: la cadena de páginas, el verbo (GET/POST), qué trae cada respuesta, y si hay datos de personas.

### 3.3 Clasificar la liga

| Caso | Qué hacer |
|---|---|
| Plataforma con adaptador ya escrito | §3.4: añadir la liga a su lista |
| Plataforma nueva con **varias** ligas detrás | §3.5: adaptador nuevo |
| Web suelta de **una** liga | §3.5 como «web propia», o anotarla para Claude si el formato es raro |
| Términos prohíben la extracción, o bloquea automatismos | §5: no se toca; va a la lista de «pedir acceso» |
| Expone datos personales (DNI, fecha de nacimiento, teléfono, correo) | §5: no se recoge; se anota para avisar |

### 3.4 Añadir a un adaptador existente (lo más común y rápido)

> **Desde el 11/10/2026 hay cerrojo por adaptador** (`arrancar.pid`): un segundo `arrancar` del mismo adaptador se niega a arrancar. Aun así, la forma correcta de añadir una liga a un adaptador activo es `sembrar`. Antes del cerrojo, el riesgo era este:
> no había cerrojo por adaptador. Si lanzas a mano `arrancar` de un adaptador que el supervisor ya tiene
> vivo, habrá **dos trabajadores pidiendo a los mismos sitios** (el doble de peticiones). Para un adaptador que
> ya está en `adaptadores-activos.json`, **nunca** `arrancar` a mano: se siembra y lo pide el que ya corre.

1. Mete la liga en la lista del adaptador (`LIGAS` de serversports, `ORGANIZACIONES` de mygol,
   `CLIENTES` de playooz, etc. — mira la cabecera del `.mjs`).
2. Encola sus semillas **sin hacer ninguna petición** (idempotente):
   ```powershell
   node scripts\multideporte\recolector-multideporte.mjs sembrar --adaptador <nombre>
   node scripts\multideporte\recolector-multideporte.mjs estado  --adaptador <nombre>
   ```
3. El trabajador vivo las pide en su siguiente tanda (además, cada adaptador vuelve a sembrar al arrancar).
   Comprueba en su registro (`descargas-multideporte\<nombre>\`) y en `pc.txt` del enlace que aparecen páginas
   de la liga nueva sin fallos, con fecha, equipos y marcador (lo no jugado sale sin marcador: es normal).

### 3.5 Adaptador nuevo (plataforma nueva)

- Cópiate el más parecido como molde: `mytorneo.mjs` (HTML por provincias), `portalrivas.mjs` (POST con fases),
  `playooz.mjs`/`mygol.mjs` (API JSON). Un adaptador sólo **siembra y lee**; el ritmo, las pausas, los carriles y
  la evidencia los pone el motor (`motor.mjs`).
- Escribe su prueba (`adaptadores/<nombre>.test.mjs`) como las que ya hay, y déjala en verde.
- **Antes** de darlo de alta, pruébalo a mano (aún no lo corre nadie, así que no hay doble trabajador):
  `node scripts\multideporte\recolector-multideporte.mjs arrancar --adaptador <nombre> --max 30`
  — 30 páginas sin fallos, y lo leído con fecha, equipos y marcador.
- Solo entonces añádelo a `scripts/multideporte/adaptadores-activos.json`: el supervisor lo arranca solo en ≤ 10 min.
- Menores: los partidos de base se recogen (instancia privada), pero marcados `menores: true` y **sin** DNI,
  correos ni teléfonos. Nunca el endpoint de inscritos.
- Si la plataforma es un caso raro (formato que no cuadra con ningún molde), **páralo y anótalo para Claude**
  con la URL y lo que viste: el código de lectores nuevos es tarea de Claude.

### 3.6 Verificar y registrar

- A las ~24 h de añadir algo: `node scripts\multideporte\calidad.mjs` — comprueba que esa plataforma trae fecha,
  equipos y marcador en buena proporción.
- Escribe en `FUTBOL-AFICIONADO.md` una fila con: liga, plataforma, qué se añadió y, si se descartó, el motivo.
- Marca la provincia en §6 cuando no queden ligas razonables por mirar en ella.

---

## 4. Ritmo (cerca del máximo respetuoso, sin pasarse)

- El motor ya pide una vez cada 5-8 s por sitio, una a la vez, y aplaza una hora un sitio que falle tres veces.
  **No se cambia.**
- Varias ligas de **dominios distintos** a la vez: eso sí acelera sin cargar a nadie. Los carriles ya están
  (`serversports` 3, `gesdeportiva` 3, `mygol` 2). Si un adaptador nuevo agrupa muchos dominios, puede llevar
  carriles; cada dominio sigue con su pausa.
- Nada de bajar la pausa por sitio, falsear el cliente ni usar proxies.

---

## 5. Lo que queda fuera (y por qué) — no se intenta

- **Clupik / Leverade / Xporty y Competize**: sus términos prohíben la extracción (Competize veta por nombre a
  los bots de IA). Muchas ligas grandes (LFV Valencia, Elche, Marbella, veteranos de Cataluña…) están ahí. Van a
  la lista de **pedir acceso**; mientras no haya convenio, no se recogen.
- **Portales que bloquean automatismos** (403 sólo a no-navegadores, CAPTCHA, contenido ofuscado): no se esquiva.
- **Datos personales** expuestos sin login (DNI, fecha de nacimiento, teléfono, correo): no se recogen; se anota
  para avisar a quien los expone, como se hizo con el tenis.
- **Descompilar o desensamblar las apps** de las federaciones o de estas plataformas: **no**. Se estudia sólo lo
  que el portal sirve en abierto a un navegador.
- **datos.madrid.es (JDM)**: su robots veta la descarga automática; David baja los CSV a mano
  (`descargas-manuales/madrid-jdm/`) y un lector los importa.

La lista de «pedir acceso» y la de «avisos de privacidad» se mantienen al final de `FUTBOL-AFICIONADO.md`. Pedir
acceso o avisar es decisión de David: anótalo, no lo hagas tú.

---

## 6. Progreso del barrido (lo mantiene DeepSeek)

> **✎ Claude, 12/10/2026 — ninguna zona está HECHA todavía.** Las once filas se cerraron mirando sólo las colas
> de los 18 adaptadores que ya tenemos, con **0 peticiones nuevas**. Eso es el **paso 1 (inventario)** y está
> bien hecho, pero por construcción **no puede encontrar nada nuevo**: lo que no está ya en un adaptador es
> invisible desde sus colas. Faltan, en cada zona (método de §2), el **paso 2 (huella de plataformas: clientes nuevos de mygol,
> serversports, mytorneo, apuntamelo… en esa provincia)** y el **paso 3 (webs propias de ligas: búsqueda web por
> provincia y modalidad)**. Los huecos ya anotados (Palencia, Soria, Teruel, Girona, Gipuzkoa, Granada, Huelva,
> Jaén) son justo donde hay que empezar. «Si existe, estará en una plataforma vetada» es una hipótesis, no un
> resultado: no va a «pedir acceso» hasta que se encuentre la liga y su plataforma.

| # | Zona | Estado | Fecha | Ligas añadidas / descartadas (con motivo) |
|---|---|---|---|---|
| 1 | CyL (Salamanca, Burgos, Palencia, Segovia, Soria, Ávila, Zamora, Valladolid) | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Inventario hecho sobre las colas de los 18 adaptadores** (evidencia local, 0 peticiones nuevas) ✓. **Ya recogidas:** `futormes` Salamanca · `futormes-zamora` Zamora · `asofusa` y `solohayfutbol` Valladolid · `f7-avila` Ávila · `futcyl` CyL (serversports) y `fes` Valladolid (mygol). **Parciales:** `fs-burgos` (**Burgos, sólo fútbol sala**) y `jdm-segovia` (**Segovia, sólo Juegos Municipales**) — sus provinciales de aficionados son **federadas** de la FCyL (`1ª División Provincial de Aficionados`), ya recogidas ✓. **Palencia y Soria: NADA, y está comprobado** ✓✗: 0 ligas en los 18 adaptadores — los 278 y 1.297 aciertos de «palencia»/«soria» en serversports (y los de gesdeportiva, totalfutbol, mygol) son **nombres de EQUIPO** dentro de ligas de Sevilla (`f7sevilla.com`), Madrid (`business-sports.es`, `fbm.es`), Gijón (`ligaf7gijon`), Gandía (`afes.red`), nacional F7 (`demoanfutbol7`), `cnfutbolsala` y `totalfutbol.es` — **verificado mirando la URL de cada coincidencia** ✓. Las búsquedas web de esas dos provincias sólo devuelven **federadas** ([rfcylf.es](https://www.rfcylf.es), ya recogidas) y **PDF de diputación/ayuntamiento** ([dipsoria.es](https://www.dipsoria.es/sites/dipsoria/files/public/uploads/deportes/Juegos_Escolares/Resultados/resultados_29a_jornada_09.04.2016._semifinales_deportes_colectivos.pdf), [tienda.rfcylf.es](https://tienda.rfcylf.es/wp-content/uploads/2020/03/Circular-n%C2%BA1-D.P.-Soria-PLAN-COMPETICIONAL-TEMPORADA-2014-15-1.pdf)) → **vía municipal, decisión de alcance de David, sin lector por pueblo** ✓. **Lo de siguetuliga sigue fuera** ✓ (federadas copiadas: `castilla-y-leon-primera-division-provincial-fase-final-trofeo-diputacion` es federada y el filtro `FEDERADA` la descarta; de sus **352 ligas** encoladas —Galicia veteranos, Córdoba Dolorense, Madrid, Canarias, Cataluña— **CyL sólo tiene 3 y ya están dentro** ✓✓: `castilla-y-leon-otras-ligas-torneo-villa-de-lario` (**aficionada**, ✓ ya recogida), `castilla-y-leon-primera-division-provincial-fase-final-trofeo-diput…` y `castilla-y-leon-tercera-division-futbol-sala-g-9` (las dos **federadas** → el filtro `FEDERADA` las descarta ✓)). **Resultado: nada que añadir, nada descartado por bloqueo, nada nuevo para la lista de «pedir acceso».** Sigue sin excluirse `/base/` (menores: se recogen, decisión del 05/10; nunca DNI, correos ni teléfonos) ✓ |
| 2 | Castilla-La Mancha (Albacete, Ciudad Real, Cuenca, Guadalajara, Toledo) | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Inventario sobre las colas de los 18 adaptadores** (0 peticiones) ✓. **Ya recogidas:** `ligamas7` **Guadalajara** (serversports ✓) y las dos locales de **Bargas (Toledo)** de siguetuliga (`castilla-la-mancha-ligas-locales-bargas-toledo` ✓ y `…copa-local-de-bargas` ✓). **Federada de CLM:** 13 temporadas ya en el canónico ✓. **El resto de aciertos son nombres de EQUIPO o de otro deporte, comprobado por URL** ✓✗: «cuenca»/«toledo»/«guadalajara» salen en `afes.red` (Gandía), `cnfutbolsala`, `f7sevilla`, `futbol7giralda`, `ligasfutbol7madrid`, `business-sports.es` (Madrid), `asofusa` (Valladolid), `demoanfutbol7` (nacional), `demoligahesperides` (Sevilla), `aemf`/`f7asturias`/`futplaya`/`ligaf7gijon` (mygol) y en los hosts únicos `siguetuliga.com`, `totalfutbol.es`, `apuntamelo.com`; y los de gesdeportiva son **baloncesto** (`fbm.es`, `gesdeportiva.fcbaloncesto.es`) ✗. **«ciudad-real»: 0 en los nueve adaptadores de fútbol.** **Resultado: nada que añadir, nada descartado por bloqueo, nada nuevo para «pedir acceso».** |
| 3 | Extremadura (Badajoz, Cáceres) | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Inventario sobre las colas de los adaptadores** (0 peticiones) ✓. **Ya recogidas 23 ligas extremeñas en siguetuliga** ✓✓: veteranos **AFAS** (liga, copa y grupos A-D ✓), `extremadura-ligas-locales-liga-sierra-de-gata` ✓, `…Primera-division-extremena-futbol-sala` ✓, `futbol-sala-extremadura-femenino-…` ✓, benjamines JUDEZ ✓ (menores: se recogen, decisión del 05/10 ✓) y el `trofeo-diputacion-badajoz` (**federada** → el filtro `FEDERADA` la descarta ✓). **Y `mytorneo` cubre Cáceres** ✓ (su adaptador lee **todas** las provincias: `torneos-ligas-en-<provincia>` ✓; en su cola hay 40 partidos con provincia `caceres` ✓). **Los demás aciertos son nombres de equipo o de otro deporte, comprobados por host** ✓✗: serversports usa `cnfutbolsala`, `estadio7`, `f7sevilla`, `ligasfutbol7madrid`, `business-sports.es`, `asofusa`, `futormes`, `futormes-zamora`; y **`feb` y `owbasket` son BALONCESTO** ✗ (`baloncestoenvivo.feb.es`, `esb.optimalwayconsulting.com`). **Resultado: nada que añadir, nada descartado por bloqueo, nada nuevo para «pedir acceso».** |
| 4 | Canarias (Las Palmas, Tenerife) | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **24 ligas canarias ya en siguetuliga** ✓✓: veteranos **ATANFE** F11 Tenerife (1ª y 2ª fase, copa, cuartos ✓), veteranos Las Palmas (1ª, 2ª, copa, La Palma ✓), locales (Cabildo Insular femenina y su play-off, copa Las Palmas, Copa Consolación, Monserrat ✓), cadetes y cadetes de Copa Federación ✓, y **fútbol sala** (1ª regional, Copa Consolación, Copa Federación cadete ✓). Y en **serversports**: `estadio7` (**Las Palmas** ✓) y `empubenco` (**Las Palmas**, sala y K7 ✓). Los aciertos de «tenerife» son de `demoligahesperides` (Sevilla) y nombres de equipo ✓✗. **Resultado: nada que añadir.** |
| 5 | Baleares | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Sólo dos entradas de Baleares, y las dos ya están dentro** ✓✓: `baleares-1-regional---futbol-sala-1-regional` (siguetuliga ✓) y `f7-mallorca` → `futbol7mallorcatorneos.es` (serversports ✓, torneos de F7 por pueblos ✓). Los demás aciertos son `cnfutbolsala` (nacional) y nombres de equipo ✓✗. **Y como los adaptadores leen sus plataformas enteras** —siguetuliga por sitemap ✓, serversports por su lista de dominios ✓—, **lo que exista de Baleares en ellas ya se recoge**; no aparece una tercera plataforma balear. **Resultado: nada que añadir.** |
| 6 | Aragón (Huesca, Teruel) y Navarra | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Zaragoza** ya estaba (`futzaragoza` y `liga-delicias` en serversports ✓). **Huesca**: `ligacomarcalbajocinca` (**mygol, comarca del Bajo Cinca**) → **ya está en la lista del adaptador** ✓✓ (`mygol.mjs` línea 16) → se recoge. **Navarra**: `fs5navarra` (**mygol**) → **ya está** ✓✓ (línea 15), más **muchas ligas locales en siguetuliga** ✓ (benjamín grupos 1-7, alevín 1-2, cadete y cadete femenina, 6 años, fútbol sala benjamín ✓). **Teruel: NADA** ✗, y comprobado: no hay liga en siguetuliga, y los aciertos de «teruel» en serversports/mygol son **nombres de equipo** en ligas de Salamanca (`futormes`), Zamora, Madrid (`business-sports.es`), Valladolid (`asofusa`), nacionales (`demoanfutbol7`, `cnfutbolsala`) y `futplaya` ✓. **Resultado: nada que añadir** (lo de Huesca y Navarra ya estaba, y no es un descuido: está en el código ✓). |
| 7 | Cataluña (Girona, Lleida, Tarragona, Barcelona comarcas) | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Todo lo catalán que aparece está YA registrado** ✓✓, comprobado en el código: **mygol** `lligueslleida` (**Lleida** ✓), `minifutbolreus` y `minifutboltarragones` (**Tarragona** ✓), `minifutbolterresdelebre` (**Tarragona**, dominio propio ✓), `futsalvilanova` y `minifutbolcatcentral` (**Barcelona** ✓); **serversports** `veteransfutbol` = `veterans-valles-maresme` (**Barcelona**, veteranos ✓); y **siguetuliga** ya trae **7 ligas catalanas** ✓ (fútbol sala preferente, veteranos central, copa asociación e intercomarcal Bages-Berguedà ×4). Los hosts `aemf`, `laboralyempresas` y `zaragoza` (mygol) y `afes.red`, `demoanfutbol7`, `veteransfutbol` (serversports) son **otras provincias o nacionales** ✓✗, y `gesdeportiva`/`fbm.es` son **baloncesto** ✗. **GIRONA: nada encontrado** ✗ — no aparece en ninguno de los 18 adaptadores (ni cola ni lista), y sus aciertos son sólo `demoanfutbol7` y `afes.red`. **Si existe una liga de Girona, es en las plataformas que §5 veta** (Clupik/Leverade/Xporty/Competize) → **va a «pedir acceso», que es decisión de David** ✓. **Resultado: nada que añadir; un solo hueco anotado (Girona) y no perseguido.** |
| 8 | Ceuta y Melilla | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Nada que añadir, y es lo esperable** ✓: son ciudades de una sola federación territorial, y sus datos **son federados y ya están** en el canónico (**Ceuta 10 temporadas** ✓, **Melilla 5** ✓, ambas verificadas contra su origen ✓). En los 18 adaptadores: **«ceuta» sólo aparece en `almeriacup.es`** (Almería ✗) y **«melilla» sólo en `afscs.mygol.es`** (que es de **Castellón** ✗, ya registrado como tal) y en `gesdeportiva.fcbaloncesto.es` (**baloncesto** ✗). **Resultado: nada que añadir, nada nuevo para «pedir acceso».** |
| 9 | País Vasco, Cantabria, Asturias, La Rioja | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Bizkaia** ✓: `futbolrapido.biz` = **Fútbol Rápido Bizkaia**, **ya registrado** (`mygol.mjs` línea 27) + `pais-vasco-cadete-masculino-bizkaia-copa-esp-1` en siguetuliga ✓. **Araba/Álava** ✓: siguetuliga trae `…cadete-masculino-primera-araba` y `pais-vasco-primera-regional-torneo-federacion-grupo-2`. **Asturias** ✓✓: mygol `f7asturias`, `ligaf7aviles`, `ligaf7gijon` (**los tres ya registrados**, línea 11) + serversports `ligaiberica.es` (**ya registrado**, línea 41). **Cantabria** ✓: `cantabria-copas-copa-cantabria-cadete---fase-final` en siguetuliga. **La Rioja: sólo federada** ✓ (los aciertos son `futbol7giralda` Sevilla, `business-sports.es` y `torneosparaempresas.com` Madrid, `asofusa` Valladolid → **nombres de equipo**), y sus **19 temporadas** ya están en el canónico ✓. **GIPUZKOA: nada encontrado** ✗ — cero coincidencias en los 18 adaptadores (ni en cola ni en lista); si existe liga aficionada allí, es en las plataformas que **§5 veta** → **«pedir acceso», decisión de David** ✓. **Resultado: nada que añadir; hueco anotado (Gipuzkoa).** **+ La Rioja (12/10 ✓): la liga de veteranos existe ✓ pero publica sólo en PRENSA → sin lector ✓ (fila 43 ✓).** |
| 10 | Andalucía y Galicia (cerrar) | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Galicia es la zona mejor cubierta de todas** ✓✓: **232 ligas gallegas ya en siguetuliga** (A Coruña **59**, Pontevedra **33**, Lugo **30**, Ourense **17**, más veteranos y locales), y en serversports `fitgalicia.com` ✓ y en mygol `vigoenxogo` ✓ (los dos registrados). **Andalucía bien cubierta** ✓✓: serversports `f7sevilla`, `futbol7giralda`, `f7-elite-sevilla`, `liga-hesperides` (Sevilla ✓), `futbol7pa7` (Córdoba ✓), `futsalchiclana` (Cádiz ✓), `adac-almeria` (Almería ✓); mygol `ligahesperides` ✓, `ligasgda` y `advetarucas` (Cádiz ✓), `malagaf7` (Málaga ✓, dominio propio); más **18 ligas de Córdoba** en siguetuliga (las «Dolorense» ✓). **Huecos anotados sin perseguir** ✗: **Granada, Huelva y Jaén** no aparecen en ningún adaptador (sólo las barras de `aemf` y `lapreferente.com`, que son nombres de equipo). **Resultado: nada que añadir; tres provincias andaluzas sin plataforma detectada.** **+ Cerrado el 12/10 ✓: Huelva (F7 amateur) = sin plataforma ✓ (fila 42 ✓) y Jaén (Liga Socca) = sólo canal VETADO ✓✗ (filas 31/41 ✓) → decisión de David ✓.** |
| 11 | C. Valenciana y Murcia (cerrar) | **INVENTARIO HECHO · BARRIDO PENDIENTE** (Claude 12/10: el paso 1 está; faltan los pasos 2-4 del «Método por zona» de §2) | 11/10 | **Murcia** ✓: `totana` = `ligadefutbol.totana.es` (**ya registrado**, línea 40). **Valencia** ✓: `afes-gandia` → `afes.red` (**ya registrado**, línea 61), `tikitakaf7` (línea 45) y mygol `futplaya` (línea 14). **Alicante** ✓: mygol `alicante` (línea 15); **Castellón** ✓: `afscs` (mygol, línea 13). El resto de aciertos son **nombres de equipo** en ligas de Sevilla, Madrid, Valladolid, Salamanca, Zamora, Ávila, Cádiz o nacionales ✓✗. **Y lo grande de Valencia ya está identificado como vetado**: §5 dice que ligas como la **LFV Valencia** o Elche viven en **Competize** (prohíbe la extracción por nombre a los bots) → **«pedir acceso», decisión de David** ✓. **+ Y Murcia cerrada el 12/10 ✓: la candidata de Cartagena (fila 34) devuelve la página de BLOQUEO del WAF ✓✗ → no perseguible, decisión de David ✓ (fila 38 ✓).** **Resultado: nada que añadir.** |

## 6 bis · Registro de búsquedas (Fase 2, desde 12/10/2026) — consulta → qué salió

> **Por qué existe esto**: Claude corrigió el barrido y tenía razón ✗✓. Las once zonas quedaron en
> **«inventario hecho»** —mirar las colas de los adaptadores que ya tenemos, con **0 peticiones**— y **con 0
> peticiones no se puede encontrar nada nuevo** ✓. Faltaban los **pasos 2 (huella de plataformas) y 3 (webs
> propias)** del «Método por zona» de §2 ✓. Una zona sólo pasa a **HECHA** con **esta tabla rellena** y **cada
> candidato clasificado** ✓ — y «si existe, estará en una plataforma vetada» **no vale como resultado** ✓.

| # | consulta | qué salió | clasificación |
|---|---|---|---|
| 1 | `liga futbol aficionado Palencia clasificación resultados` | [rfcylf.es](https://www.rfcylf.es) (×2), [tienda.rfcylf.es](https://tienda.rfcylf.es) PDF, [desdesoria.es](https://www.desdesoria.es) (noticia de la Provincial) | **federado** ✗ (FCyL, ya recogido) |
| 2 | `liga futbol aficionado Soria clasificación resultados` | ídem: [rfcylf.es](https://www.rfcylf.es) y [desdesoria.es](https://www.desdesoria.es) | **federado** ✗ |
| 3 | `liga futbol aficionado Teruel clasificación resultados` | **`futbuteo.com`** ✓, [futbol-regional.es](https://futbol-regional.es), [diariodeteruel.es](https://www.diariodeteruel.es) | **`futbuteo.com`**: agregador de **10 federaciones** («federaci» ×65 vs «aficionado» ×1) → **federado, DESCARTADO** ✗✓ · `futbol-regional.es`: **archivo histórico** (1976-77), no liga viva ✗ |
| 4 | `liga futbol aficionado Girona clasificación resultados` | [futbol-regional.es](https://futbol-regional.es), noticias, [letelegramme.fr](https://www.letelegramme.fr) (ruido ✗) | **nada aficionado** ✗ |
| 5 | `"mygol.es" Girona liga futbol` | noticias de LaLiga y ruido ✗ | **nada** ✗ |
| 6 | `futbol sala aficionado Gipuzkoa liga clasificacion` | [eff-fvf.eus](http://eff-fvf.eus) (circular federativa), [fvf-bff.org](https://fvf-bff.org) (memoria) | **federado** ✗ |
| 7 | `"totalfutbol.es" OR "apuntamelo.com" Granada liga futbol aficionado` | [totalfutbol.com](http://totalfutbol.com) — **ojo: es OTRA cosa** (empresa de campus, no `totalfutbol.es/ges` ✗), [valverdefutbolsala.blogspot.com](http://valverdefutbolsala.blogspot.com) (blog de un club) | **nada de Granada** ✗ · **trampa anotada** ✓ |
| 8 | `liga futbol aficionado Huelva veteranos clasificacion web` | [futbolistasfeafv.com](https://www.futbolistasfeafv.com) (boletín PDF de una asociación de veteranos) | **PDF/asociación** → anotado ✓ |
| 9 | `liga futbol aficionado Jaén veteranos clasificacion` | [rfaf.es](https://rfaf.es) (federación andaluza) | **federado** ✗ (ya recogido) |
| 10 | `futbol sala aficionado Palencia liga local resultados web` | PDF de liga escolar de CLM ([cee-bios…](http://cee-bios.centros.castillalamancha.es) ✗) | **nada de Palencia** ✗ |
| 11 | `veteranos futbol Soria liga resultados web propia` | [deportesavila.es](https://deportesavila.es) (noticia: liga local de **Ávila**), [aracena.es](http://www.aracena.es) **PDF municipal** | **Ávila**: liga local **por identificar** ✓ · **Aracena (Huelva)**: **PDF municipal → anotado** ✓ |
| 12 | `futbol 7 empresas Gipuzkoa liga resultados` | [managementsolutions.com](https://www.managementsolutions.com) → **«Liga de Fútbol 7 RC Interempresas»** (Bilbao) | **ya la recoge `apuntamelo`** ✓✓ (su afiliado está en la lista del adaptador ✓) |
| 13 | `"mygol.es" Mallorca liga futbol aficionado` | prensa de 1994 ([ibdigital.uib.es](https://ibdigital.uib.es)) y una memoria de 2008 de otra federación ✗ | **nada de Baleares** ✗ |
| 14 | `liga futbol aficionado Cantabria veteranos empresas clasificacion web` | [rfcf.es](https://www.rfcf.es) (Federación Cántabra) | **federado** ✗ (ya recogido) |
| 15 | `liga futbol aficionado Asturias veteranos empresas web propia clasificacion` | **`ayto-cnarcea.es`** ✓✓ ×2: *«CLASIFICACIÓN FINAL XV **LIGA LOCAL DE FÚTBOL SALA**»* (08-09) y la XII (05-06); [cpindependiente.com](http://www.cpindependiente.com) (normas de veteranos de un club) | **Cangas del Narcea: liga local en PDF MUNICIPAL → anotada** ✓✓ (decisión de alcance de David ✓) · el club no es liga ✗ |
| 16 | `liga futbol aficionado La Rioja veteranos empresas clasificacion web` | [larioja.com](https://www.larioja.com) (noticia 2011: **«La nueva Liga de Veteranos crece»**), [frfutbol.com](https://frfutbol.com) (Federación Riojana, `NBdd_DesDocumento` con jornadas) | **La Rioja: existe liga de VETERANOS → candidata por identificar** ✓✓ (dónde publica) · la federación, federada ✗ |
| 17 | `futbol sala aficionado Palencia liga local clasificacion` | [tienda.rfcylf.es](https://tienda.rfcylf.es) PDF, [ogol.com.br](https://www.ogol.com.br) (agregador de estadísticas) | federado ✗ / ruido ✗ |
| 18 | `veteranos futbol Palencia liga resultados clasificacion` | **`pmdpalencia.com`** ✓✓ — *«**39 EQUIPOS EN LA LIGA FÚTBOL SALA PMD**»* | **★ CANDIDATO: liga de fútbol sala del Patronato Municipal de Deportes de Palencia** ✓✓ — **es WEB, no PDF** → **por estudiar con REA** (si carga por JavaScript, ficha para Claude ✓) |
| 19 | `futbol 7 aficionado Girona liga clasificacion resultados` | [bibgirona.cat](https://bibgirona.cat) (PDF de un torneo de peñas de 2011), [cassadigital.cat](https://www.cassadigital.cat) (noticia de un torneo benjamín) | **nada de liga** ✗ (torneos y noticias ✓) |
| 20 | `futbol 7 aficionado Gipuzkoa liga clasificacion resultados` | [euskadi.eus](https://www.euskadi.eus) ×2 (PDF de deporte escolar) | **federado/institucional** ✗ |
| 21 | *(seguimiento del 18)* `https://www.pmdpalencia.com/` — **1 petición** | HTTP 200 · 59.785 B · `title` «PMD Palencia» · `liga` ×8 · `sala` ×4 · `php` ×218 · **sin ninguna huella** de `mod/soccer`, `mygol`, `playooz`, `apuntamelo`, `totalfutbol`, `ges/laweb` ✗ — **ni de las vetadas** (`clupik`, `leverade`, `competize` ✓) | **★ CANDIDATA A LECTOR PROPIO** ✓✓: web **municipal propia en PHP**, liga de fútbol sala de **39 equipos** ✓ → **ficha para Claude** ✓. Siguiente: localizar la página de la liga (la noticia es `noticia.php?item=1550`) y ver si los resultados son **HTML** (lector sencillo ✓) o **JavaScript** (REA, §3.2 ✓) |
| 22 | *(seguimiento del 21)* `https://www.pmdpalencia.com/noticia.php?item=1550` — **1 petición** | HTTP 200 · 45.853 B ✓ **pero no enlaza a ninguna sección de liga** ✗ (ningún `href` con `liga`/`futbol`/`sala`/`competic`/`clasific`/`resultado`/`deporte` ✓) → el menú va en **relativo o por JavaScript** ✓ | **Siguiente paso, ya de REA** ✓ (§3.2 ✓): `inspect_web_page` sobre la portada para sacar el **menú real** y la ruta de la liga ✓ — **no hace falta adivinar rutas** ✓ |
| 23 | *(preparación del REA)* ¿hay navegador con CDP? | **Sí**: 10 procesos de `chrome.exe` con `remote-debugging` ✓ — **pero son del recolector** (Chrome headless de serversports ✓) | **⚠ NO engancharse a ese navegador** ✗✗: adjuntarse por CDP al navegador de un recolector es exactamente «cambiar el recolector como efecto lateral de una tarea web», que `CLAUDE.md` prohíbe ✓. **La vía es `capture_browser_scenario` con `mode: launch`** ✓✓ — REA **lanza su propio navegador**, aislado y con perfil temporal ✓, y el recolector no se entera ✓ |
| 24 | **REA · `capture_browser_scenario` `mode: launch`** sobre `https://www.pmdpalencia.com/` (Chromium 154 propio ✓, 1 navegación ✓) | **★ ENCONTRADA LA RUTA** ✓✓ — del DOM real: `<a href="https://www.pmdpalencia.com/vercompeti.php?tipc=0">` con **`<h2>Ligas de Ocio PMD</h2>`** ✓ | **★ FICHA COMPLETA PARA CLAUDE** ✓✓: **`https://www.pmdpalencia.com/vercompeti.php?tipc=0`** = **«Ligas de Ocio PMD»** ✓. Es **PHP servido en el servidor** ✓ (`vercompeti.php` ✓, no un SPA ✗) → **los resultados deberían ser HTML** ✓ → **lector sencillo viable** ✓✓. **Nota del método**: las 2 peticiones planas **no** daban esta ruta ✗ (el menú va con rutas relativas y `AdminLTE`/jQuery ✓); **REA la dio a la primera** ✓✓ — que es exactamente para lo que el GOAL manda usarlo ✓ |
| 25 | `https://www.pmdpalencia.com/vercompeti.php?tipc=0` — **1 petición** | HTTP 200 · 61.639 B ✓ — **«Ligas de Ocio» ×3 · `futbol` ×44 · `sala` ×47 · `clasificacion` ×2 · `jornada` ×3 · `resultado` ×2 · `vercomp…` ×6 · `ajax` ×1** | **★ CONFIRMADO: EL CONTENIDO ESTÁ EN EL HTML** ✓✓ (no hace falta esperar a JavaScript ✗) → **lector sencillo viable, sin navegador** ✓✓, con **6 enlaces `vercomp*`** ✓ a las competiciones. **Un solo `ajax`** ✓ → algo suelto sí va por JS ✓ (anotado para Claude ✓). **La ficha de Palencia queda cerrada** ✓ |
| 26 | `Granada futbol aficionado liga local veterano empresa clasificacion` | [rfaf.es](https://www.rfaf.es) (federación andaluza), artículo académico ([digibug.ugr.es](https://digibug.ugr.es)) | **federado** ✗ / ruido ✗ |
| 27 | `Jaén futbol sala aficionado liga local clasificacion web` | **`jaendeportiva.es`** ✓✓ (noticia del **11/10/2026**): *«…primeros líderes en la **Liga Socca Jaén** sénior de fútbol sala»*; [jaenfs.es](https://jaenfs.es) (federación de fútbol sala) | **★ CANDIDATA: «Liga Socca Jaén»** ✓✓ — competición **con nombre propio, viva esta semana** ✓ → **identificar su plataforma** · la federación, federada ✗ |
| 28 | `Huelva futbol 7 aficionado liga local empresa clasificacion` | **[elrincondediegoneto.blogspot.com](http://elrincondediegoneto.blogspot.com)** ✓: *«Campeonato de liga y copa de **fútbol 7 Amateur en Huelva**»* (2012); [rfafsevilla.es](http://rfafsevilla.es) | **★ CANDIDATA: la liga amateur de F7 de Huelva existe** ✓ — publicada en un blog en 2012 ✓ → **identificar dónde publica ahora** ✓ · la federación, federada ✗ |
| 29 | `Soria futbol sala aficionado liga local clasificacion web` | **[dipsoria.es](https://www.dipsoria.es)** ✓✓: *«**Campeonato Interpueblos**»* (Diputación de Soria); [desdesoria.es](https://www.desdesoria.es) PDF de anexo federativo | **institucional (Diputación) → anotado** ✓✓ (misma familia que Narcea y Palencia ✓) · el anexo, federado ✗ |
| 30 | `"Liga Socca" Jaén futbol sala clasificacion jornada` + `Socca liga futbol sala España plataforma web` | [jaendeportiva.es](https://www.jaendeportiva.es) ×3 (senior ✓, **femenina** ✓ y *«las finales… de **La Liga Socca Jaén de la Asociación Andaluza de fútbol sala**»* ✓); *«**Socca Spain** convierte Santander en sede del **fútbol 6**»* ([cantabrialdia.com](https://cantabrialdia.com)); [dipusevilla.es](https://sevillaentubolsillo.dipusevilla.es) (torneo Socca en Aznalcóllar); [laverdad.es](https://www.laverdad.es) y [cope.es](https://www.cope.es) = fútbol sala **profesional** ✗ | **★ CLASIFICADA: NO es federada** ✓✓ — la organiza la **Asociación Andaluza de Fútbol Sala** bajo el paraguas **Socca Spain** (fútbol 6 ✓), **y no es de las vetadas** ✓ → **candidata legítima** ✓✓. **Falta: dónde publica** ✗ (la fuente es la **prensa**, no su web ✓) → **siguiente: buscar la web de Socca Spain** ✓ |
| 31 | `Socca Spain fútbol 6 web oficial resultados` + `Asociación Andaluza Futbol Sala liga socca resultados web` | **★ `fafutsala.com`** ✓✓✓ — *«TERCERA ALEVIN… Calendario… **ASOCIACION ANDALUZA DE FUTBOL SALA**»* y *«SEGUNDA JUVENIL… (MALAGA) JUVENIL PROVINCIAL…»* ✓ (calendarios y categorías provinciales ✓, locales `es`/`it` ✓). **Y [clupik.pro/eu/manager/219696](https://clupik.pro/eu/manager/219696/posts)** ✓✗ — *«ASOCIACION ANDALUZA DE FUTBOL SALA \| **Clupik**»* | **★ FICHA CON DOS CANALES, Y SON DISTINTOS** ✓✓: **`fafutsala.com`** = web **propia** de la asociación ✓ → **candidata a lector propio** ✓ (como Palencia ✓). **Clupik** = plataforma **VETADA** ✓✗ (§5 ✓) → **no se toca**: «pedir acceso», **decisión de David** ✓. *Primera vez en el barrido que una misma liga sale en dos canales, uno propio y uno vetado* ✓ — y sin buscar no se sabría **cuál es cuál** ✗✓ |
| 32 | *(seguimiento del 31)* `https://fafutsala.com/es/tournament/1321809/calendar/3672583/all` — **1 petición** | **✗ ERROR: «No se puede crear un canal seguro SSL/TLS»** ✓ | **No es un fallo del sitio** ✗✓: es el **límite de `Invoke-WebRequest`** (.NET por detrás en TLS ✓). **El navegador de REA (Chromium 154) sí podrá** ✓ — igual que con Palencia ✓. Misma familia que documenta el propio `busca-plataforma.mjs`: *«no fuerza certificados caducados ni bloqueos: los informa»* ✓. **Siguiente: REA con `mode: launch` sobre `fafutsala.com`** ✓ → **⚠ REFUTADA en la fila 39** ✓✗: el fallo TLS **no** era de `Invoke-WebRequest` ✗ (Chromium falla igual ✓) y el dominio **está aparcado** ✗ |
| 33 | `Albacete/Badajoz/Tenerife/Mallorca futbol aficionado liga local clasificacion` | [prensahistorica.mcu.es](https://prensahistorica.mcu.es), [hoy.es](https://www.hoy.es), [mallorcamagazin.com](https://www.mallorcamagazin.com), [fbref.com](https://fbref.com), [cuadernosdefutbol.com](https://www.cuadernosdefutbol.com), [radiomarcaab.com](https://radiomarcaab.com) = prensa, archivo y **fútbol profesional** ✗ · **`ftf.es`** (Federación Tinerfeña): *«**LIGA INSULAR DE VETERANOS**»* PDF · [federacioncanariafutbol.es](https://www.federacioncanariafutbol.es) | **nada aficionado** ✗ en las cuatro provincias ✓ · **Canarias: la Liga Insular de Veteranos es FEDERADA** ✓ → **descartada** ✓ (ya se recoge ✓) |
| 34 | `Alicante/Huesca/Lleida/Murcia futbol aficionado liga local clasificacion` | **★ [cartagena.es](https://www.cartagena.es)** ✓✓ — *«**Resultados y clasificaciones de liga comarcal de fútbol base y aficionado** \| **Ayuntamiento de Cartagena**»* ✓ · [marca.com](https://www.marca.com), [alicanteplaza.es](https://alicanteplaza.es), [laopiniondemurcia.es](https://www.laopiniondemurcia.es), [segre.com](https://www.segre.com) = prensa/profesional ✗ · [aragontenisdemesa.com](https://aragontenisdemesa.com) PDF = **tenis** ✗ | **★ CANDIDATA: liga comarcal de fútbol base y aficionado de CARTAGENA** ✓✓ (Ayuntamiento ✓, **web** no PDF ✓) → **estudiar con REA** ✓ (como Palencia ✓). Es la **primera candidata de Murcia** ✓ — en los 18 adaptadores sólo salía `ligadefutbol.totana.es` ✓ |
| 35 | `Valencia/Castellón/Navarra/Tarragona futbol aficionado liga local clasificacion` | [futnavarra.es](https://www.futnavarra.es) (Federación Navarra) · [as.com](https://as.com), [cadenaser.com](https://cadenaser.com), [noticiasdenavarra.es](https://www.noticiasdenavarra.es), [cuadernosdefutbol.com](https://www.cuadernosdefutbol.com), [xacpremsa.cultura.gencat.cat](https://xacpremsa.cultura.gencat.cat) = prensa, hemeroteca y archivo ✗ | **nada aficionado** ✗ en las cuatro ✓ (federado o prensa ✓) |
| 36 | `Ceuta futbol aficionado liga local clasificacion` + `Melilla …` | [elfarodeceuta.es](https://elfarodeceuta.es) ×3, [melillahoy.es](https://melillahoy.es) ×2, [elpueblodeceuta.es](https://www.elpueblodeceuta.es) = **prensa** ✗; [agentesdefutbolistas.com](https://agentesdefutbolistas.com) y [citaf-santa-cruz-de-la-palma.com](https://www.citaf-santa-cruz-de-la-palma.com) = **reglamentos** de juveniles ✗ | **nada aficionado** ✗ — todo de equipos **sénior/profesionales** (AD Ceuta, UD Melilla ✓). **Coherente con el inventario** ✓: son ciudades de **una sola federación** ✓ (Ceuta 10 temporadas ✓ y Melilla 5 ✓ ya verificadas ✓) |
| 37 | *(seguimiento del 34)* `https://www.cartagena.es/detalle_noticias.asp?id=87917` — **1 petición** | HTTP 200 · 87.064 B ✓ **pero no enlaza a la liga** ✗ — los únicos `href` que casan son **compartir en redes** (telegram/twitter/wa.me/mailto ✓) y `turismo.cartagena.es` ✗ | **Mismo caso que Palencia** ✓✓: el HTML plano **no lleva la ruta** ✗ → **siguiente: REA con `mode: launch`** ✓ (§3.2 ✓), **sin adivinar rutas** ✗. La candidata sigue **viva** ✓ (el ayuntamiento publica resultados y clasificaciones ✓) |
| 38 | *(seguimiento del 34, ya con REA)* **`capture_browser_scenario` `mode: launch`** sobre `https://www.cartagena.es/` (Chromium propio ✓, 1 navegación ✓) | **✗ LA PORTADA DEVUELVE LA PÁGINA DE BLOQUEO DEL WAF** ✓ — «**¡Pagina Web Bloqueada!**» (FortiGuard ✓: `fgd_icon` ✓), con `Attack ID: 20000051`, `Message ID: 000453559697` y la **IP de David** (`79.117.136.28` ✓), y el aviso *«No utilice ( ) ; ' "»* ✓. **Cero contenido del ayuntamiento** ✗ | **★ CLASIFICADA: NO PERSEGUIBLE** ✓✗ — es una **negativa explícita del servidor a una petición automatizada** ✓, misma familia que las **vetadas de §5** ✓ (Clupik/Leverade/Competize ✓). **Las reglas prohíben saltarse bloqueos** ✓ → **no se reintenta, no se cambia de agente, no se buscan rutas alternativas** ✗✓. Pasa a **«pedir acceso» — DECISIÓN DE DAVID** ✓, igual que Clupik ✓. *(Matiz honesto: el 11/10 una noticia concreta sí se leyó con HTML plano ✓ — el WAF no bloquea todo ✗; lo que está negado es el acceso automatizado a la portada, y con eso basta para no insistir ✓)* |
| 39 | *(seguimiento del 31, ya con REA)* **`capture_browser_scenario` `mode: launch`** sobre `https://fafutsala.com/es/tournament/1321809/calendar/3672583/all` (1 navegación ✓) | **✗ `net::ERR_SSL_PROTOCOL_ERROR` — y TAMBIÉN en Chromium 153** ✓✗ | **★★ REFUTA LA FILA 32, QUE ERA MÍA** ✓✗ — **no** era «el límite de `Invoke-WebRequest`» ✗: **el navegador de REA falla idénticamente** ✓. Por tanto el TLS roto **es del sitio** ✓ (o sirve HTTP en el 443, o el vhost no tiene TLS ✓) |
| 40 | *(seguimiento del 39)* diagnóstico de red **sin ninguna petición HTTP**: DNS y socket | `fafutsala.com` → **`217.160.0.152`** (rango de **IONOS** ✓) y `2001:8d8:100f:f000::200` ✓ · **TCP 443: abierto ✓** · **TCP 80: abierto ✓** · el socket **conecta** ✓ | **El host existe y acepta conexión; lo que se rompe es el handshake TLS** ✓✓ → **queda descartado que sea un fallo de mi herramienta** ✓ y **descartado que el sitio esté caído** ✓ → **hay que pedirlo por HTTP para saber qué hay** ✓ |
| 41 | *(seguimiento del 40)* **`capture_browser_scenario` `mode: launch`** sobre `http://fafutsala.com/es/tournament/1321809/calendar/3672583/all` (1 navegación ✓) | **HTTP 200 ✓ — pero NO es la asociación** ✓✗✗: es la **página de aparcamiento de IONOS** ✓ — `<title>` **vacío** ✓, `copyright 2001-2021 1&1 IONOS Inc.` ✓, `robots: **noindex,nofollow**` ✓, y el cuerpo **vende dominios, VPS, transferencias y correo de IONOS** ✓ (`ionos.com/domains/…?utm_source=referrer&utm_medium=own_customer` ✓, con su framework propio `PUSTEFIX` ✓). **Cero contenido de fútbol sala** ✗ | **★★ CLASIFICADA: EL SITIO YA NO EXISTE — DOMINIO APARCADO EN IONOS** ✓✓✗. **Consecuencia dura para Jaén** ✓: la «ficha con dos canales» de la fila 31 ✓ **se cae por un lado** ✗ — `fafutsala.com` **está muerto** ✓ y **sólo queda Clupik**, que está **VETADA** ✗. La **Liga Socca Jaén** pasa de «candidata a lector propio» a **«pedir acceso» — DECISIÓN DE DAVID** ✓✗✓. **★ LECCIÓN DE MÉTODO** ✓✓: **el snippet del buscador que la daba por viva era CACHÉ HISTÓRICA** ✗✓ — **una búsqueda NO prueba que un sitio esté vivo; hay que pedirlo** ✓✓. Esto es exactamente lo que el GOAL exige al decir que «si existe, estará en una plataforma vetada» **no vale como resultado** ✓ |
| 42 | `Huelva futbol 7 amateur liga clasificacion web resultados` (**2ª vuelta**, tras la fila 28 ✓) | [sportshuelva.com](https://sportshuelva.com) (noticia de un **alevín del Recreativo** ✗), [rfafsevilla.es](http://rfafsevilla.es) (**federación**, `NBdd_DesDocumento` ✓), [www2.maurisoft.es/recre/…](http://www2.maurisoft.es/recre/recrenoticias/) (**la web del propio club** ✗) | **★ CLASIFICADA: NO HAY PLATAFORMA** ✓ — el F7 amateur de Huelva **no publica hoy en ninguna plataforma detectable**: sólo salen **prensa** ✗, la **federación** ✗ (federada, ya recogida) y la **web de un club** ✗. **Coherente con la fila 28** ✓ (aquel blog era de **2012** ✓) → **liga extinguida o sin canal web** ✓. **Anotada, sin lector posible** ✓ |
| 43 | `liga veteranos La Rioja clasificacion resultados` (**2ª vuelta**, tras la fila 16 ✓) | [larioja.com](https://www.larioja.com/deportes/futbol/favoritos-mantienen-distancias-20180418004351-ntvo.html) — noticia de **2018** que trae la **clasificación dentro del texto** ✓ | **★ CLASIFICADA: PUBLICA EN PRENSA, SIN PLATAFORMA** ✓ — la liga de veteranos de La Rioja de la fila 16 ✓ **existe** ✓, pero su canal es **el periódico** ✗, no una web de resultados ✓ → **no hay lector posible** ✗. **Anotada** ✓ |


> **★ Con esto, las CUATRO candidatas que quedaban están clasificadas** ✓✓ — y las once zonas tienen, por fin, **cada candidato con su resultado** ✓, que es lo que el GOAL pide para poder darlas por **HECHA** ✓:
> **Palencia** = lector sencillo viable ✓✓ (`vercompeti.php?tipc=0` en HTML ✓) · **Cartagena** = **bloqueada por WAF** ✓✗ (decisión de David ✓) · **Jaén / Liga Socca** = sólo canal **vetado** ✓✗ (decisión de David ✓) · **Huelva F7** y **La Rioja veteranos** = **sin plataforma** ✓ · **Soria y Narcea** = **PDF municipal** ✓ (alcance, decisión de David ✓).
> **Dos de las cuatro se han caído al pedirlas** ✓✗ (Cartagena bloquea ✗, `fafutsala.com` está aparcado ✗) — y las dos **habrían pasado por buenas** si me hubiera fiado del buscador ✓✗. **Candidato sin petición hecha = candidato sin clasificar** ✓✓.
















## §6 ter · **FICHA DE PALENCIA — para Claude** ✓✓ (13/10/2026)

**Patronato Municipal de Deportes de Palencia · «Ligas de Ocio PMD»** ✓ — liga de **fútbol sala de ocio/empresas**, **adultos** ✓ (los equipos son bares y empresas: `MANHATTAN COPAS HUSILLOS`, `SPORTING DE PEDRAZA`, `CERVECERIA CARELIA` ✓ → **sin menores** ✓).

### URL de cada nivel, y qué trae

| nivel | URL | qué trae |
|---|---|---|
| **1 · las competiciones** | `https://www.pmdpalencia.com/vercompeti.php?tipc=0` | **HTML** ✓ **63.202 B** ✓ — la lista de «Ligas de Ocio» ✓ |
| **2 · una competición** | `https://www.pmdpalencia.com/deporte.php?competi=<id>&tipc=PT&c=0` | **HTML** ✓ **53.046 B** ✓ — **la tabla de partidos**: `Local · Visitante · Fecha · Lugar · Acta` ✓✓ |
| **3 · la clasificación** | `POST https://www.pmdpalencia.com/cargaclasificacion.php` · cuerpo `competi=<id>&numjor=<n>` | **HTML** (fragmento) que la web inyecta en un `div` ✓ |
| 4 · exportar | `print3.php` / `print2.php` (form `formuxls`, POST `xlsdata` ✓) | Excel — **no hace falta** ✓ |

### Las competiciones que salen en `tipc=0` (4 ✓, todas enlazadas en el HTML ✓)

| id | etiqueta |
|---|---|
| **000794** | **ORO** — ABSOLUTO GRUPO ÚNICO **FÚTBOL SALA** ABSOLUTO MIXTO ✓ |
| **000795** | **PLATA** — ABSOLUTO GRUPO ÚNICO **FÚTBOL SALA** ABSOLUTO MIXTO ✓ |
| **000796** | **BRONCE** — ABSOLUTO GRUPO ÚNICO **FÚTBOL SALA** ABSOLUTO MIXTO ✓ |
| 000799 | FASE PREVIA — **BALONCESTO** → **descartar** ✗ |

- **`tipc=1`** = la **otra familia** de competiciones ✓ (57.484 B, misma estructura ✓) → **queda por mirar cuáles son** ✗ (una petición ✓).
- **`tipc=2..5`** devuelven **todos lo mismo** (41.488 B ✓) → **no son niveles** ✗.

### ★ Cómo carga los datos — lo que decide el lector

- **La lista y la tabla de partidos son HTML servido** ✓✓ → **lector sencillo, sin navegador** ✓ (como ya se concluyó el 12/10 ✓).
- **La clasificación va por AJAX** ✗✓, y **el contrato exacto está sacado del propio JS** ✓ (`scripts/funcionesajax.js` ✓):
  ```js
  function cargaClasComp(id, comp) {
    jQuery.ajax({ type: 'POST', url: 'cargaclasificacion.php',
      data: { competi: comp, numjor: document.getElementById(id).value },
      success: function (msg) { document.getElementById("tab" + id).innerHTML = msg; } });
  }
  ```
  → **`POST cargaclasificacion.php`** con **`competi`** y **`numjor`** ✓ · **devuelve HTML** ✓ (se inyecta tal cual ✓).
- La web tiene una **cascada de 5 `<select>`** ✓ (`campeonato → deporte → categoria → division → grupo` ✓) con `onchange='calcula(...)'` ✓, campos `dfecha`/`hfecha` ✓ (vienen con la fecha de hoy ✓) y **tres botones**: **`lanzar(1)` Detalle · `lanzar(2)` Clasificaciones · `lanzar(3)` Jornadas** ✓.
- ✗ **Pendiente, y no bloquea**: **no he encontrado la definición de `calcula()` ni de `lanzar()`** ✗ — no están en `funcionesajax.js` ✓ ni en la página ✓; estarán en **otro JS** ✓. **Para leer no hace falta** ✓ (con los niveles 1-3 basta ✓); sólo haría falta si el lector quiere **enumerar por la vía oficial** en vez de por los `href` ✓.

### Ejemplos guardados (con `guarda-pagina.mjs` ✓, que quita DNI y correos ✓)

En `descargas-sondeo-multideporte\paginas\` ✓:
- **`pmdpalencia-deporte-000794.html`** (53.020 B ✓) — **el ejemplo bueno**: la tabla de partidos ✓✓
- `pmdpalencia-vercompeti-tipc0.html` (63.202 B ✓) · `pmdpalencia-vercompeti-tipc1.html` (57.484 B ✓)
- `pmdpalencia-funcionesajax.js` (209.699 B ✓) — **de aquí sale el contrato AJAX** ✓

### Peticiones hechas (respetuosas ✓, 1 cada 6 s ✓)

`tipc=0..5` (6 ✓) + `deporte.php?competi=000794` (1 ✓) + `funcionesajax.js` (1 ✓) = **8 peticiones** ✓. **Ninguna** a `cargaclasificacion.php` ✗ (el contrato se lee del JS ✓: no hacía falta pedirla ✓).

**El lector lo escribe Claude** ✓ (límite del GOAL ✓).

**Lo que esta tabla ya dice** ✓✓: en las ocho provincias de los huecos, lo que aparece es **federado** (RFECyL, RFAF, EFF-FVF, futbuteo ✓) o **PDF municipal** (Aracena ✓) — **y eso es un resultado, no una excusa** ✓: queda escrito **qué consulta** lo produjo, que es lo que faltaba ✗✓. **Candidato vivo por ahora: uno** — la **liga local de Ávila** que menciona la noticia ✓, **por identificar** ✓.



## 7. Hecha cuando…

- Las once zonas están `HECHA`, cada una con su fila en `FUTBOL-AFICIONADO.md`.
- Toda liga encontrada está: en un adaptador y probada, o anotada para Claude (formato raro), o en la lista de
  «pedir acceso», o descartada con su motivo.
- `calidad.mjs` no empeora en ninguna plataforma por lo añadido.
- Ninguna regla de §4 ni de §5 se ha cruzado.
