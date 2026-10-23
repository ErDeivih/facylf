# Traspaso a Claude — jornada del 12 de octubre de 2026

> Escrito por DeepSeek. Cubre **15 rondas de trabajo** entre el 11/10 por la noche y el 12/10 a media tarde.
> Todo lo que sigue está **comprobado en esta sesión**, con la salida real pegada. Donde no llegué, lo digo.
> El estado completo está en `ESTADO-DEEPSEEK.md`; esto es sólo **lo que es tuyo**.

---

## 1 · Lo más importante del día: el criterio de verificación estaba mal planteado

**El umbral del 95 % de «con resultado» NO mide la importación: mide la FUENTE.** Lo demostré con dos casos opuestos:

- **Canarias 2025-26** sale al **63 %** ✗ y el canónico es **idéntico a su paquete** (1.297 / 816 los dos ✓✓) → **no falta importar: falta recoger**.
- **Ceuta 2017-18** sale al **76 %** ✓ y **sí había pérdida**: el paquete trae 2.080 partidos y el canónico 2.044 ✗.

**El criterio bueno es `canónico == paquete de origen`, exacto**, temporada a temporada. Con él verifiqué: **melilla 5/5 exactas** ✓✓, **canarias 6/6 exactas** ✓✓, **ceuta 9/10 exactas** ✓, **rioja 2025-26 y 2024-25 exactas** ✓✓.

**Consecuencia para ti**: no persigas un «<95 %» como si fuera un fallo de importación. **Compara contra la cola.**

---

## 2 · CyL: 779 partidos que no entran porque el importador se niega — y hace bien ✗

**Es el hallazgo más importante para ti**, y está localizado en **una sola competición: la provincial de Salamanca**.

```
✗ El acta 3114304 (35292 J1) no se corresponde con la fila del calendario que la cita:
  el calendario dice «C.D. Navega vs Real Salamanca Monterrey C.F.» y el acta dice
  «U.D. Santa Marta de Tormes vs C.D. Villares de La Reina».
  El lote se detiene: hay que revisar la fuente.
```

**No es pérdida de datos: es que la fuente trae el acta pegada a otro partido** ✗. El importador **se niega y lo dice con nombres** ✓, que es lo correcto ✓.

**Cuánto cuesta** (medido, paquete contra canónico):

| temporada | paquete | canónico | faltan | grupos detenidos |
|---|---|---|---|---|
| **2020-21** | 2.683 | 2.278 | **−405** ✗✗ | **5** |
| **2024-25** | 28.357 | 28.093 | **−264** ✗✗ | **3** |
| 2016-17 | 21.630 | 21.556 | −74 ✗ | — |
| 2026-27 | 3.153 | 3.125 | −28 ✗ | — |
| 2018-19 | 20.341 | 20.333 | −8 ✗ | — |
| 2022-23 | 21.922 | 21.922 | **= ✓** | 0 |

**Los grupos detenidos son, todos, de Salamanca** ✓: en 2020-21 `35292` («Salamanca - 1»), `33979`, `33981`, `34377`, `35294`; en 2024-25 `21734954`, `11379820`, `11379871`. **La proporción cuadra** (5 grupos ↔ −405; 3 ↔ −264) ✓.

**Verificado que NO converge** ✓: reimporté 2024-25 entera (190 importados, **3 fallidos**) y el canónico **se quedó clavado en 28.093** ✗ → **no era dato viejo, es el guardián de la fuente** ✓.

**Evidencia**: `pruebas\reconstruccion\salidas\importacion-castilla-leon-2020-21-35292.txt` ✓ y `pruebas\reconstruccion\importacion-fallos-castilla-leon-<temporada>.json` ✓.

**Lo que hace falta decidir**: **cómo se trata un acta que no cuadra con su calendario** ✓. Hoy **se para el grupo entero** ✗ — lo más seguro, pero cuesta 779 partidos en CyL. Las opciones son tuyas: descartar el grupo, importar sólo los partidos que sí cuadran, o marcar la incidencia y seguir. **Yo no lo toco.**

---

## 3 · Madrid: un endpoint que devuelve 4 bytes pone al recolector en pausa ✗✗

**Y de ahí salen todos los síntomas que fui apuntando mal durante el día** (primero dije «sin worker», luego «su API falla»; la causa es una sola ✓). Su propio registro lo dice:

```
14:03:30  [supervisor] pid 28528: scripts/recolector-madrid.mjs arrancar
          Recolección en pausa hasta 2026-10-12T12:44:29.447Z:
            clasificacion|22|26737701|26737704||: 5 fallos seguidos:
            api/standings?idGroup=26737704&round=34 no devolvió JSON utilizable (4 B)
14:05:07  El worker termino; siguiente intento en 300 s (planificador: 2362 s)
```

**Madrid tiene worker y funciona** ✓ — arranca, hace su pasada y termina **cada ~5 minutos, por diseño** ✓. Lo que pasa es que **se autopausa** ✗ tras **5 fallos seguidos** de una llamada que devuelve **4 bytes** ✓.

**Efecto medido**: **10 peticiones/hora** ✗ con **647 trabajos vencidos** ✗ (el criterio de T-08 pide mirar justo eso ✓). Y explica que al mirar los procesos **unas veces haya worker y otras no** ✓ (está en el hueco de 300 s).

**El arreglo es pequeño y de una sola cosa** ✓: **tratar esa respuesta vacía como «esta jornada no tiene clasificación»** —o dejar de pedir jornadas que no existen— **en vez de como un fallo** ✗. Con eso **Madrid sale de la pausa solo**.

**Evidencia**: `descargas-madrid\recolector-local\worker-programado.log` ✓. Y en la cola hay **7 cancelaciones** del mismo endpoint (`--cancelados` sobre `descargas-madrid\recolector-local\cola-v2.sqlite` ✓).

**Y una nota de diseño**: un contador de fallos que se dispara con una respuesta **legítimamente vacía** es el mismo patrón que el resto de la lista de abajo ✗ — un dato sin información tratado como si la tuviera.

---

## 4 · El goteo de 1-3 partidos por temporada que no entra y no se avisa ✗

Comparando cada temporada importada contra su cola (Andalucía, paso 4):

| temporada | canónico | cola | diferencia |
|---|---|---|---|
| 2019-20 | 2.012 / 1.836 | 2.012 / 1.836 | **exacto** ✓✓ |
| 2018-19 | 2.414 / 2.290 | 2.420 / 2.296 | −6 |
| 2017-18 | 2.327 / 2.178 | 2.328 / 2.179 | **−1** |
| 2016-17 | 2.298 / 2.150 | 2.301 / 2.153 | **−3** |
| 2015-16 | 2.304 / 2.193 | 2.305 / 2.193 | **−1** (resultados exactos ✓) |
| 2014-15 | 2.243 / 2.174 | 2.252 / 2.183 | −9 |
| CyL 2013-14 | 4.238 / 4.212 | 4.240 / 4.214 | **−2** |

**Un goteo constante de 1 a 9 partidos por temporada**, con los resultados casi siempre exactos ✓. **Es la misma familia** que CyL (−779) y Ceuta (−36), **en pequeño** ✗. **Y sólo se ve comparando contra la cola** — desde el canónico es invisible ✗.

**Lo que hace falta**: saber **por qué** esos pocos partidos no entran, y que **se avise** cuando ocurra ✓. Hoy el importador dice «0 fallidos» y es verdad **de lo que hizo**, no de lo que había ✗.

---

## 5 · El falso positivo de la validación por lotes ✗

```
✗ La validación del lote 75466 ha fallado: partidos 18≠36, partidos con resultado 18≠36,
  actas analizadas 9≠36, participaciones 318≠1270, eventos 241≠940, técnicos 61≠179,
  árbitros designados 18≠36
```

(Canarias 2026-27.) **Pero los datos quedan BIEN** ✓✓: el paquete y el canónico dan **174 partidos y 125 con resultado**, exactos ✓, y **el grupo afectado tiene 2 partidos en el origen**, no 36 ✓. Importado **solo**, ese grupo valida con **código 0** y dice «recuentos origen/destino: cuadran» ✓.

**O sea: la temporada entera se declara fallida DESPUÉS de escribir bien** ✗ — y costó una reimportación ✓. **Los contadores esperados no salen del origen** ✗.

**Es el peor de los cuatro de esta familia** ✓ (la API de la FCF que ignora `temporadaId` · `informe:buscar` que ignora su argumento · el monitor que llama «atascada» a lo que está ahogada · y éste) **porque este sí hace concluir**: **taparía una pérdida real** ✗✗.

---

## 6 · El registro de fallos: el `motivo` sale truncado ✗

Tu arreglo **funciona** ✓✓ — guarda el motivo real y la ruta de la salida entera ✓. **Pero el motivo pierde el principio** ✗, porque el mensaje **se parte al envolver** en la consola y se coge una sola línea:

```json
"motivo": "Reina». El lote se detiene: hay que revisar la fuente."
```

cuando el mensaje real empieza en `✗ El acta 3114304 (35292 J1) no se corresponde con la fila del calendario que la cita: …` ✓.

**La salida entera sí está bien** ✓ (`salidas\importacion-<fed>-<temp>-<grupo>.txt` ✓) → basta con **coger la frase entera del `✗`**, no una línea ✓.

**Y ojo**: por `pnpm importar` directo **no se guarda nada** ✓ (`importacion-fallos-canarias-2026-27.json` sigue con el `NativeCommandError` viejo ✗) — el registro sólo actúa si se llama al envoltorio ✓.

---

## 7 · Las 61 cancelaciones de Andalucía sin motivo ✗

Clasifiqué **los 135.000 cancelados** de las cinco colas del PC por motivo (`--cancelados` ✓). Lo grande es inocente ✓, pero:

```
andalucia · cancelados: 74 en 4 motivos distintos
     61  (sin motivo guardado)                    ← ✗ y con sellos de HOY (11:42)
     10  la página del acta viene vacía y el partido es de hace más de dos meses…
      2  unknown error: net::ERR_NAME_NOT_RESOLVED
      1  página vacía o sin contenido (39 bytes)
```

**Una cancelación sin motivo no se puede juzgar** ✓ — no se sabe si era dato recuperable o no ✓. **Lo que hace falta**: guardar siempre un motivo al cancelar ✓.

---

## 8 · El supervisor no puede leer `Win32_Process` y espera ✗

```
2026-10-11 10:59:42  No se pudo leer la lista de procesos
   (Command failed: powershell.exe -NoProfile -NonInteractive -Command
    Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine
    | ConvertTo-Json -Compress);
   se espera en vez de arriesgar un duplicado.
```

**Está documentado en tu propio código** ✓ y la decisión (esperar en vez de duplicar) es correcta ✓. Pero **el efecto es que no levanta workers** ✗: **Valencia lleva sin worker** ✓ y sus **5.042 trabajos vencidos** ✗✗ no avanzan. **Es lo único que separa a Valencia de volver a pedir** ✓ — aparte del token de la sección 9.

**Evidencia**: `registros\supervisor-flota.log` ✓ (última entrada: 11/10 17:28:58 ✓).

---

## 9 · T-06 (Valencia): la API exige el token de la página ✗ — y NO es de cabeceras

**Hice la prueba que pide T-06** ✓ (3 peticiones separadas 10 s, con `scripts\prueba-referer-valencia.mjs` ✓, y respetando la condición que el propio script impone: sólo una vez pasada su pausa del 09/10 ✓ — Valencia pidió con normalidad hasta el 11/10 10:31 ✓):

```
[403] COMO LO HACE EL RECOLECTOR   {"reason":"Token de página inválido o ausente","reason_code":"INVALID_PAGE_TOKEN"}
[403] CON Referer                  ← igual
[403] COMO UN NAVEGADOR            ← igual (Accept-Language + Origin)
```

**Las tres dan 403** ✓✓ → **la causa NO es la forma de la petición** ✗ → **el arreglo de dos líneas que esperabas no sirve** ✗. El servidor pide **el token que genera la propia página** ✓: habría que **cargar primero la página del grupo y quedarse con su token** ✓.

**Y encaja con el canónico**: las 2 temporadas vacías de Valencia **están vacías también en el origen** ✓ (medido) → **importar no las arregla: hay que recoger** ✓.

---

## 10 · Lo que NO es un problema — no lo persigas ✗✓

Esto es la mitad del valor del día. **Cuatro veces concluí de más** y las cuatro están comprobadas:

| lo que parece | lo que es |
|---|---|
| **Baleares lleva 3 semanas sin pedir en el PC** ✗ | **está en `FACYLF_EXCLUIR` a propósito** ✓✓: la recoge el **servidor**. Su cola del PC parada **es lo esperado** |
| **Cataluña parada 16 h** ✗ | **falso**: hace **356 peticiones/hora**, la que más ✓, con **0 trabajos vencidos** ✓. Su recolector va contra una **API** y **no necesita navegador** ✓ |
| **Madrid sin worker** ✗ | **tiene worker**: arranca y termina cada ~5 min **por diseño** ✓; su problema es la pausa por el endpoint de 4 B (sección 3) |
| **Las 1.062 actas de Madrid «sin datos» son recuperables** ✗ | **NO hay nada que recuperar**: abrí el JSON guardado y dice **`"acta_cerrada": "0"`** con equipos, marcador y jugadores **vacíos** ✓ — son actas de **«PREFERENTE BENJAMÍN F-7» que la RFFM no ha cerrado** ✓. **El recolector hizo lo correcto al cancelarlas** ✓. **NO las reabras** ✗: se volverían a cancelar |

Y dos cosas que también sorprenden y están bien:

- **Las 125.244 cancelaciones de Cataluña son DEDUPLICACIÓN** ✓ («el código de acta ya está en la cola en su jornada» ✓), no pérdida ✓.
- **Las 1.799 de CyL son «la página del acta viene vacía y el partido es de hace más de dos meses: la fuente ya no la publica»** ✓ — límite de la fuente ✓.
- **Andalucía, Madrid y Cataluña no tienen `perfiles/<fed>.json`**: tienen su **recolector propio** ✓ (por diseño ✓). Y las tareas `FACyLF recolector *` están **Disabled** porque las sustituyó **el supervisor único** ✓.

---

## 11 · Lo que funciona bien y conviene no romper ✓

- **La importación es idempotente** ✓✓ (demostrado dos veces: rioja entera reimportada, 146/146 con código 0 y sin un solo error de clave duplicada ✓).
- **El traspaso es exacto** en la mayoría de temporadas ✓✓ (canarias 6/6 ✓, melilla 5/5 ✓, ceuta 9/10 ✓).
- **El canónico es fiel a la cola**: Madrid 2022-23 da **8.711 resultados en los dos** ✓ → lo que falta está **más atrás**, en que la cola no pudo leer ✓, no en la importación ✓.
- **El cerrojo por adaptador** ✓ y **el supervisor único** ✓ funcionan (37 procesos y 1,5 GB → 1 proceso y 0,07 GB ✓).
- **T-11 ya estaba aplicado** ✓✓: `serversports` tiene **37.879 fichas con `dorsal`** ✓ (38.951 con `jugadores`, 38.957 con la marca `menores` ✓) y `isquad-balonmano` **3.062 actas** ✓.

---

## 12 · Herramientas que dejo (sólo lectura)

En `_traspaso\_diag\` ✓ — contadores que **no piden nada a ninguna web** y que me sirvieron para todo lo de arriba:

- **`cuenta-paquete.mjs <sqlite|cola> [opciones]`** ✓: `--temporadas` (qué temporadas conoce), **`--por-temporada`** (qué tiene **de verdad**, que es lo que decide — la tabla `temporadas` es el **catálogo**, no los datos ✗✓), `--columnas`, `--busca <texto>`, `--ligas`, `--ritmo <min>` (**peticiones por la tabla `peticiones`**, no `actualizado_en` ✓), **`--trabajos`** (cuántos **vencidos** hay: la mitad del criterio de T-08 ✓), **`--cancelados`**, **`--agrupa <regex>`** (agrupar motivos normalizando números — así encontré que Madrid eran 1.062 actas y no 1.062 standings ✗✓), `--muestra-cancelado <texto>`.
- **`mira-next-data.mjs`** y **`mira-evidencia.mjs`** ✓: abren una muestra guardada y dicen qué trae dentro (sin pedir nada) ✓ — sirvieron para cerrar el caso de Madrid ✓.
- **`quien-consume.sh`** ✓: quién come CPU en el servidor, para descartar que una extracción mía se hubiera quedado viva ✓.

---

## 13 · Estado del encargo y lo que queda

**Hecho** ✓: pasos **1** (Ceuta), **2** (Canarias), **4** (Andalucía 13/13 y CyL 13, 3.232 grupos, 0 fallos) y **5** (T-12: **las 11 zonas**); **T-08, T-11 y T-12**; el informe por federación de las **20**; y la preparación completa del arranque del servidor.

**Bloqueado por el servidor apagado** ✗: **paso 3** (CyL primero: le faltan **2014-15 y 2012-13**, que son suyos) y **T-05, T-07, T-09 y T-10**. David dijo que lo arranca él.

**Y una cosa que te toca a ti por si el servidor vuelve a caerse** ✗✗: **murió anoche con el `facylf.slice` a 11 de 12 GiB y load 18,32** ✓ — justo la condición que justificaba **T-10** (`systemd-oomd`). Lo dejo anotado, no lo toco.

---

## 14 · Cómo me equivoqué, para que no te fíes de más

**Seis correcciones en un día, todas del mismo tipo**: concluir de más desde casos parecidos en vez de mirar el dato propio de cada uno ✗✓ — **baleares** (excluida a propósito), **valencia** (es del PC, no del servidor), **cataluña** (no está parada), **madrid** (tiene worker), **las 1.062 actas** (no hay nada que recuperar) y **medir el canónico mientras importaba** (Ceuta).

Están **escritas como correcciones en `ESTADO-DEEPSEEK.md`**, no borradas ✓. Si en algo de este documento ves un dato que no cuadra, **míralo tú**: la mitad de las veces el que se equivocaba era yo.
