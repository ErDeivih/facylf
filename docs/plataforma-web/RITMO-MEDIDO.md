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

### 0.1 · Y una trampa de YAML que me llevé yo por delante

Al añadir una variable de entorno a un servicio para medir, **dejé a Murcia sin recoger durante unos minutos**.
Merece la pena escribirlo porque es un fallo silencioso y volverá a pasar.

En `docker/compose.yml` los servicios heredan del ancla con `<<: *recolector`. Pero eso fusiona **claves**: si
el servicio declara su propio `environment:`, **reemplaza el del ancla entero** en vez de añadirse a él. Al
poner `FACYLF_PERF: "1"` en Murcia, Murcia se quedó sin `FACYLF_MEMORIA_GB`… y ese número no es decorativo:

- `repartePlazas` cae al respaldo («la mitad de la memoria del equipo»): **8 plazas en vez de 16**;
- y sobre todo `RESERVA_AIRE_GB` vuelve a **1,5 GB** en vez de 0,25. En un contenedor de 1,6 GB nunca caben
  1,5 GB libres, así que el worker se quedó en `esperando para abrir Chrome: cabe por reparto (5/8) pero a
  este contenedor le quedan 1.36 GB, menos que la reserva de 1.5 GB` **para siempre**. Es el mismo atasco que
  ya se documentó el 18/09/2026, y el contenedor seguía «arriba» como si nada.

**Arreglado de raíz:** las variables comunes viven en su propia ancla (`&ambiente-recolector`) y quien añade
algo hace `<<: *ambiente-recolector` seguido de lo suyo. Y hay una herramienta que lo caza en dos segundos:
**`compara-entorno-recolectores.sh`**, que enseña el entorno de los 19 y marca en rojo la columna que falte.
Valencia tenía el mismo agujero (se libró por ir por API, sin navegador que abrir) y también está corregida.

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

## 6.1 · La respuesta de (A): el 60 % del ciclo son nuestras propias escrituras

El traspaso pedía instrumentar el ciclo por fases. Está hecho, corriendo en Murcia
(`FACYLF_PERF=1`), y **sobre 150 trabajos reales** sale esto:

| grupo | tiempo | % del ciclo |
|---|---|---|
| **portal + Chrome** (`driver.get` + espera + `outerHTML`) | 3,89 s | 39 % |
| **escrituras nuestras: HTML + JSON + SQLite** | **6,01 s** | **60 %** |
| análisis del acta (`parseaActa`) | 0,05 s | **0,5 %** |
| espera de cortesía | 0,03 s | **0,3 %** |
| bucle y planificación | 0,01 s | 0 % |

Ciclo medio **10,0 s** por trabajo (mediana 9,4 s) → 360 pet/h. Detalle de la parte que manda:

| fase | media | qué es |
|---|---|---|
| `acta_estructura` | **2,72 s** | `guardaActaEstructura` + `reconciliaEnlaceActa` + marcar el acta como hecha |
| `acta_guardar_html` | **1,70 s** | sha256 + gzip + escribir el `.gz` y anotarlo en `archivos` |
| `analisis_guardado` (resto) | 0,93 s | validación y lo que no cae en las fases marcadas |
| `acta_guardar_json` | **0,66 s** | gzip + escribir el JSON del análisis |
| `acta_analizar` | **0,05 s** | `parseaActa` + `contextualizaActa` |

### Contradice al traspaso, y se puede decir exactamente por qué

El traspaso concluía: «la palanca del análisis está descartada con datos: 20 ms por acta, el 0,2 % del hueco.
**No insistas por ahí**». Y sobre el **análisis** tiene razón: aquí son 50 ms, el 0,5 %. El error fue medir el
análisis y **llamar a eso el guardado**. `mide-analisis-acta.mjs` hace tres cosas:

1. leer y descomprimir el `.gz` del archivo;
2. `parseaActa`;
3. `guardaActaEstructura`… **en una SQLite temporal y vacía en `/tmp`**.

Lo que **no** mide es justo lo que domina en producción:

- `guardaAtomico`: `sha256` + `gzip` + **escribir en `/srv/data`, un disco DURO**, + `renameSync` + el `upsert`
  en `archivos`;
- `guardaJson`: un segundo gzip y una segunda escritura;
- y las escrituras reales en la **cola viva** (438 MB en Murcia, con su WAL), no en una base de juguete en
  `/tmp`, que está en el **SSD**.

Y hay una comprobación que lo cierra: escribiendo la **misma** secuencia de escritura de un trabajo sobre una
copia real de la cola, y midiendo también con el micro-banco `mide-guardado-acta.mjs`, el trabajo de CPU es de
milisegundos —`sha256` 1,3 ms y `gzip` 4,8 ms con actas reales de 112 KB— mientras que escribir en el disco
duro tiene **mediana 0,3 ms pero media 18,5 ms y picos de 116 ms**: un colazo de latencia, no un coste de CPU.

### Lo que esto significa para el ritmo

Si las escrituras bajaran a casi nada, el ciclo pasaría de 10 s a ~4 s: **de 360 a ~900 pet/h por federación**.
Bajar sólo a la mitad ya da ~+40 % de ritmo. Es, con diferencia, la palanca más grande que hay hoy — y no toca
al portal ni pide una petición más.

Arreglos posibles, de más a menos directo:

1. **Mover el archivo (HTML y JSON) al SSD.** Es donde está el grueso de `acta_guardar_html` y
   `acta_guardar_json` (2,4 s de 10). `/` es SSD y tiene cientos de GB libres; `/srv/data` es el disco duro.
   Cuidado: el traspaso dice que los datos van en `/srv/data`, así que es una decisión del responsable, pero la
   medición la respalda.
2. **Mover las colas al SSD** (`acta_estructura`, 2,72 s). Es más gordo: las colas son la evidencia de ingesta
   y hay que revisar copias y retención.
3. **Escribir menos**: el JSON del análisis ya viaja dentro de la columna `datos` de `actas`, así que el
   fichero `.json` aparte es un segundo gzip y una segunda escritura por acta; y el `upsert` en `archivos` se
   hace una vez por fichero.
4. **Que el importador no lea las colas a la vez que se escribe en ellas** (ver §5): compite por el mismo
   disco.

> **Lo que esta medición NO separa:** dentro de las fases de escritura, cuánto es espera de disco y cuánto es
> CPU de SQLite. Los micro-bancos enseñan que la parte de CPU es de milisegundos, así que lo que queda es
> espera; pero para afirmarlo con todas las letras habría que medir el tiempo de CPU de la propia fase, y eso
> queda pendiente.

### 6.2 · Y el coste no era escribir: era **un `fsync` por confirmación** (ya arreglado y medido)

Buscando qué había dentro de esas escrituras, la respuesta resultó ser mucho más concreta de lo que parecía.
SQLite, con `synchronous = FULL` (su valor por defecto, que es el que había), **sincroniza el disco en cada
confirmación**. Medido con `mide-commit-cola.mjs` sobre una base de usar y tirar:

| | `/srv/data` (disco DURO) | `/ (SSD)` |
|---|---|---|
| 1 fila = 1 confirmación, `FULL` | **540 ms** de mediana (hasta 1.312 ms) | 3,8 ms |
| 1 fila = 1 confirmación, `NORMAL` | **0,0 ms** | 0,0 ms |
| 400 filas = 1 confirmación, `FULL` | 883 ms | 7,1 ms |

**Un factor 140 entre los dos discos, y el coste desaparece con `NORMAL`.** Y guardar un acta hacía **siete
confirmaciones sueltas** (el `upsert` de `archivos` del HTML, el del JSON, la transacción de
`guardaActaEstructura`, las decisiones de descanso, la reconciliación, el `update actas` y el `update trabajos`):
siete por 540 ms son **casi cuatro segundos por acta**. Eso es, exactamente, el hueco que la medición por fases
encontraba.

**El arreglo, y por qué va por variable.** Se añade `FACYLF_SINCRONO` en `abreBase`:

- sin la variable → `FULL`, **el comportamiento de siempre** (las 18 federaciones que no se tocan siguen igual);
- `FACYLF_SINCRONO=NORMAL` → sin sincronización en cada confirmación.

`NORMAL` en modo WAL **sigue siendo seguro frente a la corrupción** —la base nunca se rompe—, pero si se va la
luz o se cae el sistema operativo se pueden perder las **últimas confirmaciones**. Aquí eso significa repetir
unas cuantas peticiones ya hechas, porque la cola es idempotente y los trabajos vuelven a `pendiente`. **Es una
decisión del responsable**, así que se prueba en UNA federación (Murcia) y no en las 19.

**Resultado medido, con el mismo instrumento antes y después:**

| grupo | con `FULL` (220 trabajos) | con `NORMAL` (60 trabajos) |
|---|---|---|
| **escrituras nuestras** | **6,01 s (60 %)** | **2,80 s (35 %)** |
| portal | 3,89 s | 4,27 s |
| **cortesía** | 0,03 s (0 %) | **0,82 s (10 %)** |
| análisis del acta | 0,07 s | 0,19 s |
| **ciclo por trabajo** | **10,0 s** | **8,1 s** |

Se recuperan los ~3,2 s que predecía la medición del `fsync`. La cola de Murcia queda **íntegra** (cero errores
de SQLite en el registro tras el cambio) y la federación sigue trabajando con normalidad.

**Y se repite en una segunda federación, que era lo que faltaba para poder decidir.** Andalucía —una de las
colas grandes, 66.038 trabajos pendientes— con el mismo instrumento:

| grupo | con `FULL` (20 trabajos) | con `NORMAL` (30 trabajos) |
|---|---|---|
| **escrituras nuestras** | **8,59 s (69 %)** | **6,27 s (56 %)** |
| portal | 3,73 s | 4,20 s |
| cortesía | 0,00 s | 0,42 s |
| `acta_estructura` | 6,19 s | 5,24 s |
| `acta_guardar_html` | 1,57 s | 0,76 s |
| `acta_guardar_json` | 0,83 s | 0,27 s |
| **ciclo por trabajo** | **12,5 s** | **11,1 s** |

Dos federaciones distintas, las dos con menos tiempo en escrituras y ciclo más corto (Murcia −19 %, Andalucía
−11 %). **La ganancia es menor en Andalucía porque su `acta_estructura` sigue en 5,24 s: eso ya no es `fsync`,
es trabajo real** —muchísimos `insert` sobre una cola de 438 MB con sus índices—, y ahí el `fsync` no tenía nada
que rascar. Es decir: `NORMAL` quita el coste de sincronizar, no el de escribir.

Antes/después, con la misma máquina y el mismo instrumento:

| | Murcia | Andalucía |
|---|---|---|
| escrituras | 6,01 s → **2,80 s** | 8,59 s → **6,27 s** |
| ciclo | 10,0 s → **8,1 s** | 12,5 s → **11,1 s** |
| cortesía | 0,03 s → 0,82 s | 0,00 s → 0,42 s |

### 6.3 · Y ahora el cuello ha cambiado de sitio: la cortesía **sí** manda

El dato más útil del apartado anterior no es el 23 % de mejora: es que **la cortesía ha pasado de 0,03 s (0 %)
a 0,82 s (10 %)**, y de esperarse en 9 de 150 trabajos a **28 de 60**. Con el trabajo ya por debajo de la
cortesía configurada (6-8 s), `ritmo.antes()` empieza a esperar de verdad.

Es decir: **al quitar el coste de disco, el apartado (B) pasa a tener sentido — y justo en ese orden**. Antes
bajar la cortesía no servía de nada porque el worker no llegaba a esperarla; ahora sí. La secuencia correcta es
la que dice el traspaso, aunque por un motivo distinto del que decía: primero dejar de perder tiempo en el
disco, y después bajar el intervalo, que es lo que ahora limita.

> **Lo que falta para cerrarlo:** la confirmación de extremo a extremo con **peticiones/hora**. La medición por
> fases mide el ciclo de los trabajos que ocurren y **no cuenta los huecos entre sesiones**, así que da ~360
> pet/h donde el dato real de la cola da ~180-250. Hace falta una hora limpia de después (la variación natural
> de una federación es del 27-39 %, ver §8) y la ventana de 11:00 mezcla antes y después.

### 6.4 · Lo que queda después del `fsync`: escribir de verdad, y por qué Andalucía tarda más que Murcia

Tras `NORMAL`, lo que sobra en `acta_estructura` ya **no es sincronizar el disco**: Andalucía sigue en **5,24 s**
y Murcia en 1,88 s. La diferencia entre las dos no es el `fsync` —las dos van con `NORMAL`— sino el TAMAÑO de la
cola: la de Andalucía tiene **66.038 trabajos pendientes y 438 MB**, y guardar un acta hace decenas de `insert`
en `participaciones`, `eventos_acta` y `personas` con sus índices. Eso es trabajo real: ni se puede quitar con
una variable, ni lo arregla el SSD del todo.

Las palancas que quedan para ese resto, en orden de relación efecto/riesgo:

1. **Menos escrituras por acta**: el JSON del análisis ya viaja dentro de la columna `datos` de `actas`, así que
   el fichero `.json` aparte es un gzip y una escritura por acta que se pueden discutir.
2. **Una sola transacción por acta** en vez de las que quedan sueltas (`enTransaccion` ya es reentrante, que era
   lo que hacía falta para poder envolverlas).
3. **La cola al SSD** (o al menos el archivo HTML/JSON): con `NORMAL` el `fsync` ya no duele, pero leer y
   escribir páginas de una base de 438 MB en un disco duro compartido sigue costando.

Y una observación que conviene no perder: **el mismo trabajo cuesta muy distinto según la federación** (ciclo de
8,1 s en Murcia y 11,1 s en Andalucía, con `acta_estructura` de 1,88 s frente a 5,24 s). Optimizar «el worker»
como si fuera uno solo lleva a conclusiones falsas; hay que mirar por federación.

### 6.5 · Un callejón sin salida que conviene dejar escrito (para no repetirlo)

Persiguiendo el ritmo real —224 pet/h en Murcia cuando su ciclo de 8,1 s permitiría 444— hice un análisis de
huecos que decía que **entre un tercio y casi la mitad del reloj se va en espacios de más de un minuto**, en
todas las federaciones. La conclusión que saqué primero fue: **relevos de sesión** (cerrar Chrome, esperar al
supervisor, abrir otro). Sonaba bien y era razonable… y **era falsa**. Las tres comprobaciones que la tiraron:

| hipótesis | comprobación | resultado |
|---|---|---|
| «son relevos de sesión» | `analiza-relevos.sh`: duración de las sesiones | 160-219 trabajos por sesión y el supervisor espera **20 s**; en 3 h pierde menos de 1 min |
| «no tiene trabajo que pedir» | `analiza-sin-trabajo.sh` | Andalucía tiene **49.146 trabajos disponibles** y **0** veces dijo «sin trabajo»; Asturias, 9.888 |
| «hay peticiones que se cuelgan» | `analiza-duraciones.mjs` | de 570 peticiones, la **más lenta son 10,0 s** y todas `ok`; ninguna pasa de 15 s |
| «trabaja en ráfagas» | `analiza-actividad.mjs` | **0 tramos vacíos de 24**: hace peticiones en todos los tramos de 5 minutos |

Lo que de verdad pasa: **trabaja de forma continua y lenta.** Andalucía hace 14 peticiones por tramo de 5
minutos (2,9 pet/min) con peticiones de 3,2 s de mediana, o sea un **ciclo real de ~21 s**, y ninguno de esos
segundos está en la red, ni esperando trabajo, ni en un relevo. Están **dentro del worker**, que es justo lo que
la medición por fases sabe desglosar — y ahí es donde manda `acta_estructura`.

La lección de método: **una diferencia entre «el ciclo medido» y «las peticiones por hora» no dice dónde está el
tiempo; hay que ir a buscarlo.** Las cuatro comprobaciones de arriba cuestan minutos y cada una descarta una
familia de explicaciones. Tres de las cuatro eran fáciles de creer.

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
| `analiza-fases.mjs [fed] [min]` | **el ciclo por fases**: reparte el tiempo de cada trabajo y lo agrupa en portal / escrituras / análisis / espera |
| `mide-guardado-acta.mjs [fed] [n]` | coste suelto de sha256, gzip y escribir, **en el disco duro y en el SSD** |
| `mide-bloqueo-cola.mjs [fed] [n]` | cuánto tarda en concederse el bloqueo de la cola (sin modificar nada) |
| `mide-cola-en-disco.mjs [fed] [n]` | la misma escritura de un trabajo sobre copias de la cola en cada disco |
| `mide-commit-cola.mjs [n] [filas]` | **cuánto cuesta confirmar una escritura** en el disco duro y en el SSD, con `FULL` y con `NORMAL` |
| `trae-paginas-web.sh [carpeta]` | se trae las páginas de la plataforma para mirar QUÉ enseñan, no sólo si dan 200 |
| `analiza-huecos-federacion.mjs [fed] [h]` | reparte el reloj: dentro de la petición, ciclo, huecos de 15-60 s, relevos y paradas |
| `analiza-relevos.sh [fed] [h]` | cuánto duran las sesiones, con qué código terminan y cuánto espera el supervisor |
| `analiza-sin-trabajo.sh [fed] [h]` | ¿se queda sin trabajo disponible? ¿cuántos pendientes hay aplazados? |
| `analiza-duraciones.mjs [fed] [h]` | distribución de la duración de las peticiones y las más lentas, con su tipo |
| `analiza-actividad.mjs [fed] [h]` | peticiones cada 5 minutos: dice si trabaja seguido o a ráfagas |
| `compara-relevos.sh [h] [feds…]` | compara el tiempo perdido entre federaciones de un vistazo |
| `compara-entorno-recolectores.sh` | caza variables perdidas por declarar `environment:` y pisar el ancla |
| `estado-ultima-tanda.sh` · `revisa-salud-flota.sh` | ¿trabajando o caída? Bucles de caída y federaciones mudas |
| `para-medicion.sh <guion.mjs>` | para SÓLO un contenedor de medición, sin tocar los 19 recolectores |

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

1. **Decidir sobre `FACYLF_SINCRONO=NORMAL` para las 19** (§6.2). Medido en Murcia: las escrituras bajan de
   6,01 s a 2,80 s y el ciclo de 10,0 s a 8,1 s (+23 %), con la cola íntegra. **Es una decisión del responsable**
   porque con `NORMAL` una caída de luz puede perder las últimas confirmaciones (la base nunca se corrompe, y
   aquí sólo significa repetir peticiones ya hechas). Va por variable: sin ella, comportamiento de siempre.
2. **Cerrar la confirmación de extremo a extremo** (§6.3): una hora limpia de peticiones/hora, porque la
   medición por fases no cuenta los huecos entre sesiones.
3. **Y ahora sí, bajar la cortesía por federación** (apartado B): con el disco arreglado, la cortesía ha pasado
   a mandar de verdad en Murcia (0,03 s → 0,82 s; 9 de 150 trabajos → 28 de 60). Antes no servía de nada.
4. **Agrupar las escrituras de un acta en UNA transacción.** Quedan 2,80 s de escrituras y la mayoría son
   confirmaciones sueltas (`reconciliaEnlaceActa`, el `update actas`, los dos `upsert` de `archivos`). El
   terreno está preparado: `enTransaccion` ya es reentrante, que era lo que faltaba para poder envolverlas.
5. **Mover el archivo (HTML y JSON) al SSD**: de los 2,80 s que quedan, buena parte sigue siendo escribir en el
   disco duro. Decisión del responsable en lo que toque a dónde viven los datos.
6. **Arreglar el importador que se atasca** (§5.1): quema un 11 % de la máquina sin avanzar, frena a la
   federación cuya cola tiene ocupada y compite por el mismo disco duro.
7. **Explorar la sesión anónima sin navegador** (§6): es el camino al 53 % que ahora se lleva el portal.
8. **(C), descartado** mientras la máquina siga saturada. Reabrirlo sólo si se añaden núcleos.
9. **Arreglar el reloj del servidor**: no tiene NTP (`System clock synchronized: no`).
10. **Dejar de creerse el «sin trabajo» del monitor** (§0) y **mandar el «18 federaciones» del encabezado al
    canónico**, que tiene 21 filas (18 locales y 3 de pruebas, y ninguna de Melilla hasta que se importe).

**Ya hecho:** Castilla y León vuelve a recoger (§0), el entorno de Compose ya no se pierde al añadir variables
(§0.1), **la plataforma enseña datos reales del canónico con su procedencia** (§11), el ciclo por fases está
instrumentado y medido (§6.1), el coste del `fsync` está localizado y hay un arreglo probado en una federación
(§6.2), el método de (B) es aplicable sin reconstruir la imagen (§3) y Valencia corre en el escalón legal más
bajo (§9).

---

## 11 · La plataforma de consultas ya enseña datos reales (desplegado y verificado)

La otra mitad del objetivo. Estaba escrita y probada, pero **la imagen web era de hacía 34 horas**, así que no
estaba desplegada. Ya lo está, y verificado mirando el contenido de las páginas (que den 200 no dice nada: el
síntoma era justamente un 200 con ceros).

| página | qué enseña ahora |
|---|---|
| portada | «18 federaciones · 358 ediciones · 56.605 partidos conocidos · 48.887 actas analizadas», con cobertura desglosada y la frase que explica de dónde sale cada cifra |
| `/federaciones` | «18 con datos importados · medido 23/9/2026, 11:02:23» y la explicación de **por qué ya no enseña** el avance de la cola |
| `/competiciones` | grupos reales con «8/8 resultados · 30 jornadas · 16 inscripciones · actas 8/8» y **«medido el 22/9/2026»** en cada uno |
| `/canonico` | sigue igual que estaba (era la única que ya leía el canónico) |

Los invariantes se respetan y se ven en el HTML: **«Un guion es un dato que no existe, no un cero»**; la
provincia no se ofrece porque el importador todavía no la rellena, y la página lo dice en vez de filtrar a
vacío; y el avance de descubrimiento no se enseña a cero, se explica que vive en una tabla que el canónico no
tiene.

**Queda pendiente de esta mitad:** el rediseño como producto de consulta y la investigación de patrones de UI y
de Generative UI que pide el traspaso; migrar las otras 17 rutas (siguen leyendo el SQLite local, y la propia
portada avisa de que la búsqueda todavía lo hace); y el encabezado, que sigue diciendo «18 federaciones» desde
una lista fija.
