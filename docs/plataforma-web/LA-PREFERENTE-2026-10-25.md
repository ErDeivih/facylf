# La Preferente: qué tiene y para qué nos sirve (25/10/2026)

> **Ampliado para las 19 federaciones, con código y encargo:** `LA-PREFERENTE-PLAN-2026-10-25.md`.

> Lo pidió David: «aquí hay mucha información, no hay actas creo, pero puede servir para muchas competiciones y
> categorías». Lo revisó Claude en el navegador, con unas 60 peticiones espaciadas 5-6 s. Una muestra se contrastó con
> la cola de CyL (petición 217). Corrige lo que dijo `FUENTES-ALTERNATIVAS-2026-10-25.md` sobre La Preferente: **sí
> tiene fichas de partido completas**, aunque sólo en una parte de las competiciones.

## 1. Qué hay

| Página | Qué trae | Cómo se pide |
|---|---|---|
| **Competición** | Clasificación (general, local y visitante), jornada actual, estadísticas, enlaces a todas las secciones | `C{id}-{ccaa}/{nombre}/estadisticas.html`; otra temporada: `index.php?gr={línea}&temporada=AAAAAAAA` |
| **Calendario** | **Todos los resultados de la temporada en una página.** Tercera 8 de 1995-96: 42 jornadas en una petición. | `index.php?comp={id}&accion=calendario` |
| **Jornada** | Marcadores, y si el partido tiene ficha, su enlace («Ficha Disponible») | `index.php?comp={id}&accion=widget&jor={n}` (lo que lee hoy el adaptador) |
| **Ficha de partido** | **Lo de un acta**: titulares y suplentes con dorsal y nombre completo, cambios con minuto, goles con minuto, árbitro con su delegación, amonestados y expulsados, cuerpo técnico. Cada jugador lleva su **id de La Preferente**. | `P{id}C{comp}/{temporada}/{local-vs-visitante}` |
| **Equipo** | Plantilla con posición, convocatorias, partidos, titularidades, **minutos**, goles, amarillas y rojas; cuerpo técnico; club (localidad y año de fundación), estadio, historial y fichajes | `E{id}C{comp}-{ccaa}/{equipo}` |
| **Jugador** | **Trayectoria por temporadas y equipos, también entre comunidades** (p. ej. de Tercera de Cantabria a 1.ª Regional de CyL), y partido a partido de la temporada | `J{id}C{comp}/{equipo}/{jugador}.html` |
| **Goleadores / porteros** | Goles, goles por 90 minutos, penaltis; porteros menos goleados | `…/goleadores.html` |

- **Deportes y territorios:** fútbol, fútbol sala, baloncesto (ACB y femenino) y fútbol playa; las 17 comunidades más Ceuta y Melilla, y Gibraltar.
- **Temporadas:** en el desplegable, desde 1921-22.
  - En las categorías altas son reales: Tercera grupo 8 tiene **57 temporadas, desde 1929-30**.
  - 1.ª Regional de CyL sólo existe desde 2012-13, más 2001-02 y 2003-04.
- **Categorías por comunidad en 2025-26** (el número incluye las competiciones nacionales que salen en todas):

| Comunidad | Sénior | Juvenil | Cadete | Infantil | Alevín | Benjamín | Prebenj. | Femenino | Sala sénior | Veteranos |
|---|---|---|---|---|---|---|---|---|---|---|
| Andalucía (y Ceuta, Melilla) | 98 | 91 | 82 | 110 | 115 | 104 | 89 | 42 (+ base) | 55 | 27 |
| Galicia | 92 | 85 | 58 | 53 | 18 | 13 | 6 | 39 (+ base) | 24 | 3 |
| Cataluña | 103 | 57 | 34 | 21 (+ S13) | 4 (+ S11) | 2 (+ S9) | 2 | 32 | 68 | 1 |
| C. Valenciana | 68 | 68 | 12 | 20 | 14 | 18 | 11 | 35 | 34 | — |
| País Vasco | 41 | 32 | 9 | 20 | — | — | — | 45 (+ base) | 24 | — |
| Castilla y León | 54 | 48 | 2 | — | — | — | — | 31 | 24 | — |
| Madrid | 70 | 26 | — | — | — | — | — | 27 | 24 | — |
| Resto (Asturias, Cantabria, Baleares, Murcia, Extremadura, Navarra, Rioja, Aragón, CLM) | 35-48 | 26-39 | 0-16 | 0-3 | — | — | — | 27-35 | 24-30 | 0-1 |

Canarias (grupo 12) dio un error 502 y no se midió.

## 2. ¿Están bien los datos? Contraste con la federación (petición 217)
- **Muestra:** 1.ª División Regional de Aficionados de CyL, grupo A, 2025-26, de la cola del PC. La Preferente no tiene colaboradores en esa liga y dice «actualización 100 %».
  - **Clasificación (16 equipos):** los **puntos y los partidos coinciden en los 16**. En 4 equipos hay un gol de diferencia (GF o GC), de **2 marcadores distintos de 240**. Falta ver quién acierta: tabla cruzada o acta.
  - **Jornada 30:** 8 de 8 marcadores iguales.
  - **Plantilla del C.D. Belorado (27 jugadores):** convocatorias, titularidades, goles y amarillas **coinciden en 25**.
    - En 2 hay una diferencia de criterio: La Preferente cuenta la **doble amarilla como roja**, y nosotros como dos amarillas.
    - En 1 hay un gol de diferencia, 2 nuestros y 1 suyo; puede ser un gol en propia.
- **Conclusión:** donde hay ficha, **es el acta de la federación transcrita**, con los mismos nombres completos. Además añade minutos jugados, posición e id propio del jugador.
  - Donde **no** hay ficha, los datos (sobre todo jugadores) los meten colaboradores y pueden faltar.
  - Ejemplo: un juvenil de León, con la plantilla a ceros.

## 3. Cuánto tiene ficha (muestras de jornadas, 2025-26 salvo indicación)

| Competición | Partidos con ficha |
|---|---|
| 1.ª Regional CyL (2025-26) | **100 %** (3 jornadas) |
| 1.ª Provincial Salamanca | **100 %** |
| 2.ª Provincial Salamanca | 0 % |
| Juvenil provincial León | 0-7 % |
| Primera División | 100 % |
| Preferente Madrid | 0 % |
| Primera FFCV (Valencia) | ~12 % |
| Tercera grupo 8: 2015-16 / 2010-11 / 2005-06 | 100 % / ~10 % / 0 % |
| 1.ª Regional CyL: 2018-19 / 2013-14 | ~12 % / 0 % |

**Las fichas sólo están en las categorías altas y en las temporadas recientes.** Lo viejo y lo bajo trae sólo marcadores y clasificaciones.

## 4. Para qué nos sirve, de más a menos

1. **Histórico de resultados y clasificaciones anteriores a las webs de las federaciones.**
   - Las federaciones publican desde ~2012; La Preferente, en las categorías altas, desde los años 40 (Tercera desde 1929-30).
   - Con la página de **calendario**, cada temporada de cada competición es **una sola petición**.
   - Coste aproximado: unas 30.000-40.000 competiciones-temporada en España, a dos peticiones (competición + calendario) → **~70.000 peticiones, ~6 días** de un recolector a 7 s.
   - Es otra web, así que va **en paralelo** a las federaciones y no les quita ritmo.
   - Da a la web el palmarés y la historia de cada club y cada categoría.
2. **Competiciones nacionales que no están en las webs autonómicas:**
   - División de Honor Juvenil (la cola de CyL no la tiene; las demás federaciones, sin comprobar);
   - Primera y Segunda Federación, y las fases de ascenso;
   - Primera División y Primera Federación femeninas; fútbol sala nacional.
   - Con fichas.
3. **Trayectoria de los jugadores entre comunidades.**
   - Cada ficha trae el **id de La Preferente** de los 38-40 jugadores.
   - Así se puede unir al mismo jugador en dos federaciones distintas, donde nuestros códigos federativos no sirven.
   - Responde a «de dónde viene cada jugador» (§7 de `mejorar-web-informes.md`).
4. **Comprobación cruzada** de lo que bajamos de las federaciones.
   - Clasificaciones y goleadores (una petición por competición) frente a lo calculado de nuestras actas.
   - Detecta marcadores mal leídos y actas incompletas.
5. **Fichas de partido como segunda fuente de actas**, sólo donde la federación no sirve o no se puede:
   - Madrid y Valencia (iSquad, lento o con token);
   - Euskadi;
   - comunidades bloqueadas.
   - Para CyL **no merece la pena**: lo que le falta es casi todo base y provincial, donde La Preferente no tiene ficha.
6. **Lo no federado y veteranos:** ya entra con el adaptador `lapreferente`. Mejora: leer el **calendario** en vez de jornada a jornada, unas 30 veces menos peticiones.

## 5. Precauciones
- **No es oficial**: lo dice la propia web. En el canónico va como **fuente secundaria** (`fuente = 'lapreferente'`), y **manda la federación** cuando hay las dos.
- **Robots y condiciones:**
  - robots.txt lo permite todo, y su aviso legal no prohíbe la extracción (sólo se encontró la política de privacidad).
  - Aun así, es una base de datos montada por ellos (derecho «sui generis» de la Ley de Propiedad Intelectual, art. 133).
  - **Recogerla para uso interno y para contrastar, sí. Publicar en masa lo que sólo está en La Preferente, mejor con su permiso.** Lo decide David.
- **Ritmo:** es una web modesta (dio un 502 en la medición): una petición cada 6-8 s, una a la vez, identidad FacylfBot.
- **Datos personales:**
  - **no** se guarda la edad (sale de la fecha de nacimiento);
  - en categorías de base (menores) se aplica lo de siempre: se recoge en el PC, no se publica.
  - Escudos y fotos, no: tienen derechos de imagen.
- **Doble amarilla:** La Preferente la cuenta como roja. Al contrastar hay que normalizarlo.

## 6. Propuesta de trabajo (para DeepSeek, con el visto bueno de David)

| # | Tarea | Coste |
|---|---|---|
| L1 | Adaptador `lapreferente`: tipo **`calendario`** (una petición por competición y temporada) en lugar de jornada a jornada para lo no federado. Con pruebas. | ½ día |
| L2 | Adaptador **`lapreferente-historico`**: recorre por comunidad y categoría las competiciones de cada temporada (desplegables de la página de competición) y lee su calendario. Guarda marcadores y clasificación con `fuente = lapreferente`. **Sólo temporadas que la federación no publica** (antes de 2012-13 en CyL; el corte depende de cada federación). | 1-2 días + ~6 días de recolector en el servidor |
| L3 | **Fichas de las competiciones nacionales** (DH Juvenil, 1.ª/2.ª Federación, femenino nacional): lector de la ficha → `partido`, `alineacion`, `evento`, con el id de jugador de La Preferente. | 1-2 días |
| L4 | **Enlace de jugadores** por el id de La Preferente: tabla `persona_fuente_externa (persona, fuente, id_externo)` y un emparejador por nombre completo + equipo + temporada. Sólo adultos para publicar. | 2 días |
| L5 | **Regla de contraste** en el vigía: la clasificación de La Preferente frente a la calculada. Avisa si difieren puntos o partidos jugados. | ½ día |

Orden recomendado: **L1 → L5 → L2 → L3 → L4**. L1 y L5 son baratos y útiles ya. L2 es lo que más da: decenas de temporadas que hoy no tenemos.
