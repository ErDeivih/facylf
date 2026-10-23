# El aparcado del año 2099 y cómo se opera el servidor

Escrito el 06/10/2026 al cerrar el objetivo de dejar todas las federaciones ingestando. Recoge **lo que se
descubrió, lo que se arregló y las trampas que costaron tiempo**, para que el siguiente no las pise.

---

## 1 · El hallazgo: doce federaciones «sin trabajo» que tenían 230.000 trabajos

Doce de las dieciséis federaciones del servidor aparecían paradas: cero peticiones, cero trabajo pendiente.
Parecía que estaban al día. La sospecha de David fue la correcta: **con quince temporadas de historial detrás,
una federación no puede estar sin trabajo.**

Lo que había:

```
POR FECHA (cuándo vuelven)
  2099-01-01    28154   calendario,clasificacion,jornada,acta,indice_jornadas
```

**`2099-01-01` es «nunca».** Las temporadas de 2010 a 2018 estaban aparcadas con `siguiente_intento = 2099-01-01`
y **sin un solo error apuntado**: no las aparcó un fallo, las aparcó una decisión. En Aragón eran 28.154
trabajos de 31.299.

Y el efecto combinado con el suelo: el recolector no las elegía (por la fecha) **y** los porcentajes no las
contaban (por el suelo), así que el agujero no aparecía en ningún informe.

**Total: unos 230.000 trabajos aparcados** repartidos por las dieciséis.

### 1.1 Cómo se abre una temporada

`scripts/servidor/abre-temporada.mjs <cola> <temporada>` — **mirar por defecto**, `--abrir` para abrir:

1. Cuenta lo aparcado de esa temporada por tipo y **enseña el motivo apuntado**. Si sale `(sin error)`, es
   aparcado deliberado y se puede abrir sin miedo.
2. Devuelve `siguiente_intento` a nulo **sólo** en los trabajos de esa temporada que están a 2099.
3. Añade la temporada al fichero `temporadas-asignadas.txt` de la federación, que es la puerta que ya existía
   (`lib/temporadas-asignadas.mjs`) para que una temporada por debajo del suelo **crezca** aunque no sea su
   turno por la escalera normal.

`scripts/servidor/abre-recientes.sh --aplicar` lo hace en las dieciséis a la vez, **una temporada por
federación y por pasada** (la más reciente que quede aparcada). Repetir pasadas va bajando el historial.

**Resultado del 06/10/2026: de ~230.000 aparcados a 0.** Comprobación de cierre:
`scripts/servidor/queda-aparcado.sh` + `cuenta-aparcados.mjs`.

### 1.2 Por qué se abre de la más RECIENTE hacia atrás

Es el orden que pidió David, y tiene sentido: lo reciente da «temporadas anteriores» para los jugadores de hoy.
Pero conviene saber **cómo se sirve después**, porque no es el orden en que se abre:

```
prioridad = base × 1.000.000 + antiguedad × 10.000 + fase × 1.000 + sub × 100
antiguedad = 100 − codigoTemporada
```

**El peso de la competición es cien veces mayor que el de la temporada.** Así que el orden real de servicio es
«primero las competiciones más importantes, sea cual sea su temporada», y dentro de cada competición la
temporada más nueva. Comprobado en los registros: Asturias y Galicia trabajan 2026-27 y 2025-26 mientras la
2018-19 espera. **No es un fallo: es el diseño.** Si alguien quiere cambiar el orden, que sepa que está tocando
esto.

---

## 2 · El despliegue del servidor: un fichero suelto NO

**El 06/10/2026 dejé los 16 recolectores caídos** copiando sólo `recolector-local.mjs` dentro de los
contenedores:

```
ERR_MODULE_NOT_FOUND: file:///app/scripts/lib/temporadas-asignadas.mjs
El worker termino con codigo 1; siguiente intento en 3600 s
```

**La causa:** los contenedores **no leen el repositorio**, su `/app/scripts/` viene de la **imagen** (del 23/09).
El fichero nuevo importa módulos que en la imagen no existen. Desplegar un fichero suelto de un repositorio que
ha seguido avanzando deja una **mezcla**, y la mezcla se rompe por un `import`.

**Lo que hay que hacer:** copiar **la carpeta `lib/` entera** (72 módulos, es autónoma: sólo módulos de Node,
sin dependencias de npm) **junto con** `recolector-local.mjs`, y reiniciar. Guion:
`scripts/servidor/despliega-completo.sh --aplicar` (deja `lib.previo` y `.previo` dentro del contenedor).

**El PC no necesita nada de esto**: sus recolectores **se lanzan desde el repositorio** en cada tanda, así que
leen el código actual cada vez. Esa asimetría es deliberada — el servidor es reproducible, el PC trabaja sobre el
repositorio vivo.

---

## 3 · Las cinco trampas de medición (todas costaron una ronda)

Están aquí porque **cada una me hizo creer algo falso**, y volverán a pasar:

1. **«La última línea de error» no es el error de ahora.** El registro guarda la historia. Cuatro contenedores
   mostraban `ERR_MODULE_NOT_FOUND` y estaban sanos: el error era de las 16:22 y el registro seguía escribiendo
   a las 16:40. **Hay que mirar la FECHA, y comparar la línea del error con el total de líneas.**
2. **El error de un `import` no sale por el registro del contenedor**, sale por el **fichero de registro del
   recolector**. Mi comprobación decía «cero errores en los 16» y era mentira por mirar en el sitio fácil.
3. **`node -e` en línea falla EN SILENCIO.** PowerShell 5.1 no escapa las comillas al pasar argumentos a un
   ejecutable nativo. El 06/10 las dieciséis federaciones contestaron «no tiene nada aparcado» con 27.381
   trabajos aparcados en Aragón. **Siempre fichero `.mjs`, nunca `-e`.**
4. **Tapar la salida de un comando es mentirse.** Dos `scp | Out-Null` escondieron que los ficheros **no
   llegaban al servidor**, y perseguí un fallo de consulta que era un fichero inexistente.
5. **Un total que crece no mide producción.** Sumar «todas las temporadas abiertas» sube cada vez que se abre
   una más. La única medida honesta es **fijar el conjunto y volver a medirlo**:
   `scripts/servidor/linea-base-2018-19.sh` (diez federaciones, temporada 2018-19).

Y una sexta, de orden: **ejecutar el recolector como lo ejecuta el contenedor**, con su perfil. Probarlo a mano
sin `--perfil` da `No existe .../descargas-federacion/competiciones-por-temporada.json` y parece roto sin serlo.

---

## 4 · Otras cosas que se arreglaron en la misma faena

- **1.722 actas sin trabajo** en el servidor (Asturias 713, Galicia 685, La Rioja 133, Cantabria 128, Canarias
  37). Estaban en la tabla `actas` y **no tenían ningún trabajo asociado**: no era «no tener trabajo», era
  trabajo que nunca se encoló. `reparaActasSinTrabajo` (que corre al abrir sesión) las devuelve a la cola.
  Medido: bajaron a ~560 en dos rondas, **sin que nadie las tocara**.
- **La distinción que separa un sistema sano de uno roto:** un trabajo aplazado a una fecha **cercana** está
  esperando su turno (`Sin trabajo disponible ahora; el próximo está aplazado a 2026-10-11. No se abre el
  navegador` — eso es el sistema funcionando); uno aplazado a **2099** está aparcado para siempre.
- **El ámbito de menores se lee de `recolector.<fed>.config.json`**, NO de `perfiles/<fed>.json`. Comprobarlo en
  el sitio equivocado lleva a creer que quince federaciones excluyen a los menores cuando **todas lo tienen a
  `true`**. Cataluña no declara la clave, pero su recolector **tampoco la consulta**: recoge todo y marca
  `menores`, archivando en `actas-menores/`.

---

## 5 · RETOMAR EL HISTÓRICO: LA MANERA CORRECTA (y las tres trampas que pisé)

Todo lo anterior **abre** el trabajo aparcado. Pero abrirlo no basta: el **suelo de temporadas** lo vuelve a
excluir al elegir, y ahí me equivoqué tres veces seguidas antes de encontrar lo que ya existía.

### 5.1 Lo que ya estaba escrito, y no leí

**`lib/temporada-minima.mjs`** — el fichero del suelo — contiene las dos piezas, con su comentario diciendo
para qué sirven:

```js
export const TEMPORADA_MINIMA = process.env.FACYLF_TEMPORADA_MINIMA ?? '2023-24';
/** Deshace el aplazamiento (para cuando se retome el histórico). */
export function reactivaTemporadasViejas(db, minima = TEMPORADA_MINIMA) { … }
```

Es decir: **el suelo se baja con una variable de entorno** (sin tocar código, y su comentario lo dice:
*«Se puede cambiar sin tocar código con `FACYLF_TEMPORADA_MINIMA=2020-21`»*), y **deshacer el aparcamiento ya
tenía función propia**, pensada exactamente para este momento.

**Retomar el histórico es, entonces, dos cosas:**

| dónde | qué |
|---|---|
| PC | `$env:FACYLF_TEMPORADA_MINIMA = '2010-11'` en `scripts/entorno-flota.ps1`, y **relanzar la flota** |
| servidor | la misma variable en el **ancla** `&ambiente-recolector` de `docker/compose.yml`, el valor en `docker/.env`, y **recrear** |

Con eso, el suelo deja de excluir **nada** —comprobado con `scripts/mide-suelo.mjs`: «el suelo deja fuera: 0»—
y los recolectores se van al histórico solos, porque la prioridad sigue mandando la competición y **la temporada
en curso ya no tiene trabajo vencido**. No hace falta ningún carril: **el histórico llena el hueco**, y el hueco
está medido (el servidor hacía 1.769 peticiones/hora con capacidad para ~8.000).

**Comprobación de que funciona** (`scripts/servidor/que-temporada-sirve.sh`): con el suelo bajo, Asturias sirve
las temporadas 11 y 16, Galicia y Aragón la 18, Murcia la 19. Con el suelo alto, ninguna.

### 5.2 Las tres trampas, y las tres son silenciosas

1. **`temporadas-asignadas.txt` NO SIRVE PARA ESTO.** No añade temporadas: **restringe la recolección a las que
   lista** (`lib/recolector-local.mjs:831` y `:1645`). Está pensado para **una sola cosa** —repartir Castilla y
   León entre el PC y el servidor por temporadas completas—, y la librería lo dice: *«En el PC conviven cuatro
   federaciones y SÓLO UNA se reparte por temporadas»*. Crearlo en Madrid y Valencia las dejó **encerradas en
   ocho temporadas viejas y fuera de la temporada en curso**, sin un solo error. Y escribirlo con **códigos** en
   vez de **etiquetas** lo deja inerte, porque el lector traduce etiquetas por la tabla `temporadas` (el código
   18 es 2022-23 en Madrid, no 2017-18).
2. **El nombre del proyecto de Compose no se escribe a mano.** `docker compose … up -d` desde `docker/` toma el
   nombre del **directorio** y levanta un juego **duplicado** de contenedores (`docker-*` junto a `facylf-*`) que
   monta **las mismas carpetas**: dos flotas pidiendo lo mismo a la misma federación. La forma correcta está en
   `scripts/servidor/arranca-en-servidor.sh`:
   `docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml up -d`
3. **Un `environment:` propio reemplaza el ancla entera.** Ya pasó el 23/09/2026 (Murcia se quedó sin
   `FACYLF_MEMORIA_GB` y su worker esperaba memoria para siempre, con el contenedor «arriba» y sin recoger
   nada). Antes de añadir una variable al ancla, **comprobar con `scripts/servidor/compara-entorno-recolectores.sh`**
   que ninguna federación tiene columnas vacías. Hoy no las tiene, y por eso el cambio fue una línea.

**La lección común a las tres:** el sistema hizo **exactamente lo que le pedí**, no lo que yo creía pedirle, y no
dio ningún error. **Antes de escribir una herramienta nueva, leer la que ya hay.** Las tres piezas que
necesitaba —`reactivaTemporadasViejas`, `FACYLF_TEMPORADA_MINIMA` y el guion de arranque— **llevaban semanas
escritas y documentadas.**

---

## 6 · Estado al cerrar esta faena (06/10/2026)

| | |
|---|---|
| trabajos aparcados al 2099 | **0** (eran ~285.000 entre las dos máquinas) |
| federaciones con historial abierto | **16 de 16**, de 2026-27 a 2010-11 |
| suelo de temporadas | **bajado a 2010-11** en el PC (`entorno-flota.ps1`) y en el servidor (ancla del `compose` + `.env`) |
| recolectores del servidor | 16 vivos, con `lib/` completo desplegado y verificado |
| recolector del PC | lee del repositorio; sin despliegue pendiente |
| actas sin trabajo (huérfanas) | **237** (eran 1.722; el 86 % recuperadas solas) |

**EL HISTORIAL SE ESTÁ RECOGIENDO, NO SÓLO ENCOLADO** (verificado el 06/10/2026 después de bajar el suelo):

- **PC**: los tres recolectores activos sirven temporadas antiguas — 92, 99 y 98 claves de trabajo con código
  anterior a la 2023-24, y **cero** de la temporada en curso (que ya no tiene trabajo vencido).
- **Servidor**: Asturias sirve las temporadas **11 y 16**, Galicia y Aragón la **18**, Murcia la **19**.

Lo que sigue siendo cierto es que queda **muchísimo por hacer**: cientos de miles de trabajos a una petición cada
5-8 segundos por federación. Eso son semanas o meses, no hay atajo y **no se debe subir el ritmo** para acortarlo.
Pero conviene no confundirlo con lo de antes: **ya no está esperando una decisión ni un arreglo — está saliendo.**

### Pendiente de decisión

**Bizkaia, Gipuzkoa, Araba, Las Palmas y Tenerife**: los cinco perfiles y sus configuraciones están listos y con
`actasMenores: true`. Cada uno con **su propia ficha y carpeta** (`descargas-bizkaia`, `descargas-laspalmas`…),
que es la recomendación de Claude y la correcta: no mezclar Vizcaya con Guipúzcoa ni Las Palmas con Tenerife.
Usan la misma plataforma que ya leemos (`/pnfg/NPcd`), así que **el recolector sirve sin tocar código**.

Sólo falta meterlos en el `compose`, copiarlos y `docker compose up -d`. **No se ha hecho porque son cinco
recolectores con navegador más** en una máquina de la que David pidió **bajar** la carga, no subirla. Se
arrancarán de uno en uno, midiendo.
