# La Preferente para las 19 federaciones: adelantar los datos y terminar la web antes (25/10/2026)

> Lo pidió David: «déjalo todo bien mirado, y no sólo para CyL, también para el resto de federaciones; así podemos
> tener los datos antes y la web terminada, aunque después sigamos ingiriendo y corrigiendo».
>
> Escrito por Claude.
> - **Medición:** unas 270 peticiones a La Preferente (LP) desde el navegador, a una cada 6-15 s (catálogo de las 17
>   comunidades, una jornada de 185 competiciones y 6 comunidades en 4 temporadas), y contraste con la cola de CyL
>   (petición 217).
> - Base: `LA-PREFERENTE-2026-10-25.md` (qué es cada página).
> - **Nada está activado:** el código nuevo tiene pruebas, pero no se usa en ninguna recogida.

## 0. La idea en cinco líneas

1. **Primero los resultados de todo, después las actas.** El calendario de LP da una temporada entera de una
   competición en **una petición**. En **~1 semana** de un recolector se tienen los resultados y las clasificaciones de
   **toda España de 2010-11 a hoy**, más el histórico de las categorías altas desde los años 40.
2. **Las fichas (el acta) donde la federación va lenta o no llega.** Por orden de prioridad:
   - Cataluña 2010-2025, que no tenemos;
   - Andalucía y Galicia, a las que les quedan ≥ 95 y ≥ 47 días;
   - las competiciones nacionales.
3. **Todo lo de LP entra como fuente secundaria.** Se guarda aparte, se empareja con el grupo de la federación por los
   marcadores, y al canónico sólo va lo que la federación no tiene. Va marcado como «dato no oficial».
4. **Cuando llega la federación, manda la federación.** La edición de LP se retira sola (`reemplazada_por`) y queda para
   contrastar.
5. **Una sola petición a la vez a LP**, a 6-8 s, desde el servidor. Es otra web, así que no le quita ritmo a ninguna
   federación.

## 1. Dónde estamos con las federaciones (vigía del 25/10, 11:50)

«Temporadas»: las de la cola en el PC; en el servidor se pone el suelo configurado (2010-11). «Días» = lo vencido entre la mediana diaria. Es **un mínimo**: las jornadas sin leer esconden actas que todavía no
están en la cola (en CyL, ~4,6 por jornada).

| Federación | Temporadas en la cola | Vencido (actas · jornadas) | Días, como mínimo |
|---|---|---|---|
| Andalucía (PC) | 2013-14 → | 101.424 · 188.889 | **95** |
| Galicia (servidor) | suelo 2010-11 | 62.455 · 89.766 | **47** |
| C. Valenciana (PC) | 2015-16 → | 5.305 · 120.500 | **42** |
| Cataluña (PC) | **sólo 2025-26 y 2026-27** | 136.628 relecturas | 24 |
| Madrid (PC) | 2015-16 → | 32.162 · 105.245 | 21 |
| Castilla-La Mancha | suelo 2010-11 | 5.959 · 21.767 | 19 |
| Aragón | suelo 2010-11 | 14.229 · 55.558 | 18 |
| CyL (PC + servidor) | 2012-13 → | 18.598 · 58.291 | 13 + 5 (ver `REPARTO-CYL`) |
| Baleares | suelo 2010-11 | 17.199 · 34.094 | 13 |
| Bizkaia / Gipuzkoa / Araba (PC) | 2010-11 → | 22.670 · 86.174 | 12 / 8 / 2,5 |
| Extremadura, Asturias, Tenerife, Murcia, Las Palmas | suelo 2010-11 (Las Palmas 2015-16, Tenerife 2016-17) | — | 5-7 |
| Cantabria | suelo 2010-11 | 1.410 · 5.518 | 2 |
| Navarra, Rioja, Euskadi, Ceuta, Melilla, Canarias | — | 0 vencido | 0 (al día o parada) |

## 2. Qué tiene LP de cada comunidad (temporada 2025-26)

- **Competiciones:** 2.343 regionales + 133 nacionales. Los grupos cuentan como competiciones distintas.
- **Fichas:** muestras de la jornada 8; entre paréntesis, cuántas competiciones se miraron.

| Comunidad | Competiciones regionales | Frente a los grupos de la federación | Fichas sénior | Juvenil | Base | Femenino | Sala |
|---|---|---|---|---|---|---|---|
| **Andalucía** | **929** | ~50 % de 1.856 | 100 % (2) | 58 % (2) | **63 % (5)** | 37 % (5) | 72 % (11) |
| **Cataluña** | **372** | ~24 % de 1.553 | 93 % (2) | 100 % (2) | **88 % (9)** | 100 % (1) | 0 % (5) |
| **Galicia** | **301** | — | 100 % (2) | 95 % (2) | **100 % (4)** | 100 % (4) | — |
| C. Valenciana | 191 | ~18 % de 1.036 | 44 % (2) | 7 % (2) | 10 % (6) | 31 % (5) | 3 % (2) |
| País Vasco | 169 (sobre todo femenino de base) | — | 0 % | 0 % | 0 % | 0 % | — |
| Extremadura | 86 | — | 0 % | 0 % | 0 % | 0 % | 0 % |
| Canarias | 57 | — | 0 % | 0 % | 0 % | 0 % | — |
| Castilla y León | 48 | ~16 % de 301 | 100 % (2) | 53 % (2) | — | 0 % | — |
| Navarra | 43 | — | 100 % (1) | — | — | 0 % (3) | — |
| Madrid | 36 | ~3 % de 1.210 | 56 % (2) | — | — | — | — |
| Castilla-La Mancha | 31 | — | 53 % | 60 % | — | 0 % | — |
| Aragón, Asturias, Murcia, Cantabria, Baleares | 10-18 | — | 0-72 % | 0 % | — | 0-29 % | — |
| La Rioja | 2 | — | 100 % | — | — | — | — |
| **Nacionales** (1.ª/2.ª División, 1.ª/2.ª Federación, DH y Liga Nacional juvenil, femenino nacional, ACB…) | 133 | — | **100 % (4)** | 77 % (4) | — | 54 % (2) | 35 % (9) |

- **Histórico** (temporadas con datos en el desplegable):
  - Andalucía, 63 desde 1944-45;
  - Galicia, 60 desde 1929-30;
  - Cataluña, 73 desde 1929-30;
  - C. Valenciana, 76 desde 1929-30;
  - CyL, 57 desde 1929-30;
  - Madrid, 55 desde 1929-30.
- **Antes de 2010 hay poco regional.** Competiciones sénior regionales en 2009-10:
  - Andalucía 36, Galicia 39, Cataluña 8, Valencia 6, Madrid 4, CyL 1;
  - en 2004-05, entre 0 y 24.
- **Fichas en temporadas pasadas** (sénior regional, 2 muestras): sobre todo en la más alta de cada comunidad.

| Comunidad | 2019-20 | 2014-15 | 2009-10 | 2004-05 |
|---|---|---|---|---|
| Andalucía | 100 % y 100 % | 94 % y 0 % | 17 % y 0 % | 0 % y 19 % |
| Galicia | 100 % y 100 % | 70 % y 0 % | 100 % y 0 % | — |
| Cataluña | 100 % y 100 % | 50 % y 0 % | 0 % y 0 % | 11 % y 0 % |
| C. Valenciana | 100 % y 12 % | 100 % y 0 % | 0 % | 0 % |
| CyL | 100 % y 0 % | 0 % | 0 % | — |
| Madrid | 100 % y 0 % | 0 % | 0 % | 0 % |

**Lectura:** donde más se adelanta es justo en las federaciones más lentas (Andalucía, Galicia) y en la que no
tiene histórico (Cataluña). En País Vasco, Extremadura y Canarias, LP sólo da resultados.

## 3. Qué adelanta LP en cada federación

| Federación | Lo que da LP antes que la federación | Prioridad |
|---|---|---|
| **Cataluña** | **Resultados y clasificaciones de 2010-11 a 2024-25** (hoy no tenemos ninguna), y fichas en sénior, juvenil y base al menos desde 2019-20 (en 2014-15, la mitad en Primera Catalana). | **1** |
| **Andalucía** | Resultados de 2010-11 a 2012-13, que no tenemos. Resultados de todo lo pendiente (189.000 jornadas vencidas) en días. Fichas de base, sala y sénior del 60-100 % de 2025-26 y 2024-25. | **1** |
| **Galicia** | Resultados de todo lo pendiente y fichas al ~100 % en todas las categorías de 2019-20 en adelante. | **2** |
| **C. Valenciana** | Resultados de 2010-11 a 2014-15, que no tenemos. Fichas parciales en sénior. | 2 |
| **Nacionales** | 1.ª/2.ª Federación, División de Honor y Liga Nacional juvenil, femenino nacional: fichas al 77-100 %. Hoy no las recoge ninguna federación (la cola de CyL no tiene la DH Juvenil). | 2 |
| Madrid | Resultados de 2010-11 a 2014-15 de sus 36 competiciones altas, y fichas en sénior. | 3 |
| País Vasco (Euskadi y forales), Canarias (y las insulares), Extremadura | Sólo resultados: rellenan grupos y temporadas que falten. Euskadi publica poco y Canarias tiene 638 partidos en 2024-25. | 3 |
| CyL, Aragón, Asturias, Cantabria, Baleares, Murcia, Navarra, Rioja, CLM | Histórico de las categorías altas desde los años 40 y contraste. Poco más: la federación va bien o va a terminar pronto. | 4 |
| Ceuta, Melilla | Por comprobar: salen dentro de Andalucía (grupos 9/10 de Tercera); falta mirar si LP tiene sus competiciones locales. | — |

## 4. Cómo entra en el canónico (propuesta)

SQL en `docs/plataforma-web/propuestas/0051-fuente-la-preferente.sql`. Es aditiva y **no está en
`infra/migraciones`**.

1. **Esquema `externo`.** Las tablas `lp_competicion`, `lp_partido`, `lp_participacion`, `lp_evento` y
   `lp_emparejado` guardan lo leído con las claves de LP: `C{id}`, `P{id}`, `J{id}` de jugador, `A{id}` de árbitro.
2. **Emparejado** (`scripts/lib/empareja-lapreferente.mjs`, con pruebas). Para cada competición de LP con
   federación conocida y la misma temporada:
   - empareja los equipos por parecido de palabras, sin forma jurídica, con prefijos («Intern.» = «Internacional») y
     con cuidado con los filiales;
   - da el grupo por **el mismo** sólo si **≥ 90 % de los marcadores comparables coinciden** (al menos 10).
   - Con los 16 equipos de la 1.ª Regional A de CyL 2025-26 empareja bien todos, incluidos «San José de Soria» con
     «C.D. San José» y «Cultural Cebrereña» con «C. y D. Cebrereña».
   - Resultado: `emparejado`, `sin_contraparte` (la federación no lo tiene) o `dudoso` (a revisar, no se proyecta).
3. **Proyección al canónico:**
   - `sin_contraparte` → `core.competition_edition` con `origen = 'lapreferente'`, `codigo_externo = 'lp:{id}'` y la
     federación de su comunidad, con sus partidos, alineaciones y eventos. Se sigue el ADR-0010: `source_capability`
     dice qué trae.
   - `emparejado` → no se proyecta nada. Si el grupo de la federación aún no tiene actas y LP sí tiene fichas, las
     fichas se proyectan a esos partidos con `match_source.url` de LP y `match_report.quality = 'partial'`, hasta que
     llegue el acta de la federación y la sustituya.
   - Cuando llega la edición de la federación de un grupo `sin_contraparte`, el emparejado la encuentra,
     `reemplazada_por` apunta a ella y la edición de LP deja de verse.
4. **Personas:** el `J{id}` de LP es la misma persona en todas las temporadas y comunidades. Entra como evidencia
   fuerte en `analytics.persona_grupo` (migración 0024): un mismo `J{id}` en dos federaciones enlaza las dos
   identidades si el nombre completo coincide.
5. **La web:**
   - toda edición, partido o acta con `origen = 'lapreferente'` lleva la marca «Dato no oficial (La Preferente)» y un
     enlace a la ficha original;
   - las fichas de **menores** siguen la regla de siempre (no se publican nombres);
   - nada de edades, escudos ni fotos de LP.

## 5. El código que ya está escrito (Claude, 25/10)

| Fichero | Qué hace | Pruebas |
|---|---|---|
| `scripts/multideporte/adaptadores/_lapreferente-ficha.mjs` | `calendario(html, comp)`: todas las jornadas de una página, con el id del partido, la URL de su ficha y si tiene ficha. `fichaPartido(html)`: fecha, hora, estadio, árbitro con su delegación, titulares, suplentes y técnicos con id de LP, dorsal y nombre completo, cambios (quién sale, quién entra, minuto), goles con minuto y marcador parcial, tarjetas (amarilla/roja) con minuto. | `_lapreferente-ficha.test.mjs` (3) con dos fixtures sintéticas copiadas de la estructura real |
| `scripts/lib/empareja-lapreferente.mjs` | Emparejado de equipos y de grupo por marcadores. | `empareja-lapreferente.test.mjs` (4), con los nombres reales del grupo A de CyL |

**Probado contra páginas reales** (en el navegador, con el mismo código):
- calendario de la 1.ª Regional A de CyL 2025-26: 30 jornadas, 240 partidos, 240 fichas;
- ficha Villarcayo-Coca: 11+11 titulares, 9 cambios, 2 goles, 6 tarjetas, árbitro y estadio, todo como en su página;
- fichas de División de Honor Gallega de base, Primera Andaluza de sala, Preferente Catalana y División de Honor Juvenil: equipos, alineaciones, goles y tarjetas bien leídos.

**Dos cosas que vigilar:**
- en las fichas de **sala** (cambios volantes) y en las de **Cataluña** no hay cambios: es lo que publica LP;
- en una ficha de CyL el árbitro salía con delegación «Sevilla». Es raro y hay que contrastarlo con la federación antes de fiarse de los árbitros de LP.

## 6. Coste en peticiones y calendario

Ritmo medido de LP: **~15 s por página** (6,5 s de pausa + 6-10 s de respuesta), o sea **~6.000 peticiones al día**
con un solo recolector.

| Paso | Peticiones | Días | Qué se tiene al acabar |
|---|---|---|---|
| L2a · Catálogo por comunidad y temporada (2010-11 → hoy) | ~300 | < 1 | Todas las competiciones de LP |
| L2b · Calendarios 2010-11 → 2026-27 (~1.800 de media por temporada) | ~29.000 | ~5 | **Resultados y clasificaciones de toda España desde 2010-11** |
| L2c · Calendarios antes de 2010 (nacionales y regionales altas) | ~9.000 | ~1,5 | Histórico desde los años 40 |
| L3 · Fichas nacionales de las 3 últimas temporadas | ~60.000 | ~10 | 1.ª/2.ª Federación, juveniles nacionales, femenino nacional con actas |
| L4 · Fichas de Cataluña 2019-20 → 2024-25 (sénior y juvenil primero; antes, las que haya) | ~150.000-250.000 | 25-40 | Actas del histórico catalán |
| L5 · Fichas de Andalucía y Galicia donde la federación aún no ha llegado | se recalcula cada semana | en paralelo | Actas antes de que lleguen las de la federación |

- **Lo importante para la web** (L2a-L2c) son **~6-7 días**.
- Las fichas son meses y van por prioridad. Cada semana se rehace la lista: sólo se piden fichas de partidos cuya acta
  de la federación no esté ya en el canónico.

## 7. Encargo para DeepSeek (con el visto bueno de David)

| # | Tarea | Terminado cuando… |
|---|---|---|
| L0 | Revisar y numerar la propuesta SQL (0051) y pasarla a `infra/migraciones`. | La migración pasa en una copia del canónico y `0001-0050` no cambian. |
| L1 | Adaptador **`lapreferente-federado`** en `scripts/multideporte/adaptadores/` con los tipos `region → temporada → calendario → ficha`, usando `_lapreferente-ficha.mjs`. Codificación windows-1252, FacylfBot, 6-8 s, una a la vez, en el servidor. **Sólo calendario** hasta que se active L3/L4. | En una prueba real de 40 páginas, 0 fallos; un calendario da todas sus jornadas y la ficha de un partido coincide con su página. |
| L2 | Lector de evidencias → `externo.lp_*` (importador nuevo, idempotente). | La 1.ª Regional A de CyL 2025-26 queda con 240 partidos, y `emparejado` con 240 comparables y ≥ 238 iguales (hay 2 marcadores distintos medidos el 25/10). |
| L3 | Emparejado en lote (`empareja-lapreferente.mjs`) y proyección de `sin_contraparte` al canónico, con `origen = 'lapreferente'`. | Cataluña 2018-19 aparece en la web con sus clasificaciones y la marca «no oficial». Ninguna edición de federación se duplica. |
| L4 | Fichas por prioridad (§6), con la lista semanal de partidos sin acta de federación. | El vigía enseña `lapreferente` con su ritmo, sus errores y las fichas por federación. |
| L5 | Regla del vigía: clasificación de LP frente a la calculada del canónico en grupos emparejados. Avisa si difieren puntos o partidos jugados. | Aviso visible y sin falsas alarmas en CyL, Andalucía y Galicia. |
| L6 | `persona_grupo` con el `J{id}` de LP como evidencia (0024). | Un jugador de LP que ha jugado en dos federaciones queda enlazado con evidencia «lapreferente». |
| L7 | Web: marca «Dato no oficial (La Preferente)» y enlace a la ficha en edición, partido y acta. | La ve David en la web y le da el visto bueno. |

**Orden:** L0 → L1 (sólo calendario) → L2 → L3 → L7 → L5 → L4 → L6. Con L0-L3 y L7, **la web tiene resultados y
clasificaciones de toda España desde 2010-11 en ~2 semanas** (código + ~6 días de recogida), aunque las federaciones
sigan.

## 8. Lo que decide David
1. **Publicar lo que sólo está en LP**, marcado como no oficial. La recomendación es pedirles permiso por escrito antes de publicarlo en abierto; recogerlo y contrastar, sí.
2. **Prioridad de las fichas:** se propone Cataluña, luego Andalucía y Galicia, luego nacionales.
3. **Dónde corre:** se propone el servidor, un solo recolector; el PC no lo nota.
