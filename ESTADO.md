# Estado del proyecto — qué hemos hecho y qué bloquea

Documento para pedir ayuda (p. ej. a otro asistente/Claude) con los **bloqueos** que tenemos.
Contexto completo y datos: `HALLAZGOS.md` y `PROYECTO.md`.

## El proyecto
Web **personal, sin ánimo de lucro**, de resultados y clasificaciones del **fútbol base de
Salamanca** (Castilla y León). Fuente de datos: la federación `www.rfcylf.es`.

- Stack: Next.js 15 (web) + Supabase (datos) + pnpm workspaces + Node 22.
- Paquetes: `apps/web` (Next), `packages/dominio` (clasificación/calendario, sin deps),
  `packages/ingesta` (cliente HTTP, parsers, discovery).
- Trabajo en `F:\EspacioCodigo\facylf`. Datos bajados en `descargas-federacion/`.

## Qué funciona

1. **Ingesta de una competición** (calendario + clasificación + jornadas + actas) con
   parsers validados: `parseaCalendario`, `parseaJornada` (marcadores), `parseaActa`,
   `parseaCompeticiones`, `parseaGrupos`.
2. **Reconstrucción** → clasificación real (evolución por jornada).
3. **Web multi-competición** (lista + vista por competición + clasificación + jornadas).
4. **Descubrimiento del histórico**: Selenium con **ventana real** vuelca el HTML de cada
   temporada (2012-13 a 2026-27) → `competicionesDeSelect` extrae **831 competiciones**
   con código+nombre. Los **grupos** por competición se obtienen navegando a cada
   competición y leyendo `#grupo` (correcto: provincial→9/12, regional→A/B, etc.).
5. **Worker continuo** reanudable, con cadencia, backoff y freno si el sitio no responde.

## Los bloqueos (donde pedimos ayuda)

### Bloqueo 1 — El histórico NO se ve por HTTP ni por headless
- `NFG_Mov_LstCompeticiones?codtemporada=N` **ignora el año** (devuelve siempre la
  temporada actual). El endpoint que filtra por año es
  `NFG_CmpJornada_Exec?codtemporada=N`, pero **por GET directo devuelve vacío** para años
  antiguos (solo la temporada actual se renderiza).
- El dato histórico lo puebla **JS** al **cambiar la temporada en el desplegable**.
- **Chrome headless (Selenium `--headless`) NO puebla** las temporadas antiguas (la web lo
  detecta). Solo funciona con **ventana real**.
- Pregunta para el asistente: ¿cómo automatizar esto de forma **honesta** (sin cabeza,
  sesión real) sin que la web lo detecte? ¿Alguna config de Selenium/Playwright que
  ejecute el JS y pase la detección headless de forma legítima?

### Bloqueo 2 — El servidor frena a ~15 peticiones por sesión
- Webhacking: tras ~15 páginas seguidas, el sitio devuelve vacío y hay que **esperar**
  (cooldown ~90 s) y reintentar. Es el rate-limit del servidor.
- Ya lo gestionamos (cooldown + reintento + reanudar), pero es **muy lento**: hay ~831
  competiciones por mirad todos los años × sus grupos → miles de peticiones.
- Pregunta: ¿cómo optimizar un crawl que **respete** un rate-limit tan estricto y no
  bloquee? ¿Batching/backoff mejor?

### Bloqueo 3 — El HTTP puro dispara el anti-bot y bloquea la IP
- El cliente HTTP identificado (`FacylfBot`) provoca la compuerta ("no se ha aceptado el
  cookie" / botnet **SonicWall**) y puede **bloquear la IP** (hay que esperar cooldowns
  largos). Selenium (navegador real, ventana) no dispara esa compuerta.
- Pregunta: ¿cómo diferenciar "humano" de "bot" sin **engañar** (sin falsificar UA, sin
  rotar proxies, sin resolver captchas)? La prioridad es **honestidad**.

### Bloqueo 4 — Mojibake / codificación
- Los **códigos y provincias** están bien, pero los **nombres** salen con acentos rotos
  ("FederaciÃ³n", "Leï¿½n") por la codificación latina del sitio capturada por el
  navegador. A veces se repara con iconv (doble codificación), otras se pierde.
- Pregunta: ¿reparación robusta de mojibake latino/UTF-8 a partir del HTML capturado?

## Reglas que no se negocian (importante)
- Proyecto personal/no comercial. **No** se suplanta el navegador ni Googlebot, **no** se
  rotan proxies para esconderse, **no** se resuelven captchas. **Ningún dato inventado.**
- Acceso **respetuoso y espaciado**, cliente identificado (`FacylfBot/1.0`), backoff ante
  429/5xx, y **parar** si un endpoint deja de responder. Si se hace público/comercial,
  **pedir permiso** a la delegación.
