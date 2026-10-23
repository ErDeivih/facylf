# Plataforma nacional de fútbol federado — especificación y plan

> Escrito por Claude el 21/10/2026 a petición de David: «una plataforma estilo Transfermarkt donde
> cualquier resultado de fútbol federado de España esté disponible, con sus datos y sus jugadores, y
> que pedir un club, un equipo o un jugador sea inmediato».
>
> **No sustituye** a `ARQUITECTURA.md`, `MODELO-DATOS.md` ni a los ADR: los aplica a escala nacional y
> añade lo que faltaba (el modelo de lectura, la normalización entre lenguas y el plan de despliegue).
> Todo lo marcado «medido» se midió ese día sobre las colas del PC, en sólo lectura.

---

## 0. Resumen en diez líneas

1. **El dato está; lo que falta es la capa de lectura.** Las tablas de resúmenes (`analytics.*`) existen
   desde la migración 0005 **pero están vacías: nadie las escribe**. Cada informe y cada ficha recorren
   apariciones y eventos en el momento. Ésa es la causa de fondo de la espera.
2. **Hecho hoy:** migración `0023-modelo-de-lectura.sql` + `pnpm lectura:proyectar`, que rellenan esos
   resúmenes grupo a grupo después de cada lote. Probado sobre PostgreSQL real (las 23 migraciones):
   un grupo de 240 partidos se proyecta en ~0,1 s y la ficha de un jugador se lee en ~2 ms.
3. **Los clubes estaban partidos.** La letra del final es el FILIAL (A, B, C… cada uno en una categoría
   inferior al anterior). El importador sólo la quitaba entre comillas dobles: Madrid tenía 3.404 «clubes»
   donde hay ~1.360, Valencia 2.453 donde hay ~970 y Cataluña 3.795 donde hay ~1.980. Arreglado en el
   importador (comillas simples y letra suelta) y con un script que une lo ya importado.
4. **Categoría y género sólo se entendían en castellano.** Catalán, valenciano, euskera y `SUB-NN`
   quedaban en «desconocida». Arreglado y medido: −180 desconocidas, +64 con género, 131 correcciones.
5. **Jugadores entre federaciones (§3.4):** sin código común sólo coincide el nombre. Se enlazan por
   evidencia: nombre completo, número esperado de homónimos, que nunca jueguen a la vez y que la edad que
   fijan sus categorías sea compatible. Medido: 3.235 enlaces automáticos en la muestra; el resto se
   propone en la ficha para confirmar. Las federaciones vascas comparten código: ahí es seguro.
6. **Desplegables (§3.5):** categoría → **división** (División de Honor, Liga Nacional, Preferente,
   Primera…) → grupo, y provincia, en cuatro lenguas, para filtrar por federación o cruzarlas todas.
7. **Arquitectura:** sin servicios nuevos. PostgreSQL + `pg_trgm` + resúmenes precalculados + Next.js
   con caché por etiquetas. Ni Elasticsearch, ni Redis, ni Kubernetes mientras las mediciones no lo pidan.
8. **Interfaz (§6):** aspecto de aplicación comercial, estudiado en FotMob, SofaScore, Transfermarkt y
   La Preferente. Prototipo visual de cuatro pantallas para revisar antes de construir.
9. **Uso:** privado para David y su gente, para siempre; se desarrolla en local. Sin publicar en Internet.
10. **Observabilidad:** `pg_stat_statements`, registros JSON, salud `/api/salud`, alertas por backlog de
   proyección e importación fallida.
11. **Plan:** fase 1 (aplicar lo de hoy y medir) → 2 (consultas de la web sobre `analytics`) → 3 (páginas)
    → 4 (acceso y despliegue) → 5 (identidad entre temporadas y federaciones).

---

## 1. Qué se pide y qué no

**Sí:** cualquier resultado federado de España (19 territoriales, provinciales e insulares) con su
calendario, clasificación, acta, plantillas y estadísticas; fichas de club, equipo, jugador, técnico,
árbitro, competición y partido; búsqueda global tolerante a tildes y erratas; comparativas; PDF.
Respuesta inmediata: que nada se «genere» al pedirlo.

**No (sigue valiendo `MEJORAR-WEB-INFORMES.md` §7):** valores de mercado, xG, mapas de tiro o datos en
directo. Con actas federativas no existen y no se inventan.

## 2. Diagnóstico medido

### 2.1 Volumen (colas del PC y paquetes de `_traspaso`, 21/10/2026)

| Federación (muestra) | Partidos | Con acta | Apariciones | Eventos | Notas |
|---|---:|---:|---:|---:|---|
| Andalucía (14 temporadas) | 250.874 | 230.460 | 3,1 M | 1,07 M | 6.261 competiciones distintas |
| Cataluña (2 temporadas) | 246.369 | 246.369 | 0,82 M | 0,17 M | **sin código de jugador**, sólo goles |
| Madrid (7) | 145.522 | 145.522 | 3,2 M | 1,30 M | distingue `convocados` |
| Valencia (10) | 98.442 | 98.442 | 2,6 M | 1,06 M | roles como `segundo-entrenador` |
| Araba (17) | 35.212 | 19.058 | 0,27 M | 0,12 M | 73 % de goles **sin minuto** |
| Castilla y León (2024-25) | 28.762 | 28.274 | 0,73 M | 0,43 M | la más rica |
| Melilla (2025-26) | 3.254 | 3.253 | 57 k | 25 k | códigos de jugador en el 23 % |

Proyección razonable del canónico completo: **3-5 millones de partidos, 60-100 millones de apariciones,
25-40 millones de eventos, ~4 millones de personas**. Cabe en un PostgreSQL de un solo servidor con
disco SSD; lo que no cabe es agregarlo en cada visita.

### 2.2 Por qué hoy tarda

| Síntoma | Causa comprobada |
|---|---|
| Pedir un equipo o un jugador tarda segundos | `analytics.team_edition_summary`, `player_team_season_summary`, `player_career_summary` y `search_entity`: **0 filas**, ningún proceso las escribe (`apps/web/src/consultas/entidades.ts` lo dice en su comentario). Se agregan hechos al vuelo. |
| El PDF tarda 6-40 s | Chrome sin ventana que imprime una página que, a su vez, consulta al vuelo. |
| «Para meter un club tienes que meterlo completamente bien» | Se busca por **inscripción** (equipo en un grupo) y no hay entidad club fiable: los clubes de Madrid y Valencia estaban partidos por equipo (§3.2). |
| Buscar un jugador no encuentra o duplica | La búsqueda va sobre `core.person`, sin alias ni contexto, y la misma persona tiene una identidad por federación (correcto) pero también varias si la fuente no da código. |
| Filtrar por categoría pierde competiciones | Categoría «desconocida» en catalán, euskera y `SUB-NN` (§3.1). |

## 3. Los datos por federación: diferencias y cómo se normalizan

Regla de siempre: **el literal de la fuente se conserva**; lo normalizado es una columna aparte, con su
confianza, y lo que no se sabe se queda en «desconocido», nunca en cero.

### 3.1 Lenguas y convenciones (medido sobre 12.841 nombres de competición)

| Rasgo | Dónde | Ejemplo | Tratamiento |
|---|---|---|---|
| Nombres bilingües `ES / EU` | Euskadi, Araba, Bizkaia, Gipuzkoa | `LIGA VASCA JUVENIL / GAZTEEN EUSKAL LIGA` | Se reconoce cualquiera de las dos mitades. El literal entero se muestra. |
| Catalán | Cataluña | `DIVISIÓ HONOR CADET S16`, `SEGONA CATALANA` | `cadet`, `aleví`, `benjamí`, `femení`, `segona/quarta`. |
| Valenciano mezclado | Valencia | `Primera FFCV Aleví 1r. any Castelló` | Igual que catalán. |
| Edad en vez de categoría | Selecciones, Cataluña | `SUB-14`, `S15` | 13-14 infantil, 15-16 cadete, 17-19 juvenil… con confianza 0,6. |
| Categorías fuera del vocabulario | Andalucía, Cataluña, Madrid | `Bebé`, `Minipre­benjamí`, `Debutantes` | **desconocida** (antes salían como aficionados). |
| Roles del cuerpo técnico | todas | `Entrenatzailea`, `DELEGAT CAMP`, `segundo-entrenador` | Ya normalizados en `resolucion/roles.ts` (130 literales → 17 roles). |
| Fechas | todas | `YYYY-MM-DD` en las colas | Ya uniforme. |

**Hecho:** `categoriaDesdeNombre` y `generoDesdeNombre` en `packages/canonico/src/origen/vocabularios.ts`,
con `test/vocabulario-lenguas.test.ts`. Resultado por cola: Cataluña 54 → 24 desconocidas, Bizkaia 429 →
353, Valencia 93 → 61, Euskadi 12 → 5, Rioja 5 → 1. Lo ya importado se corrige con
`pnpm lectura:reclasificar` (sólo cuenta; `--aplicar` escribe y no toca lo curado a mano).

### 3.2 Clubes y filiales

La letra del final del nombre de un equipo es el **filial**: un club no puede tener dos equipos iguales en
la misma categoría, así que el B juega por debajo del A, el C por debajo del B… y sólo en la última
categoría pueden coincidir (David, 21/10/2026). Por tanto el club es el nombre sin esa letra, y el equipo
la conserva.

| Cola | Nombres de equipo | Clubes (regla vieja) | Con comillas simples | Con letra suelta |
|---|---:|---:|---:|---:|
| Madrid | 3.522 | 3.404 | **1.358** | 1.352 |
| Valencia | 2.490 | 2.453 | **966** | 965 |
| Cataluña | 4.113 | 3.796 | 3.795 | **1.977** |
| Andalucía | 9.867 | 5.480 | 5.480 | 5.395 |

Cómo la escribe cada fuente (medido sobre nueve colas):

- entre comillas dobles o simples, en todas (`"A"`, `'B'`);
- **suelta en la FCF** (Cataluña la pone siempre: 1.317 A, 305 B, 62 C, 16 D, 4 E, 1 F): letra A-H;
- suelta a veces en las demás (`CD SAFA B`, `AXULAR LIZEOA E`): letra A-E y nunca detrás de una inicial
  con punto, porque ahí una «F» final suele ser «Femenino» o la forma jurídica (`E.M.F. ADEJE F`,
  `XEREZ FEMINAS C. F`) y hay nombres que acaban en otra letra legítima (`RIVER X`).

**Hecho:** `clubDesdeNombreEquipo` (importador) y `scripts/consolida-clubes-comillas.mjs` (lo ya importado:
cuenta sin `--aplicar`; con él, una transacción que aborta ante cualquier choque) aplican la misma regla.

### 3.3 Lo que no se une automáticamente

- **El mismo club escrito con formas distintas** (`C.D. ALFA` y `ALFA C.D.`, `PALMAS, U.D. LAS`): se
  proponen para revisión, no se unen solos.
- **Calidad desigual de actas** (declarada en `core.source_capability`, nunca rellenada): Cataluña sin
  código de jugador ni tarjetas/cambios; Araba sin minuto en la mayoría de goles; Melilla con códigos
  parciales. Lo que depende de eso se muestra con su cobertura o no se muestra.

### 3.4 El mismo jugador en varias federaciones (y en Cataluña, en varias temporadas)

**Qué hay:** ninguna federación comparte código con otra (salvo el País Vasco), y ninguna acta trae fecha
de nacimiento. Las fotos van incrustadas en las actas PNFG ligadas al código: sirven de prueba cuando las
dos federaciones las publican (fase 5). Valencia escribe «Carles Zomeño Fajardo»; el resto, «ZOMEÑO
FAJARDO, CARLES». En Cataluña no hay código de jugador: cada temporada y equipo es una identidad aparte
(ADR-0011), así que sin enlazar tampoco hay trayectoria dentro de Cataluña.

**El método** (registro probabilístico, tipo Fellegi-Sunter, con reglas que descartan):

1. **Clave de nombre** `nombre | apellido1 apellido2`, sin tildes ni partículas, conservando el ORDEN de
   los apellidos (MARTÍN BENITO ≠ BENITO MARTÍN). Sin nombre de pila o sin apellido no hay clave: «HUGO»
   no se cruza nunca.
2. **Descartes duros:** juegan en las dos el mismo periodo (fechas que se solapan; en la misma federación
   y club no cuenta), o la **edad** que fijan sus categorías es incompatible: juvenil en 2025-26 = nacido
   2007-2009; cadete 2010-2011… con tolerancia de 2 años jugando por encima y 1 por debajo.
3. **Rareza del nombre:** número esperado de personas con ese nombre y apellidos = población × p(nombre)
   × p(apellido1) × p(apellido2), con frecuencias medidas en nuestros datos y en el ámbito más
   desfavorable (España o cada federación: «Mohamed Mohamed» es raro en España y común en Ceuta).
4. **Continuidad:** temporadas seguidas pesan más que un hueco.
5. **Margen:** si otra ficha compite por el mismo nombre, no hay enlace automático.
6. **Lo humano manda:** «unir» y «separar» quedan registrados y prevalecen; nada se reescribe.

**Medido** (933.909 identidades de 16 colas, 21/10/2026): 174.126 pares de igual nombre en federaciones
distintas → 40.770 descartados por jugar a la vez, 63.354 por edad, 37.851 por nombre incompleto,
21.374 no propuestos por nombre común, **3.235 automáticos**, 4.659 de confianza alta y 2.883 a revisar.
Euskadi∩Bizkaia: 4.019 de 4.021 códigos comunes llevan el mismo nombre → enlace determinista.

**Hecho:** migración `0024-identidad-entre-federaciones.sql` (tramos, perfiles, frecuencias, candidatos,
grupos y la vista `analytics.trayectoria_unificada`), `pnpm lectura:proyectar` lo recalcula tras cada lote
y `--identidad-todo` la primera vez; consultas `trayectoria-unificada` y `candidatos-de-identidad`
(`apps/web/src/consultas/identidad.ts`). Probado con nueve casos (nombre raro en dos formatos, mismo día,
edad imposible, nombre común, dos rivales, código vasco, Cataluña sin código, nombre incompleto y decisión
humana). Los umbrales viven en `analytics.parametro_identidad` y se ajustan sin migración.

### 3.5 División, nivel y provincia

Para los desplegables (federación → temporada → categoría → **división** → grupo) y para cruzar
federaciones («todas las División de Honor juvenil»). `divisionDesdeNombre` reconoce División de Honor,
Liga Nacional, Primera/Segunda/Tercera Federación, Preferente, Primera… Quinta en las cuatro lenguas
(`Ohorezko`, `Lehentasunezko`, `Segona`, `Divisió d'Honor`, `Liga Vasca`), y no confunde «1ª FASE» ni
«1r. any». Cubre el 52 % de las competiciones: el resto son copas, torneos y ligas de base de un solo
escalón. La provincia, cuando el nombre la cita (49 %). Migración `0025` (columna `division` e índices
para el cruce) y `pnpm lectura:reclasificar` para lo ya importado.

### 3.6 Evolución de cada equipo, ascensos, descensos y zonas (migración 0026)

Cada equipo de un club es una **línea**: club + categoría + género + modalidad + letra (`"A"`, `"B"`…).
`analytics.linea_equipo_temporada` guarda una fila por temporada con la división, el nivel, la posición
final (oficial o reconstruida), si jugó fase de ascenso o promoción de permanencia y el **movimiento**
respecto al año anterior (sube, baja, se mantiene, aparece). Con eso se dibuja la evolución del club
(una fila por línea, una casilla por temporada) y la «escalera de divisiones» de un equipo.

Las **zonas** de una clasificación (ascenso directo, fase de ascenso, promoción de permanencia, descenso)
casi nunca vienen en los datos. Se aprenden de lo que pasó: si el 1.º y el 2.º de un grupo suben al año
siguiente en ≥ 60 % de los casos (con al menos dos temporadas), esas posiciones son de ascenso; igual con
la fase y los descensos. Se pueden fijar a mano por grupo o por familia en `core.reglamento_grupo`
(prioridad: manual del grupo → manual de la familia → aprendido con confianza ≥ 0,6). La vista
`analytics.zonas_de_grupo` da el resultado ya resuelto para pintar las franjas de color.

### 3.7 Los minutos, el dato principal (migración 0029)

«Los minutos jugados es casi lo más importante que tenemos de cada jugador» (David, 21/10). Por eso:
- **Cambios volantes** (fútbol base): se suman los tramos; antes el jugador quedaba sin minutos.
- **Doble amarilla escrita como dos amarillas**: cuenta como expulsión y corta los minutos en la segunda.
- **Prórroga** en copa y fases: la duración se amplía si hay eventos claramente después del final.
- **% de minutos**: sobre los partidos del equipo CON acta (`minutos_posibles`), nunca sobre los que no se ven.
- **Desglose por equipo** en la misma temporada (`analytics.minutos_por_equipo`, `analytics.jugador_temporada`):
  el equipo «de ficha» es el de más convocatorias (a igualdad, el de menos nivel); los demás tienen papel
  **superior** (el A siendo del B; juvenil siendo cadete), **inferior** u **otro club** (traspaso a mitad de
  temporada, con fecha; o «simultáneo», que se avisa). El total suma todo; la ficha lo enseña apilado.
- Si algún partido no es calculable, la cifra lleva «≥»: es lo seguro, no el total.
Medido en las colas: **Cataluña no tiene ni cambios ni tarjetas** en su cola (sólo 172.611 goles): sin arreglo
en el recolector no hay minutos allí (PLAN-DEEPSEEK §5.2).

### 3.8 Disciplina y partidos perdidos por sanción (0029)

Sin acceso a las resoluciones del comité, se **infiere**: tras una expulsión (roja directa, doble amarilla
o doble deducida) o al cumplir un ciclo de amarillas (5 por defecto, por federación en
`analytics.parametro_sancion`), se cuentan los partidos de SU equipo en ESA competición en que no aparece en
el acta hasta que reaparece. Se corta si el siguiente partido no tiene acta, al final de temporada o en un tope
(8). Se anota si mientras tanto jugó con otro equipo (el B). Se presenta como «partidos sin jugar tras la
expulsión», nunca como sanción oficial. Una doble amarilla que el acta escribe además como roja (Canarias lo hace
siempre) cuenta **una** expulsión.

### 3.9 Árbitros (0029)

El importador creaba una persona-árbitro por edición y, en Valencia, Madrid y Cataluña, con **todos los
colegiados unidos con « / »** en un mismo texto (31.208 partidos). `analytics.arbitro_persona` usa sólo el
principal (siempre el primero) y agrupa por federación + nombre ordenado («GARCIA PEREZ, JUAN» = «Juan García
Pérez»). `analytics.arbitro_temporada` y `arbitro_comparado`: partidos, amarillas y expulsiones por partido
frente a la media de sus colegas en la misma competición, penaltis marcados, % de victorias locales y su
trayectoria (la competición más alta que dirige cada temporada). Arreglo de raíz (asistentes y código de
árbitro, que Novanet publica): PLAN-DEEPSEEK §5.3.

### 3.10 Posición y edad (0029)

**Posición** (medido sobre muestras): Valencia la publica en ~85 % de los jugadores desde 2025-26 (y el sistema,
«1-4-3-3», en ~85 % de las actas); Madrid en ~10 %; Cataluña sólo el capitán; el resto sólo el portero. Se
guarda donde existe (`core.appearance_detalle`, `core.match_esquema`, `scripts/rellena-posiciones.mjs` para lo
archivado) y **no se deduce**: el dorsal acierta la línea sólo en el 64 % de los titulares (238 actas de Valencia).
**Edad**: no hay fecha de nacimiento en ninguna acta. Se deduce de la categoría más joven de cada temporada
(juvenil = nacidos Y-18…Y-16 si la temporada empieza en Y) y se estrecha temporada a temporada; si no cuadra
una sola edad, `edad_incoherente` (posible unión errónea). **Fotos**: las actas Fénix (Castilla y León y otras)
llevan la foto del jugador incrustada; servirán como prueba de identidad en el PC (fase E), nunca se publican.

### 3.11 Ojeo: buscar talento (0029 + `apps/web/src/consultas/ojeo.ts`)

«Los mejores sub-19 de Castilla y León»: filtros de federación, temporada, año de nacimiento, categoría, nivel
mínimo, minutos mínimos, portero, posición (sólo donde se publica), «juega por encima de su edad» y provincia.
Puntuación orientativa 0-100 = percentiles **dentro de la búsqueda**: minutos 30 %, % de minutos de su equipo
15 %, nivel (escalón) 20 %, minutos por encima 10 %, temporadas previas en nivel alto 10 %, goles por 90 10 %
(porteros: titularidades), expulsiones −5 %. Siempre se enseña con sus componentes. El **escalón**
(`analytics.escalon`) ordena divisiones de federaciones distintas de forma orientativa, nunca como equivalencia
oficial. Todos los casos raros de los datos, con su tratamiento: [`CASUISTICAS.md`](CASUISTICAS.md).

## 4. Investigación: qué hacen otros y qué nos sirve

| Referencia | Qué tomamos (la decisión, no la forma) |
|---|---|
| **Transfermarkt** | Buscador único arriba con resultados por tipo (jugador, club, competición); ficha de jugador con trayectoria por temporada; ficha de club con plantilla por temporada y selector de temporada en la URL. |
| **La Preferente** (fútbol modesto español) | Tabla de trayectoria por temporada con equipo, competición, PJ/PT/min/goles/tarjetas y resultado del equipo; ficha de club con «Plantilla / Historial / Estadio». Es exactamente lo que nuestras actas permiten, con más rigor de cobertura. |
| **BeSoccer / resultados-futbol** | Navegación federación → competición → grupo; últimos partidos del jugador con marcador. |
| **FBref** | Tablas densas con cabecera fija, orden por columna, explicación de cada métrica y exportación. |
| **FotMob / SofaScore** | Ficha de partido legible (alineaciones, eventos por minuto) y forma reciente en la previa. |

**Estudio de interfaz (21/10/2026, visto en el navegador, sin cuenta y sin aceptar cookies):**

| Patrón | Dónde | Cómo se adapta |
|---|---|---|
| Cabecera de entidad (escudo, nombre, contexto, selector de temporada) + pestañas | FotMob, SofaScore | Igual en club, equipo, competición y jugador. |
| Tarjetas en rejilla en la portada de una ficha (forma, próximo partido, alineación) | FotMob | «Resumen» del equipo; el detalle va en pestañas (lo de serie y lo de un clic más). |
| Tabla densa con escudo, zonas de color en el borde, leyenda y glosario de abreviaturas | SofaScore | Clasificación con ascenso/descenso y forma V/E/D con letra (no sólo color). |
| Barra de progreso de la temporada | SofaScore | «Jornada 12 de 30 · verificado hasta la J12»: une avance y cobertura. |
| Ruta País › Liga › Club › Jugador y datos clave del jugador | Transfermarkt | Federación › Categoría › División › Grupo. |
| Cinco desplegables en cascada (territorial, deporte, categoría, competición, temporada) | La Preferente | Es la navegación que piden los usuarios del fútbol modesto; con aspecto actual. |

Principio de FotMob (su responsable de producto): decidir qué va **por defecto** y qué **a un clic más**,
y no enseñar una métrica hasta que el usuario la entiende.

Repositorios revisados: `felipeall/transfermarkt-api` y `felipeall/football-data-platform` (rascador →
JSON → PostgreSQL: el mismo patrón que ya tenemos, con menos rigor de identidad), `worldfootballR`.
**Ninguno aporta código reutilizable** para fútbol federado español; confirman la arquitectura.

Tecnología evaluada:

| Opción | Veredicto |
|---|---|
| `pg_trgm` + proyección `search_entity` | **Elegida.** Tolerante a tildes y erratas, indexada, sin servicio extra. |
| ParadeDB `pg_search` (BM25) | Buena candidata si un día hace falta ranking de texto largo; no lo necesitamos para nombres. |
| Meilisearch / Typesense | Servicio aparte y sincronización: sólo si `pg_trgm` no da p95 < 200 ms con datos reales. |
| `pg_ivm` (vistas incrementales) | **Descartada:** sin OUTER JOIN y bloquea la escritura mientras mantiene la vista; el importador esperaría a la web. Proyectar por grupo tras su lote es más simple y verificable. |
| Next.js 16 Cache Components (`use cache`, `cacheTag`, `revalidateTag`) | **Elegida** (ADR-0007 ya lo preveía). Caché por entidad e invalidación al proyectar. |
| Better Auth | **Elegida** para acceso: librería, usuarios en nuestro PostgreSQL, sin servicio externo. |

### 4.x Segunda ronda (22/10): ideas tomadas para minutos, ojeo y árbitros

- **FotMob, ficha de jugador**: cabecera con el color del club y datos en rejilla «valor sobre etiqueta»;
  «Rasgos del jugador», un hexágono de percentiles frente a jugadores de su misma posición; rendimiento «Total /
  Por 90»; trayectoria con pestañas «Club / Temporada» y separada en profesional y juvenil; últimos partidos con
  minutos y nota. → Nuestro perfil de 5 percentiles en el ojeo (frente a los de su edad y nivel, porque la
  posición casi nunca se conoce) y la ficha con minutos primero.
- **Transfermarkt, búsqueda avanzada**: edad o año desde/hasta, posición, capitán, dorsal, competición, división,
  país del club; los parámetros usados se resaltan en los resultados; máximo 250 resultados. → Los filtros del ojeo
  y «Guardar búsqueda».
- **CIES Football Observatory** («los sub-20 con más minutos»): el indicador de talento joven más citado es
  **minutos a una edad y en un nivel**. → Peso principal de la puntuación: minutos, % de minutos y nivel.
- FBref (percentiles de «scouting report») tiene comprobación anti-bots: no se rodeó; se usa lo que se sabe de
  su diseño público.

## 5. Arquitectura objetivo

```text
19 portales ─► recolectores (PC + servidor) ─► colas SQLite por federación (evidencia)
                                                    │  importador incremental (ya existe)
                                                    ▼
                                         PostgreSQL canónico (core.*)
                                                    │  proyector por grupo (NUEVO, 0023)
                                                    ▼
                analytics.* (resúmenes de equipo y jugador, carreras, búsqueda, cobertura)
                         │                                        │
                         ▼                                        ▼
          Next.js (fichas, búsqueda, comparar)          servicio de informes / PDF
          caché por etiqueta: club:<id>, persona:<id>,   (lee los mismos resúmenes:
          grupo:<id> · invalidada al proyectar           mismo número en web y PDF)
```

Reglas: la web **sólo lee** `analytics` y `core` con `facylf_lector`; nunca abre SQLite; ninguna petición
agrega hechos de más de un partido; toda consulta declara presupuesto y plan (`pnpm planes`).

### 5.1 El modelo de lectura (migración 0023)

| Tabla | Una fila por | La leen |
|---|---|---|
| `analytics.team_edition_summary` | equipo en un grupo | clasificación reconstruida, ficha de equipo, ficha de club |
| `analytics.player_team_season_summary` | jugador × equipo × temporada | plantilla, trayectoria, rankings |
| `analytics.player_career_summary` | jugador | cabecera de la ficha, ordenar búsquedas |
| `analytics.search_entity` | nombre o alias de persona, club, equipo, competición | buscador global |
| `analytics.proyeccion_grupo` | grupo proyectado | qué está al día (`analytics.proyeccion_pendiente`) |

Ciclo: el importador termina un lote → `ops.coverage_checkpoint.calculado_en` cambia → el grupo aparece
en `proyeccion_pendiente` → `pnpm lectura:proyectar` lo recalcula entero (idempotente) y las personas
afectadas → la web invalida `grupo:<id>` y las fichas tocadas. Las reglas de minutos son **las mismas**
que las de los informes (`informe-minutos.mjs`); si se cambia una regla, se sube
`analytics.version_metricas()` y todo vuelve a quedar pendiente.

### 5.2 Presupuestos (p95 en el servidor, datos completos)

| Recorrido | Presupuesto | Cómo se cumple |
|---|---|---|
| Sugerencias del buscador | 150 ms | `search_entity` + GIN trigramas + prefijo, límite 8 por tipo |
| Ficha de jugador | 200 ms | `player_summary_person_idx` |
| Ficha de club (todas sus temporadas) | 300 ms | `team_season(club_id)` + resúmenes |
| Ficha de equipo / plantilla | 200 ms | `player_summary_team_idx` |
| Competición y clasificación | 300 ms | `standing_snapshot` + `team_edition_summary` |
| Partido / acta | 150 ms | por `match_id` |
| PDF | < 5 s | imprime una página ya cacheada |

Paginación por clave (*keyset*), nunca `OFFSET` grande. Exportaciones asíncronas.

### 5.3 Ajustes de PostgreSQL al crecer

`shared_buffers` 25 % de la RAM dedicada, `effective_cache_size` 60-70 %, `random_page_cost` 1,1 (SSD),
`autovacuum` más agresivo en `core.appearance`/`match_event`; `pg_stat_statements` siempre activo.
PgBouncer en modo *transaction* cuando haya más de un proceso web. Particionar `appearance` y
`match_event` por temporada **sólo** si el mantenimiento (VACUUM, reindex) supera la ventana nocturna.

## 6. Interfaz: lo que ve el usuario

Aspecto de aplicación comercial, moderno y funcional: tipografía Inter con cifras tabulares, tablas densas,
escudos y colores de club sólo en su contexto, verde/gris/rojo con letra para la forma, modo oscuro, todo
usable en móvil. Se apoya en `SISTEMA-DISENO.md` (paleta neutra y acento azul-verde, ADR-0009).

**Sin contadores de vanidad** (David, 21/10): nada de «933.909 jugadores» o «1.977 clubes». Cada cifra que
aparece responde a una pregunta del usuario (posición, racha, goles, minutos, nivel de la división).

### 6.1 Mapa de navegación

Estudio de Transfermarkt, FotMob, SofaScore, BeSoccer y La Preferente (§12): ninguna organiza la barra por
tipos de dato. Lo que hacen es **enlazar entidades entre sí por sus nombres**: cualquier nombre de jugador,
equipo, club, competición o árbitro es un enlace a su página, y cada página tiene pestañas y selectores
de contexto. Lo copiamos así:

- **Barra superior mínima**: logo (inicio) · buscador único · *Explorar* (desplegables en cascada) ·
  *Rankings* · *Comparar* · equipos que sigues (estrella) · cuenta. En móvil el buscador baja a su
  propia fila.
- **Páginas de entidad** con miga de pan (club › equipo, competición › jornada) y selectores en la propia
  página: temporada, grupo, y el **conmutador de equipos del club** (Juvenil A / Juvenil B / Cadete A…)
  igual que el de Transfermarkt entre primer equipo, filial y juveniles.
- **Recorridos**: Inicio → buscar → jugador → su equipo → la competición → una jornada → el acta → otro
  jugador. O club → evolución → una casilla (aquella clasificación) → equipo → plantilla → jugador.

```
            Buscador / Explorar / Rankings / Comparar   (siempre arriba)
                               │
  Competición ── jornada ── Acta ── Jugador ── Comparar
      │  ▲                    │        │  ▲
      ▼  │                    ▼        ▼  │
  Clasificación ──────────── Equipo ── Club (evolución de sus líneas)
```

### 6.2 Prototipo v3 (artefacto «Plataforma de fútbol federado — prototipo», datos inventados)

**v3 (22/10)**: la barra suma *Ojeo*; el avatar del administrador lleva a *Salud*. Jugador rehecho con los
minutos como primera cifra (total, % del equipo, titularidades) y **barras apiladas por temporada y equipo**
(su ficha, el equipo superior del club, otro club en la misma temporada), tabla con las filas de cada equipo y
su papel, y expulsiones con los partidos que se perdió. Nuevas: 9 · **Ojeo** (filtros + tabla con perfil de
5 percentiles y puntuación), 10 · **Árbitro** (frente a la media de sus colegas, trayectoria, por competición,
últimos partidos), 11 · **Estadísticas de la competición** (resultados, goles por tramo, minutos para la
cantera por equipo, disciplina por equipo, árbitros de la liga), 12 · **Salud** (estado por área, alertas,
datos por federación, tiempos frente a presupuesto, calidad, copias, últimos errores). Equipo marca a los que
suben del B o del cadete.

**v2:**

1 · **Inicio**: buscador con sugerencias tipadas, explorador en cascada, tus equipos (forma, último y próximo).
2 · **Competición**: clasificación con franjas de zona y leyenda, barra de progreso de la temporada,
navegador de jornadas, goleadores. 3 · **Acta**: cabecera con escudos y marcador, goleadores por lado,
cronología central con iconos (gol, penalti, en propia, amarilla, doble amarilla, roja, cambio),
alineaciones a dos columnas con marcas, árbitro con sus tarjetas por partido, cara a cara.
4 · **Equipo**: posición jornada a jornada con zonas, donut V/E/D, goles a favor y en contra por tramo de
15′, plantilla con barra de minutos. 5 · **Club**: equipos de la temporada y evolución de cada línea por
temporada (división, posición, ▲ ascenso, ▼ descenso, fase y promoción), escalera de divisiones.
6 · **Jugador**: trayectoria visual (barra por temporada coloreada por club, altura = minutos, franja de
federación), tabla temporada a temporada, por qué se unieron sus fichas y homónimos descartados.
7 · **Comparar**: dos jugadores de federaciones distintas, barras enfrentadas y trayectorias alineadas.
8 · **Rankings**: goleadores (y minutos, tarjetas, porteros) con filtros y «todas las federaciones»;
comparación de ligas (goles por partido, reparto local/empate/visitante, tarjetas, actas completas).

| Ruta | Contenido | Consulta |
|---|---|---|
| `/` | Buscador, explorar, tus equipos | `BUSQUEDA_POR_NOMBRE` |
| `/competicion/[id]?grupo=&jornada=` | Clasificación con zonas, jornadas, goleadores | `ZONAS_DEL_GRUPO`, `RANKING_GOLEADORES` |
| `/partido/[id]` | Acta | (existente) |
| `/equipo/[id]` | Panel con gráficos y plantilla | `CURVA_DEL_EQUIPO`, `GOLES_POR_TRAMO` |
| `/club/[id]` | Equipos y evolución | `EVOLUCION_DEL_CLUB` |
| `/jugador/[id]` | Trayectoria unificada | `TRAYECTORIA_UNIFICADA`, `CANDIDATOS_DE_IDENTIDAD` |
| `/comparar?a=&b=` | Dos jugadores | `COMPARADOR_JUGADORES` |
| `/rankings?...` | Rankings y comparación de ligas | `RANKING_GOLEADORES`, `COMPARACION_DE_LIGAS` |
| `/ojeo?...` | Buscador de talento | `OJEO_JUGADORES` |
| `/arbitro/[id]` | Ficha de árbitro | `ARBITROS` |
| `/competicion/[id]/estadisticas` | Estadísticas de la competición | `USO_DE_CANTERA`, `ARBITROS`, `GOLES_POR_TRAMO` |
| `/admin/salud` | Salud (sólo administrador) | `ops.salud`, `ops.chequeo_diario`, `ops.consulta_minuto` |

Las consultas viven en `apps/web/src/consultas/paneles.ts` e `identidad.ts` y están en `pnpm planes`.
Cada estadística lleva su cobertura («minutos de 18 de 22 partidos»). Ningún hueco se pinta como cero.
Responsive: rejillas `auto-fit`, tablas anchas dentro de una caja con desplazamiento, objetivos táctiles
de 44 px.

## 7. Seguridad, acceso y privacidad

- **Instancia privada, para siempre** (David, 21/10/2026). Hoy se desarrolla y se usa en local; si un día
  se quiere entrar desde fuera de casa, se decide entonces cómo, sin abrir puertos.
- **Acceso por invitación** con Better Auth (correo + contraseña o enlace mágico, 2FA para administración).
  Migración `0027`: esquema `app` (y `auth` para las tablas de Better Auth), rol de base de datos
  `facylf_app`. Dos **roles**: `administrador` (todo, incluida la gestión de usuarios, unir/separar
  identidades y fijar zonas) y `usuario`. Los usuarios tienen un **paquete**:
  - `esencial`: buscar, fichas, actas, clasificaciones y rankings;
  - `ojeador`: + panel de equipo, comparador, cruce de federaciones y PDF;
  - `analista`: + comparación de ligas y exportación de datos (CSV/Parquet).
  `ver_menores_nombres` no entra en ningún paquete: se concede persona a persona, con quién y por qué
  (`app.usuario_capacidad`). `app.puede(usuario, capacidad)` es la única comprobación; cada acceso
  sensible queda en `app.registro_acceso`. Un paquete puede caducar (`valido_hasta`).
- La web lee con `facylf_lector`; escribe sólo decisiones de identidad, zonas manuales y usuarios con `facylf_app`. Proyector e importador con `facylf_publicador`.
  Migraciones con `facylf_admin`, nunca desde la web.
- Cabeceras: CSP estricta, HSTS, `frame-ancestors 'none'`; límite de peticiones por usuario en búsqueda.
- **Menores:** la AEPD ha sancionado publicar datos de menores sin consentimiento y exige
  consentimiento de los padres por debajo de 14 años (LOPDGDD art. 7). Que la federación publique un
  acta no habilita a redistribuirla. Mientras no haya una revisión jurídica, **nada con nombres de
  menores sale de la instancia privada**. (No es asesoramiento legal: es la razón de la regla.)
- **Copias:** `pg_dump` diario comprimido + copia semanal fuera del servidor; restauración probada cada
  mes en una base temporal. Las colas SQLite y los `.gz` son la copia de último recurso: el canónico se
  puede reconstruir desde ellas.

## 8. Observabilidad (migración 0030)

Objetivo (David): «mantener buenos tiempos, buenas estadísticas, que no haya errores y, si los hay, poder
subsanarlos y enterarme a tiempo».

| Pieza | Qué guarda | Quién la escribe |
|---|---|---|
| `ops.evento_app` | errores y avisos estructurados (nivel, origen, tipo, mensaje, detalle, id de petición, usuario con hash) | web, proyector, importador, vigilancia, mantenimiento, copias |
| `ops.consulta_minuto` | por consulta nombrada y minuto: n, p50, p95, máx, errores, ejecuciones sobre presupuesto | web (`lib/observabilidad.ts`) |
| `ops.web_vital` | LCP, INP, CLS, TTFB por ruta y día (p75) | web (`/api/web-vitals`) |
| `ops.copia` | cada copia y restauración de prueba | `copia-seguridad.mjs` |
| `ops.chequeos()` | ~25 comprobaciones: procesos, frescura por federación, calidad de datos, identidad, base, rendimiento, copias | SQL |
| `ops.alerta` | abre / mantiene / cierra; recordatorio cada 6 h; silenciable | `ops.registra_chequeos()` |
| `ops.chequeo_diario` | lo peor de cada chequeo cada día (histórico 400 días) | ídem |

**Avisos al móvil**: `scripts/vigilancia-plataforma.mjs` cada 15 min (Telegram, ntfy o webhook), aviso al abrir
y al cerrar, recordatorio si sigue abierta, parte diario a las 8:05. Además mira lo que SQL no ve: memoria, carga,
disco de copias y que la web responde. Umbrales en `ops.parametro` (se cambian sin migración).
**Pantalla Salud** (prototipo 12) para el administrador.

## 9. Mantenimiento y copias

| Cuándo | Qué | Script |
|---|---|---|
| cada 15 min | proyectar lo pendiente (pasada corta, sin cálculos globales) | `proyectar-lectura.mjs --limite 200 --sin-globales` |
| 3:31 | copia comprobada (`pg_restore --list`), sha256, rotación 7 diarias / 4 semanales / 6 mensuales | `copia-seguridad.mjs` |
| 4:31 | purga de ops, frecuencias de nombres, evolución, zonas, árbitros, `analyze` | `mantenimiento-bd.mjs --noche` |
| domingo 5:01 | `vacuum (analyze)` de tablas con > 10 % muertas, `reindex concurrently` de índices hinchados (con pgstattuple), top 10 sentencias | `mantenimiento-bd.mjs --semana` |
| día 2, 5:31 | restauración de prueba completa en una base temporal y comparación de recuentos | `copia-seguridad.mjs --restauracion-prueba` |

Todo se da de alta con `scripts/registrar-tareas-plataforma.ps1`. Nunca `VACUUM FULL` ni `CLUSTER` (bloquean).
Docker con servicios **nombrados**; límites de memoria por contenedor para no competir con los recolectores.

### 9.1 Capa de análisis (migración 0028)

Para el uso futuro como plataforma de análisis de datos: esquema `dwh` en estrella, sólo vistas sobre
el canónico y el modelo de lectura, legibles por `facylf_lector`.
Dimensiones `dim_temporada`, `dim_competicion` (federación, categoría, división, nivel, provincia),
`dim_equipo`, `dim_jugador` (nombre nulo si es menor). Hechos `hecho_partido`, `hecho_aparicion`,
`hecho_evento`, `hecho_jugador_temporada`, `hecho_equipo_temporada`. Con esto se responden preguntas como
«goles por partido por división y federación» o «edad de debut en Liga Nacional» con SQL simple. Cuando
haga falta más, se exporta a Parquet y se consulta con DuckDB en el PC, sin cargar el servidor.

## 10. Plan por fases

| Fase | Contenido | Se cierra cuando |
|---|---|---|
| **0 · hecho (21-22/10)** | 0023 modelo de lectura · 0024 identidad entre federaciones · 0025 división · 0026 evolución y zonas · 0027 usuarios, roles y paquetes · 0028 capa de análisis · 0029 minutos, sanciones, árbitros, posiciones y ojeo · 0030 observabilidad · vocabulario en 4 lenguas · filiales · consultas de búsqueda, identidad y paneles · prototipo v2 | pruebas en verde (abajo) |
| **1 · aplicar y medir** | `pnpm db:migrar` (0023-0030), paso a paso en [`PLAN-DEEPSEEK.md`](PLAN-DEEPSEEK.md); `consolida-clubes-comillas` (contar → copia → aplicar); `lectura:reclasificar`; `lectura:proyectar` por federaciones de noche; `--identidad-todo` | `lectura:estado` sin pendientes; p95 medidos con `pnpm planes`; muestra de 100 enlaces automáticos revisada a mano |
| **2 · consultas** | Pasar `apps/web/src/consultas` y el servicio de informes a leer `analytics` (búsqueda, jugador, equipo, club) | ninguna ficha agrega hechos; informe < 1 s |
| **3 · páginas** | Next 16 + Cache Components; rutas de §6; estados vacío/parcial/error | E2E y accesibilidad en verde |
| **4 · acceso y operación** | Better Auth (usuarios de David), rol que confirma identidades, copias, observabilidad | restauración probada; alertas probadas |
| **5 · identidad fina** | fotos (huella perceptual) como prueba; clubes con formas jurídicas distintas; técnicos y árbitros | precisión medida sobre muestra de oro |

### Comprobaciones hechas hoy (en un PostgreSQL embebido, PGlite)

- Las 23 migraciones se aplican en orden sobre una base vacía.
- `proyecta_grupo`: minutos (titular entero, cambio a los 60, suplente que entra, suplente sin entrar = 0),
  convocado sin prueba con gol cuenta como jugado y sus minutos son «no calculables», el técnico no cuenta,
  fútbol sala sin minutos, idempotente, una corrección del grupo devuelve a la persona que desaparece.
- `proyectar-lectura.mjs` de extremo a extremo por conexión real: estado → proyección → «nada pendiente».
- `reclasifica-ediciones.mts` y `consolida-clubes-comillas.mjs`: cuentan, aplican una vez, la segunda
  pasada no encuentra nada, lo curado no se toca.
- Las 25 migraciones se aplican en orden; 0024 con nueve casos de identidad y la búsqueda con alias.
- `reclasifica-ediciones.mts` rellena categoría, división, nivel y provincia; `consolida-clubes-comillas.mjs`
  une filiales con comillas y sueltas sin tocar `E.M.F. ADEJE F` ni `RIVER X`.
- `vitest`: `vocabulario-lenguas` (14) y `modalidad-nombre` (3) en verde.
- 22/10: `pruebas/sql/m29.mjs` (52 comprobaciones: minutos con volantes, doble amarilla deducida, prórroga,
  A/B, cadete en juvenil, traspaso, sanciones, ciclo de amarillas, árbitros con « / » y dos formatos, ojeo y las 5
  consultas de `ojeo.ts`) y `m30.mjs` (9: chequeos, alertas, purga). El proyector nuevo, la vigilancia y el
  mantenimiento, de extremo a extremo contra un PostgreSQL embebido. Las suites anteriores siguen en verde con
  la versión 2 de las métricas.
- Las 28 migraciones se aplican en orden. 0026: la letra del filial (`"B"`, `'C'`, `C.E. C`, no `RIVER X`),
  evolución por línea, zonas aprendidas (2 ascensos, 2 a fase y 2 descensos en el caso sintético) y la
  regla manual que manda. 0027: paquetes, concesión individual, caducidad, `facylf_app` sin acceso a lo
  demás. 0028: vistas `dwh` sin nombres de menores. Consultas de paneles (goleadores, evolución, zonas,
  curva, tramos, comparador y comparación de ligas) sobre datos de prueba.

## 11. Decisiones de David y lo que queda

Decidido (21/10): la letra es siempre el filial, también en Cataluña; privada para siempre y en local; aspecto
de aplicación comercial; sin contadores; barra por funciones; móvil de primera. Decidido (21/10, 23:06): la
unión de clubes **se aplica** (con copia antes); unir jugadores entre federaciones y medir tiempos; paquetes como
están; prototipo aprobado en estilo («me gusta mucho lo que veo»); los minutos mandan; árbitros con
estadísticas; doble amarilla deducida; partidos perdidos por sanción. **No queda nada pendiente de decidir**
para la fase A; el orden de ejecución está en [`PLAN-DEEPSEEK.md`](PLAN-DEEPSEEK.md). Sólo se le preguntará a
David si volver a descargar actas antiguas de Cataluña (§5.2 del plan) compensa el tiempo de recolección.

## 11b. Entrega del 22/10: datos por federación, usuarios, administración y anuncios

- **Capacidad de datos (0032).** Cada competición y temporada dice qué apunta: cambios, tarjetas, minuto de gol,
  posiciones, alineaciones → `nivel` completo / alineaciones / resultados / calendario. La web enseña lo que hay,
  dice lo que falta y nunca rellena. Medición por federación y reglas de pantalla: `COBERTURA-FEDERACIONES.md`.
- **Casos de datos (0032).** `ops.caso_dato`: se detectan tras cada proyección, se cierran solos si el origen se
  corrige, y una persona con `confirmar_identidades` los confirma o descarta. Catálogo: `CASUISTICAS.md`.
- **Usuarios (0031).** Better Auth (esquema `auth`) + `app.usuario`; registro por invitación; favoritos de todo
  tipo; «Mi panel» con accesos rápidos; avisos en bandeja, push y correo (`scripts/notificaciones.mjs`).
- **Administración (0034).** Áreas del panel, capacidades y señales de observabilidad: `ADMINISTRACION.md`.
- **Publicidad (0033).** Huecos preparados y apagados; AdSense sólo con CMP certificado (TCF v2.2); patrocinio
  directo sin seguimiento como alternativa: `PUBLICIDAD.md`.

## 12. Referencias para ver

- Transfermarkt, club con conmutador de equipos: https://www.transfermarkt.es/real-madrid/startseite/verein/418
- Transfermarkt, jugador (trayectoria y comparador): https://www.transfermarkt.es/federico-valverde/profil/spieler/369081
- FotMob, partido (cronología, alineaciones): https://www.fotmob.com/es/matches/espanyol-vs-real-madrid/2fzhol#5868025
- FotMob, equipo y plantilla: https://www.fotmob.com/es/teams/8633/overview/real-madrid · https://www.fotmob.com/es/teams/8633/squad/real-madrid
- SofaScore, clasificación con zonas: https://www.sofascore.com/es/football/tournament/spain/laliga/8
- La Preferente, fútbol regional en cascada: https://www.lapreferente.com/J340577/baenense-atletico-cf/modesto.html
- BeSoccer, jugador: https://www.resultados-futbol.com/jugador/2024/Alexandre-1007494
- FotMob, ficha de jugador (rasgos en percentiles, trayectoria club/temporada): https://www.fotmob.com/es/players/760712/trent-alexander-arnold
- Transfermarkt, búsqueda avanzada de jugadores (modelo del ojeo): https://www.transfermarkt.es/detailsuche/spielerdetail/suche
- Soccerway, «los sub-20 con más minutos» (CIES): https://es.soccerway.com/noticias/futbol-serie-a-betano-los-sub-20-con-mas-minutos-en-el-futbol-mundial/4zxPNfhB
