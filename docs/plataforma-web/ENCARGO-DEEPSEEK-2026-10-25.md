# Encargo para DeepSeek — 25/10/2026 (Claude, a petición de David: «adelante con todo, déjalo listo para DeepSeek»)

> Lo primero que se lee. Junta TODO lo pendiente de los últimos días en un solo orden.
> - Detalle de cada parte:
>   - `REPARTO-CYL-2026-10-25.md` (CyL entre PC y servidor);
>   - `FUENTES-ALTERNATIVAS-2026-10-25.md` (tabla cruzada de la federación);
>   - `LA-PREFERENTE-PLAN-2026-10-25.md` (La Preferente para las 19 federaciones);
>   - `ENCARGO-WEB-DEEPSEEK-2026-10-24.md` (la web, W0-W10), que sigue en paralelo.
> - **Reglas de siempre:**
>   - ritmo 5-8 s por sitio, FacylfBot, nada de proxies, captchas ni descompilar;
>   - sin DNI, correos, teléfonos ni fechas de nacimiento; los nombres de menores, nunca públicos;
>   - no tocar migraciones aplicadas;
>   - commits y push sólo si David lo pide;
>   - en el servidor, no tumbarlo; en el PC, dejar sitio a David.
> - **§0 dice lo que tiene que decidir David.** Hasta que conteste, lo que depende de él se hace con el valor por defecto
>   indicado, que es siempre el reversible o el de no publicar.

## 0. Decisiones de David (con su valor por defecto)

| # | Decisión | Por defecto, hasta que diga otra cosa | Qué bloquea |
|---|---|---|---|
| D1 | **CyL:** pasar la cola del PC al servidor hacia el 30/10-1/11 (opción A de `REPARTO-CYL` §3) y subir CyL de 10-13 s a 6-8 s cuando la pida una sola máquina. | **Sí a las dos.** Es la recomendación y no aumenta la carga sobre la web de la FCyLF. | Paso 3 |
| D2 | **La Preferente:** ¿se publica en la web, marcado como «dato no oficial», lo que sólo está allí? | **Se recoge, se guarda y se ve en la web interna, pero NO en la pública** (variable nueva `FACYLF_LP_PUBLICO=false`, a crear en L7) hasta que David diga sí. Se recomienda escribirles antes (borrador en §6). | Sólo la parte pública del paso 6 |
| D3 | **La Preferente:** orden de las fichas (actas). | Cataluña → Andalucía y Galicia → competiciones nacionales. | Paso 6 (L4) |
| D4 | **Personas huérfanas** del canónico tras reimportar Cataluña/Madrid/Valencia: ¿se borran? | **No se borra nada.** Se miden y se deja la lista. | Paso 4 |
| D5 | **Correo a La Preferente** pidiendo permiso (§6): ¿lo envía David? | No se envía nada: lo envía David si quiere. | — |

## 1. Hoy mismo (sin decisiones)

1. **Docker Desktop del PC.** El 25/10 a las 11:54 estaba parado (petición 218: «dockerDesktopLinuxEngine… not found»). Sin él no hay canónico ni importación. Arrancarlo y comprobar `docker ps` → `facylf-postgres` arriba.
2. **T2 · Desplegar el código al servidor:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1`.
   - Lleva el arreglo de los 0-0 (`scripts/lib/recolector-local.mjs`), lo de Valencia (`ActaSinDatos`) y lo del vigía.
   - **Comprobar:** en el siguiente arranque de CyL en el servidor, su registro dice «N partidos con «0-0» (o sin resultado)… toman el resultado que dan los goles de su acta». Se esperan **~18.116 en 2014-15**.
   - Repetir la petición 213 (`scripts/claude/marcador-vs-acta.mjs` en el monitor): `p00ConGoles` de 2014-15 tiene que quedar en ~0.
3. **Reimportar al canónico las temporadas de CyL con 0-0 corregidos:**
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion castilla-leon -Temporada 2013-14
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-federacion-servidor.ps1 -Federacion castilla-leon -Temporadas 2014-15
   ```
   - 2013-14 es del PC; 2014-15, del servidor, después del punto 2.
   - **Terminado cuando** las clasificaciones de esas temporadas en la web ya no salen llenas de empates a cero.
4. **Medir, sin cambiar nada,** los partidos cuyo resultado de jornada no cuadra con los goles del acta (`marcadorDistintoDeGoles`):
   - **3.050 en 2022-23 (servidor)**, 861 en 2017-18 (PC) y 516 en 2018-19 (servidor).
   - Para 20 de cada temporada, ver si el acta tiene goles a medias (falta un gol) o si es la jornada la que está mal.
   - Anotar el resultado en `ESTADO-DEEPSEEK.md`. **No se corrige nada** hasta que Claude lo mire.
5. **Vigía, avisos abiertos:**
   - **Castilla-La Mancha:** 74 peticiones en 24 h frente a 1.216 de mediana. Mirar su registro en el servidor y si está en pausa o atascada.
   - **Navarra:** 0 peticiones en 49 h, pero con 0 vencido y 2.141 aplazados. Probablemente esté al día; confirmar que el próximo aplazado tiene fecha y que no está parada por error.
   - **Valencia y Las Palmas:** el 51 % «aún no publicado» el domingo 25/10. Si entre semana sigue alto, pasar 5 ejemplos a Claude.

## 2. Cataluña, Madrid y Valencia 2026-27 (T5), en cuanto acabe la relectura de Cataluña

- **Medido el 25/10 a las 12:50:**
  - 2026-27 (código 22): **3.517** pendientes; 2025-26 (código 21): 17.968;
  - ritmo de 2.200-3.300 al día, así que 2026-27 acaba hacia el **26-27/10**.
  - Claude lo vuelve a mirar el 27/10 a las 08:10 UTC.
- Cuando 2026-27 esté a ~0:
  - `scripts\importar-temporada.ps1` para cataluna, madrid y valencia 2026-27;
  - medir las personas huérfanas y dejar la lista (**D4: no borrar**).
- 2025-26 de Cataluña, cuando acabe su relectura: lo mismo.

## 3. CyL: el cambio de temporadas PC → servidor (hacia el 30/10-1/11) · D1

- Pasos 1-9 de `REPARTO-CYL-2026-10-25.md` §4: la cola del PC viaja al servidor como `descargas-federacion-pc` y el PC se queda con la temporada que tenga a medias.
- Con **D1 = sí**, el recolector nuevo va a **6-8 s** (no a 10-13).
- **Cuándo:** cuando el vigía del servidor marque `ritmo_bajo` en `federacion` (se queda sin trabajo en sus temporadas). Claude tiene un aviso programado para el 30/10 a las 08:10 UTC.
- **Terminado cuando:**
  - ~10.000 peticiones al día en el recolector nuevo;
  - ninguna jornada pedida dos veces;
  - el PC sin CyL salvo esa temporada.

## 4. Tabla cruzada de la federación (PNFG): todos los resultados de un grupo en una página

`FUENTES-ALTERNATIVAS-2026-10-25.md` §2-§3.

- **Qué:** tipo de trabajo nuevo `tabla_cruzada` en el recolector PNFG (`scripts/recolector-local.mjs`), con la URL que ya sale en el `calendario.html` archivado de cada grupo (`NFG_VisTablaCruzada?cod_primaria=…&CodGrupo=…`).
  - El lector rellena el marcador de los partidos cuya jornada aún no se ha leído y apunta cuántos partidos esperan en cada jornada.
  - **No crea actas**: las actas siguen saliendo de la jornada.
- **Prioridad:** alta, por delante de las jornadas, una por grupo.
  - En CyL son 1.217 grupos: 3-4 h.
  - Sirve igual en todas las federaciones PNFG; comprobar en cada una que la página existe antes de activarla.
- **Terminado cuando:**
  - en CyL, todas las temporadas tienen clasificación completa;
  - el estimador (`scripts/claude/estima-pendiente.mjs`) da el número **exacto** de actas que faltan, sin medias.
- **No se usa** `NFG_LstPartidos` sin sus filtros obligatorios (club o campo, 7 días como mucho): es un límite puesto a propósito.

## 5. La web (sigue en paralelo)

`ENCARGO-WEB-DEEPSEEK-2026-10-24.md`, W0-W10, rama `fase-c`.

- Los datos de los pasos 4 y 6 llegan al canónico por las vías de siempre. La web no necesita nada especial salvo la marca de procedencia (L7).

## 6. La Preferente para las 19 federaciones (L0-L7)

`LA-PREFERENTE-PLAN-2026-10-25.md`.

**Ya hecho por Claude** (con pruebas y **sin activar**; 14 pruebas pasan, más las 6 del motor):
- `scripts/multideporte/adaptadores/_lapreferente-ficha.mjs`: lectores de calendario y ficha, probados contra páginas reales de 5 comunidades.
- `scripts/multideporte/adaptadores/lapreferente-federado.mjs`: el adaptador completo, con `region → calendario → ficha`.
  - Por defecto, desde 2010-11 y **sin fichas**.
  - Opciones `desde` (19291930 para el histórico) y `fichas`, una función que decide qué competiciones las piden.
  - Pruebas en `lapreferente-federado.test.mjs`.
- `scripts/lib/empareja-lapreferente.mjs`: emparejado de equipos y grupos por marcadores, con pruebas.
- `docs/plataforma-web/propuestas/0051-fuente-la-preferente.sql`: esquema `externo`, `origen` y `reemplazada_por`. **Propuesta**, no aplicada.

**Lo que queda**, en este orden:

| # | Tarea | Terminado cuando… |
|---|---|---|
| L0 | Revisar 0051, numerarla y pasarla a `infra/migraciones`. | Aplica en una copia del canónico; 0001-0050 intactas. |
| L1 | **Activar `lapreferente-federado` en el servidor, en lugar de `lapreferente`** (es un superconjunto: los dos a la vez doblarían el ritmo a la web). Quitar `lapreferente` y poner `lapreferente-federado` en `adaptadores-activos.json`, y reiniciar el multideporte para que el proceso viejo pare. Ritmo 6-8 s, un carril. Primero `desde = 20102011`, sin fichas. | En 24 h: ~6.000 peticiones, < 1 % de errores (si da 502 seguidos, pausa de 1 h) y calendarios guardados de las 17 comunidades. |
| L2 | Importador de las evidencias del multideporte a `externo.lp_*`, idempotente. | La 1.ª Regional A de CyL 2025-26 queda con 240 partidos. |
| L3 | Emparejado en lote y proyección de `sin_contraparte` al canónico con `origen = 'lapreferente'`. | Cataluña 2018-19 sale en la web **interna** con sus clasificaciones y la marca «no oficial», y no se duplica ninguna edición de federación. El grupo A de CyL 2025-26 queda `emparejado` con ≥ 238 de 240 marcadores iguales. |
| L7 | Web: marca «Dato no oficial (La Preferente)» y enlace a la ficha. **Pública sólo si D2 = sí** (`FACYLF_LP_PUBLICO`). | David la ve en la web interna. |
| L5 | Regla del vigía: clasificación de LP frente a la calculada, en grupos emparejados. | Sin falsas alarmas en CyL, Andalucía y Galicia. |
| L2c | Histórico: `desde = 19291930`. | Tercera grupo 8 1995-96 aparece completa (42 jornadas). |
| L4 | Fichas por prioridad (D3), sólo de partidos sin acta de la federación en el canónico (lista semanal). | El vigía enseña `lapreferente-federado` con sus fichas por federación. |
| L6 | El `J{id}` de LP como evidencia en `analytics.persona_grupo` (0024). | Un jugador con partidos en dos federaciones queda enlazado con evidencia «lapreferente». |

**Cuidado:**
- LP tarda ~15 s por página: ~6.000 al día con un carril. **No subir los carriles**: es una sola web.
- En una ficha de CyL el árbitro salía con delegación «Sevilla»: contrastar los árbitros de LP con la federación antes de usarlos.
- Las fichas de sala y las de Cataluña no traen cambios: es lo que publica LP, no un fallo del lector.

### Borrador del correo a La Preferente (para que lo envíe David si quiere · D5)

> Asunto: Permiso para usar datos de La Preferente en un proyecto personal de fútbol modesto
>
> Hola:
>
> Soy David, de Salamanca. Estoy montando, como proyecto personal y sin ánimo de lucro, una web de estadísticas del
> fútbol federado modesto a partir de las actas que publican las federaciones territoriales. Para las temporadas y
> competiciones que las federaciones ya no publican (sobre todo el histórico), La Preferente es la mejor fuente que existe.
>
> Querría pediros permiso para:
> 1. leer vuestras páginas de calendario y de ficha de partido con un programa identificado, a una petición cada pocos
>    segundos (nunca más deprisa) y sin tocar nada que requiera iniciar sesión;
> 2. mostrar en mi web esos resultados y fichas cuando la federación no los tenga, siempre citando a La Preferente como
>    fuente, con enlace a vuestra página y la marca de «dato no oficial».
>
> No guardaríamos fotos, escudos, edades ni ningún dato personal más allá del nombre que aparece en el acta, y los de
> menores nunca se publicarían. Si preferís otras condiciones (ritmo, horario, atribución) o que no lo hagamos, decídmelo y
> lo respetamos.
>
> Muchas gracias,
> David

## 7. Lo que ya está programado por Claude
- **27/10, 08:10 UTC:** ¿acabó la relectura de Cataluña 2026-27? (§2). También mira Valencia y Las Palmas.
- **30/10, 08:10 UTC:** ¿toca el cambio de CyL? (§3).
