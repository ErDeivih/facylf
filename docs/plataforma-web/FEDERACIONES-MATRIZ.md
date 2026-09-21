# Matriz de federaciones y capacidades por fuente

Estado: decisión de diseño, 14 de septiembre de 2026. Complementa a
[MODELO-DATOS.md](MODELO-DATOS.md) y es de lectura obligatoria antes de escribir cualquier
importador, consulta o pantalla que asuma que un campo existe.

## 1. El problema que resuelve este documento

Castilla y León no es la referencia: es una fuente entre diecinueve, y de las más ricas. Diseñar el
modelo canónico contra Salamanca y después "adaptar las demás" produce dos fallos garantizados:

1. **Falsos ceros.** Madrid tiene miles de fichas pendientes y algunas actas sin alineaciones; si la
   web asume que la ausencia de `appearance` significa "no jugó nadie", un equipo aparece con cero
   goleadores en vez de con "pendiente de recoger" o "sin datos en esta acta".
2. **Falsas identidades.** El código de jugador de la PNFG y el `id` de iSquad son números en
   ambos casos. Cruzarlos sin `federation_id` + `context_key` fusiona personas distintas.

La regla que gobierna todo el proyecto: **ausencia de dato es un dato**, y debe viajar desde el
recolector hasta el píxel. Un campo vacío tiene tres significados incompatibles que la interfaz
jamás puede confundir:

| Significado | Origen | Cómo se muestra |
|---|---|---|
| `no_publicado_por_la_fuente` | la fuente nunca ofrece ese campo | "esta federación no publica alineaciones" |
| `pendiente_de_recolectar` | la fuente lo ofrece y aún no se ha bajado | "pendiente de recoger (J14 de 30)" |
| `ausente_en_este_caso` | la fuente lo ofrece y en este partido no hay | "sin datos en esta acta" |

## 2. Las diecinueve territoriales

Datos verificados en `ESTADO-INGESTA.md`, `HALLAZGOS-FEDERACIONES.md` y las SQLite locales
(14/09/2026).

| Federación | Adaptador | Portal | Cola |
|---|---|---|---|
| Castilla y León | PNFG (navegador) | rfcylf.es | `descargas-federacion` |
| Galicia | PNFG | futgal.es | `descargas-galicia` |
| Asturias | PNFG | asturfutbol.es | `descargas-asturias` |
| Cantabria | PNFG | rfcf.es | `descargas-cantabria` |
| Aragón | PNFG | futbolaragon.com | `descargas-aragon` |
| La Rioja | PNFG | frfutbol.com | `descargas-rioja` |
| Extremadura | PNFG | fexfutbol.com | `descargas-extremadura` |
| Navarra | PNFG | futnavarra.es | `descargas-navarra` |
| Euskadi | PNFG | euskadifutbol.eus | `descargas-euskadi` |
| Castilla-La Mancha | PNFG | ffcm.es | `descargas-castilla-la-mancha` |
| Andalucía | PNFG | rfaf.es | `descargas-andalucia` |
| Murcia | PNFG | ffrm.es | `descargas-murcia` |
| Canarias | PNFG | federacioncanariafutbol.es | `descargas-canarias` |
| Ceuta | PNFG | rffce.es | `descargas-ceuta` |
| Baleares | PNFG `/Fed/NPcd/` | ffib.es | `descargas-baleares` |
| Comunidad Valenciana | iSquad (JSON) | ffcv.es | `descargas-valencia` |
| Madrid | iSquad (JSON) | rffm.es | `descargas-madrid` |
| Cataluña | FCF (navegador propio) | fcf.cat | `descargas-cataluna` |
| Melilla | PNFG Nova | rfmf.es | `descargas-melilla` |

Diecinueve colas activas y tres familias de adaptadores en funcionamiento. Ese número no baja: el
modelo canónico nace multi-fuente.

## 3. Capacidades declaradas, no adivinadas

Cada adaptador declara qué sabe producir. Esa declaración vive en la base, no en un `if` dentro de
una página.

```sql
create table core.source_capability (
  federation_id   smallint not null references core.federation(id),
  capability      text     not null,
  support         text     not null
    check (support in ('full','partial','none','unknown')),
  season_from     text     not null default '',   -- '' = desde siempre
  season_to       text,
  evidence_url    text,
  nota            text,
  updated_at      timestamptz not null default now(),
  primary key (federation_id, capability, season_from)
);
```

Vocabulario cerrado de `capability` (ampliable sólo con ADR):

| Capacidad | Qué significa que exista |
|---|---|
| `catalogo_competiciones` | se descubren competiciones y grupos de una temporada |
| `calendario` | fecha, hora y campo previstos por jornada |
| `resultado` | marcador oficial del partido |
| `clasificacion_oficial` | tabla publicada por la federación tras cada jornada |
| `acta` | existe una ficha de partido accesible |
| `alineacion` | la ficha lista los jugadores |
| `alineacion_dividida` | la ficha distingue titular de suplente |
| `dorsal` | número de camiseta por jugador |
| `codigo_persona` | identificador federativo estable de la persona |
| `eventos_gol` | goles individualizados |
| `minuto_evento` | minuto del evento |
| `subtipo_gol` | penalti y propia puerta diferenciados |
| `tarjetas` | amarillas y rojas por jugador |
| `cambios` | entradas y salidas con minuto |
| `cuerpo_tecnico` | entrenador, delegado o auxiliares |
| `arbitros` | árbitro principal y asistentes |
| `campo` | instalación del partido |

### Estado conocido hoy

Sólo se rellena lo verificado; lo demás es `unknown` hasta que una muestra de oro lo confirme.

| Capacidad | PNFG | iSquad Valencia | iSquad Madrid | FCF Cataluña |
|---|---|---|---|---|
| `catalogo_competiciones` | full | full | full | full |
| `calendario` | full | full | full | full |
| `resultado` | full | full | full | full |
| `clasificacion_oficial` | full | full | full | full |
| `acta` | full | full | full | full |
| `alineacion` | full | full | partial | full |
| `alineacion_dividida` | partial | full | partial | unknown |
| `codigo_persona` | full | full | partial | unknown |
| `eventos_gol` | full | full | partial | full |
| `minuto_evento` | partial | full | partial | unknown |
| `subtipo_gol` | partial | full | partial | unknown |
| `cambios` | partial | full | partial | unknown |
| `cuerpo_tecnico` | full | full | partial | unknown |

Madrid es un caso que obliga a separar capacidad y cobertura. A 14/09/2026 la cola contiene 52.682
fichas enlazadas; 4.165 ya están analizadas, con 127.500 participaciones, 73.476 eventos y 23.698
técnicos. Algunas fichas concretas vienen sin alineaciones y la mayor parte del histórico sigue
pendiente. Por tanto, la capacidad existe, pero una métrica individual sólo se muestra para el
tramo realmente cubierto. La evidencia pública de calendario ofrece además enlaces «Ver acta»; la
capacidad no se deduce de una lectura antigua de `robots.txt` ni se generaliza entre temporadas.

### Cómo se usa

- El publicador rechaza un lote que traiga `appearance` de una federación con
  `alineacion = 'none'`: sería un dato inventado o un adaptador roto.
- Las consultas de ranking excluyen automáticamente las ediciones cuya federación carece de la
  capacidad que la métrica necesita, en vez de devolver ceros.
- La interfaz consulta capacidades junto con cobertura y elige el texto:
  `sin cobertura` ≠ `sin capacidad`.
- Toda pantalla nueva declara en su contrato qué capacidades exige. Sin esa declaración, la
  funcionalidad no cumple la Definition of Done.

## 4. Trampas por adaptador

### PNFG (dieciséis federaciones)

- Misma ruta `/pnfg/NPcd/NFG_CmpJornada` y mismo `cod_primaria=1000120` en casi todas; Baleares
  cuelga de `/Fed/NPcd/` y Extremadura se ha observado también sin el segmento `/NPcd/`.
- **Los códigos se repiten entre federaciones.** El mismo `cod_primaria` en dos portales no
  relaciona nada: la clave siempre lleva `federation_id`.
- La condición titular/suplente no siempre se publica → `called_up_unknown`, nunca `starter`.
- Profundidad histórica desigual: La Rioja llega a 2008/09, Canarias sólo a seis temporadas. Una
  comparación "histórica" entre federaciones sin acotar temporadas es engañosa por construcción.
- `robots.txt` devuelve `Disallow: /` para agente genérico en los seis dominios sondeados. El
  proyecto se identifica, espacia peticiones y no rota proxies; eso es política de ingesta, no del
  modelo, y está en la skill `ingesta-federacion`.

### iSquad (Valencia y Madrid)

- JSON limpio y estable, con alineaciones, cuerpo técnico, árbitros, goles con subtipo (normal,
  penalti, propia puerta), tarjetas, cambios y minutos en Valencia.
- Madrid comparte intérprete y ficha de acta. Su cobertura aún es parcial y algunas fichas no traen
  todas las secciones; el estado se decide por temporada, grupo y acta, no por federación entera.
- Los identificadores son numéricos y densos: máxima tentación de tratarlos como globales. No lo son.

### FCF (Cataluña)

- Sin API permitida: el descubrimiento sólo puede partir del HTML público; `robots.txt` excluye
  `/api/` y `/_next/`.
- Verificación de extremo a extremo ya conseguida: la clasificación oficial de la FCF cuadra
  partido a partido con los 240 partidos reconstruidos desde sus 240 actas. Ése es el patrón de
  validación que debe repetirse en cada federación, no un logro puntual.
- Volumen estimado ~240.000 actas: el alcance se prioriza por categoría y temporada en curso.

### Melilla

El portal nuevo es PNFG Nova. La primera visita crea una sesión anónima y vuelve a la portada; una
petición sin conservar esa cookie sólo recibe el aviso corto «No se ha aceptado el cookie». Tras
repetir la ruta con la sesión del navegador, expone el mismo selector que el resto: 13 temporadas,
197 competiciones en las cinco temporadas que publican catálogo y grupos/jornadas normales. Usa el
adaptador PNFG y claves propias de `federation_id`; no se reutilizan códigos del portal histórico.

## 5. Crecimiento incremental: construir la web sin tener los datos

Los datos tardarán meses (6,37 millones de peticiones pendientes, ~78 días de suelo teórico con la
federación más lenta marcando el ritmo). La web no espera: se construye contra un canónico que
crece. Reglas que lo hacen posible sin rehacer nada:

1. **La unidad de publicación es el grupo, no la federación.** En cuanto un `phase_group` alcanza
   `complete_through_matchday >= 1`, es navegable. No se espera a que termine la cola.
2. **Toda página se diseña primero en su peor estado.** El orden de implementación de una vista es
   vacío → parcial → completo, nunca al revés. Una pantalla que sólo se ha visto con Salamanca
   completa no está terminada.
3. **El importador es idempotente y reanudable.** Volver a importar un grupo con más actas
   actualiza los hechos y recalcula sólo sus agregados; no duplica ni pierde revisiones humanas.
4. **Los agregados llevan denominador.** `goles / partidos_con_acta`, nunca `goles / jornadas`.
   Cuando entran actas nuevas el número se mueve, y eso es correcto y explicable.
5. **Prioridad de importación por valor, no por tamaño.** Primero la temporada en curso de las
   federaciones con capacidades completas; después histórico; al final las de capacidad parcial.
6. **Cada federación entra con su muestra de oro.** Ver
   [CALIDAD-PRUEBAS.md](CALIDAD-PRUEBAS.md): sin comparación de recuentos contra la SQLite de
   origen, una federación no se incorpora al canónico.

## 6. Orden de incorporación al canónico

No es un orden de importancia, es un orden de riesgo decreciente: cada paso descubre un tipo de
problema distinto antes de multiplicarlo por dieciocho.

| Paso | Federación | Qué pone a prueba |
|---|---|---|
| 1 | Castilla y León (Salamanca) | el caso rico y completo; línea base de recuentos |
| 2 | Madrid | cobertura muy parcial sobre capacidad existente; fichas sin alineación |
| 3 | Comunidad Valenciana | segundo adaptador, JSON, subtipos de gol y minutos fiables |
| 4 | Cataluña | adaptador propio, volumen y contraste con clasificación oficial |
| 5 | Canarias | cola pequeña y poca profundidad histórica; caso de baja cobertura |
| 6 | Andalucía | 9.269 competiciones: el caso de catálogo masivo y facetas |
| 7 | resto de PNFG | repetición mecánica con recuentos comparados |

Antes del paso 7 el modelo canónico ya ha visto: fuente rica, cobertura mínima sobre capacidad
completa, dos formatos distintos, adaptador propio, poca profundidad histórica y catálogo enorme. Si sobrevive a eso, el resto es
volumen.

## 7. Prueba de que el modelo es realmente multi-fuente

Se considera superada cuando, con al menos cuatro federaciones cargadas:

- ninguna consulta de la web contiene un literal con nombre de federación;
- ningún `JOIN` relaciona entidades sólo por `external_id`;
- una búsqueda de un nombre común devuelve homónimos de federaciones distintas **sin fusionarlos**
  y mostrando el contexto de cada uno;
- una competición sin capacidad de acta se navega entera sin un solo "0" engañoso;
- los recuentos por federación/temporada/grupo del canónico cuadran con los de cada SQLite;
- retirar una federación del canónico y reconstruirla produce el mismo estado.
