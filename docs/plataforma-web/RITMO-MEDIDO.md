# Ritmo de recolección: lo que está medido

**Fecha:** 23/09/2026, 00:30–01:15 (hora de Madrid).
**Qué es esto:** la medición del apartado (A) del traspaso y la revisión de los apartados (B) y (C), hecha
sobre la máquina en marcha. **Corrige la premisa del traspaso en dos puntos importantes**, y ambos están
medidos, no supuestos. Donde no he podido llegar, lo dice: ver «Límites de estas mediciones».

---

## 1 · La cuenta cierra: el hueco no es trabajo oculto, es procesador que no existe

El traspaso dejaba **~1 957 s sin explicar** en una hora de Andalucía (≈16 s por petición) y proponía buscarlos
en el trabajo local del worker. Medido, la explicación es más simple y más incómoda:

| magnitud | valor medido |
|---|---|
| núcleos de la máquina | **4** |
| procesador calculando | **89,8 %** (3,55 de 4) |
| esperando a disco | 8,0 % |
| procesador ocupado en total | **97,8 %** |
| suma del procesador de todos los contenedores | **234,5 cpu-s/min = 3,91 núcleos** |
| ritmo de la flota | **61–68 peticiones/min** |

Y la comprobación que cierra la cuenta:

```
234,5 cpu-s/min ÷ 61,4 peticiones/min = 3,82 s de procesador por petición
4 núcleos ÷ 3,82 s = 62,8 peticiones/min   ← lo medido: 61–68
```

**La máquina no está esperando: está trabajando al 100 % y el ritmo es exactamente el que cabe en ella.** No
hay 16 s «perdidos» que recuperar moviendo trabajo de sitio; hay procesador que no existe.

### El trabajo local que sale en el registro no es el culpable

El traspaso apuntaba a «Preparando vigilancia y ámbito de actas» y «Revisando calendario futuro». Medido con
`mide-consulta-trabajo.mjs` sobre la cola viva de Andalucía, eso **no** son 9 segundos:

| lo que se hace en cada vuelta del bucle | coste medido |
|---|---|
| `siguienteTrabajo` (se ejecuta UNA vez por trabajo) | **75,8 ms** |
| `peticionesHoy` (antes de cada petición) | 0,6 ms |
| `ultimaPeticion` (antes de cada petición) | 0,02 ms |

Suman **~76 ms por trabajo, el 0,8 % del ciclo**. El análisis del acta ya estaba descartado en el traspaso
(20 ms). Así que el hueco no está en la lógica del worker: está en que todo el worker va lento porque compite
por 4 núcleos con otros 15 navegadores.

> **Un hallazgo colateral que sí conviene arreglar algún día:** `siguienteTrabajo` hace un `SCAN` completo de
> `trabajos` con `USE TEMP B-TREE FOR ORDER BY`, **sin usar** el índice `trabajos_pendientes`. La causa es que
> el `ORDER BY` lleva `coalesce(cast(temporada as integer), -1) desc` en segunda posición: una expresión que
> ningún índice de la tabla cubre, así que SQLite ordena 51 362 filas para devolver una. Son 75 ms de
> procesador por trabajo a cambio de nada; con 17 federaciones y ~60 peticiones/min es despreciable para el
> ritmo, pero es trabajo tirado.

---

## 2 · Dónde va el procesador, contenedor por contenedor

Medido con `mide-cpu-por-peticion.sh` (incremento real de `cpu.stat` del cgroup, cruzado con las peticiones de
la misma ventana — no una foto de `docker stats`, que aquí engaña):

| contenedor | cuota | pet/min | cpu-s/min | cpu-s por petición |
|---|---|---|---|---|
| andalucia | 0,90 | 3,7 | 18,8 | 5,08 |
| aragon | 0,85 | 3,7 | 16,7 | 4,51 |
| asturias | 0,90 | 4,1 | 18,2 | 4,44 |
| baleares | 0,58 | 2,9 | 16,2 | 5,59 |
| cantabria | 0,68 | 1,4 | 9,7 | 6,93 |
| castilla-la-mancha | 0,72 | 2,2 | 23,8 | **10,8** |
| cataluna | 0,90 | 2,4 | 20,1 | **8,4** |
| extremadura | 0,77 | 2,6 | 12,6 | 4,85 |
| galicia | 0,85 | 4,1 | 14,6 | 3,56 |
| melilla | 0,45 | 2,2 | 16,5 | 7,50 |
| murcia | 0,63 | 4,6 | 21,8 | 4,74 |
| navarra | 0,68 | 3,5 | 15,2 | 4,34 |
| **madrid** (API, sin navegador) | 0,81 | **6,4** | **0,8** | **0,13** |
| **valencia** (API, sin navegador) | 0,77 | **5,3** | **0,8** | **0,15** |
| importador | 1,50 | — | 26,9 | — |
| postgres · web · monitor | sin tope | — | 0,8 · 0,6 · 0,1 | — |

**El contraste que lo dice todo:** Murcia y Valencia hacen *casi las mismas páginas por minuto* (4,6 y 5,3) y
Murcia gasta **27 veces más procesador** (21,8 frente a 0,8 cpu-s/min). La diferencia no es el portal ni el
trabajo: es que Murcia abre Chrome y Valencia no.

- **Una página por navegador cuesta ~4–11 s de procesador.** (El coste sube con lo que tarda la página dentro
  de Chrome: Cataluña y Castilla-La Mancha, las dos con las páginas más lentas —16,4 s y 10,6 s de mediana—, son
  también las dos más caras.)
- **La misma tarea por API cuesta 0,13–0,15 s.** Treinta y cinco veces menos.

### Las cuotas están muy sobrevendidas

La suma de las cuotas repartidas (`docker/compose-turnos.yml` más el importador) es de **más de 15 núcleos
sobre una máquina de 4**: 3,9 veces sobrevendida. Conviene entender bien qué significa eso, porque es fácil
leerlo al revés:

- **no** significa que las cuotas ahoguen a nadie — Andalucía usa 0,32 núcleos de los 0,90 que tiene
  permitidos, así que no está frenada por su cuota;
- significa que **el reparto no reparte nada**: quien decide es el planificador del sistema, porque la demanda
  total (3,91 núcleos) es igual a la oferta (4). Las cuotas sólo dicen quién tiene derecho a más cuando la
  máquina se libera.

---

## 3 · (B) La cortesía: en 12 de 14 federaciones ya no manda nada

`ritmo.antes()` **no suma** la cortesía a la petición: espera hasta `iniciada_en + mínimo + jitter`. Es decir,
la cortesía se solapa con la página y **sólo manda cuando el trabajo entero dura menos que ella**. Por eso la
pregunta correcta no es «cuánta cortesía hay», sino «¿el hueco entre peticiones es mayor que la cortesía?».

Medido con `mide-huecos.mjs` sobre una hora real (`hueco_med` = mediana del tiempo entre inicios de petición
consecutivos):

| federación | cortesía | hueco mediano | ¿manda la cortesía? |
|---|---|---|---|
| valencia | 4-6 s | **5,6 s** | **SÍ** — está dentro del rango: el worker espera de verdad |
| galicia | 6-8 s | 7,9 s | al borde |
| murcia | 6-8 s | 8,7 s | no (el trabajo ya dura más) |
| aragon | 6-8 s | 8,8 s | no |
| baleares | 6-8 s | 8,8 s | no |
| navarra | 6-8 s | 8,8 s | no |
| asturias | 6-8 s | 8,9 s | no |
| andalucia | 6-8 s | 9,1 s | no |
| cantabria | 6-8 s | 9,4 s | no |
| extremadura | 6-8 s | 9,7 s | no |
| melilla | 6-8 s | 14,2 s | no |
| castilla-la-mancha | 6-8 s | 17,2 s | no |
| cataluna | 6-8 s | 19,9 s | no |
| madrid | 4-6 s | 7,9 s | no |

**Conclusión de (B): bajar la cortesía en las PNFG no sube el ritmo, porque no están esperando: están
trabajando.** El `… pausa respetuosa de N s` del registro es engañoso a este respecto — aparece sólo cuando
queda algo de espera; cuando el trabajo se come la cortesía entera, esa línea **no sale**, y parece que el
worker va a toda velocidad. La única federación donde la cortesía manda de verdad es Valencia.

### El método de (B) tal como está escrito no funciona

El traspaso dice: «el fichero de configuración se cambia y se recrea su contenedor». **No es así, y es
importante porque se habrían perdido horas**:

- `recolector.<federación>.config.json` **viaja dentro de la imagen** (`facylf-recolectores:local`), no se
  monta por volumen. Comprobado con `docker inspect facylf-valencia-1`: sus únicos montajes son
  `plazas → /app/.estado-workers`, `descargas-valencia` y `descargas-federacion-sondeo`. El repositorio no se
  monta.
- `scripts/servidor/aplica-turnos.sh` sólo hace `docker compose up -d`: **recrea el contenedor con la MISMA
  imagen**. Cambiar el JSON y ejecutarlo no cambiaría nada, en silencio.

**Arreglado** (es la primera cosa que he tocado del código): `docker/entrada-recolector.sh` ahora reenvía la
variable `FACYLF_ARGS` al worker, y los dos recolectores ya aceptaban `--intervalo-min`/`--intervalo-max` por
línea de órdenes con el fichero como respaldo. Con eso, el ritmo de una federación se ajusta desde su servicio
del compose y se aplica con `aplica-turnos.sh <fed>`, **sin reconstruir la imagen**. Sin la variable no se
añade ningún argumento, así que el comportamiento de siempre no cambia. Requiere **una** reconstrucción de la
imagen para activarlo (hecha).

---

## 4 · (C) Dos pestañas por federación: no, y está medido por qué

El traspaso ya lo condicionaba a que (A) y (B) no bastaran. **No bastan, pero (C) empeora el problema y no lo
mejora**, por lo que se ve en los números de arriba:

- La máquina está al 97,8 % de CPU con 3,91 núcleos de demanda sobre 4. **No hay procesador que repartir**: una
  segunda pestaña por federación duplicaría la demanda de un recurso que ya está agotado. El resultado sería el
  mismo total de páginas, peor repartido, y probablemente menos, porque cada Chrome adicional añade su coste
  fijo.
- Y el ejemplo de las API lo confirma: donde el procesador **no** es el cuello (Madrid y Valencia, 0,13–0,15 s
  por petición), sí se puede pedir más deprisa y sale casi gratis. Donde sí lo es (Chrome), pedir en paralelo
  no crea procesador.

Por eso el orden correcto es el inverso al que sugiere el traspaso: **primero abaratar la página (o dejar de
renderizarla), y sólo después, si sobra procesador, pedir en paralelo.**

---

## 5 · El importador: no es una palanca de CPU, y además retiene las colas

El importador es el segundo consumidor de la máquina (**26,9 cpu-s/min ≈ 0,45 núcleos**, un 11 % del
procesador). Parecía la palanca fácil: no recolecta, luego su CPU está «prestada». **Medido, no funciona así.**

**Experimento** (`prueba-cpu-importador.sh`, sin parar ni reiniciar el contenedor, sólo bajándole la cuota):

| fase | cuota del importador | ritmo de la flota |
|---|---|---|
| antes (12 min) | 1,50 núcleos | **68,25 pet/min** |
| durante (12 min) | 0,15 núcleos | **60,67 pet/min** |

**Liberar procesador del importador no subió el ritmo; bajó.** Y hay una explicación medida para ello: el
importador **retiene el bloqueo de cada cola** mientras importa una unidad, y algunas unidades tardan muchísimo
(registro del importador: **1 195 s, 1 099 s, 889 s, 581 s, 578 s** para una sola unidad). Los recolectores
abren esa misma cola con `busy_timeout = 120000`, así que mientras el importador la tiene, **esperan sin gastar
procesador y sin hacer peticiones**. Si al importador se le quita CPU, tarda *más* en soltar el bloqueo.

Huellas de esa espera en los registros de los recolectores:

| federación | «database is locked» | errores SQLite |
|---|---|---|
| **galicia** | **250** | 132 |
| **baleares** | **32** | 16 |
| asturias | 2 | 1 |
| las demás | 0 | 0 |

**Conclusión: la CPU del importador no es una palanca, y bajarle la cuota es contraproducente.** Lo que sí
conviene es lo contrario: que **suelte la cola antes**. Es trabajo de producto sobre el importador (transacciones
más cortas, o leer la cola por lotes en vez de mantenerla abierta), no un ajuste de ritmo.

> **Aviso de operación:** el experimento dejó la cuota del importador en 0,15 núcleos durante unos minutos de
> más, porque el restaurador falló: `awk` con la configuración regional del servidor escribe `1,50` con coma y
> `docker update --cpus=1,50` lo rechaza. **Ya está restaurada a 1,50** (comprobado con `docker inspect`) y el
> guion está corregido con `LC_ALL=C`. Si se repite el experimento, el restaurador funciona.

---

## 6 · La única palanca de verdad: que cada página cueste menos

Si el ritmo es `núcleos ÷ procesador por petición`, y los núcleos no se pueden cambiar, sólo queda bajar el
procesador por petición. Ahí es donde está el factor 35 que separa una federación con navegador de una por API.

**Se ha comprobado si se puede dejar de usar el navegador.** Con `prueba-html-con-sesion.mjs`, pidiendo la misma
URL de acta que el recolector ya había traído bien:

| | navegador | petición normal |
|---|---|---|
| acta de Andalucía | 301 833 – 407 750 bytes | **117 bytes** |
| portada `/pnfg/` | — | **117 bytes** |

Los 117 bytes son un muro, no contenido: el portal redirige a `https://www.rfaf.es/pnfg/NLogin?NSess=1` y
devuelve un HTML **sin ninguna cookie** (`Set-Cookie` no aparece en la respuesta) con el texto comentado
«No se ha aceptado el cookie». Es decir: **el navegador no se usa para renderizar, se usa para tener una sesión
anónima que el portal sólo entrega al ejecutar JavaScript.** Por eso la petición normal, incluso pidiendo antes
la portada y guardando cookies, sigue devolviendo 117 bytes.

Eso **no cierra la puerta**, pero la convierte en trabajo de producto y no en un cambio de configuración: hay
que replicar sin navegador el paso que crea la sesión (mirar qué pide el JavaScript del portal para
establecerla, o si hay una ruta que la emita). Merece la pena intentarlo porque el premio es de otra escala:
pasar de 5 s de procesador por página a 0,15 s multiplicaría el ritmo por un orden de magnitud **sin pedirle una
petición más a nadie**.

**Lo que falta para decidir con datos** (siguiente paso, ya no hace falta adivinar): **instrumentar el ciclo por
fases en UNA federación** — lo que el traspaso pedía — para repartir los 4–11 s por página entre
*render de Chrome*, *descarga*, *análisis y guardado* y *espera*. Sin eso no se sabe si conviene atacar el
JavaScript del portal, bloquear más recursos en Chrome o cambiar de herramienta.

---

## 7 · Herramientas nuevas (todas de sólo lectura sobre la flota)

| herramienta | para qué |
|---|---|
| `mide-huecos.mjs [min]` | el hueco entre peticiones comparado con la cortesía: dice si el worker espera o trabaja |
| `mide-cpu-por-peticion.sh [seg]` | segundos de procesador por petición **de cada contenedor** (cgroups, no `docker stats`) |
| `mide-cpu-contenedores.sh` | cuotas repartidas, consumo real y **frenos del kernel** (`nr_throttled`) |
| `muestrea-cpu.sh [min] [seg]` | muestras de `cpu.stat` en el tiempo, para cruzar con las peticiones |
| `exporta-peticiones.mjs` · `cuenta-peticiones-ventana.mjs` | los inicios de petición de una ventana exacta |
| `analiza-cpu-muestras.mjs` | separa gasto fijo del navegador y coste por página (ver límites, abajo) |
| `mide-ritmo-total.sh [min]` | UNA cifra de ritmo de toda la flota: la única forma honesta de comparar antes/después |
| `prueba-cpu-importador.sh [min] [cuota]` | el experimento de CPU compartida, con restauración automática |
| `historico-federacion.mjs <fed> [horas]` | peticiones por hora y **su variación natural** |
| `mide-consulta-trabajo.mjs <fed> [n]` | cuánto cuesta `siguienteTrabajo` y su plan de ejecución |
| `prueba-html-sin-navegador.mjs` · `prueba-html-con-sesion.mjs` · `muestra-muro.mjs` | ¿hace falta navegador? Enseña el muro tal cual |
| `busca-bloqueos-cola.sh` | esperas por la cola («database is locked») por federación |

---

## 8 · Límites de estas mediciones (lo que **no** se puede afirmar)

1. **No he podido separar el gasto fijo de tener Chrome abierto del coste por página.** El ajuste sale
   degenerado (R² ≈ 0,0) y no es un error del método: en una máquina saturada cada contenedor consume
   procesador a un ritmo **casi constante**, independientemente de cuántas páginas haga, así que las dos cosas
   son indistinguibles con esta ventana. El contraste navegador/API sí es sólido (27×), pero **cuánto de los
   4–11 s es coste fijo y cuánto por página está sin determinar**.
2. **El experimento del importador está infradimensionado.** Dos ventanas de 12 minutos, y la variación natural
   del ritmo total es del orden de 58–68 pet/min. Lo que se puede afirmar con seguridad es que **liberar CPU
   del importador no sube el ritmo**; que lo baje un 11 % es compatible con el ruido. Repetirlo bien exige
   ventanas de una hora y medir además el procesador del sistema durante la prueba (no lo hice, y era lo que
   habría distinguido «no liberó CPU» de «liberó CPU y no sirvió»).
3. **La variación natural de una federación es enorme**: Valencia hace entre 56 y 544 peticiones por hora
   (mediana 388, coeficiente de variación **39 %**). Cualquier prueba de cortesía que dure menos de una hora no
   puede concluir nada. Por eso la prueba del apartado 9 se mide con la referencia horaria al lado.
4. Las cifras del traspaso (58,4 pet/min, 629 lotes) eran de su momento; las de aquí son de las 00:30–01:15.
   La máquina sigue trabajando mientras se lee esto.

---

## 9 · Prueba en curso: la cortesía de Valencia

Única federación donde la cortesía manda (hueco mediano 5,6 s dentro de 4-6 s) y, además, **barata**: va por API
y cuesta 0,15 s de procesador por petición, así que subirle el ritmo no le quita nada a las demás.

- **Escalón probado:** 2-3 s (desde 4-6 s), aplicado con `FACYLF_ARGS` en `docker/compose.yml` y
  `aplica-turnos.sh valencia`. Verificado: `docker exec facylf-valencia-1 printenv FACYLF_ARGS` →
  `--intervalo-min 2 --intervalo-max 3`.
- **Referencia:** mediana de 388 pet/h en las horas anteriores, con variación natural del 39 %. Una hora de
  margen a cada lado es lo mínimo para poder decir algo.
- **Qué se mira:** peticiones/hora **y fallos** (`fallosVentana` en `colas.json`; y en el registro: `403`,
  `429`, `robots`, respuestas vacías, `codigo 1`). Al primer síntoma de bloqueo se sube un escalón y se deja
  esa federación ahí.

> **Nota cosmética que conviene arreglar:** el registro sigue diciendo «ritmo configurado de 4-6 s entre
> peticiones» porque `compruebaPermiso()` lee el fichero de configuración y no los argumentos de la línea de
> órdenes. Con `FACYLF_ARGS` ese aviso miente; el ritmo real es el de los argumentos.

---

## 10 · Qué hacer ahora, en orden

1. **Terminar la prueba de Valencia** (§9) y dejar el escalón encontrado escrito, o subirla si falla.
2. **No tocar la cortesía de las PNFG.** Está medido que no sirve; cambiarla sólo añadiría ruido.
3. **Instrumentar el ciclo por fases en una federación** (`galicia` o `murcia`). Es lo que decide si el enemigo
   es el JavaScript del portal, el render de Chrome o el guardado, y es la única forma de seguir bajando el
   procesador por página. **Es el siguiente paso de verdad.**
4. **Que el importador suelte la cola antes** (transacciones más cortas o lectura por lotes). Es lo único que
   hoy bloquea a federaciones concretas: Galicia acumula 250 «database is locked».
5. **Explorar la sesión anónima sin navegador** (§6): es el único camino a un cambio de orden de magnitud, pero
   es trabajo de producto con pruebas.
6. **(C), descartado** mientras la máquina siga saturada. Reabrirlo sólo si se añaden núcleos.
