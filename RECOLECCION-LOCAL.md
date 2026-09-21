# Diseño de recolección local de RFCYLF

Este documento describe el recolector local reanudable y la estructura que alimenta la web.
La colección histórica está en curso desde 2015/16, con Salamanca como primer objetivo.

## Qué se ha verificado

La temporada es una parte obligatoria de cualquier identidad. Los códigos de competición,
grupo y equipo no se tratan como globales ni se reutilizan de un año a otro.

Cadena verificada el 6 de septiembre de 2026:

- temporada `11` = 2015/16: 61 competiciones;
- competición `2316`: 1ª División Provincial de Aficionados;
- grupo `8652`: Primera - Salamanca;
- 22 jornadas, del 18/10/2015 al 01/05/2016;
- la jornada 22 expone equipos (`Codigo_Equipo`) y actas (`CodActa`);
- el acta `3698159` expone dorsal e identificador de jugador;
- el calendario HTML contiene las 22 jornadas en una sola página;
- la clasificación final contiene 12 equipos.

Comprobación adicional de la temporada 2026/27:

- el desplegable publica los códigos de las 15 temporadas 2012/13–2026/27;
- el catálogo actual contiene 40 competiciones, ocho más que la copia local anterior;
- `24218941` (1ª Provincial de Aficionados) expone nueve grupos;
- `24218945` es el grupo de Salamanca y expone 30 jornadas;
- su página de calendario abre y contiene 30 bloques de jornada.

Esta diferencia confirma que el catálogo actual no puede considerarse cerrado. El recolector
vuelve a comprobarlo cada siete días y los grupos de la temporada actual cada catorce. Una
temporada nueva se descubre desde el propio desplegable, sin introducir su código a mano.

La ficha `NFG_VisEquipos` no se recolecta: al abrir un enlace antiguo muestra información
actual y además contiene nombres, teléfonos, correo y domicilio de contacto. Para resultados
y estadísticas basta con los identificadores y nombres que ya aparecen en jornadas y actas.

## Orden del trabajo

1. **Catálogo de temporadas.** Verificar que las temporadas 2015/16 en adelante siguen
   presentes en el desplegable.
2. **Competiciones por temporada.** Cambiar el desplegable y guardar exactamente las
   opciones devueltas. Se comparan con el catálogo local existente; no se presupone que una
   competición exista dos años seguidos.
3. **Grupos por competición y temporada.** Una petición por competición. Cada grupo se
   identifica por `(temporada, competición, grupo)`.
4. **Índice de jornadas.** Se abre la jornada 1 de cada grupo, se guardan sus partidos y el
   desplegable proporciona el número y la fecha de todas las demás. Así no se supone que
   todos los grupos tengan las mismas jornadas ni se gasta una petición sólo para contarlas.
5. **Calendario por grupo.** Una página HTML contiene la programación completa y evita una
   descarga adicional de Excel.
6. **Clasificación por grupo.** Se conserva la clasificación publicada para poder validar la
   que luego reconstruyamos desde resultados.
7. **Jornadas restantes.** Una petición por jornada. De ellas salen los equipos y los códigos
   de acta.
8. **Actas adultas.** Una petición por partido. El agregado de actas permite calcular
   convocatorias, titularidades, suplencias, goles y tarjetas sin visitar una ficha de jugador
   adicional.
9. **Actas de menores.** Se controlan con `alcance.actasMenores`. El archivo local puede
   conservarse para análisis privado, pero la web sólo expone agregados y dorsales en categorías
   de base; el buscador nominal usa exclusivamente categorías adultas.

## Ritmo y recuperación

- una única ventana de Chrome y una única petición lógica en curso;
- perfil dedicado y persistente, sin proxies, sin rotación de sesión y sin Patchright;
- intervalo aleatorio configurado: **8–12 segundos** durante la prueba actual;
- una única petición lógica simultánea y límites de sesión/día configurables;
- un fallo conserva el trabajo pendiente y su siguiente instante de intento;
- si el proceso de Chrome deja de responder, se crea una sesión limpia y la cola continúa;
- cada página se valida antes de marcar el trabajo como terminado;
- los ficheros se escriben primero como `.tmp` y se renombran sólo cuando están completos;
- SQLite conserva cola, intentos, hashes, archivos y presupuesto diario para reanudar sin
  repetir trabajo.

## Almacenamiento

Todo queda bajo `descargas-federacion/recolector-local/`:

```text
cola-v2.sqlite
inventario-codigos.json
temporadas.json
t11-2015-16/
  catalogo.html
  competiciones.json
  comp-2316/
    grupos.html
    grupos.json
    grupo-8652/
      calendario.html
      clasificacion.html
      jornadas/jornada-22.html
      actas-adultos/acta-3698159.html
      actas-adultos/acta-3698159.json
      actas-menores/acta-3698160.html
      actas-menores/acta-3698160.json
```

Cada acta guardada dentro del alcance configurado se analiza además con `parseaActa` (el mismo parser que usa la ingesta
en `packages/ingesta`): se vuelca un JSON junto al HTML con marcador, equipos, alineaciones
(titulares/suplentes/portero), goles, sustituciones, cuerpo técnico y tarjetas. El parser repara
además el mojibake latin-1/UTF-8 de los nombres (p. ej. `Ã³` → `ó`) cuando lo detecta, sin tocar
el texto ya correcto. Ese mismo JSON queda en la columna `datos` de la tabla `actas`, de modo que
se puede reprocesar sin volver a abrir la web. Como el parser se importa del build de
`packages/ingesta/dist`, la recolección necesita `pnpm --filter @facylf/ingesta build` (o
`pnpm build`) la primera vez.

SQLite es solamente un índice y una cola local. El HTML original se conserva para poder
reprocesarlo si cambia un parser. No se utiliza Supabase.

### Regla del archivo comprimido

`guardaAtomico` añade `.gz` cuando el contenido pasa de 8 KB, así que en SQLite hay rutas con y sin
la extensión. De ahí dos invariantes que conviene no romper:

- **`leeArchivo(ruta)` es la única forma de leer un archivo guardado**: busca la ruta tal cual y, si
  no está, su versión `.gz`. Nunca hay que hacer `readFileSync` directo sobre una ruta de la base.
- **Un fichero `.gz` es siempre gzip**, aunque el contenido sea pequeño. Cuando se deriva una ruta
  nueva a partir de otra archivada (por ejemplo el JSON del análisis que acompaña al HTML), hay que
  quitar el `.gz` **antes** de cambiar la extensión: usar `rutaJsonDeArchivo()` del módulo compartido.
  El 13/09/2026 se escribió el JSON encima de `acta-X.html.gz` en 1.526 actas por saltarse esto; el
  detalle está en `ESTADO-INGESTA.md` (sección 7) y el reparador es
  `scripts/reparar-actas-html-perdido.mjs`.

## Identidad histórica de jugadores

La unión entre temporadas se realiza después, en un proceso por lotes. El nombre normalizado
es siempre el punto de partida. Si existen homónimos, se busca primero continuidad en la misma
provincia, después en el mismo club y finalmente en el mismo equipo. Dos apariciones simultáneas
con el mismo nombre se conservan como personas separadas; el identificador federativo, cuando
está presente, actúa como confirmación adicional. Esta regla está implementada en
`packages/dominio/src/jugador.ts` y cubierta por pruebas automáticas.

## Preparación sin red

```powershell
pnpm recolector:preparar -- --desde 2015
pnpm recolector:estado
pnpm recolector:exportar
pnpm recolector:reprocesar
pnpm recolector:plan-muestras
pnpm recolector:test
```

Esto crea la cola a partir del catálogo que ya existe, pero no abre la web.

`recolector:reprocesar` vuelve a interpretar todos los HTML de jornada ya guardados y actualiza
las tablas locales de partidos, equipos, campos y árbitros. No realiza nuevas peticiones. Es el
comando que se ejecuta después de mejorar un parser.

`recolector:plan-muestras` deja en primer lugar tres competiciones variadas por cada
temporada: fútbol aficionado, categoría femenina adulta y fútbol sala siempre que existan.
Para cada una comprobará grupos, la jornada 1 de un grupo real y su calendario. Son 36
competiciones y unas 108 peticiones, repartidas por el límite diario; por eso el plan queda
preparado pero no se ejecuta antes del permiso. Las páginas válidas de la muestra cuentan
como trabajo real y no se vuelven a descargar durante el barrido completo.

`inventario-codigos.json` es el catálogo legible de temporada → competición → grupos, con
fechas de verificación y número de jornadas. Mientras la columna de verificación esté vacía,
la entrada es una candidata local y no una confirmación obtenida de la web. El campo
`inventarioCodigosCompleto` sólo pasa a `true` cuando todas las temporadas se han
contrastado, todas sus competiciones han pasado por la fase de grupos y todos los grupos
han expuesto su índice de jornadas.

`calendariosYJornadasCompletos` exige además que haya un calendario guardado por grupo y
que todas las jornadas descubiertas tengan su HTML local. Así el proceso puede informar de
que ha terminado sin depender de una comprobación manual.

El punto de partida actual contiene los 713 códigos de competición y 59 códigos de grupo
que ya estaban disponibles localmente o se comprobaron en las pruebas pequeñas. No se
presentan como un inventario completo: conseguir los grupos restantes exige aproximadamente
una consulta por competición y se hará únicamente después del permiso.

## Ejecución

1. Copiar `recolector.config.ejemplo.json` como `recolector.config.json`.
2. Ajustar el alcance y el ritmo.
3. Ejecutar una única orden:

```powershell
Copy-Item recolector.config.ejemplo.json recolector.config.json
# Editar una sola vez recolector.config.json
pnpm recolector:arrancar
```

Cada nueva ejecución de `pnpm recolector:arrancar` continúa exactamente desde el primer
trabajo pendiente. Es una orden idempotente: no duplica temporadas, competiciones, grupos,
jornadas ni actas. Puede programarse más adelante una vez al día; si no hay nada pendiente,
si está fuera de horario o existe una pausa preventiva, termina sin hacer peticiones.

La cola usa prioridades absolutas: primero termina de descubrir todos los grupos; después procesa
al mismo nivel Salamanca y las competiciones regionales/nacionales relevantes. A continuación va
el resto del fútbol once y, en la fase final, el fútbol femenino y el fútbol sala. Dentro de cada
bloque, las actas descubiertas se procesan junto a sus jornadas para que las estadísticas nominales
aparezcan pronto en la web.
Las temporadas se recorren de la más reciente a la más antigua, de modo que las cinco últimas
quedan disponibles antes que 2015/16–2020/21. Reiniciar el worker no vuelve a alterar la prioridad.

El mínimo técnico configurable es 4 segundos y el intervalo configurado en las 14 federaciones
pnfg es de 6 a 8 segundos. Los cambios de configuración se cargan al arrancar una sesión nueva:
un worker que ya está en memoria conserva el código y el intervalo con el que comenzó, así que
un cambio en `scripts/recolector-local.mjs` sólo entra en vigor cuando la tarea programada vuelve
a lanzar el proceso.

## Recolector de la Comunidad Valenciana (iSquad, sin navegador)

`scripts/recolector-valencia.mjs` cubre la única territorial que no usa `/pnfg/`. La plataforma
iSquad publica los datos como API JSON, así que este recolector **no abre Chrome**: pide, interpreta
y escribe en las mismas tablas que los demás. Comparte con el recolector pnfg el esquema
(`abreBase`), la escritura de actas (`guardaActaEstructura`) y la pausa global, todas en
`scripts/lib/recolector-local.mjs`.

```powershell
pnpm valencia:preparar     # arma la cola desde el catálogo ya descubierto, sin red
pnpm valencia:arrancar     # recorre la cola
pnpm valencia:estado       # resumen por tipo de trabajo
```

Opciones útiles: `--max N` limita los trabajos de la sesión y `--solo <texto>` procesa únicamente
los trabajos cuya clave contenga ese texto, lo que permite probar o reprocesar una temporada, una
competición o un grupo concretos sin recorrer antes los diez mil trabajos de descubrimiento. Por
ejemplo, `--solo "|15|7941|26510|"` recorre la cadena completa de un solo grupo.

El orden de trabajo es el mismo que en las federaciones pnfg: **todo el descubrimiento antes que
cualquier dato**. Primero el catálogo de temporadas, después los grupos de cada competición y
después el índice de jornadas de cada grupo (que además resuelve el calendario, porque en iSquad el
índice de jornadas *es* el calendario). Sólo entonces se bajan jornadas, clasificaciones y actas.
Así se sabe cuántas actas existen antes de empezar a pedirlas y las estimaciones del visor usan los
datos de la propia federación.

Las jornadas con fecha futura se aplazan a la mañana siguiente a su fecha en vez de pedirse: sin
jugarse no hay resultado ni acta. Si una jornada ya se jugó pero la fuente todavía no publica
resultados, el trabajo se pospone dos días en lugar de guardar un calendario a medias.

Las actas se guardan como JSON con **las fotos incrustadas eliminadas**: la ficha llega con las
imágenes en base64 y son el 95 % del peso (362 KB por acta frente a 18 KB sin ellas). Las imágenes
de personas no aportan nada a los datos y multiplicarían el tamaño de la colección.

## Visor de workers

`scripts/visor-workers.mjs` sirve en `http://127.0.0.1:3777/` el estado de las 19 territoriales
leído directamente de sus bases SQLite y de sus ficheros de sondeo. No recolecta nada: sólo lee.
Muestra, por federación, la estructura, las jornadas, las actas, la cola pendiente, el trabajo
aplazado y la temporada en curso; las barras de estructura, jornadas y cola son medidas reales y
la de actas es una estimación calculada con la media de esa misma federación (se desactiva si el
catálogo es sospechoso o si se ha leído menos del 10 % de los índices).

El visor debe sobrevivir a la máquina saturada, así que tiene tres protecciones:

- `scripts/ejecutar-visor.ps1` comprueba cada 5 minutos el puerto 3777. Si está cerrado lo
  levanta; si está abierto pero no contesta en 20 segundos, mata el proceso y lo levanta; si
  contesta, sólo anota un latido. La tarea programada `FACyLF visor` ejecuta esa comprobación al
  iniciar sesión y cada 5 minutos.
- `visor-workers.mjs` registra cualquier error en `visor.log` y en `visor-watchdog.log` queda el
  latido, de modo que un fallo se puede leer en vez de adivinar.
- Las consultas de estado se cachean 10 segundos: la primera llamada puede tardar unos segundos y
  el resto son milisegundos.

Para forzar un reinicio limpio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ejecutar-visor.ps1 -Forzar
```

**Si el visor no aparece, mira primero la tarea.** El 14/09/2026 la tarea `FACyLF visor` amaneció
**deshabilitada**: el vigilante dejó de latir a las 11:06, el visor murió y estuvo caído dos horas y
media sin que nadie lo levantara (el síntoma desde fuera es «página que no carga», que se confunde con
«los workers se han apagado»). Para comprobarlo y arreglarlo:

```powershell
Get-ScheduledTask -TaskName 'FACyLF visor' | Select-Object TaskName,State
Enable-ScheduledTask -TaskName 'FACyLF visor'; Start-ScheduledTask -TaskName 'FACyLF visor'
```

`ejecutar-visor.ps1` vuelve a habilitarla solo si la encuentra deshabilitada, así que basta con
ejecutarlo a mano una vez. Las tareas de los recolectores se pueden consultar con
`Get-ScheduledTask -TaskName 'FACyLF recolector*'`.

## Memoria antes de abrir Chrome

`adquiereSlotChrome()` no abre un navegador nuevo si `freemem()` baja del umbral
(`MIN_RAM_LIBRE_NUEVO_CHROME`). **Cuidado con ese umbral**: en Windows `freemem()` devuelve la memoria
*libre*, no la *disponible* (que incluye la caché en espera y es varias veces mayor). Medido el
14/09/2026 en este equipo: 4,1 GB libres frente a 17-21 GB disponibles. Con el umbral en 6,5-8 GB,
ningún worker que reciclara su Chrome volvía a entrar: Andalucía, Aragón y Galicia estuvieron **3 h 40
min, 2 h 54 min y 2 h 40 min sin hacer una sola petición**, parados en «esperando memoria libre antes
de abrir Chrome», mientras el equipo tenía 17 GB disponibles. El umbral está en **2,5 GiB**: sobra para
otro Chrome (250-400 MB) y mantiene margen antes de la zona peligrosa.

Para comprobar si alguien está esperando turno o memoria, en `.estado-workers/slots-chrome/`:
`slot-N.lock` son las plazas ocupadas (con el pid dentro) y `espera-pnfg-<pid>.ficha` los que esperan.
Si hay fichas de espera y pocas plazas ocupadas, el freno es la memoria; si están las 14 plazas
ocupadas, el freno es el número de navegadores (por diseño).

## Quién consume la CPU

`node scripts/_diag-cpu-ahora.mjs` compara el tiempo de proceso entre dos muestras y ordena por uso
real. Con los recolectores a pleno rendimiento, medido el 14/09/2026 sobre 12 núcleos lógicos: Chrome
de los recolectores ~353 % (de un núcleo cada uno), Brave 135 %, los dos procesos `python` del usuario
111 %, node 47 %. Es decir: la ingesta no era el único que competía por la máquina.

## Barrera real y página vacía no son lo mismo

Una respuesta corta o vacía **no** es un bloqueo: significa que esa dirección no tiene contenido
(un grupo sin índice, un código retirado, una respuesta a medias). Se comprobó el 11 de septiembre
de 2026 con Murcia, que quedó parada 24 horas porque una sola página de grupo volvió vacía y el
recolector la interpretó como barrera.

Ahora el comportamiento es:

- **barrera de verdad** (texto de reto, captcha, `access denied`, `too many requests`): el trabajo
  pasa a `bloqueado`, se anota en `peticiones` como `bloqueo` y hay **pausa global de 24 h**. Es lo
  correcto: si la web nos está frenando, hay que parar.
- **página vacía o sin contenido**: el trabajo vuelve a `pendiente` con reintento a las 2 h y, si
  falla otra vez, a las 24 h. Al tercer intento se marca `cancelado` con el motivo guardado, para
  no reintentar eternamente algo que no existe. La federación **no se detiene**.
- **cinco fallos seguidos** en la misma sesión: pausa global de 6 h, porque cinco fallos seguidos
  ya sí apuntan a un problema del sitio.

Los trabajos `cancelado` se pueden devolver a la cola y las pausas falsas se pueden retirar con:

```powershell
node scripts/limpiar-pausa.mjs --federacion murcia --seco   # ver qué haría
node scripts/limpiar-pausa.mjs --federacion murcia          # aplicarlo
node scripts/limpiar-pausa.mjs --todas
```

El visor cuenta los `cancelado` como **descartados** (no como pendientes) y los excluye del
denominador de las barras, de modo que una temporada no se queda a medias por un trabajo imposible.

### Un 503 de la fuente es sobrecarga, no una página vacía

Entre esos rechazos había 191 ficheros de **310 bytes** en Andalucía que parecían «páginas vacías» y
eran en realidad la página de Apache: *«503 Service Unavailable: the server is temporarily unable to
service your request due to maintenance downtime or capacity problems»*. Tratarlo como página vacía
significaba seguir pidiendo al mismo ritmo a un servidor que acababa de pedir que se le dejara en paz.
Ahora se detecta y se aplica el mismo criterio que en iSquad con un HTTP 503: el trabajo se aparta
una hora y la sesión se para.

### Un acta que la fuente no publica no puede bloquear a su grupo para siempre

La web publica un grupo sólo cuando **ninguna** de sus actas está fuera de `hecha`. Si una ficha no
existe en la web —Murcia sirve `<html><head></head><body></body></html>`, 39 bytes, para actas de
temporadas antiguas— su trabajo se cancelaba tras tres intentos, pero la fila se quedaba `pendiente`…
y el grupo no se publicaba nunca, por mucho que todo lo demás estuviera completo.

Ahora, al descartar un acta tras tres intentos (2 h, 24 h y descarte, siempre repartidos en días), el
recolector la marca **`ausente_web`** —el mismo criterio que ya se usaba con los grupos que la fuente
retiró— y la web deja de exigirla. Medido el 12/09/2026 en Extremadura: 279 → 283 grupos publicables
(los cuatro que estaban atrapados por una acta inexistente). La cobertura del grupo cuenta esas actas
como resueltas, no como pendientes.

### Y una ficha publicada vacía tampoco (estado `sin_datos`)

Distinto del anterior: aquí la federación **sí publica la ficha**, pero sin datos. En la Copa del Rey
de Euskadi (acta 1838084) y en Navarra (acta 18247573) el HTML archivado trae los encabezados
(«Titularrak»/«Titulares») con la tabla vacía y el entrenador como «Ez du aurkezten»/«No presenta».
El recolector no puede marcarlas `hecha` (publicaría el grupo sin plantillas) ni `ausente_web` (diría
que la fuente no la publica), así que antes las reintentaba **cada mes para siempre** y su grupo no se
publicaba nunca: 34 grupos, 27 de ellos copas de Euskadi.

Ahora, en una **temporada cerrada**, tras dos intentos pasan al estado **`sin_datos`**, con el motivo
escrito: la web las cuenta como resueltas y el grupo puede publicarse. En la temporada en curso se
sigue esperando (la ficha puede llenarse cuando se juegue). Nada se pierde: el HTML queda archivado y
`version_parser` sigue en 0, así que los reparadores la reanalizan cuando haya un parser mejor y, si
sacan algo, la devuelven a `hecha` con un evento `acta_recuperada`.

Antes de marcar ninguna se comprueba el HTML: si trae jugadores o goles que el parser no supo leer
(`_diag-fichas-con-datos-sin-analizar.mjs`), **no se marca** —eso sería tapar un fallo nuestro— y se
informa para arreglar el parser. De las 176 fichas revisadas, 0 tenían datos.

## Reiniciar los recolectores

El supervisor lanza un proceso `node` que vive horas, así que **un cambio en el código no entra en
vigor hasta que el proceso se relanza**. Para aplicarlo a todas las federaciones de una vez:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-recolectores.ps1 -Simular
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-recolectores.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-recolectores.ps1 -Federacion galicia
```

Cortar a mitad es seguro: al empezar cada ciclo el recolector devuelve a `pendiente` cualquier
trabajo que se quedara en `en_curso`, y los procesos de Chrome que queden huérfanos los cierra el
propio supervisor al rearrancar.

## Ventana de temporadas: de 2023-24 en adelante

Decisión del cliente (14/9/2026), para terminar antes la ingesta y poder usar los datos: se recogen
**23-24, 24-25, 25-26 y la 26-27 que se va generando**. Lo ya recogido de temporadas anteriores no se
borra: queda **aplazado** y se puede retomar tal cual.

El suelo se compara por **etiqueta** (`2023-24`), nunca por código de temporada: en La Rioja el código
9 es 2013-14 y en Andalucía el 19 es 2023-24. Vive en `scripts/lib/temporada-minima.mjs` y se puede
cambiar sin tocar código con la variable de entorno `FACYLF_TEMPORADA_MINIMA`.

Se aplica en tres sitios, porque con uno solo se cuela trabajo:

1. `encola()` no crea trabajo de temporadas por debajo del suelo, y el plan
   (`preparaDesdeCatalogo`/`preparaGruposDesdeCatalogo`) ni siquiera registra esas temporadas;
2. la consulta que elige el siguiente trabajo lo excluye, también en Valencia/Madrid y en Cataluña;
3. el trabajo que ya estaba en cola se aparta con un `siguiente_intento` lejano —no se cancela ni se
   borra— para que no consuma tiempo ni ensucie el avance del visor.

```bash
node scripts/aplazar-temporadas-viejas.mjs              # informe: cuánto hay fuera de la ventana
node scripts/aplazar-temporadas-viejas.mjs --aplicar    # lo aparta (290.728 trabajos el 14/9/2026)
node scripts/aplazar-temporadas-viejas.mjs --revertir   # lo devuelve a la cola
```

Medido: de 505.224 trabajos vivos, **290.728 eran de temporadas anteriores a 2023-24** (el 58 %) y
**214.491 dentro de la ventana**. Tras aplicarlo, en tres minutos de comprobación: **0 peticiones a
temporadas antiguas** y 221 dentro de la ventana.

Un cambio así **necesita reiniciar los recolectores** (§Reiniciar los recolectores): el proceso que ya
está en marcha sigue con el código viejo y volvería a despertar trabajo aplazado al reintentar un
fallo.


## Estimación

Desde 2015/16 hay 12 temporadas y 713 competiciones detectadas. El inventario de grupos se
termina antes para no omitir ninguna competición salmantina. A 8–12 segundos entre comienzos de
petición, la cola completa ya se mide en días de ejecución continua, no en meses. Salamanca,
Tercera División/Tercera Federación, Primera y Segunda Federación, Liga Nacional Juvenil,
División de Honor, regionales, Preferente y fases de ascenso comparten la primera prioridad.

## Comprobaciones que conviene tener a mano

Todos son de sólo lectura salvo donde se dice, y ninguno pide nada a las federaciones.

| Comando | Para qué |
| --- | --- |
| `node scripts/estimar-tiempos.mjs` | Cuánto queda por federación, separando lo medido de lo estimado |
| `node scripts/_diag-actividad.mjs` | Última petición de cada cola: sirve para ver si alguna se ha parado |
| `node scripts/_diag-salud.mjs` | Errores y bloqueos de las últimas 24 h por federación |
| `node scripts/_diag-grupos-comprobados.mjs` | Qué competiciones están listas para publicarse (`grupos_comprobados_en`) |
| `node scripts/_diag-auditoria-web.mjs <fed>` | Qué le falta a cada grupo para que la web lo publique, agrupado por motivo |
| `node scripts/_diag-porque-no-publica.mjs <fed> <temp> <comp>` | El detalle de una competición concreta |
| `node scripts/_diag-actas-canceladas.mjs` | Actas que no se pudieron bajar y están bloqueando su grupo |
| `node scripts/_diag-calidad-cataluna.mjs` | Compara el marcador con los goles leídos en las actas de la FCF |
| `node scripts/_diag-cola.mjs <ruta-cola>` | Foto de una cola: trabajos por tipo y estado, actas, jornadas, partidos |
| `node scripts/_diag-huecos.mjs <ruta-cola>` | Ritmo real: hueco entre peticiones consecutivas |
| `node scripts/_diag-ritmo-rapido.mjs [min]` | Peticiones por minuto y errores de cada federación ahora mismo |
| `node scripts/_diag-integridad-archivos.mjs [fed]` | Que cada ruta de la base exista y que todo `.gz` sea gzip de verdad |
| `node scripts/_diag-procesos.mjs` | Qué recolectores, supervisores y visor están vivos y desde cuándo |
| `node scripts/auditar-calidad.mjs` | Integridad y motivos de «revisar» de las actas de las 18 federaciones |
| `node scripts/_diag-ver-archivo.mjs <ruta>` | Qué contiene un HTML guardado (plano o `.gz`) y qué se lee de él |
| `node scripts/_diag-copas.mjs <ruta-cola>` | Competiciones sin índice de jornadas: cuántos grupos tienen índice y cuántos no |
| `node scripts/_diag-desplegable-grupos.mjs <fed> <temp> <comp>` | El desplegable de grupos tal cual lo publica la federación, junto a lo que saca el extractor |
| `node scripts/_diag-clasifica-bloqueos.mjs` | Clasifica los grupos sin índice: código repetido, nombre repetido o sin jornadas publicadas |
| `node scripts/_diag-grupos-bloqueados.mjs <ruta-cola>` | Grupos que no podrán publicarse y por qué motivo, agrupados |
| `node scripts/_diag-bloqueos-definitivos.mjs` | Cuenta los grupos sin salida en las 18 federaciones, separando los transitorios |
| `node scripts/_diag-estado-grupo.mjs <fed> <temp> <comp> <grupo>` | Ficha de un grupo: jornadas, partidos, actas, trabajos y aplazamientos |
| `node scripts/_diag-adelantar-trabajo.mjs <ruta-cola> <clave>` | Pone un trabajo al frente para observar qué contesta la fuente (una sola petición) |
| `node scripts/marcar-grupos-sin-jornadas.mjs` | Marca como `ausente_web` los grupos que la federación lista sin jornadas (`--aplicar`) |
| `node scripts/marcar-actas-sin-datos.mjs` | Cierra como `sin_datos` las fichas que la federación publica vacías, tras comprobar el HTML (`--aplicar`) |
| `node scripts/_diag-actas-sin-datos.mjs` | Cuántas fichas sin datos hay y cuántos grupos bloquean |
| `node scripts/_diag-fichas-con-datos-sin-analizar.mjs` | Busca fichas que SÍ traen datos y el parser no lee (fallo nuestro, no de la fuente) |
| `node scripts/_diag-publicables-total.mjs` | Competiciones publicables en las 18 federaciones con la condición actual de la web |
| `node scripts/_diag-web-competicion.mjs <slug>` | Comprueba que la web sirve de verdad una competición (no sólo que la base lo permita) |
| `node scripts/adelantar-jornadas-sin-partidos.mjs <fed>` | Adelanta las jornadas aplazadas por «la fuente no publica» para que el arreglo se aplique ya |

Los `_diag-marcar-actas-ausentes.mjs`, `_diag-reabrir-*.mjs` y `_diag-limpiar-fechas.mjs` **escriben**
en la cola: se usan para reparaciones puntuales y conviene leer su cabecera antes de lanzarlos (varios
tienen nota de por qué se limitan a una federación).
