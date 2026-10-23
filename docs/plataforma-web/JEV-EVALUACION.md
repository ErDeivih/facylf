# Jev (TypeSafe AI): veredicto, evidencia y criterio previo

Estado: criterio registrado **antes** de ejecutar, 23 de septiembre de 2026. **No se ha hecho ni una
llamada al modelo**: no hay clave. Este documento existe para que la decisión no dependa de recordar
una conversación. Cuando llegue la clave se ejecuta §5 y se añade el resultado; el criterio y la
muestra están fijados aquí y **no se renegocian después de ver los números**.

Nada de esto toca las SQLite, el canónico, `apps/web` ni las migraciones. Es un documento de
decisión y de protocolo.

## 1. Qué es, y de dónde sale cada dato

`Jev` es un modelo de decisión, no de generación: no produce texto libre, produce una etiqueta de un
esquema cerrado con una probabilidad. `System One` es la categoría de producto de TypeSafe AI, no
una taxonomía científica. TypeSafe AI salió de stealth en septiembre de 2026 con una semilla de 40 M
de dólares.

Procedencia de lo que sigue, porque aquí no vale mezclar:

- **(P) fuente primaria**: leído en `docs.typesafe.ai` y en el blog de TypeSafe por el operador del
  proyecto el 23-sep-2026.
- **(T) terceros**: documentación de integradores y prensa. Corrobora, no acredita.
- **(?) sin verificar**: aparece en resultados de búsqueda y no se ha leído. **No se usa para
  decidir.**

| Dato | Valor | Procedencia |
|---|---|---|
| Endpoint | `POST https://api.typesafe.ai/v1/systemone` | (P) |
| Modelo | `jev-latest` → `jev-1.13.0`, alias móvil | (P) |
| Primitivas | `Choice` (1 de hasta 255 opciones + probabilidades), `Score` (2–10 niveles ordenados), `Noul` (sí/no como probabilidad 0–1) | (P) |
| Precio | `$0,042` por millón de tokens de entrada; salida gratis | (P) |
| Límites | 250.000 tok/s · 1.200 rpm · 64k por petición, 32k para `state` más la pregunta más larga | (P) |
| Entrada | sólo texto (string, JSON o array). No imágenes | (P)(T) |
| Acceso | público desde el 20-sep; **sin lista de espera**; `$5` de crédito por cuenta | (P) |
| Crédito | `$5 ≈ 119 M tokens`; cuadra con `5 ÷ 0,042 = 119,05`, lo que confirma el precio por una vía independiente | (P) |
| Datos | DPA disponible, no entrenan con el contenido del cliente; ZDR sólo en enterprise | (?) |

El precio aparece también como `$42` en la misma fuente; **la unidad de esa cifra no está
confirmada** y no se usa en ningún cálculo de este documento.

## 2. Veredicto: dónde no entra

**En el camino del importador, no.** Y la razón principal ya no es una prohibición del encargo, sino
que el contrato es insatisfacible:

1. **Idempotencia.** El encargo exige, como prueba obligatoria 1, que «de cero, dos veces seguidas y
   por mitades» se produzca el mismo estado canónico. La reproducibilidad de un servicio remoto no
   es demostrable por lectura de contrato, y Jev **no expone perillas de muestreo** —`temperature` y
   `top_p` se ignoran—, así que tampoco puede forzarse. Un componente cuya determinación no se puede
   probar ni forzar no entra en un contrato que exige tres ejecuciones idénticas. **Esto no depende
   de que exista una medición de no-determinismo**: basta con que no sea demostrable. La carga de la
   prueba recae en el que quiere meterlo, no en el que lo rechaza.
2. **La confianza no ordena el acierto.** Medición de terceros (`jevnav`): decisiones correctas con
   probabilidad en `0,41–0,99` y erróneas en `0,39–0,47`. **Solapadas.** Es un descalificador
   *independiente* del anterior: aunque Jev fuese perfectamente determinista, no habría umbral que
   separe acierto de fallo, y toda la promesa de la prima `Choice`/`Noul` es precisamente el umbral.
3. **El `state` no se trata como hostil.** Todo el estado de este proyecto sería HTML y JSON de
   federaciones, es decir, texto de terceros que no controlamos. La mitigación no puede delegarse al
   modelo: detectar una inyección cuando se le pregunta como `Noul` y ser movido por ella no se
   contradicen, y hay mediciones compatibles con ambas cosas a la vez.
4. **El sesgo de posición.** En las primitivas ordenadas, la posición de la opción mueve la
   respuesta, hasta el punto de que existe un proyecto entero dedicado a la invariancia por
   permutación. Sobre 17 opciones ordenadas esto produce el fallo peligroso: **etiqueta válida,
   confiada y equivocada**, que pasa la validación de forma y por tanto no se detecta.

A esto se suma lo que ya decía el encargo y no cambia: §7.2 (un valor fuera del vocabulario detiene
el lote; no existe el destino `otro`), §7.6 («un nombre igual no une a dos personas; este importador
no fusiona nada»), §11 («inventar un dato que la fuente no publica», «fusionar personas») y
`ENCARGO-IMPORTADOR.md:59` («este importador **no** crea `identity_candidate`»).

Tampoco entra en: pareja calendario↔acta (ya es determinista y demostrable; un modelo aquí sería una
regresión), unir personas entre temporadas, y cuadres, marcadores, clasificación, fechas ni
aritmética — para lo que la propia documentación de Jev dice que se quede en el código, que es lo
que ya se hace.

## 3. Dónde sí, por orden de valor real

1. **Reranking de `analytics.search_entity`** (siguiente encargo, según `ENCARGO-IMPORTADOR.md:56`).
   Es un problema de `Score`, bajo riesgo funcional y con evidencia a favor: sobre BEIR SciFact,
   `MRR 0,622 → 0,843` y `Hit@1 50% → 78,3%`. **Cautela que cambia el diseño:** BM25 es un rival
   flojo y un cross-encoder corriente obtiene ganancias del mismo orden, así que esos números **no
   aíslan a Jev**. Si se evalúa, el comparador tiene que ser un reranker normal, no BM25. Y sigue
   aplicando el sesgo de posición. **No se toca ahora.**
2. **Capa de asesoramiento**, si algún día se construye: escribe informes, nunca columnas canónicas.
   Con una condición no negociable: la salida de un componente no determinista se archiva
   **verbatim, con versión del modelo y orden exacto de las opciones**, como fuente. Nunca como una
   función que se pueda volver a derivar.
3. **Nada más.** El valor diferencial real de Jev frente a un LLM corriente es latencia y coste, y
   ninguno de los dos decide nada en este proyecto. El argumento del tipado queda retirado: con
   `json_schema` en modo estricto los LLM tampoco violan el esquema, así que «cero alucinaciones» no
   es un diferencial. Era garantía de **forma**, nunca de verdad.

## 4. Evidencia disponible, con su fuerza

| Medición | Resultado | Fuerza |
|---|---|---|
| Evaluación propia de TypeSafe, cuatro flujos | Jev 67,8% | La columna mide **acuerdo con modelos de referencia** (media de GPT-6 Astra y Fable 5.1), **no acierto contra verdad humana**. Sol 74,1%, Opus 5 73,1% |
| El mismo informe, flujo de facturas oficial | **Jev 61,8% vs Terra 74,7%** | 12,9 puntos por debajo. El promedio publicado esconde el único flujo donde pierde con claridad. **Es el dato más relevante de todo el expediente** |
| 791 decisiones frente a cuatro LLM | gana en latencia y coste; empata con los pequeños; 5–6 puntos por detrás de Terra en dos tareas de intención | terceros |
| Calibración, 108 afirmaciones en seis dominios | 96,3% de acierto, Brier 0,0331, ECE 0,0660 | terceros, 18-sep. **`n=108` es indicativo, no establecido**: el error estándar es amplio y el Brier está dominado por el acierto cuando el modelo es confiado y acierta, así que dice poco de la región difícil — que es donde vivirían los umbrales |
| `jevnav`, confianza frente a acierto | correctas `0,41–0,99`, erróneas `0,39–0,47` | terceros. Ver §2.2 |
| 22.500 llamadas, muestras maliciosas | **16,6% por debajo de 0,1** | terceros. La puntuación baja **no** es un cubo seguro |
| InjecAgent, detección como `Noul` | P/R 100%, 0% falsos positivos con umbral 0,10 | terceros. Ver el matiz de §2.3 |
| `jev-scout`, misma entrada | **28% y luego 88%** sólo por comparar bandas frente al score continuo | terceros. **Trampa de rasero: la semántica de la decisión tiene que fijarse antes de medir**, y es la razón del control de §5.4 |

## 5. Criterio previo del spike

**Disparador:** existe clave y un ejecutor con HTTPS saliente. Aviso práctico: la shell de este
proyecto **no tiene red saliente** (se comprobó: falla igual un host cualquiera que
`docs.typesafe.ai`), así que quien ejecute necesita una vía con salida a Internet. No basta con la
clave.

**Pregunta:** ¿es admisible un componente no determinista en un contrato que exige repetibilidad?
No es «¿acierta?». El acierto sobre los 130 literales se recoge como subproducto, no como pregunta:
la tabla de `IMPORTADOR-SQLITE.md:150` ya resuelve esas filas de forma determinista y medida, así
que medir acierto ahí gasta un céntimo en una pregunta que no cambia ninguna decisión.

**Muestra.** Literales de rol de `IMPORTADOR-SQLITE.md`. Sin datos personales: son etiquetas de rol y
los 17 nombres canónicos, así que ninguna puerta de privacidad lo bloquea y el ADR 0012 no hace
falta para esto — sólo para cualquier uso posterior con datos reales.

- **Brazo A, aleatorio**: 30 literales de los 130, cubriendo las cinco lenguas. Da la **tasa**.
- **Brazo B, adversarial**: los tres literales que ya rompieron dos versiones de la propia regla
  (`ENTRENADOR PORTEROS`, `ENTRENADOR AUXILIAR`, `AYUDANTE TECNICO SANITARIO`) más los cortos y
  ambiguos (`2º`, `AU`, `M`, `epr`). Los giros se concentran donde el modelo está casi indiferente,
  así que muestrear sólo al azar puede dar un «pasa» falso. Los dos brazos juntos cierran también la
  objeción contraria, la de haber elegido los casos difíciles a propósito.

**Fases, en este orden y con salida temprana.**

1. **Repetibilidad.** El mismo `state`, 5 veces, en los 30 del brazo A. La decisión —el `argmax` de
   `probabilities`, que es lo único que se escribiría— debe ser idéntica 5/5.
2. **Invariancia por permutación.** **Sólo si la fase 1 sale limpia.** Con la fase 1 sucia la fase 2
   queda confundida: no distinguiría no-determinismo de sesgo de posición. 8 permutaciones
   aleatorias de las 17 opciones por literal, con el orden exacto registrado. Idéntica 8/8.

**Métrica.** Hay que separar dos estabilidades, y sin separarlas la prueba no tiene umbral:

- **de la decisión**: el `argmax`. Es lo que exige el contrato;
- **de la distribución**: cuánto se mueve la masa, que es el indicador temprano de que la primera va
  a caer. Se mide con distancia de variación total entre vectores de probabilidad, más el delta de
  la probabilidad de la opción superior, por literal. El desempate del `argmax` se fija por escrito
  antes de la primera llamada.

**Criterio, escrito antes de gastar:** **un solo giro en cualquiera de las dos fases ⇒ no admisible**,
y el asunto se cierra con evidencia propia. Se reporta además la **tasa observada**, porque el
criterio absoluto deja un «no» sin magnitud y esa es la única pregunta que quedaría viva si alguien
relajase el contrato más adelante.

**Control obligatorio de fontanería.** Antes de interpretar nada, 3 literales de respuesta conocida
para comprobar que el mapeo `Choice` → rol sobrevive a la permutación. El caso `jev-scout` (28% →
88% sobre los mismos datos) demuestra que un arnés puede mover 60 puntos: sin este control, un
«giro» puede ser nuestro propio índice leyendo la opción equivocada.

**Cota superior.** El `state` de la prueba es un literal suelto, el mínimo posible. La propia
documentación dice que la precisión empeora cuanto más `state` irrelevante se añade, así que un
«pasa» aquí **no** es un «pasa» en uso real con contexto de federación y partido. Tiene que decirlo
el informe.

**Coste.** ~390 llamadas ≈ 150.000 tokens ≈ `$0,007`, menos de un céntimo. Cabe en el crédito de `$5`
por un factor de unos 700. El coste no decide nada aquí, ni en el spike ni en ningún escenario del
proyecto: todo el corpus de roles con estado completo queda por debajo de los 50 dólares.

**No ejecutar la fase 2 si la fase 1 gira** ahorra la mitad del gasto y, más importante, evita una
conclusión confundida.

## 6. Operación

- **Fijar `jev-1.13.0`, nunca `jev-latest`**: un alias que se mueve cambia la calibración sin que se
  toque nada.
- **No por gateway.** El propio foro de Vercel reporta (issue #21213) que AI Gateway descarta la
  versión resuelta: `modelId` devuelve el alias, 69 hojas recorridas sin versión y los identificadores
  versionados dan 404. Cloudflare sí expone `"model": "jev-1.13.0"`. Si la trazabilidad de versión
  importa —y para archivar verbatim importa— va directo contra la API o por un proveedor que publique
  la versión.
- **La API malinterpreta formas de petición en silencio.** Hay linters publicados para eso. Una API
  que lee mal una petición sin avisar encaja mal con un proyecto cuyo principio es que un valor raro
  **detiene el lote**; si algún día se usa, la petición se valida antes de enviarla.
- Ecosistema: hay mucho revendedor y mucha granja de contenido alrededor. Los canales oficiales son
  `typesafe.ai`, `docs.typesafe.ai` y `console.typesafe.ai`.

## 7. Privacidad

Aplican los invariantes del proyecto y `SEGURIDAD-OPERACION.md`. El spike de §5 **no usa datos
personales** y no necesita decisión de privacidad. Cualquier uso posterior con contenido real de
menores —nombres, actas, fichas— exige ADR propio (sería el **0012**, los ADR llegan hoy a 0011) y
una revisión explícita de `SEGURIDAD-OPERACION.md` antes de la primera llamada. El gasto no es el
obstáculo en ningún escenario: 1,8 millones de filas de rol con estado completo quedan por debajo de
los 50 dólares.

## 8. Lo que no está verificado

Se deja anotado para que nadie lo dé por bueno por haberlo leído aquí:

- Los `732` casos repetidos tres veces, el análisis de VentureBeat sobre inyección de prompt, el
  repositorio de invariancia por permutación y la prueba de 39 noticias en español: **aparecen en
  resultados de búsqueda y no se han leído**. Falta de verificación no es refutación, y el veredicto
  de §2.1 no depende de ellos.
- DPA/no-entrenamiento y ZDR: no confirmados en esta revisión.
- Los «193x» y «444x» de velocidad y coste son cifras de la propia empresa, del extremo alto.
- La columna de acuerdo de la evaluación de cuatro flujos sólo se ha leído para los flujos citados
  en §4; no se ha reconstruido el promedio.

## 9. Referencias

Fuentes primarias del fabricante: `docs.typesafe.ai/models`, `docs.typesafe.ai/introduction` y
`console.typesafe.ai`. Documentación de integradores usada sólo como corroboración: las páginas de
`typesafe/jev-1.13` en OpenRouter, AI/ML API y LiteLLM.

Internas: [IMPORTADOR-SQLITE.md](IMPORTADOR-SQLITE.md) §7 y §11 de
[ENCARGO-IMPORTADOR.md](ENCARGO-IMPORTADOR.md), [RENDIMIENTO-BUSQUEDA.md](RENDIMIENTO-BUSQUEDA.md) y
[MODELO-DATOS.md](MODELO-DATOS.md) para `analytics.search_entity`.

## 10. La alternativa abierta: Laya (evaluada el 24-sep-2026)

**Sale del mismo cajón que Jev y con las mismas tres primitivas, pero es de peso abierto y se ejecuta
en casa.** Esto cambia dos cosas y no cambia una, y conviene tenerlas separadas.

`convaiinnovations/laya` es un modelo **de decisión no autorregresivo**, no un generador: un encoder
**ModernBERT** que hace **una sola pasada** y devuelve respuestas tipadas con probabilidades. No genera
texto, así que no hay nada que parsear. Licencia **Apache-2.0**, con etiqueta explícita de uso
comercial, publicado el 18-sep-2026. Y lo que lo hace directamente relevante aquí: **`laya-serve`
expone el mismo `POST /v1/systemone` que TypeSafe Jev**, así que el spike ya pre-registrado en §5 vale
tal cual cambiando la URL base.

| Checkpoint | Backbone | Parámetros | Contexto | Para qué |
|---|---|---|---|---|
| `laya` | ModernBERT-large | 421 M (803,6 MB en disco) | 512 | inglés |
| `laya-multilingual` | mmBERT-base | 322 M (614 MB) | 1024, hasta 8192 | 100+ idiomas, ~2,2× más rápido |
| `laya-typed-decisions` | ModernBERT-large | 421 M | 1024 | los cuatro flujos con los que se afinó (0,766 de acierto) |

Comprobado por mí, no leído en un resumen: el paquete `laya` 0.3.20 está en PyPI publicado por «Convai
Innovations», la misma organización del repositorio de Hugging Face; los tamaños de los `.safetensors`
cuadran con los parámetros declarados a bf16 (421 M × 2 B ≈ 803 MB, 322 M × 2 B ≈ 614 MB), así que el
modelo es real y del tamaño que dice. Y **esta máquina puede ejecutarlo**: Python 3.12, una GTX 1660
SUPER de 6 GB, 12 núcleos y 32 GB de RAM. En CPU el propio fabricante mide 193–464 ms por decisión;
en GPU, 33–40 ms.

### Lo que cambia: el permiso deja de ser el obstáculo

1. **No hace falta clave, ni lista de espera, ni tarjeta.** El bloqueo que tenía parado el spike
   desaparece: se descarga y se ejecuta.
2. **No hay coste por token.** Gratis después de la descarga.
3. **Y lo importante para este proyecto: no sale nada de la máquina.** Ningún documento federativo,
   ninguna acta, ningún nombre de menor viaja a un tercero. El problema de privacidad que en Jev
   exigía DPA, ZDR y una decisión explícita **desaparece para la fase experimental**: no hay
   encargado de tratamiento porque no hay tercero. Es una ventaja de categoría, no de grado.
4. **Es un encoder, no un generador.** No hay muestreo que forzar ni `temperature` que ignorar: la
   determinación es al menos *plausible*, cosa que con Jev no lo era.

### Lo que no cambia: el veredicto del importador

Sigue sin entrar, y por una razón que no depende del modelo: **la salida de un modelo es una
inferencia, no un dato de la fuente**. §7.2 exige que un valor fuera del vocabulario detenga el lote y
que no exista el destino `otro`; §7.6 y §11 prohíben fusionar personas e inventar un dato que la fuente
no publica. Que el componente sea determinista y reproducible no convierte una interpretación en un
hecho archivado. Y §9.1 sigue exigiendo tres ejecuciones idénticas: **la reproducibilidad de este
modelo tampoco es demostrable por lectura**, porque su configuración declara
`deterministic_flash_attn: false` y su propia nota de versión cuenta que hubo que arreglar colisiones de
búfer entre llamadas concurrentes en la ruta rápida de CUDA. Se mide, no se supone.

### Los números del fabricante que juegan en contra

Están en su propio modelo card, no en un blog de terceros:

| Dato | Valor | Qué significa aquí |
|---|---|---|
| Decisión tipada **cero-shot**, 4 opciones | **0,362** de acierto | apenas por encima del 0,25 del azar. El 0,766 lo alcanza **después de afinar** con 2.000 decisiones del dominio |
| Calibración general **cero-shot** | ECE **0,204** (frente a 0,030 dentro de tarea) | fuera de su dominio, las probabilidades no son de fiar |
| Idiomas utilizables (>3× azar) | 45 de 51 | media agregada; **no publica castellano, catalán, euskera ni gallego por separado** |
| Acierto en 13 idiomas no ingleses (MASSIVE) | 0,451 | muy por debajo del 0,783 en inglés |

Y una frase suya que hay que leer dos veces, porque es exactamente la tesis que sostiene toda idea de
umbral: *«el checkpoint inglés se hunde con escrituras no latinas (el jemer da 0,000 de acierto con
0,952 de confianza). Como el modelo sigue confiado mientras se equivoca, **la puerta por confianza no
puede salvarte**»*. La dice el propio fabricante, en su README.

A eso se añade lo que ya estaba medido por terceros en japonés sobre esta misma familia de modelos:
con 300 casos, en el juicio de urgencia **la opción en primer lugar no se eligió ni una sola vez** —
**sesgo de posición sobre la primitiva `score`**, que es justo la que propondríamos para el reranking.

### El test que hay que añadir al pre-registro

Además de las fases A (repetibilidad) y B (invariancia por permutación) de §5, que valen tal cual,
Laya obliga a añadir una tercera prueba que en Jev no existía:

**Enrutado por idioma.** El `Router` elige checkpoint **por escritura**, y su motivo declarado es
«escritura no latina». El castellano, el catalán, el gallego y el euskera **son escritura latina**. Es
decir: hay un modo de fallo predecible en el que nuestras cinco lenguas se envían al checkpoint
**inglés** —el que se hunde fuera del inglés— en lugar de al multilingüe. Se prueba con el enrutado
automático y con el forzado (`lang=` / `lang_guess=`), y se compara. Si el automático manda euskera al
inglés, el resultado no mide el modelo: mide el enrutador, y hay que decirlo así.

**Recomendación.** El spike deja de tener excusa: no cuesta dinero, no pide permiso a nadie, no saca un
solo dato de la máquina y mide lo mismo que se iba a medir contra Jev, con las mismas tres fases más el
enrutado. Se ejecuta con el criterio de §5 **sin tocarlo**. Lo que no debe pasar es que el tener modelo
local sustituya al criterio: el 0,362 cero-shot y la frase del fabricante sobre la confianza son la
advertencia, y siguen en pie.

## 11. RESULTADO DEL SPIKE: no admisible. La pregunta queda cerrada (24-sep-2026)

Ejecutado con `convaiinnovations/laya` en local (Apache-2.0, `laya` 0.3.20, torch 2.14 CPU, CPU
únicamente porque `pip` instaló la compilación sin CUDA), contra el **canónico real**: los **73
literales distintos** de `core.match_staff` con sus frecuencias, de los cuales **71 tienen verdad de
referencia** según las reglas de `packages/canonico/src/resolucion/roles.ts`, portadas a Python para
esta prueba. La verdad de referencia la pone el código que ya funciona, no un juicio.

Coste: **0 €**. Tiempo: una tarde. Ni una clave, ni un dato fuera de la máquina. Artefactos en
`F:\EspacioCodigo\laya-spike\` (`spike.py`, `resultado.json`, `evidencia.jsonl` con cada petición y
respuesta verbatim).

### Control de fontanería: superado, 3/3

Antes de interpretar nada, tres literales de respuesta conocida comprueban que el mapeo
opción→etiqueta sobrevive a la permutación. Los tres aciertan en orden base **y** en orden permutado.
**El resultado de abajo no es un fallo de nuestro arnés**; era la condición para poder interpretarlo.

### Fase A — repetibilidad: **30/30 estables, tasa de giro 0,0 %**

El mismo `state` cinco veces da la **misma decisión** en los treinta literales, con probabilidades
idénticas o casi. **Esto es lo contrario de lo que yo esperaba y hay que decirlo**: no es
no-determinista. Un encoder no autorregresivo, sin muestreo, en CPU, repite. La objeción de §2.1
—«la reproducibilidad no es demostrable por lectura»— **queda resuelta a su favor en esta máquina**.

### Fase B — invariancia por permutación: **4 de 40 invariantes. Tasa de giro 90,0 %**

Y aquí se cae todo. Con **8 permutaciones aleatorias de las 17 opciones canónicas**, **36 de 40
literales cambian de respuesta**. No es un sesgo leve: la distancia de variación total entre las
distribuciones llega a **0,98**, es decir, la masa se muda entera de una etiqueta a otra.

| Literal | Respuestas distintas según el orden | TV máx. |
|---|---|---|
| `Entrenador` (9.980 filas) | entrenador · entrenador auxiliar · entrenador en practicas | 0,783 |
| `2ºEntrenador` (5.690) | segundo entrenador · delegado · entrenador | 0,979 |
| `Zelaiko Delegatua` | delegado de campo · delegado | 0,976 |
| `DELEGAT CAMP` (4.807) | delegado de campo · delegado | 0,950 |
| `entrenador-auxiliar` | delegado · entrenador auxiliar · entrenador en practicas · entrenador | 0,948 |
| `AUXILIAR` | entrenador auxiliar · auxiliar · entrenador | 0,927 |
| `ENCARGADO MATERIAL` | encargado de material · entrenador | 0,914 |
| `ALTRES` (el opaco) | cinco etiquetas distintas | 0,697 |

Sólo cuatro aguantan, y son los que ya venían con confianza alta y acierto: `Médico` (TV 0,066),
`Encargado Material` (0,607), `ENCARREGAT MATERIAL` (0,506) y `AYUDANTE TECNICO SANITARIO` (0,107).

**Consecuencia, y es la frase que cierra el asunto:** la respuesta es una función del **orden de la
lista de opciones**, no del literal. Con el orden congelado se obtiene una decisión determinista —la
fase A lo demuestra— pero deja de significar nada, porque lo que la determina es nuestra lista, no lo
que escribió la federación. **Se puede tener una respuesta reproducible o una respuesta con sentido;
las dos a la vez, no.** Y el rótulo «cero alucinaciones» no cubre esto: la etiqueta siempre es válida.

### Fase R — enrutado por idioma: confirmado el fallo previsto

Los **seis** textos —castellano, catalán, euskera y gallego— se enviaron al checkpoint **`english`**,
con el motivo escrito por el propio enrutador: *«Latin script, language not identified and no
non-English letters; using default (english)»*. El euskera se marca como `is_english: true`.

Forzar el multilingüe **cambia respuestas en las dos direcciones**: `2ºEntrenatzailea` pasa de
`entrenador` (mal) a `segundo entrenador` (bien), y `DELEGAT CAMP` pasa de `delegado de campo` (bien)
a `delegado` (mal). O sea: ni el automático ni el forzado son de fiar, y el idioma es una variable
más que mueve la respuesta.

### Lo que ya dijeron sus propias tripas

- Al cargar, la librería avisa: *«this checkpoint ships invalid temperatures or values outside
  [0.5, 5]; using choice:11+ … **Treat confidence from the affected entries as uncalibrated**»*. La
  primitiva `choice` —la nuestra— llega **sin calibrar**, y lo dice el código, no un blog.
- La latencia real en CPU es de **718–824 ms** por llamada, no los 193–464 ms que anuncia el
  fabricante.

### Veredicto

**No admisible.** Un solo giro bastaba y hubo **36 en 40**. Con el criterio de §5 fijado de antemano
y sin tocarlo después de ver los números:

- **El importador no lo usa**, y ahora por una razón mejor que la prohibición del encargo: no porque
  sea impredecible, sino porque **su salida no depende de la fuente**. §7.2 prohíbe la sustitución
  silenciosa; esto sería la sustitución manifiesta, decidida por el orden de una lista nuestra.
- **El reranking de `analytics.search_entity` con `Score` queda descartado**, y con más motivo: es la
  primitiva sobre la que ya había 0 elecciones de la primera opción en 300 casos medidos en japonés.
- **La capa de asesoramiento con umbral queda descartada**: no hay confianza calibrada (`choice` sin
  calibrar) ni estabilidad por orden.

**Y la pregunta se cierra para Jev y para Laya a la vez**, porque el criterio y la forma de la
petición eran los mismos. Esto es exactamente lo que el spike pretendía: cerrar la pregunta con
evidencia propia en vez de con un post de lanzamiento, y por lo que costaba —una tarde y cero euros—
merecía la pena hacerlo aunque el resultado sea un no.
