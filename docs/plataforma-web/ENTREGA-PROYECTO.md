# Entrega del proyecto: qué es, cómo está hoy y qué se hace con él

**Documento autosuficiente.** Está escrito para que lo lea alguien —persona o agente— que no sabe nada de este
proyecto y pueda ayudar sin romper nada. Todo lo que dice está **medido**, y lo que no está medido se dice que
no lo está.

**Fecha de la foto:** 30 de septiembre de 2026, mañana.

---

## 0 · Resumen en diez líneas

Es una **plataforma privada de fútbol federado español** que recoge sola, todos los días, las actas y las
clasificaciones que publican **19 federaciones territoriales**, las mete en una base de datos propia y las
convierte en **informes para entrenadores**: cómo juega un rival, qué jugadores tiene, cuánto juegan, quién
marca y quién está listo para dar el salto de categoría.

No se vende ni se publica. Es una herramienta de trabajo para cuerpo técnico. Ahora mismo hay **860.178
partidos** y **1,2 millones de personas** cargados, y la recolección no para: dos máquinas piden a los portales
federativos respetando un ritmo de cortesía.

Lo que hace falta de quien ayude: **no tocar los ritmos ni los límites de los recolectores** (son acuerdos de
cortesía con portales públicos y una federación bloquea si se abusa), **no publicar nombres de menores**, y
**no inventar nunca un dato ausente** — «desconocido» y «cero» no son lo mismo en este proyecto, y confundirlos
es el error más caro que se ha cometido.

---

## 1 · Qué es el proyecto

### El producto

Una web privada que responde preguntas de fútbol, no de informática:

- **preparar un partido y estudiar a un rival**: su plantilla, sus resultados recientes, cómo reparte minutos,
  quién marca, con qué once suele salir;
- **seguir a un jugador**: en qué equipos ha jugado cada temporada, cuántos minutos, goles, tarjetas, si ha
  subido al equipo de categoría superior del club;
- **consultar competiciones**: jornadas, clasificaciones, partidos y actas;
- **comparar equipos y jugadores sin mezclar categorías ni temporadas** (un cadete no se compara con un sénior);
- y saber **si los datos están completos o a medias**, porque un informe con datos parciales miente aunque salga
  perfecto.

### Para quién

Para el **entrenador**. No es informático y no tiene por qué serlo: lo lee en el móvil o impreso. Las dos reglas
de forma que más se incumplen son «ni un identificador ni un nombre de tabla en el informe» y «corto: 5-8
páginas, no 15». Detalle en [`docs/informes/GUIA-INFORMES-EQUIPO.md`](../informes/GUIA-INFORMES-EQUIPO.md), que
es el cuaderno de oficio del proyecto y **hay que leer antes de hacer un informe**.

### De dónde salen los datos

De los portales públicos de las federaciones territoriales. Hay **cuatro plataformas distintas** y cada una se
lee de una manera:

| plataforma | federaciones | cómo se lee |
|---|---|---|
| **PNFG** | 15 (Castilla y León, Galicia, Asturias, Cantabria, Aragón, La Rioja, Extremadura, Navarra, Euskadi, Castilla-La Mancha, Andalucía, Murcia, Canarias, Ceuta, Baleares) | navegador real (Chrome), HTML |
| **iSquad** | Madrid y Valencia | API JSON, más ligera y rápida |
| **FCF** | Cataluña | portal propio: los datos sólo aparecen cuando su web los carga sola |
| **portal documental** | Melilla | su servidor devuelve **HTTP 500** en la zona de documentos: hoy **no se puede recoger** (ver `MELILLA.md`) |

**No hay acuerdo ni API oficial**: se leen páginas públicas a un ritmo deliberadamente lento (6-8 s entre
peticiones, con pausas de una hora si el portal responde 503). Ese ritmo **no se toca**: es lo que mantiene el
proyecto dentro de lo razonable y lo que evita que los portales bloqueen la IP. El proyecto **no** suplanta al
navegador, **no** rota proxies, **no** resuelve captchas y se identifica como `FacylfBot`. Si algún día esto
pasara a ser público o comercial, habría que pedir permiso a las federaciones.

### Privacidad

Hay categorías de menores (alevín, infantil, cadete, juvenil). **Los nombres de menores no se publican** y hay
marcas de ámbito en toda la cadena para que no salgan. El proyecto es privado; abrirlo a Internet exige una
decisión explícita y revisar `docs/plataforma-web/SEGURIDAD-OPERACION.md`.

---

## 2 · Cómo funciona

```text
Portales federativos (19)
        │  navegador / API, a 6-8 s por petición
        ▼
Recolectores  ──► HTML y JSON originales, comprimidos y con hash  (la EVIDENCIA)
        │
        ▼
SQLite de cada federación   ← la cola: qué falta, qué está hecho, qué falló y por qué
        │  el importador lee por lotes, sin borrar nada
        ▼
PostgreSQL canónico   ← hechos y dimensiones: federaciones, temporadas, clubes, equipos,
        │                partidos, actas, alineaciones, eventos, personas
        ▼
Web Next.js  →  informes de equipo y de jugador
```

### Las piezas, y quién es dueño de qué

| pieza | dónde vive | de qué es responsable |
|---|---|---|
| **Recolector** | `scripts/recolector-local.mjs` (+ variantes de Madrid, Valencia y Cataluña) | ritmo, reintentos, evidencia, parseo, cola |
| **Cola SQLite** | `descargas-<federación>/recolector-local/cola-v2.sqlite` | estado fiel y reanudable de ESA federación |
| **Archivo** | `descargas-<federación>/…` (HTML/JSON `.gz`) | la prueba de lo que se descargó, con URL y fecha |
| **Importador** | `scripts/importar-masivo.mjs` y `packages/canonico` | traducir la cola al contrato común, por lotes, idempotente |
| **Canónico** | PostgreSQL, contenedor `facylf-postgres` | relaciones, consultas, cobertura |
| **Web** | `apps/web` (Next.js) | navegación, presentación, informes |

**Nada se borra.** La SQLite es la fuente de reconstrucción: si algo del canónico sale mal, se vuelve a importar.
Por eso el importador nunca destruye la cola.

### Las dos máquinas

El trabajo está repartido para que las dos avancen en paralelo y **no pidan lo mismo dos veces**:

| | PC (Windows, la máquina del responsable) | servidor (Debian, 4 núcleos, 16 GB) |
|---|---|---|
| federaciones | **4**: Castilla y León, Madrid, Valencia, Cataluña | **las otras 15** |
| plazas de navegador | 4 | 5 |
| qué es | la federación de casa y las tres con plataforma propia | el grueso del histórico |
| IP | — | 192.168.1.139 · Tailscale 100.117.58.93 |

**Castilla y León se recoge desde las DOS** a la vez, repartida por temporadas completas (nunca la misma acta
en las dos): está explicado en [`REPARTO-TEMPORADAS.md`](REPARTO-TEMPORADAS.md), que hay que leer antes de tocar
`temporadas-asignadas.txt`.

Una **plaza de navegador** es un Chrome abierto: cada uno ocupa 250-900 MB. El número de plazas sale del
presupuesto de memoria (`FACYLF_MEMORIA_GB`), y cuando hay más federaciones que plazas se **turnan** (una cede
el navegador cada X minutos). Esto es lo que evita que el servidor se quede sin memoria.

---

## 3 · Estado actual (30/09/2026)

### El canónico, en números

| qué | cuánto |
|---|---|
| federaciones | 22 (19 reales + 3 de prueba) |
| temporadas | 19 (de 2008-09 a 2026-27) |
| ediciones de competición | 9.741 |
| grupos | 29.966 |
| inscripciones (equipo en una competición) | 250.024 |
| **partidos** | **860.178** |
| **actas guardadas** | **434.071** |
| alineaciones (apariciones) | 11.905.695 |
| eventos (goles, tarjetas, cambios) | 6.049.223 |
| **personas** | **1.213.588** |

### ¿Está completo? Casi nunca, y hay que decirlo

Sólo **8.514 grupos de 29.966 (28 %)** están completos, entendiendo por completo «todas las jornadas, todos los
resultados y todas las actas». Lo que entra en un informe son sólo las ediciones completas:

| temporada | ediciones | completas | % |
|---|---|---|---|
| 2025-26 | 1.834 | 923 | 50 % |
| 2024-25 | 1.165 | 516 | 44 % |
| 2023-24 | 791 | 390 | 49 % |
| 2022-23 | 713 | 224 | 31 % |
| 2021-22 | 680 | 192 | 28 % |
| 2020-21 | 508 | 163 | 32 % |
| 2019-20 | 431 | 36 | 8 % |
| 2018-19 y anteriores | 3.078 | 441 | 14 % |
| **2026-27 (en curso)** | 541 | 52 | 10 % |

**La temporada en curso es la excepción declarada**: por definición no puede estar completa, así que en los
informes se muestra con lo que hay hasta la última jornada jugada, y nunca se anuncia como cerrada.

### Por federación (partidos / actas cargadas)

| federación | partidos | actas | | federación | partidos | actas |
|---|---|---|---|---|---|---|
| Cataluña | 107.308 | 12.114 | | Baleares | 38.738 | 22.573 |
| Madrid | 75.705 | 33.282 | | Cantabria | 38.670 | 27.763 |
| Andalucía | 73.649 | 12.320 | | Murcia | 38.272 | 26.040 |
| **Castilla y León** | **67.907** | **42.005** | | Aragón | 35.832 | 23.260 |
| Valencia | 62.617 | 54.065 | | Euskadi | 33.759 | 18.463 |
| Asturias | 48.447 | 24.769 | | Ceuta | 21.252 | 17.608 |
| Galicia | 44.660 | 22.337 | | Canarias | 2.729 | 1.813 |
| Castilla-La Mancha | 43.228 | 23.542 | | Melilla | 1.112 | 894 |
| La Rioja | 42.713 | 21.660 | | | | |
| Extremadura | 42.021 | 27.805 | | | | |
| Navarra | 41.557 | 21.756 | | | | |

Nótese el desequilibrio: **Cataluña tiene los partidos pero no las actas**, y Valencia al revés. No es un fallo,
es que cada portal publica cosas distintas y la recolección va por fases (primero se descubre la estructura,
después se bajan las actas).

### La recolección, ahora mismo

| | peticiones/hora | actas/hora | ritmo real |
|---|---|---|---|
| PC (4 federaciones) | ~2.300 | ~700 | 5-8 s entre peticiones |
| servidor (15 federaciones, 5 plazas) | ~2.800 | ~2.250 | 5-15 s entre peticiones |
| **total** | **~5.000/h** | **~3.000/h** | — |

En 24 horas pasan por el sistema unas **109.000 peticiones y 84.000 actas**.

### Castilla y León (la federación de casa, y la que más importa al responsable)

| | actas hechas | % | pendientes |
|---|---|---|---|
| PC (6 temporadas) | 57.720 de 83.706 | **69 %** | 25.986 |
| servidor (6 temporadas) | 54.607 de 82.983 | **66 %** | 28.376 |

Sumando las dos: **112.327 actas hechas**, y quedan unas **43.000** de las temporadas ya identificadas → **unos
2-3 días** al ritmo actual. El reparto completo, temporada a temporada, está en `REPARTO-TEMPORADAS.md`.

### Qué está funcionando y qué no

**Funciona:** las dos flotas recolectan sin parar; el importador trae lotes al canónico; la web y la consulta de
informes responden; la pasada del fin de semana pone la última jornada por delante del histórico (los lunes en
el PC, todos los días en el servidor).

**Problemas conocidos, abiertos:**

1. **El PC se suspende por las noches** (~11 h sin recoger, ~30 % de la capacidad de Castilla y León perdida).
   No es un fallo de software: es un portátil que alguien suspende. La palanca existe (despertar la tarea a las
   06:05) pero está pendiente de decisión.
2. **El servidor se apaga solo cada dos o tres días.** Es un **portátil con batería** y está medido: con el
   cargador conectado («online»), la batería **se vacía a 1,8 W**. No hay ninguna configuración que lo apague —
   `wtmp` registra **«crash»**, no «shutdown», y el diario se corta sin secuencia de apagado. Eso es corriente,
   no software: **hay que revisar cargador, cable y conector.** Calibración y diagnóstico en
   `scripts/servidor/diagnostica-apagados.sh` y `mide-bateria.sh`.
3. **`/canonico` tarda ~20 s** en servir su resumen: hace `count(*)` sobre tablas de hechos de más de un giga
   que no caben en caché. Su prueba de contrato es intermitente. Arreglo real: una tabla de recuentos mantenida
   por el importador (una migración nueva). Ver el comentario de `RESUMEN_CANONICO`.
4. **Cataluña lleva cuatro días pidiendo al portal sin guardar una sola acta.** Medido el 30/09/2026:

   | federación (PC) | actas en la cola | última acta guardada | peticiones 24 h | actas 24 h |
   |---|---|---|---|---|
   | Castilla y León | 83.710 | hoy | 5.985 | **5.270** |
   | Madrid | 127.885 | hoy | 8.743 | 698 |
   | Valencia | 79.578 | hoy | 2.841 | 771 |
   | **Cataluña** | **16.294** | **26/09 13:11** | **6.093** | **0** |

   Son unas 20.000 peticiones al portal de la FCF en cuatro días **sin nada que enseñar**, y encima es tráfico
   de cortesía gastado en balde. Sin diagnosticar. Es un buen encargo para quien ayude.
5. **El turno de plaza del servidor es de 600 minutos.** Tras un reinicio, las 5 federaciones que ganan la
   carrera se quedan la plaza 10 horas. Hoy no hace daño (nadie espera), pero es un riesgo silencioso.
6. **Historia anterior a 2015-16 en Castilla y León**: el catálogo tiene hasta 2013-14 y se dejó fuera a
   propósito hasta cerrar la serie actual.

---

## 4 · Los informes: equipo y jugador

### Qué son

Un **informe de equipo** es un documento de scouting sobre un equipo concreto en una competición y temporada
concretas, pensado para el entrenador que va a jugar contra él o que dirige a esos chavales. Un **informe de
jugador** es la ficha individual: dónde ha jugado, cuánto, qué ha hecho.

### Cómo se piden hoy

El sistema cambió el 28/09/2026: **ya no se generan y guardan informes en un catálogo**, se **consultan en vivo**.

```powershell
pnpm informe:servir        # arranca el servicio local (queda en 127.0.0.1:4180)
# y en el navegador
http://127.0.0.1:4180
```

- Se busca el equipo (por texto, temporada, categoría, provincia, competición, grupo) y se abre.
- Cada dirección `/equipo/<inscripción>` **consulta la base en ese momento**; «Actualizar datos» vuelve a
  consultar. No hay que regenerar nada ni buscar una versión guardada.
- **Descargar PDF** crea una impresión horizontal del dashboard, con dos alcances: «resumen para preparar
  partido» y «detalle completo». El PDF **no se archiva** en el proyecto: lo entrega el servidor al navegador.
- **No se usa IA** en ningún paso: son consultas de sólo lectura, render y una impresión con Chrome.

Por consola, sin la web:

```powershell
pnpm informe:buscar --texto pizarrales --categoria juvenil   # encontrar equipos
pnpm informe:buscar --equipo 17736                           # el contexto de uno
pnpm informe:buscar --cobertura                              # qué temporadas están completas
pnpm informe:dashboard --equipo 17736 --pdf                  # generar con PDF
```

**Importante:** buscar devuelve **inscripciones**, no clubes. Una inscripción es «este equipo en esta
competición y esta temporada»; un club tiene decenas. Por eso escribir «Pizarrales» no basta.

### Qué lleva un informe de equipo

El encargo original, que sirve de plantilla:

1. **La plantilla de esta temporada**, jugador a jugador, con sus estadísticas individuales.
2. **El desempeño de cada uno la temporada pasada**, jugara donde jugara (en su equipo, en el del club de
   categoría superior o en cualquier otro).
3. **Quiénes han jugado también con el equipo de categoría superior** del club (el juvenil con el sénior, el
   cadete con el juvenil…). Es el mejor indicador de nivel disponible.
4. **Gráficas** de minutos, goles, amarillas y expulsiones, comparando temporadas.

Y lo que lleva la ficha individual de un jugador: una fila por equipo y temporada con foto, convocatorias,
titularidades, minutos, porcentaje de disponibilidad, puesto por minutos dentro de ese equipo, goles por partido
completo, cuota de goles (sólo cuando los eventos cuadran con el marcador) y tarjetas.

### La regla que gobierna todo: sólo temporadas completas

**Una competición entra entera en el informe sólo si está completa.** Cualquier otro estado significa que falta
algo y, con lo que falta, las cifras mienten. La única excepción es la temporada en curso.

Esto no es teoría: medido el 24/09/2026, un informe decía que un jugador había jugado **1 partido** en un club
la temporada anterior, cuando había jugado **toda la competición** — estaba recolectada con sus 182 actas
completas y **sin importar**. El error no fue de la consulta: fue dar por buena una comparación sin comprobar
que la base tuviera la temporada entera.

### Dónde queda lo generado

| qué | dónde |
|---|---|
| visores interactivos (autocontenidos, con fotos dentro) | `informes/dashboard/<slug>.html` |
| catálogo e índice | `informes/dashboard/catalogo.json` y `index.html` |
| instantánea con la evidencia | `informes/<slug>.datos.json` |
| las consultas exactas usadas | `informes/<slug>.consultas.sql` |
| PDF (flujo antiguo, manual) | `output/pdf/<slug>.pdf` |

Los informes antiguos **no se actualizan solos**: hay que volver a consultarlos.

---

## 5 · Lo explorado: lo que ha costado sangre

Esta sección es la más valiosa del documento. Cada punto costó un informe mal hecho o una tarde de investigación.

### Del producto y los datos

- **Descubierto no es ingerido.** Dividir actas entre partidos *descubiertos* da 95-99 % y engaña. El porcentaje
  honesto es `actas hechas / (hechas + pendientes)` de la tabla `actas`. Y ni eso basta: hay que comprobar que
  esas actas **tengan un trabajo que las pida** (ver más abajo).
- **Una temporada importada a medias produce comparaciones falsas**, y el informe sale perfecto. Se comprueba
  siempre la cobertura antes de cruzar dos temporadas.
- **«Desconocido» no es «cero».** Una alineación incompleta, un minuto imposible o un marcador ausente dejan
  `NULL`, nunca 0. Un total con un hueco dentro no se publica como completo.
- **Una fila del acta no son minutos jugados.** Ha hecho falta separar «está en el acta» de «cuánto jugó».
- **Dos maquetas de la misma página.** La jornada de PNFG puede venir «una tabla por partido» o «una sola tabla
  con toda la jornada». La segunda no se leía: 7 partidos, 7 actas correctas y **0 marcadores**. Sin marcadores
  no hay jornada cerrada, y sin jornada cerrada el importador se niega a escribir la tabla oficial.
- **La «N» final de las categorías de base.** Las reglas de menores exigían `alevín`/`benjamín` con N, y en
  valenciano y catalán son «aleví» y «benjamí», sin N. Consecuencia: **6.282 actas de niños de 8 a 12 años**
  estaban tratándose como de adultos, justo lo que el proyecto prohíbe.
- **Un nombre igual no es la misma persona.** Las identidades se vinculan por código federativo **dentro** de una
  federación, nunca por nombre. No se fusionan homónimos para rellenar cifras.
- **Un club tiene muchos equipos.** A/B/C del mismo club en la misma categoría no son el mismo equipo, y la
  trayectoria de un equipo no debe incluir a todos ellos.

### De la recolección

- **El disco, no la red, era el cuello.** Medido con instrumentación: del ciclo de un trabajo, **39 % portal y
  navegador, 60 % nuestras propias escrituras** y 0,5 % el análisis. Y eran 7 confirmaciones por acta con
  `synchronous = FULL`: **540 ms cada una** en disco duro frente a 0,0 ms en SSD.
- **Un mensaje de error que mentía.** El aviso de tiempo agotado de la web decía siempre «5 s» aunque la
  consulta declarara más, así que mandaba a buscar el problema donde no estaba.
- **Un histograma en UTC mal etiquetado** como «hora local» hizo leer mal una parada nocturna de dos horas.
- **`encola` nunca resucita un trabajo cancelado.** Un acta que vuelve al ámbito se quedaba en «pendiente» con
  el trabajo en «cancelado», y no se descargaba **nunca**: 27.000 actas en esa situación. Es el fallo silencioso
  más caro del proyecto y está explicado en `REPARTO-TEMPORADAS.md`.
- **Asignar una temporada bajo el suelo no basta.** Hay **tres** puertas y hay que abrir las tres: elegir
  trabajo, levantar el aplazamiento al año 2099 y **dejar que la temporada crezca**. Abrir sólo una deja al
  recolector sin trabajo **y sin ningún error**.
- **`pkill -f` con el patrón en la propia línea de órdenes se mata a sí mismo.** Nunca hacerlo.
- **Una SQLite viva no se copia.** Se lee, no se clona, mientras el recolector escribe.

### De la operación

- **Fallo de Docker que parece de la fuente.** `containerd: could not load stale containerd task object:
  DeadlineExceeded` dejó Navarra caída. Se arregla parando containerd y docker del todo, limpiando shims, y
  arrancando en grupos de cinco.
- **Un contenedor «creado» no está «arrancado».** La pasada semanal del servidor estuvo días en estado
  `created`: configurada y sin ejecutarse ni una vez.
- **La CPU que mide el contenedor del monitor es la de la máquina entera**, porque monta el cgroup del host.
  Medía «788 %». Con `docker stats` la realidad era casi cero.
- **`FACYLF_EXCLUIR` es la frontera entre las dos flotas.** Una federación en las dos flotas pide lo mismo dos
  veces; en ninguna, no se recoge. Las dos cosas han pasado.

---

## 6 · Invariantes: lo que NO se puede romper

Estas reglas están en `CLAUDE.md` y son el resultado de errores ya cometidos. Si quien ayuda rompe una, el daño
suele ser invisible durante días.

1. **Trabajar en español.** Y no inventar datos ausentes: **desconocido, no publicado y pendiente son estados
   distintos; nunca se convierten en cero.**
2. **Una identidad externa incluye siempre federación y contexto.** Mismo nombre no implica misma persona.
3. **Club, equipo-temporada e inscripción en una competición son entidades diferentes.**
4. **Las SQLite y los archivos comprimidos son la evidencia de la ingesta.** La web consulta PostgreSQL con un
   rol de **sólo lectura**.
5. **No publicar nombres de menores** ni abrir datos a Internet sin decisión explícita.
6. **Conservar los límites, pausas, reintentos e idempotencia de los recolectores.** No duplicar workers ni
   cambiar su ritmo como efecto lateral de otra tarea.
7. **No editar una migración ya aplicada**: añadir otra.
8. **No copiar una SQLite en marcha.**
9. **Un valor fuera del vocabulario documentado detiene el lote**; no existe un destino «otro».
10. **Todo se mide.** «Debería funcionar» no vale: se ejecuta, se cuenta y se escribe el número con su fecha.

---

## 7 · Qué hacer si vas a ayudar

### Lo que se puede hacer sin preguntar

- Leer y consultar el canónico con el rol de lectura (`pnpm db:psql`, o `scripts/estado-canonico.ps1`).
- Medir: hay herramientas para el ritmo, la cobertura y la coherencia de las colas (§8).
- Escribir y mejorar documentación.
- Añadir pruebas y arreglar lo que rompan.
- Mejorar los informes (plantilla, consultas, métricas) siempre que se respeten los invariantes.

### Lo que hay que preguntar antes

- Tocar `FACYLF_MEMORIA_GB`, los intervalos, los turnos o cualquier límite de los recolectores.
- Cambiar el reparto de temporadas entre las dos máquinas.
- Añadir o mover federaciones entre flotas.
- Cambiar el esquema del canónico (migraciones nuevas).
- Cualquier cosa que implique publicar o exponer datos.

### Cómo comprobar que no has roto nada

```bash
pnpm test                                              # 600 pasan, 1 saltada y 1 intermitente (ver abajo)
node --test scripts/lib/recolector-local.test.mjs      # las del recolector (25)
pnpm lint                                              # tipos de los paquetes
pnpm --filter @facylf/web exec tsc --noEmit            # tipos de la web
```

**La intermitente es un aviso real, no ruido:** `apps/web/test/consultas.test.ts` comprueba el contrato del
resumen del canónico y su consulta hace `count(*)` sobre tablas de más de un giga. En caliente ronda los 20 s
del presupuesto y pasa; en frío tarda ~40 s y falla. **Pasa o falla según lo templada que esté la caché**, que no
es lo que dice comprobar. No se arregla subiendo el límite — ver §10.

Y dos que avisan de lo que no se ve:

```bash
node scripts/diagnostica-actas-sin-trabajo.mjs <cola.sqlite>   # actas en ámbito sin trabajo que las pida
node scripts/diagnostica-cyl-temporadas.mjs <cola.sqlite>      # qué puede trabajar AHORA cada temporada
```

---

## 8 · Mapa: dónde está cada cosa

### Órdenes útiles (de `package.json`)

| orden | para qué |
|---|---|
| `pnpm informe:servir` | arranca la web de informes en `127.0.0.1:4180` |
| `pnpm informe:buscar --texto …` | buscar equipos desde consola |
| `pnpm db:arrancar` / `db:parar` | PostgreSQL canónico local |
| `pnpm db:estado` | estado de las migraciones |
| `pnpm importar --federacion … --temporada … --grupo …` | importar un grupo |
| `pnpm importar:estado` | cómo va el importador |
| `pnpm recolector:estado` / `recolector:preparar` | estado y plan de la cola de Castilla y León |
| `pnpm flota:reiniciar` | reiniciar la flota del PC |
| `pnpm workers:limpiar-pausa` | quitar una pausa preventiva |
| `pnpm cola:volver-a-pedir` | devolver trabajo a la cola |

### Herramientas de medida hechas a mano

| qué quieres saber | con qué |
|---|---|
| estado del canónico en una pantalla | `& .\scripts\estado-canonico.ps1` |
| ritmo de descargas (PC / servidor) | `node scripts/ritmo-descargas.mjs [--horas N]` · `bash scripts/servidor/ritmo-descargas-servidor.sh` |
| porcentaje honesto por temporada (CyL) | `node scripts/porcentaje-exacto-cyl.mjs <cola.sqlite>` |
| qué puede trabajar ahora cada temporada | `node scripts/diagnostica-cyl-temporadas.mjs <cola.sqlite>` |
| actas en ámbito sin trabajo que las pida | `node scripts/diagnostica-actas-sin-trabajo.mjs <cola.sqlite>` |
| por qué se apagó el servidor | `bash scripts/servidor/diagnostica-apagados.sh` |
| si la batería se vacía enchufado | `bash scripts/servidor/mide-bateria.sh` |
| quién tiene plaza de navegador | `bash scripts/servidor/estado-plazas.sh` |
| cuánto tarda el resumen del canónico | `& .\scripts\mide-resumen-canonico.ps1` |

### Documentos que hay que leer, por orden

| documento | qué es |
|---|---|
| `CLAUDE.md` | los invariantes, en una página |
| **`docs/plataforma-web/REPARTO-TEMPORADAS.md`** | el reparto entre máquinas y las actas sin trabajo |
| **`docs/informes/GUIA-INFORMES-EQUIPO.md`** | el cuaderno de oficio de los informes (2.000 líneas) |
| `docs/informes/CONSULTA-VIVA.md` | cómo funciona hoy la consulta de equipos |
| `docs/plataforma-web/ARQUITECTURA.md` | la arquitectura objetivo y por qué |
| `docs/plataforma-web/MODELO-DATOS.md` | entidades, claves y métricas |
| `docs/plataforma-web/RECOLECCION-10GB.md` | el programa de recolección, con todas las medidas |
| `docs/plataforma-web/RITMO-MEDIDO.md` | dónde se va el tiempo de un recolector |
| `docs/plataforma-web/IMPORTADOR-SQLITE.md` | el contrato entre la cola y el canónico |
| `docs/plataforma-web/DESPLIEGUE-SERVIDOR.md` | el servidor: cómo se despliega y se opera |
| `docs/plataforma-web/TRASPASO-AGENTE.md` | traspaso anterior (22-24/09), con averías ya resueltas |

Y en la **raíz del repositorio** hay una documentación más antigua, escrita cuando el proyecto era sólo
Salamanca y todavía se evaluaba Supabase. **No prevalece sobre `docs/plataforma-web/`**, pero contiene el
recorrido de los hallazgos y sigue siendo útil:

| documento | qué es |
|---|---|
| `PROYECTO.md` | contexto histórico completo |
| `HALLAZGOS.md` · `HALLAZGOS-FEDERACIONES.md` | lo que se descubrió al explorar cada portal |
| `ESTADO-INGESTA.md` | foto del sistema el 12/09/2026: los adaptadores, federación a federación |
| `RECOLECCION-LOCAL.md` | cómo se recolecta en local |
| `CATALUNA.md` | el portal de la FCF, con sus cuatro condiciones |
| `MADRID-ACTAS.md` | por qué Madrid no bajaba actas y cómo se resolvió |
| `MELILLA.md` · `EUSKADI-PENDIENTE.md` | las dos federaciones con problemas propios |
| `ESTADISTICAS.md` | métricas del producto |
| `DESIGN.md` | contrato visual de una pantalla, para entregar antes de tocar interfaz |
| `README.md` · `PLATAFORMA.md` · `ESTADO.md` | punto de entrada, arquitectura antigua y una petición de ayuda de agosto |

### Estructura del repositorio

```text
facylf/
├── apps/web/                  la web Next.js (informes, consultas)
├── packages/
│   ├── dominio/               reglas y métricas puras, sin framework
│   ├── ingesta/               parsers de actas, jornadas y clasificaciones
│   └── canonico/              importador a PostgreSQL
├── scripts/                   recolectores, importador, informes y herramientas de medida
│   └── servidor/              herramientas del servidor (todas .sh, allí sí hay bash)
├── descargas-<federación>/    la cola y la evidencia de cada federación  ← DATOS, no tocar a mano
├── descargas-federacion/      Castilla y León
├── informes/                  visores e informes generados
├── output/pdf/                PDF de los informes
├── infra/                     docker-compose del PostgreSQL canónico y migraciones
├── docker/                    los 19 recolectores y los servicios del servidor
└── docs/                      toda la documentación
```

---

## 9 · Objetivos medibles del producto

Están fijados y sirven para no discutir de gustos:

- búsqueda sugerida por debajo de 200 ms (p95, servidor);
- página de competición por debajo de 800 ms (p95, sin contar la red del usuario);
- cero consultas a archivos federativos desde una petición de usuario;
- **cero estadísticas sin etiqueta de cobertura** cuando ésta no sea completa;
- ninguna consulta de más de 100 filas; exportaciones siempre asíncronas.

---

## 10 · Lo que haría falta de quien ayude, en orden

1. **Arreglar el resumen del canónico** (`RESUMEN_CANONICO`): una tabla de recuentos que el importador mantenga
   al cerrar cada lote, para que `/canonico` deje de tardar 20 s y su prueba deje de ser intermitente.
2. **Subir la cobertura de las temporadas que ya se recogen**: de 2023-24 a 2026-27 hay decenas de miles de
   actas pendientes y cada punto de cobertura se convierte directamente en informes utilizables.
3. **Diagnosticar Cataluña**: 107.308 partidos cargados y 0 actas nuevas desde hace días.
4. **Cerrar el histórico de Castilla y León** (2015-16 a 2022-23) y después valorar bajar a 2014-15.
5. **Mejorar los informes**: es donde el proyecto se juega su utilidad real. La guía de oficio manda.
