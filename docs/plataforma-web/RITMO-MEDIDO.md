# Ritmo de recolección: lo que está medido

**Fecha:** 23/09/2026, 00:30–09:45 (hora de Madrid).
**Qué es esto:** la medición del apartado (A) del traspaso y la revisión de los apartados (B) y (C), hecha
sobre la máquina en marcha. **Corrige la premisa del traspaso en dos puntos importantes**, y ambos están
medidos, no supuestos. Donde no he podido llegar, lo dice: ver «Límites de estas mediciones».

---

## 0 · La avería que estaba escondida: Castilla y León no recogía nada (y ya recoge)

Esto no estaba en el traspaso y es lo más importante que ha salido. Lo encontré persiguiendo el ritmo, al
comprobar que **ninguna** federación estuviera en bucle de caída.

**El síntoma:** `federacion` (Castilla y León) arrancaba, hacía el trabajo local y moría con **código 1**. El
registro lo decía:

```
Error: Falta el contacto real (identidad.contacto) en recolector.config.json.
    at creaDriver (file:///app/scripts/recolector.mjs:2053:77)
```

Y una pista que lo confirmaba sin ambigüedad, en la misma tanda:

```
ℹ️  Proyecto personal/no comercial: ritmo configurado de 180-300 s entre peticiones.
```

**180-300 s son los valores POR DEFECTO del código**: esa federación no estaba leyendo su configuración.

**La causa:** `recolector.config.json` está en **`.gitignore`** (lleva la identidad real), así que nunca llegó
al servidor. La imagen se construye desde el repositorio del servidor, así que **no lo contiene** — comprobado:
`docker run --entrypoint ls facylf-recolectores:local /app/recolector.config.json` → *No such file*. Y Castilla
y León es **la única federación sin `--perfil`**: es la única que lee ese fichero, y por eso es la única rota.

**Por qué nadie se había dado cuenta:** `estado-general.sh` la contaba entre las «sin trabajo», cuando lo que
pasaba es que **no podía arrancar**. Y las que no tienen trabajo hacen 0 peticiones igual que las averiadas, así
que el monitor las veía idénticas. Su cola tenía **45.935 trabajos pendientes** que no se iban a recoger nunca.

**El arreglo:** montar el fichero como volumen de sólo lectura para ese servicio (es configuración, no programa
— el mismo criterio que el resto de los datos, regla 9 del traspaso), en vez de copiarlo dentro de la imagen:

```yaml
- ../recolector.config.json:/app/recolector.config.json:ro
```

**Verificado, no supuesto:** tras recrear el contenedor, `federacion` figura como **«trabajando ahora»** en
`estado-ultima-tanda.sh` y su registro enseña clasificaciones guardándose una tras otra. La flota pasó de 14 a
**15 federaciones recogiendo de verdad**.

**Lo que hay que aprender de esto:** «0 peticiones» es ambiguo. Hay que distinguir **«no tiene trabajo»** de
**«arranca y muere»**, y el monitor no las distinguía. Por eso `estado-ultima-tanda.sh` compara ahora el ORDEN
del último arranque y del último cierre, en vez de mirar sólo el último código de salida.

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

### 5.1 · Y hay una unidad del importador que se ha atascado girando en local

Esto se encontró por casualidad, persiguiendo otra cosa, y es lo más accionable de todo el documento.

El importador llevaba **62 minutos sin completar una sola unidad** (`estado-general.sh` decía «última actividad:
hace 62 min») mientras seguía consumiendo ~11 % del procesador. `diagnostica-importador.sh` lo identifica:

| qué | valor medido |
|---|---|
| unidad en curso | `valencia \| 2025-26 \| 29509174` |
| tiempo de reloj | **01:02:22** |
| tiempo de **procesador** | **00:20:47** |
| estado del proceso | **`R`** — ejecutando |
| consultas activas en PostgreSQL | **0** |
| lo que tardan las unidades normales | 45–124 s (el registro) |

**Cero consultas activas y el proceso en `R` significa que no está esperando a la base: está girando en
local.** Veinte minutos de procesador para una unidad que debería costar uno o dos, y encima **retiene la cola
de Valencia mientras lo hace**.

Esto encaja con dos cosas que ya estaban en el traspaso y que hasta ahora parecían independientes:

- los **88 unidades del importador con fallo**, de las que **66 son «nombre de equipo no resuelto en la
  fuente»** (`packages/canonico/src/resolucion/inscripcion.ts`): un resolutor que no acota su búsqueda se ve
  exactamente así desde fuera — un proceso que gira sin hablar con la base;
- **el desplome de Valencia**: pasó de 477 peticiones/hora a 178 sin que nadie le tocara nada. La causa
  probable no es el portal ni su ritmo, sino que **el importador le tenía la cola ocupada**.

**Qué hacer:** poner un tope de tiempo y de procesador por unidad en el importador (una unidad que pasa de, por
ejemplo, dos minutos se aparta y sigue la siguiente) y acotar la búsqueda del resolutor de equipos. No es un
ajuste de ritmo: es que hoy el importador se queda atascado y, de paso, frena a una federación.

> **Consecuencia para la prueba de Valencia (§9):** mientras el importador tenga la cola de Valencia ocupada, la
> prueba está **contaminada** y su resultado no se puede atribuir a la cortesía. Hay que repetirla con el
> importador arreglado, o al menos sin una unidad suya en curso sobre Valencia.

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
| `diagnostica-importador.sh` | tiempo de CPU y de reloj por unidad, y si trabaja en PostgreSQL o gira en local |
| `estado-ultima-tanda.sh` | ¿cómo terminó la última tanda de cada federación? Distingue «trabajando» de «caída» |
| `revisa-salud-flota.sh` | busca bucles de caída y federaciones que arrancan y no piden nada |
| `compara-relojes.sh` | reloj del host, del contenedor y lo escrito en las colas (husos y día de Madrid) |

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
4. Las cifras del traspaso (58,4 pet/min, 629 lotes) eran de su momento; las de aquí son de las 00:30–09:45.
   La máquina sigue trabajando mientras se lee esto.
5. **La sesión de medición duró casi diez horas de reloj** (de las 23:53 a las 09:45, comprobado con `uptime`:
   pasó de «1 día 10:26» a «1 día 19:19», así que **no fue un salto de reloj**). Eso significa que comparar
   «el ritmo de antes» con «el ritmo de después» cruza la noche con la mañana, y los portales no se comportan
   igual: el ritmo medido osciló entre **45 y 68 pet/min** sin que se tocara nada. Cualquier comparación
   antes/después que cruce ese límite está contaminada. El anfitrión **no tiene NTP** (`timedatectl`:
   `System clock synchronized: no`), lo que conviene arreglar.
6. **El cuello cambia de sitio según el momento, y eso hay que respetarlo.** A las 00:15 el procesador estaba al
   97,8 % (esta es la medición que sostiene todo el apartado 1). A las 09:45, en cambio,
   `estado-cpu-real.sh` da **65,8 % calculando y 30,4 % esperando a disco**, y avisa por sí solo: «el cuello es
   el DISCO, no el procesador». Las dos cosas son ciertas en momentos distintos: la conclusión de este
   documento vale para cuando la máquina está **saturada de procesador**, que es como estaba cuando se midió.

---

## 9 · Valencia: el único sitio donde la cortesía manda, y el suelo de 4 s

Única federación donde la cortesía manda (hueco mediano 5,6 s dentro de 4-6 s) y, además, **barata**: va por API
y cuesta 0,15 s de procesador por petición, así que subirle el ritmo no le quita nada a las demás, al contrario
que en las PNFG.

**Estado:** Valencia corre ahora con **4-5 s** (`FACYLF_ARGS` en `docker/compose.yml`), que es el escalón más
bajo legal, y está **trabajando con normalidad** (`estado-ultima-tanda.sh`: «trabajando ahora»). El premio de
ese escalón es pequeño —media 4,5 frente a 5,0, unos +45 pet/h, ~1 % del total de la flota— y **queda como
decisión del responsable confirmarlo**, no como algo que se deje puesto sin más después del incidente de abajo.

**La medición que iba a respaldarlo NO vale.** Ver §9.1.

- **Escalón probado:** primero 2-3 s (**error mío, ver abajo**); corregido a **4-5 s**, que es el escalón más
  bajo legal. Aplicado con `FACYLF_ARGS` en `docker/compose.yml` y `aplica-turnos.sh valencia`. Verificado:
  `docker exec facylf-valencia-1 printenv FACYLF_ARGS` → `--intervalo-min 4 --intervalo-max 5`.
- **Referencia:** mediana de 388 pet/h en las horas anteriores, con variación natural del 39 %. Una hora de
  margen a cada lado es lo mínimo para poder decir algo.
- **Qué se mira:** peticiones/hora **y fallos** (`fallosVentana` en `colas.json`; y en el registro: `403`,
  `429`, `robots`, respuestas vacías, `codigo 1`). Al primer síntoma de bloqueo se sube un escalón y se deja
  esa federación ahí.

### 9.1 · El error que cometí, para que no se repita

Puse el escalón en **2-3 s**. `Ritmo` lo rechaza de plano:

```js
if (this.minimo < 4_000 || this.maximo < this.minimo) {
  throw new Error('El intervalo debe ser como mínimo 4 s y el máximo no puede ser menor.');
}
```

El worker murió con **código 1** en cada arranque y el supervisor reintentaba cada 20 s. **Valencia estuvo
37 minutos sin hacer una sola petición** (de 00:43 a 01:20) y el ritmo total de la flota cayó de ~65 a
57,4 pet/min. Los 37 minutos de caída de una federación explican por sí solos los 8 pet/min que faltaban.

Lo que hay que aprender:

1. **Ese 4 s no es un límite técnico: es un suelo de cortesía deliberado.** El código lo defiende a propósito,
   y tiene razón: bajar de ahí es pedirle a un portal más de lo que este proyecto se ha comprometido a pedirle.
2. **Un argumento inválido no da un error visible: deja la federación en silencio.** El contenedor seguía
   «arriba» y el registro lo decía, pero nadie estaba mirando el registro. Si se vuelve a tocar el ritmo, hay
   que comprobar **peticiones/hora**, no que el contenedor esté en pie.
3. **El aviso del registro mintió**: seguía diciendo «ritmo configurado de 4-6 s» porque `compruebaPermiso()`
   lee el fichero y no los argumentos. Es lo que me hizo tardar en verlo.
4. El escalón más bajo posible es **4-5 s** (media 4,5 frente a 5,0: ~10 % menos espera, unos +45 pet/h en
   Valencia, ~1 % del total de la flota). Un premio pequeño para el riesgo que tiene tocar el suelo, así que
   **queda como decisión del responsable confirmarlo**, no como algo que yo deje puesto sin más.

> **Consecuencia:** la medición de la FASE 2 que corrió entre 00:49 y 01:19 no mide la cortesía, mide la caída
> de Valencia por mi error. **No vale y no se usa.** Hay que repetirla con el escalón 4-5 s y con el importador
> sin una unidad suya en curso sobre Valencia.

> **Nota cosmética que conviene arreglar:** el registro sigue diciendo «ritmo configurado de 4-6 s entre
> peticiones» porque `compruebaPermiso()` lee el fichero de configuración y no los argumentos de la línea de
> órdenes. Con `FACYLF_ARGS` ese aviso miente; el ritmo real es el de los argumentos.

---

## 10 · Qué hacer ahora, en orden

1. **Arreglar el importador que se atasca** (§5.1): tope de tiempo y de procesador por unidad, y acotar el
   resolutor de equipos. Es lo primero porque hoy **quema un 11 % de la máquina sin avanzar y frena a la
   federación cuya cola tiene ocupada** — Valencia pasó de 477 a 178 peticiones/hora por esto. Mientras siga
   así, cualquier medición de ritmo queda contaminada.
2. **Repetir bien la prueba de Valencia** (§9), ya sin la unidad del importador encima y sin cruzar la noche
   con la mañana: ventanas de una hora y la referencia horaria al lado.
3. **No tocar la cortesía de las PNFG.** Está medido que no sirve; cambiarla sólo añadiría ruido.
4. **Instrumentar el ciclo por fases en una federación** (`galicia` o `murcia`). Es lo que decide si el enemigo
   es el JavaScript del portal, el render de Chrome o el guardado, y es la única forma de seguir bajando el
   procesador por página. **Es el siguiente paso de fondo.**
5. **Explorar la sesión anónima sin navegador** (§6): es el único camino a un cambio de orden de magnitud, pero
   es trabajo de producto con pruebas.
6. **(C), descartado** mientras la máquina siga saturada. Reabrirlo sólo si se añaden núcleos.
7. **Arreglar el reloj del servidor**: no tiene NTP (`System clock synchronized: no`). No es cosmético — el cupo
   diario cuenta por día civil de Madrid y los aplazamientos se calculan con ese reloj.

**Ya hecho en esta sesión:** Castilla y León vuelve a recoger (§0), el método de (B) es aplicable sin
reconstruir la imagen (§3), Valencia corre en el escalón legal más bajo (§9) y quedan cinco herramientas nuevas
para medir esto sin volver a empezar de cero (§7).
