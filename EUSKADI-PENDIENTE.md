# Euskadi: descifrado y resuelto

Nota de trabajo del 11 de septiembre de 2026. Recoge qué se ha descifrado, qué se ha arreglado y qué
queda abierto, con la evidencia de cada decisión.

## El problema, en una frase

Euskadi sirve sus páginas con la maqueta **widget del tema nova y en euskera**, distinta de la de
Castilla y León. El recolector descargaba las páginas correctamente y **no guardaba nada**: 3.534
páginas de jornada (≈445 MB) y ni un solo partido, ni un acta analizada.

## Lo arreglado

### 1. Descifrado del marcador

El dígito va ofuscado con un `eval(...)` empaquetado (estilo Dean Edwards). **Está desempaquetado**;
la función que genera la clase del dígito es:

```js
function ntype(id, n, i, oc) {
  var t = [2,5,9,4,1,0,8,6,3,7,1,3,5,7,9,0,2,4,6,8,0,2,4,6,8,1,3,5,7,9,7,5,2,0,9,6,3,8,4,1];
  document.getElementById(id).classList.remove(oc);
  document.getElementById(id).classList.add('fa-' + t[i*10 + n]);
}
```

El empaquetador sustituye los tokens 0–35 sólo cuando la clave de esa posición **no está vacía**, y
eso es justo lo que conserva los números de la tabla dentro del código.

La duda era cuál de los tres canales es el bueno: la clase `fa-N`, el
`<span style="display:none">` o el `content:"\0030"` del CSS. **Resuelto sin adivinar**: el proyecto
ya tenía el descifrador en `packages/ingesta/src/parsers/ofuscacion.ts`, usado para la cabecera de
**todas** las actas, y su orden de prioridad dice que la clase calculada por `ntype()` es «la fuente
definitiva» y que los spans ocultos «suelen ser señuelos», quedando como último recurso. Ahora la
jornada usa **ese mismo descifrador** (`numeroOfuscadoHtml`) en vez de una regla propia.

Aun así, en la jornada se es más estricto que en las actas: el marcador sólo se acepta cuando las
**dos** celdas traen una señal fiable (una llamada `ntype(...)` o una clase `fa-N`). Un 21 % de las
celdas no la traen y son las que producían un 22,7 % de 0-0, imposible en fútbol real. En ese caso se
deja el marcador desconocido **en ambos lados** en vez de rellenarlo: un marcador inventado se
propaga a la clasificación sin que se note, y lo acaba poniendo la acta, que es la fuente
autoritativa.

### 2. Extracción de partidos de la maqueta widget

La maqueta no enlaza los equipos (`NFG_VisEquipos?Codigo_Equipo=`): los pone como texto en
`div.font_widgetL > h4` y `div.font_widgetV > h4`, y los códigos sólo están en el enlace de
comparativa (`equipo1=`/`equipo2=`). Se añadió `extraePartidosWidget` como segunda vía, que se usa
sólo si la clásica no ve nada.

### 3. Validación e intérpretes atados al castellano

Tres sitios daban por hecho el idioma y dejaban fuera a Euskadi:

| dónde | exigía | Euskadi publica |
| --- | --- | --- |
| `validaPagina` (acta) | `Ficha Partido\|Titulares\|Suplentes` | `Partiduko fitxa`, `Titularrak`, `Ordezkapenak` |
| `validaPagina` (jornada) | `Visualización de Partidos\|Resultados` | `Emaitzak`, `Jardunaldia` |
| `parseaActa` (secciones) | `Goles`, `Cuerpo Técnico`, `Tarjetas`, `Sustituciones` | `Golak`, `Langile Teknikoak`, `Txartelak`, `Ordezkapenak` |

Los dos primeros hacían que las actas se descargaran bien (superaban los 1.000 bytes, por eso el
motivo era «no parece un acta» y no «página vacía») y se rechazaran igualmente. Los terceros hacían
que se leyeran las alineaciones y el marcador pero **ni un gol, ni una tarjeta, ni un técnico**, sin
avisar. Ahora se aceptan las variantes y, cuando existe, se usa una **señal estructural** que no
depende del idioma: filas de jugador con `jugador=CODIGO`.

### 4. Aviso de cookie escondido en un comentario HTML

La página responde a veces con 117 bytes y el aviso va **dentro de un comentario**:

```html
<body>
<!--
<h1>No se ha aceptado el cookie</h1>
-->
</body>
```

Como el texto de un comentario no existe, el detector de barreras no lo veía y el trabajo quedaba
sin explicación. Ahora se busca en el HTML en bruto y se trata como condición del portal: el trabajo
se aparta una semana **sin contar como fallo seguido**, para que no pare la federación entera.

## Alineaciones sin encabezado: el arreglo que valía para tres federaciones

Hay territoriales cuyas actas publican las alineaciones en tablas **sin** el encabezado
`Titulares`/`Suplentes` y, a veces, **sin** `onclick="jugador="`. La primera vía del parser no veía
nada y esas actas se quedaban sin plantilla aunque la página la traiga.

Regla, comprobada sobre actas reales de Navarra, Murcia y Euskadi: las tablas de alineación van
**antes** del bloque «Cuerpo Técnico» de su equipo, así que el número de encabezados de cuerpo
técnico ya vistos dice de qué lado son — **0 → local, 1 o más → visitante**. Dentro de cada lado, la
primera tabla son los titulares y la segunda los suplentes. Los recuentos salen bien: 11+7 en fútbol
11 y 5+9 en fútbol sala.

Para no confundir una lista de goles o de sustituciones con una plantilla se descartan las tablas
cuyas filas llevan minuto con apóstrofo, y se exige un mínimo de cinco jugadores.

## Resultado (todo leyendo páginas ya descargadas, sin una petición nueva)

| | Antes | Ahora |
| --- | --- | --- |
| Partidos (Euskadi) | 0 | 24.037 |
| Actas descubiertas | 0 | 15.762 |
| Actas analizadas | 0 | 348 |
| Alineaciones (participaciones) | 0 | 11.412 |
| Eventos | 0 | 8.378 (1.010 goles, 1.402 amarillas, 77 rojas, 33 dobles, 2.928 cambios) |
| Actas sin alineación en Navarra | 942 | 0 |
| Actas sin alineación en Murcia | 109 | 0 |

## Lo que queda abierto

- **490 actas «hecha» sin alineación** en seis federaciones, frente a ~1.400 antes:
  Valencia 306 (la fuente publica esas fichas sin listas de jugadores: son JSON de 340 bytes con las
  listas vacías, no hay nada que recuperar), Ceuta 76, **Euskadi 63**, Galicia 39, Canarias 4 y
  Extremadura 2. Los tres bloques grandes son los que hay que mirar.
- **La Rioja:** 6.639 de 13.085 partidos sin código de acta. Sin acta no hay datos de jugador.
- **Madrid:** `api/filtros/grupos_fetch.php` devuelve 267 KB que no son JSON en varias competiciones.
- **Ruido de fondo:** casi todas las federaciones muestran `ERR_CONNECTION_TIMED_OUT`. Con 16
  recolectores y su Chrome sobre menos de 2 GB libres, buena parte de esos fallos son locales. La
  pausa por fallos repetidos se bajó de 6 h a 1 h precisamente por eso: cuatro federaciones se
  pausaron en dos horas por «página vacía», y es mucho más creíble que fuera la máquina que cuatro
  webs a la vez.

## Cómo comprobarlo

```powershell
node scripts\estimar-tiempos.mjs                           # volúmenes y tiempos
node scripts\_diag-salud.mjs                               # salud de las 16 colas
node scripts\_diag-marcador-acta.mjs <cola.sqlite>         # marcador frente a acta enlazada
node scripts\_diag-limpiar-actas-vacias.mjs <cola.sqlite>  # actas sin alineación
node scripts\_diag-enlazar-actas.mjs <cola.sqlite>         # HTML en disco sin enlazar en la base
node scripts\_diag-reactivar-actas.mjs <cola.sqlite> --dias 7
$env:RFCYLF_PERFIL='perfiles/euskadi.json'; node scripts\recolector-local.mjs reprocesar
```
