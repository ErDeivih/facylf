# Federaciones con problemas: qué se encontró y qué se arregló

## ⟶ CONTINUAR POR AQUÍ (lo que queda, con su comando)

**Sólo quedan dos cosas, y ninguna se resuelve pensando: las dos hay que ejecutarlas.**

**1 · Valencia — el `Referer`. A partir del 09/10/2026 a las 08:14** (el recolector se pausó solo hasta esa
hora tras recibir el 403; **no pedirle nada antes**):

```bash
node scripts/prueba-referer-valencia.mjs
```

Hace tres peticiones: como lo hace el recolector (sin `Referer`), con `Referer`, y como un navegador. **Si la
primera da 403 y las otras 200, el arreglo son dos líneas** en `pideJson` (`recolector-valencia.mjs:462`). Si las
tres dan 403, la causa es otra (sesión o bloqueo por IP) y hay que capturar la red de un navegador de verdad.

**2 · Melilla — las 5 temporadas vacías.** Su cola tiene 10 temporadas y su catálogo sólo 5
(`competiciones-por-temporada.json` → 18 a 22). Las de 2015-16 a 2019-20 **tienen su trabajo de catálogo hecho y
cero competiciones**. Comprobado que **no hay atajo por HTTP** (la `base` de su perfil sola da 404), así que hay
que **abrir su portal con el navegador del recolector y capturar la red** para ver qué pide al elegir una
temporada antigua. Si el portal no las publica, **no hay nada que hacer y queda cerrado**.

**Y si se quiere volver a pasar la comprobación sistemática** (temporadas vacías en las 20 colas):

```bash
scripts/servidor/vacias-16.sh          # las 16 del servidor
node scripts/diagnostica-temporadas-vacias.mjs <cola.sqlite> <etiqueta>   # una cualquiera
```

---

Escrito el 08/10/2026, tras dieciséis rondas investigando Cataluña, Valencia, Melilla y las demás. **Recoge
las conclusiones con su evidencia y, sobre todo, la comprobación que distingue un hueco real de una falsa
alarma** — porque la primera que escribí daba cuatro falsos positivos y se quedaba corta en el único caso real.

---

## 1 · La comprobación que hay que usar (y la que NO)

### La mala: contar temporadas

Comparar las temporadas del catálogo contra el `desdeAnio` de la configuración **da falsas alarmas**. Señaló a
cinco federaciones; **cuatro estaban bien**:

| federación | lo que dijo | la verdad |
|---|---|---|
| Cataluña | «faltan 10 temporadas» | su API **sólo publica 2** |
| Canarias | «faltan 7» | **0 temporadas vacías** |
| Ceuta | «faltan 3» | **0 vacías** |
| Murcia | «falta 1» | **0 vacías** |
| **Melilla** | «faltan 2» | **5 vacías** ← y aquí se quedó **corta** |

**Exageró en cuatro y se quedó corta en el único real.** El `desdeAnio` es una aspiración, no lo que la fuente
ofrece: Cataluña declara 2015 y su API publica 2025-26 y 2026-27.

### La buena: contar competiciones DENTRO de cada temporada

> **Por cada federación y temporada: ¿tiene 0 competiciones, o tiene algunas?**

- **0 competiciones** → o la fuente no la publica, o el descubrimiento se quedó a medias. **Hay que mirarlo.**
- **algunas** → la temporada está descubierta; lo que le falte es recolección, que es otra cosa.

**Una temporada vacía es invisible en cualquier resumen**: no tiene trabajo, así que no pide nada, así que
parece al día. Es el agujero silencioso de manual.

Herramienta: `scripts/diagnostica-temporadas-vacias.mjs` + `scripts/servidor/vacias-16.sh`.

**Resultado en las 20 colas (08/10/2026): sólo Melilla tiene temporadas vacías.** Las otras diecinueve, cero.

---

## 2 · Cataluña: dos fallos reales, corregidos

### Fallo 1 — el historial no se buscaba NUNCA

`scripts/recolector-cataluna.mjs`:

```js
if (!datos.temporadas.length && quedan()) await descubreTemporadas(...);
```

Sólo buscaba temporadas **con el catálogo vacío**. Como ya tenía dos, la condición era falsa para siempre y
**las anteriores no se buscaban jamás**. El resto de pasos sí corrían (refinaban competiciones y grupos), así
que el descubridor **parecía trabajar** y nadie notó que el historial no se tocaba.

**Corregido**: también busca si al catálogo le falta historial respecto al `desdeAnio` que declara la
federación. Es aditivo: con el catálogo completo no cambia nada.

### Fallo 2 — la capa de cookies se comía los clics

Diagnóstico (`scripts/diagnostica-selector-cataluna.mjs`) con la posición de cada botón y **quién lo tapa**:

```
[19] «2026-27» visible pos(85,687)  ← TAPADO POR DIV.qc-cmp-cleanslate css-1ij9nli
[3]  «AGREE»   visible pos(918,662)
```

El botón de la temporada **existe, está visible, y el clic no le llega**: la capa de consentimiento (Quantcast)
lo cubre. Por eso los 81 `<li>` de la página no cambiaban en 50 segundos — no es que la lista tardara, es que
nadie pulsaba nada.

**Corregido**: se pulsa «AGREE» **esperándolo hasta 25 s** (aparece con retraso — la primera versión miraba una
sola vez y no lo encontraba). Se pulsa **sólo** aceptar: `MORE OPTIONS`, `DISAGREE` y `partners` no se tocan.

### Y lo que NO es un fallo nuestro

```
GET https://www.fcf.cat/api/competition/temporadas
→ [{"value":"22","label":"2026-2027"},{"value":"21","label":"2025-2026"}]
```

**La API de la FCF declara dos temporadas, y nada más.** Es lo que el backend dice de sí mismo, así que
**probablemente** el catálogo esté completo respecto a su fuente — pero ver la advertencia de más abajo: hay un
parámetro de esa misma API que **no** funciona como aparenta.

### LA API COMPLETA DE LA FCF (encontrada el 08/10/2026)

**⚠ AVISO: la conclusión sobre el historial está EN DUDA — leer el final de esta sección antes de darla por
buena.** El endpoint de temporadas sólo lista dos, pero **hay indicios de que el parámetro `temporadaId` puede
no respetarse**, y eso debilita la prueba.

La web de la FCF es **Next.js con un proxy a un backend REST**. Los endpoints, todos bajo
`https://www.fcf.cat/api/competition/`:

| endpoint | qué devuelve |
|---|---|
| `temporadas` | **las dos temporadas que existen**: `22` = 2026-2027, `21` = 2025-2026 |
| `disciplines` | las 7 modalidades: Fútbol 11, 7, 5, Sala, Femení, Sala Femení, Platja |
| **`competicions?temporadaId=NN&disciplinaId=MM`** | **la lista completa de competiciones** |

Ejemplo real, `competicions?temporadaId=22&disciplinaId=19308233` → **51 competiciones de Fútbol 11 en la
2026-27**: Primera/Segona/Tercera Federació, Lliga Elit, Primera a Quarta Catalana, Divisió Honor Juvenil,
Lliga Nacional Juvenil, Preferent, Divisió Honor Cadet S16 y S15, Infantil S14 y S13, Lúdica, copas…

**El historial: NO está demostrado que no exista. La API IGNORA el parámetro de temporada.**

```
GET .../competicions?temporadaId=21&disciplinaId=19308239     ← se pide la 2025-26
→ [{"CODTEMPORADA":"22", …}, {"CODTEMPORADA":"22", …}, …]      ← devuelve TODO de la 2026-27
```

**Se pidió la temporada 21 y cada fila viene etiquetada como 22.** La API **acepta `temporadaId` y lo ignora**:
siempre responde con la temporada en curso. Y **cada fila lo dice de sí misma** en `CODTEMPORADA`, que es lo
que permitió detectarlo.

**Consecuencias, y son importantes:**

1. **Nunca se llegó a preguntar por otra temporada.** Todas las consultas devolvieron la 2026-27, así que la
   conclusión «el backend sólo tiene dos» **no se apoya en ninguna comprobación**.
2. **El «257 competiciones por temporada» era la misma temporada contada dos veces** — dos ejecuciones
   idénticas eran el aviso, y ahora está confirmado el porqué.
3. **Lo único que sigue en pie** es el endpoint `temporadas`, que **lista dos** ✓ — un dato que el backend da
   sobre sí mismo y que no depende del parámetro. Así que **lo más probable sigue siendo que sólo haya dos**,
   pero es **una inferencia, no una comprobación**.

**Lo que haría falta para cerrarlo**: un endpoint que sí filtre por temporada —probablemente el mismo backend
tiene otro recurso—, o navegar el portal con el navegador eligiendo una temporada antigua y **capturar la
petición que hace de verdad**. Eso último es lo que ha funcionado siempre: **mirar lo que pide el navegador**.

**La pista que lo destrabó fue un 404.** El cuerpo del error decía
`{"error":"Backend returned status 404","backendBody":"Cannot GET /competition/competiciones"}` — es decir,
**la ruta intentada y que la API es un proxy a un backend REST**. Y el recurso estaba **en catalán**
(`competicions`, no `competiciones`). Sin leer el error con atención, se habría concluido que el endpoint no
existía.

### El catálogo, validado contra la API: **INTENTO FALLIDO** (08/10/2026)

Se escribió `scripts/compara-catalogo-api.mjs` para verificar el catálogo contra la API. **NO se pudo concluir
nada**, por dos motivos:

**1 · El guion leía mal el catálogo.** Buscaba `t.competiciones` y la estructura del fichero es otra, así que la
columna que debía comparar dio `0` y no comparó nada.

**2 · La API devolvió EXACTAMENTE lo mismo para las dos temporadas:** 257 competiciones las dos veces, con el
desglose idéntico (51/41/2/63/45/39/16). **Eso significa que ignora el `temporadaId`** — comprobado después
pidiendo la 21 y recibiendo filas etiquetadas `CODTEMPORADA: "22"`.

**Conclusión honesta: la comparación sigue sin hacerse.** Y el «92 de 162» que se apuntó al principio **no
demuestra nada**, porque las 51 y las 41 medidas pueden ser todas de la misma temporada.

**La lección, que vale más que el dato**: **dos ejecuciones que devuelven exactamente lo mismo no son una
confirmación, son una sospecha.** Si se hubieran mirado sólo los totales, habría quedado escrito «la API tiene
257 competiciones por temporada» — falso, y con toda la apariencia de un dato.

**Y un detalle que hace perder media hora si no se sabe**: `disciplinaId` es **obligatorio**. Sin él el endpoint
devuelve `[]` — **vacío, no un error**. Una respuesta vacía parece «no hay competiciones» cuando en realidad es
«falta un parámetro».

### Mejora propuesta para el descubridor (no aplicada)

**El descubrimiento de Cataluña no necesita navegador**, con esos tres endpoints:

| paso | ahora | con la API |
|---|---|---|
| Temporadas | desplegable, clics, capa de cookies | **una petición** |
| Disciplinas | desplegable | **una petición** |
| Competiciones | 4 selectores, `qc-cmp-cleanslate`, `wait` de 45 s | **una por temporada × disciplina** (`~16` al año) |

**Más simple, más rápido y no se puede romper por un overlay.** Los dos fallos corregidos abajo siguen siendo
válidos y el descubridor con navegador **funciona y está verificado** — pero esto es menos frágil. **Es una
propuesta para Claude**: reescribir el descubrimiento tiene su prueba, y lo que hay funciona.


---

## 3 · Valencia: 403 con causa identificada (prueba pendiente)

```
Recolección en pausa hasta 2026-10-09T08:14:37Z:
  indice_jornadas|19|900436068|900436071: HTTP 403 en /competiciones/api/filtros/jornadas_fetch.php
```

**Lo descartado, con datos:**

- **No es la frecuencia**: se bajó el ritmo de 4-6 s a **8-12 s** y el 403 sigue. Además, 403 es «prohibido»;
  «demasiadas peticiones» sería 429. Y Madrid va a 4 s sin bloqueos.
- **No es el navegador**: el recolector de Valencia usa `fetch` en HTTP directo, no Selenium.

**La causa probable, con evidencia**: la petición va **desnuda**.

```js
respuesta = await fetch(url, {
  headers: { Accept: 'application/json,...', 'User-Agent': identidad() },
});
```

**Sin `Referer`, sin cookies, sin sesión** — y los endpoints que fallan son **API interna del portal**
(`api/filtros/*.php`). Un `fetch` suelto se distingue de un clic en un segundo, y la respuesta honesta del
servidor es 403.

**Prueba a hacer** (cuando salga de la pausa): añadir `Referer: ${PORTAL}/` y, si hace falta, una sesión
obtenida visitando el portal una vez. **Se verifica con una petición**, no con un despliegue.

---

## 4 · Melilla: el único hueco real, y apunta a la fuente

Su **cola** tiene 10 temporadas; su **catálogo** sólo 5:

```
competiciones-por-temporada.json →  "18" "19" "20" "21" "22"
cola (trabajos)                  →  11 12 13 14 15 (un catalogo_temporada hecho, 0 competiciones)
                                     16 17 18 19 20 21 22 (con trabajo)
```

**El trabajo de catálogo de 2015-16 a 2019-20 está HECHO y trajo cero competiciones.** Es decir: no es que no
se intentara — **el descubrimiento pasó por el portal y no encontró nada**. Y el descubridor **sí** lista
temporadas antiguas en diecinueve federaciones, así que lo más probable es que **la RFMF no publique
2015-2020**, igual que la FCF sólo publica dos.

**Salvedad honesta**: «el descubridor no encontró nada» y «no hay nada» **no son lo mismo** — un descubrimiento
que fallara dejaría el catálogo igual de vacío. Para cerrarlo del todo hay que mirar el portal con un navegador.

---

## 5 · Lo que NO era un problema (y parecía)

| lo que parecía | lo que era |
|---|---|
| Cataluña «parada» con miles de partidos pendientes | **125.244 cancelados son DUPLICADOS**: *«el código de acta ya está en la cola en su jornada: esta fila la copió el defecto de la jornada repetida»*. La web catalana repite jornadas y el recolector descarta la copia. **Su cola tiene 18.474 actas hechas y 1 pendiente.** |
| Canarias, Ceuta, Murcia con temporadas «sin descubrir» | **0 temporadas vacías**. Su portal publica lo que publica. |
| Euskadi incompleta | **13 de 13 temporadas** con competiciones. Lo que le falta son las **tres provinciales** (Bizkaia, Gipuzkoa, Araba), que ya están preparadas. |

---

## 6 · Herramientas que quedan

| herramienta | para qué |
|---|---|
| `scripts/diagnostica-temporadas-vacias.mjs` | **la comprobación buena**: temporadas con 0 competiciones |
| `scripts/servidor/vacias-16.sh` | la misma, en las 16 del servidor |
| `scripts/diagnostica-catalogo.mjs` | la comprobación mala (temporadas vs. `desdeAnio`) — se conserva por si acaso, pero **da falsas alarmas** |
| `scripts/diagnostica-temporada-trabajos.mjs` | qué trabajos tiene una temporada, por tipo y estado |
| `scripts/por-que-cancelados.mjs` | motivos agrupados de los trabajos cancelados |
| `scripts/diagnostica-selector-cataluna.mjs` | qué botones hay, dónde, y **quién los tapa** |
| `scripts/captura-red-cataluna.mjs` | **la red de una página**: de ahí salió la API de la FCF |
| `scripts/prueba-temporada-cataluna.mjs` | ¿responde un `temporadaId` concreto? |
| `scripts/servidor/huecos-son-nuestros.sh` | estado por temporada de las federaciones con huecos |

**Y el método que ha funcionado, por delante de todas ellas**: **capturar la red y leer**. Dos de los tres
hallazgos reales salieron de una petición HTTP, no de un parche.
