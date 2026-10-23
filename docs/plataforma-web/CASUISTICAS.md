# Casuísticas de los datos: qué puede pasar y qué hace la plataforma

> Catálogo de situaciones reales (o probables) en las actas de las 19 federaciones que pueden hacer que un
> dato «parezca que coincide mal». Para cada una: **qué pasa**, **cómo se detecta**, **qué hacemos**,
> **dónde está** y **estado** (✅ hecho y probado · 🟡 hecho, falta aplicarlo en la base real · 🔴 pendiente,
> con el encargo escrito). Regla de oro de todo el catálogo: **no se inventa ningún dato**; lo que no se sabe
> se dice («≥», «no calculable», «sin acta») y no se pinta como cero.
>
> Redactado el 21/10/2026 a partir de lo pedido por David y de muestras medidas en las colas del PC.
> Pruebas: `pruebas/sql/m29.mjs` (52 comprobaciones) y `pruebas/sql/m30.mjs` (9).

## 1. Minutos (el dato principal)

| # | Qué pasa | Cómo se detecta | Qué hacemos | Dónde | Estado |
|---|---|---|---|---|---|
| 1.1 | **Cambios volantes** (fútbol 7/8 y base: sale y vuelve a entrar) | más de una entrada o salida del mismo jugador en el partido | se suman los tramos en orden de minuto y de acta; si la secuencia es imposible (entra estando dentro, sale estando fuera), NULL | `analytics.minutos_partido()` (0029) | 🟡 |
| 1.2 | **Segunda amarilla escrita como dos amarillas** | ≥ 2 amarillas en minutos distintos y ninguna roja | cuenta como **doble amarilla** (expulsión) y corta los minutos en la segunda | `proyecta_grupo` v2 (0029) | 🟡 |
| 1.3 | Dos amarillas **en el mismo minuto** | mismo jugador, mismo minuto | probable fila duplicada del acta: NO es expulsión; se avisa | chequeo `amarillas_duplicadas` (0030) | 🟡 |
| 1.4 | Doble amarilla **y además** roja en el acta (Canarias 2024-25 lo hace en sus 39 dobles: 96 rojas = 57 directas + 39 que acompañan a una doble) | doble y roja del mismo jugador en el mismo partido | **una** expulsión, motivo doble amarilla (no directa) | 0029 (`rojas` = expulsiones por partido) | 🟡 |
| 1.5 | Roja a un **suplente en el banquillo** | roja sin haber entrado | expulsión sí; minutos 0 | `minutos_partido` | 🟡 |
| 1.6 | Roja o cambio **en el añadido** (91′, 94′) | minuto > duración | cuenta como el final del partido | `minutos_partido` | 🟡 |
| 1.7 | Minuto **imposible** (150′) o **sin minuto** | fuera de [0, duración+30] o NULL | minutos del partido NULL → total «≥» | `minutos_partido` | 🟡 |
| 1.8 | **Prórroga** en copa o fase de ascenso | eventos > duración+10 en grupo de copa/fase | la duración pasa a 120 (90), 100 (80/70) o +10 | `duracion_con_prorroga` | 🟡 |
| 1.9 | Fútbol **sala y playa** | modalidad | sin minutos (no hay reloj fiable en las actas) | `duracion_reglamentaria` (0023) | ✅ |
| 1.10 | Jugador **dos veces en el acta** (titular y suplente a la vez) | dos filas mismo partido-persona | cuenta una convocatoria; minutos NULL | 0016 + 0023 | ✅ |
| 1.11 | **Convocado sin dato** de titular/suplente | `called_up_unknown` | convocatoria sí, partido jugado sólo si hay un evento suyo (entra, sale, gol) | 0023 | ✅ |
| 1.12 | Partido **administrativo** (3-0 sin jugar), **cancelado** | `official_status` | no suma minutos ni partidos al jugador; cuenta en la clasificación | `proyecta_grupo` v2 | 🟡 |
| 1.13 | **Cataluña**: el JSON del acta trae minutos junto a los jugadores pero NO dice si es cambio o tarjeta | cola de Cataluña: 0 eventos de tarjeta, cambio o salida (medido: sólo 172.611 goles) | hoy: minutos no calculables en Cataluña; arreglo en el recolector (ver PLAN-DEEPSEEK §5.2) | `recolector-cataluna` | 🔴 |
| 1.14 | Duraciones por categoría | categoría | prebenjamín 40, benjamín 50, alevín 60, infantil 70, cadete 80, resto 90 | 0023 | ✅ |
| 1.15 | **% de minutos**: el equipo jugó partidos sin acta | `partidos_cubiertos` < `partidos_elegibles` | el % se calcula sobre los partidos CON acta (`minutos_posibles`) y la pantalla dice «de N partidos con acta» | 0029 | 🟡 |

## 2. Un jugador en varios equipos en la misma temporada

| # | Qué pasa | Cómo se detecta | Qué hacemos | Dónde | Estado |
|---|---|---|---|---|---|
| 2.1 | **Ficha en el B, juega con el A** | mismo club, misma categoría, letra menor | el equipo «de ficha» es el de más convocatorias (a igualdad, el de menos nivel); los minutos del A salen como **«por encima»** y se suman al total | `proyecta_temporadas`, `minutos_por_equipo` | 🟡 |
| 2.2 | **Cadete que juega en juvenil** (o infantil en cadete, juvenil en aficionado) | mismo club, categoría mayor | «por encima» + marca **«jugó por encima de su edad»**; la edad sale de la categoría más joven | 0029 | 🟡 |
| 2.3 | **Baja del A al B** (jugador del A que juega con el B) | mismo club, equipo inferior | «por debajo» (minutos_inferior) | 0029 | 🟡 |
| 2.4 | **Cambio de club a mitad de temporada** | dos clubes con tramos de fechas que no se solapan | «traspaso» con fecha; los dos equipos en el desglose; el total suma ambos | 0029 (`cambio_club`) | 🟡 |
| 2.5 | Cambio de club **y de federación** (Madrid → CyL en enero) | dos fichas unidas por la identidad entre federaciones | igual que 2.4, en la trayectoria unificada | 0024 + 0029 | 🟡 |
| 2.6 | **Dos clubes a la vez** (fechas solapadas) | tramos solapados | «simultáneo»: puede ser fútbol + sala, un convenio, o dos personas con el mismo código; se avisa para revisar | chequeo `dos_clubes_a_la_vez` | 🟡 |
| 2.7 | **Mismo día, dos partidos** (A por la mañana, B por la tarde) | dos partidos misma fecha distinta hora | válido, cuentan los dos | — | ✅ |
| 2.8 | **Titular en dos partidos a la misma hora** | misma persona, mismo `played_at` | imposible: identidad mal unida o fecha errónea → aviso | chequeo `titular_en_dos_partidos_a_la_vez` | 🟡 |
| 2.9 | Liga **y copa** del mismo equipo | dos `team_entry` del mismo `team_season` | se agrupan en el mismo equipo para el papel; el % de minutos usa sólo la liga | `proyecta_temporadas` | 🟡 |
| 2.10 | **Fases** (primera fase y fase de ascenso en otro grupo) | mismo `team_season`, varios grupos de la edición | las sanciones se encadenan entre fases; los minutos se suman | `proyecta_sanciones_edicion` | 🟡 |

## 3. Tarjetas, expulsiones y sanciones

| # | Qué pasa | Cómo se detecta | Qué hacemos | Dónde | Estado |
|---|---|---|---|---|---|
| 3.1 | **Partidos que se pierde por expulsión** (no tenemos las resoluciones del comité) | tras la expulsión, partidos de SU equipo en ESA competición en que no está en el acta | se cuentan hasta que reaparece; se muestra como «partidos sin jugar tras la expulsión», no como sanción oficial | `analytics.sancion_inferida` | 🟡 |
| 3.2 | El siguiente partido **no tiene acta** | partido jugado sin apariciones del equipo | se corta la cuenta («sin_acta»): no se supone nada | 0029 | 🟡 |
| 3.3 | Expulsión en la **última jornada** | no hay partidos después | «fin_temporada» (la sanción se cumple la temporada siguiente y no la podemos atribuir) | 0029 | 🟡 |
| 3.4 | **No vuelve nunca** (lesión, se va) | nunca reaparece | se corta en un tope (8 partidos, configurable por federación) | `parametro_sancion.tope_partidos` | 🟡 |
| 3.5 | Juega **el partido siguiente** a una expulsión | reaparece con 0 perdidos | se muestra 0 y se avisa (recurso estimado, error de acta o roja mal atribuida) | chequeo `expulsado_que_juega_el_siguiente` | 🟡 |
| 3.6 | Mientras está sancionado en el A **juega con el B** (otra competición) | apariciones en otro equipo entre la expulsión y su vuelta | se cuenta aparte (`jugo_con_otro_equipo`); la sanción sólo cuenta en su competición | 0029 | 🟡 |
| 3.7 | **Ciclo de amarillas** (5 amarillas = 1 partido en la mayoría de territoriales) | acumulado pasa por múltiplo del ciclo | sanción inferida «ciclo_amarillas»; el ciclo por federación en `parametro_sancion` (NULL = no inferir) | 0029 | 🟡 |
| 3.8 | Las amarillas de un partido con **doble amarilla** no cuentan para el ciclo | partido con expulsión por doble | excluidas del acumulado | 0029 | 🟡 |
| 3.9 | Ciclos distintos por federación, categoría o fase (reset en la fase de ascenso) | reglamentos | hoy un ciclo por federación; 🔴 leer los reglamentos y afinar (PLAN-DEEPSEEK §6.4) | `parametro_sancion` | 🔴 |
| 3.10 | **Roja a un técnico** | `sujeto_tipo = tecnico` | no cuenta para ningún jugador; sí en el árbitro (`expulsiones_tecnicos`) | 0029 | 🟡 |
| 3.11 | Partido **aplazado** que se juega más tarde | `played_at` posterior a jornadas siguientes | las sanciones se ordenan por FECHA, no por número de jornada | 0029 | 🟡 |

## 4. Identidad de personas

| # | Qué pasa | Cómo se detecta | Qué hacemos | Dónde | Estado |
|---|---|---|---|---|---|
| 4.1 | Mismo jugador en **dos federaciones** | nombre completo raro + sin solapes + edad compatible + sin rivales | unión automática; si no, «por confirmar» en la ficha | 0024 | 🟡 |
| 4.2 | **Homónimos** que jugaban a la vez | solape de fechas | nunca se unen | 0024 | 🟡 |
| 4.3 | Unión que deja **edades incoherentes** | las categorías de las temporadas no admiten una sola horquilla | se marca `edad_incoherente` y se avisa | `ojeo_temporada`, chequeo | 🟡 |
| 4.4 | Federaciones vascas comparten código | familia `pais-vasco` | unión determinista por código | 0024 | ✅ |
| 4.5 | **Árbitros**: una persona por edición (identidad nominal) y formatos «APELLIDOS, NOMBRE» / «Nombre Apellidos» | clave de nombre ordenada | se agrupan por federación + clave; homónimos de árbitro en una federación se juntarían (rarísimo) y se separan a mano | `analytics.arbitro_persona` | 🟡 |
| 4.5b | **Varios colegiados unidos con « / »** en `partidos.arbitro` (31.208 partidos de Valencia, Madrid y Cataluña) | texto con « / » | el principal es el primero: se usa sólo esa parte (0029); arreglo de raíz en PLAN-DEEPSEEK §5.3 | `recalcula_arbitros` | 🟡 |
| 4.6 | Árbitro con **código** (Madrid y Valencia publican `cod_arbitro`) | JSON Novanet | 🔴 el importador debe guardarlo como identidad con código (determinista) y añadir asistentes | PLAN-DEEPSEEK §5.3 | 🔴 |
| 4.7 | **Fotos** de jugador incrustadas en las actas Fénix (CyL y otras) | `data:image/...;base64` en la fila | prueba adicional de identidad con huella perceptual (fase 5); nunca salen del PC | `scripts/fotos-desde-actas.mjs` | 🔴 |
| 4.8 | Menores | `person.es_menor` | sin permiso `ver_menores_nombres`, el nombre sale NULL en todas las consultas nuevas | 0027, consultas | 🟡 |

## 5. Edad y categoría

| # | Qué pasa | Cómo se detecta | Qué hacemos | Dónde | Estado |
|---|---|---|---|---|---|
| 5.1 | **No hay fecha de nacimiento** en ninguna acta | — | horquilla por categoría (temporada que empieza en Y: juvenil Y-18…Y-16, cadete Y-15…Y-14, infantil Y-13…Y-12, alevín Y-11…Y-10, benjamín Y-9…Y-8, prebenjamín Y-7…Y-6); se estrecha con cada temporada | `nacimiento_de_categoria`, `ojeo_temporada` | 🟡 |
| 5.2 | Jugar **por encima** (cadete en juvenil) | se usa la categoría MÁS JOVEN de cada temporada para la edad | la categoría mayor no estropea la edad | 0029 | 🟡 |
| 5.3 | **Femenino** y algunas ligas mixtas con horquillas más anchas | categoría + género | 🔴 tabla de excepciones por federación y género cuando se mida (hoy: horquilla estándar; la tolerante de 0024 para identidad) | — | 🔴 |
| 5.4 | Categoría **desconocida** (torneos, «minipre») | `categoria = desconocida` | no aporta a la edad | 0024/0029 | ✅ |
| 5.5 | **Aficionados**: cualquier edad ≥ 16 | categoría | no estrecha la horquilla por arriba | 0024 | ✅ |

## 6. Equipos, clubes y competiciones

| # | Qué pasa | Cómo se detecta | Qué hacemos | Dónde | Estado |
|---|---|---|---|---|---|
| 6.1 | Letra de filial con comillas, suelta o hasta la H en Cataluña | regla de letra | filial del mismo club | 0026 + vocabulario | 🟡 |
| 6.2 | El **B pasa a ser el A** al desaparecer el A | línea con letra distinta y plantilla parecida | 🔴 detectar «línea renombrada» si > 60 % de la plantilla coincide y unir la evolución | PLAN-DEEPSEEK §6.5 | 🔴 |
| 6.3 | Equipo **retirado** a mitad de temporada | `team_entry.retirado` | sus partidos anulados no cuentan en la clasificación reconstruida; la oficial manda | 0002 + importador | ✅ |
| 6.4 | **Sanción de puntos** al equipo | oficial ≠ reconstruida | prevalece la oficial; se enseña la diferencia | 0019-0022 | ✅ |
| 6.5 | **Nivel** no comparable entre federaciones | — | `escalon()` orientativo para ordenar y ojear; nunca se presenta como equivalencia oficial | 0029 | 🟡 |
| 6.6 | Clubes **convenidos** (nombres distintos, mismo proyecto) | — | NO se unen (no hay dato fiable); 🔴 tabla manual si David lo pide | — | 🔴 |

## 7. Posiciones

| # | Qué pasa | Cómo se detecta | Qué hacemos | Dónde | Estado |
|---|---|---|---|---|---|
| 7.1 | Valencia publica demarcación (~85 % desde 2025-26) y sistema (1-4-3-3) | JSON Novanet | se guarda en `core.appearance_detalle` y `core.match_esquema`; posición habitual = la más repetida como titular | 0029 + `rellena-posiciones.mjs` | 🟡 |
| 7.2 | Madrid la publica en ~10 % | ídem | ídem | ídem | 🟡 |
| 7.3 | Cataluña sólo capitán, y su JSON no trae código de jugador | — | sin código no se empareja (nunca por nombre): 🔴 que el recolector guarde el código | PLAN-DEEPSEEK §5.2 | 🔴 |
| 7.4 | Resto: sólo portero | `appearance.portero` | portero conocido en todas; las demás posiciones, desconocidas | — | ✅ |
| 7.5 | ¿Deducir la posición por el **dorsal**? | medido en 238 actas de Valencia: la línea más probable del dorsal 1-11 acierta el 64 % | **no se deduce**: 36 % de error es inventar | — | ✅ (decisión) |
