# Los contadores de ambigüedad de Euskadi, y por qué 22 nunca fueron 24

Estado: medición del 15 de septiembre de 2026, sobre una copia consistente de la cola de Euskadi
(34.358 partidos, 4.802 jornadas con HTML archivado). Reproducible con
`scripts/_diag-union-ambiguas.mjs`, `scripts/_diag-ambiguas-22-vs-24.mjs`,
`scripts/_diag-importables-euskadi.mjs` y `scripts/_diag-glosario-marcadores.mjs`; volcados en
`pruebas/reconstruccion/informes/`.

## El problema

Se presentaron a la vez dos cifras de «casos ambiguos» de Euskadi como si describieran el mismo
conjunto:

- **22**, las filas ambiguas del manifiesto de simulación;
- **24**, de sumar «13 casos dependientes de `(P)`» y «11 casos de Clase B».

Sumar 13 + 11 = 24 y compararlo con 22 obliga a buscar las dos filas que explican la diferencia. **No
existen**, porque 24 nunca fue un conjunto: es la suma de un delta de un diagnóstico y de un recuento de
marcador de otro.

## Qué mide cada contador

| Contador | Qué cuenta | Universo | Unidad |
|---|---|---|---|
| **Ambiguas del manifiesto** | la fila CAMBIA al releer su HTML y el acta **no sostiene** la pareja nueva | filas de jornadas con HTML archivado | filas |
| **Reparado por los marcadores** | el calendario y el acta no comparten equipo y coinciden al quitar los marcadores de estado | filas con acta leída | filas |
| **Dependiente de `(P)`** | de las anteriores, las que **sólo** coinciden si además se quita `(P)` | filas con acta leída | filas — **es un delta**, no un total |
| **Bloqueo de importación** | la pareja del calendario y la del acta no coinciden ni con los marcadores, así que el lote se detiene | filas con acta leída | filas |
| **(Irabazlea) en 11 casos** | veces que aparece ese marcador pegado a un nombre | literales de calendario | **apariciones de marcador** |

## La medición, antes de resolver `(P)`

```text
filas con acta leída ..................................... 17.286
  calendario y acta comparten equipo (nombre crudo) ...... 17.087
  INCOMPATIBLES ..........................................    199
      reparado por los 4 marcadores ......................    170
      dependiente de (P) .................................     16   ← lo que la documentación llamaba «13»
      bloqueo de importación .............................     13
  ambigüedades del manifiesto ............................     23
      el acta no sostiene la pareja ......................     16
      el acta no permite comprobar la pareja .............      7
  Clase B en Euskadi (la cola no dice lo que dice su HTML)      0
```

## La conclusión, en tres puntos

1. **El «13» es un delta, no un total.** Está escrito en `nova-equipos.ts`: «*13 más si se quitara también
   `(P)`*». Esas filas **ya están dentro** de las ambiguas del manifiesto —la intersección medida es
   exactamente 16— así que sumarlas al total las cuenta dos veces.
2. **El «11» no es un recuento de filas.** Es el número de apariciones del marcador `(Irabazlea)` —está en
   la tabla de `nova-equipos.ts` y en la §«Clase A» de [IMPORTADOR-SQLITE.md](IMPORTADOR-SQLITE.md)— y **no
   es Clase B**. La Clase B de Euskadi mide **cero**: los 75 casos de Clase B que documenta ese informe son
   de Castilla y León (62), Aragón (5), Castilla-La Mancha (3), La Rioja (3) y Ceuta (2).
3. **Por tanto no hay dos filas que expliquen la diferencia**, porque no hubo dos conjuntos. No hay
   deduplicación, ni cambio de universo que explique un resto de dos: la suma nunca describió un conjunto.
4. **22 tampoco era una cifra estable**: era el valor del manifiesto a las 12:28; la cola creció de 33.077
   a 34.358 filas y pasó a 23. Cualquier cifra publicada tiene que ir con su instantánea.

## `(P)` no era una incógnita: lo dice la fuente

El encargo pedía no resolver `(P)` por intuición «hasta encontrar evidencia independiente». Esa evidencia
existe y la publica la propia fuente. La maqueta nova envuelve cada marcador de estado en un `<span>`, y
el de `(P)` lleva un `title` que lo define:

```html
<h4> ARRUPE CHAMINADE C.D.
  <span title="Ganador del partido en Penaltis" style="font-size:12px;font-weight:bolder;color:green;"> (P) </span>
  <span style="font-size:9px;font-weight:bolder;color:green;"> (Sailkatua) </span>
</h4>
```

Medido con `scripts/_diag-glosario-marcadores.mjs` sobre 110 jornadas archivadas (548 celdas de nombre):

| token | qué dice el `title` de la fuente | apariciones |
|---|---|---|
| `(P)` | **«Ganador del partido en Penaltis»** | **35 de 35, sin excepción** |
| `(Sailkatua)` | (sin `title`; ya estaba en la lista) | 197 |
| `(Irabazlea)` | (sin `title`; ya estaba en la lista) | 12 |
| `(Juv.)`, `(RET)`, `(3)`, `(1)` | **texto suelto dentro del `<h4>`, sin `<span>` ni estilo** | 8, 6, 2, 2 |

Y `scripts/_diag-parentesis-por-federacion.mjs` comprueba que `(P)` **sólo aparece en Euskadi**: 35 filas,
0 en las otras diecisiete colas.

Dos cautelas que se comprobaron y **no** salieron a favor, y por eso se dicen:

- la concordancia con el marcador es **débil**: de las 35 filas con `(P)` sólo 10 tienen marcador
  publicado y 6 son empates (60 %, frente al 41 % del resto de la cola). La justificación no es ésa: es el
  `title`;
- **el desempate no está en ninguna columna de la cola**, y la acta tampoco lo trae (0 de 29 actas con `(P)`
  lo mencionan). Quitar `(P)` limpia el nombre, pero el hecho deportivo sólo queda en el HTML archivado
  —que es la evidencia y no se toca—, en `core.team_alias.literal`, y en los `marcadores` que el manifiesto
  guarda por cada corrección. Llevarlo al canónico como estado del partido exige una columna en la cola:
  queda como tarea pendiente declarada.

## La medición, DESPUÉS de separar `(P)`

```text
INCOMPATIBLES ..........................................    199
    reparado por los marcadores (incluido (P)) ..........    199   ← los 199, ninguno queda fuera
  ambigüedades del manifiesto ............................     10
      el acta no sostiene la pareja ......................      0
      el acta no permite comprobar la pareja .............     10   ← no hay acta con la que comprobar
  bloqueos de importación ................................      0   ← eran 16 grupos y 29 filas
  grupos de Euskadi importables .......................... 875 de 875
```

Manifiesto con el cambio: **199 correcciones en 80 jornadas**, `(Sailkatua)` 188 · `(Irabazlea)` 11 ·
`(P)` 29; y 10 ambiguas, todas porque **no hay acta** con la que comprobar la pareja, no porque la
contradiga.

**Y las dos piezas del 24 eran la MISMA causa.** Los 16 casos con `(P)` al final y los 13 con `(P)` al
principio eran 29 filas del mismo marcador desconocido: al entrar `(P)` en la lista, la primera forma se
resuelve —quitar `(Sailkatua)` deja `(P)` al descubierto y una segunda pasada lo quita— y la segunda
también, porque el bucle ya no se detiene ante un paréntesis que no reconoce. De ahí que las 13 filas que
«no coincidían ni quitando `(P)`» pasaran a coincidir: no eran otra causa, eran la misma en otra posición.

### Corrección posterior: las correcciones son **194**, no 199

Esa medición se hizo sin comprobar una cosa que ahora sí se comprueba, y la cifra que se publica es la
corregida: **194 correcciones en 79 jornadas**, `(Sailkatua)` 183 · `(Irabazlea)` 11 · `(P)` 29.

El HTML archivado lo reescribe el worker **en el sitio** cada vez que vuelve a comprobar una jornada, y la
cola sobre la que se reconstruye es una **foto**. Si el worker ha vuelto a comprobar una jornada después
de esa foto, la reconstrucción estaría comparando filas de una lectura contra el HTML de otra: las
diferencias que encontraría no serían defectos del extractor, serían **desfase de evidencia**. La cola
guarda el sha256 del contenido que leyó (`jornadas.hash`), así que la comprobación es directa, y desde el
contrato 4 una jornada así **queda fuera del lote y se declara** —con las dos huellas— en vez de
compararse en silencio.

Medido sobre la copia de Euskadi, y cuadra al fila: **11 jornadas** (de 4.802) tenían el HTML cambiado,
**89 filas** que antes se comparaban ya no se comparan, y de ahí salían **5 de las 199 «correcciones», en
1 jornada** (`t22 c24675380 g24675438 J3`, precisamente la que el worker reescribió a las 09:15:51 de hoy).
Ninguna de las 539 fantasma retiradas estaba en esas 11 jornadas: la retirada no queda afectada.

La partición, con la resta declarada en vez de escondida:

```text
idénticas 33.526 + correcciones 194 + ambiguas 10 + fantasma 539 = 34.269
+ 89 filas no comparables (evidencia desfasada) ............... = 34.358  = filas de la cola
```

Una consecuencia práctica: **cualquier cifra medida sobre una copia caduca en cuanto los workers vuelven
a comprobar una jornada**, así que la copia se renueva antes de publicar números, no después.

## Cómo se impide que vuelva a pasar

`compruebaCoherencia` exige que **todo contador publicado se pueda derivar del manifiesto**:

- `filas = idénticas + correcciones + ambiguas + fantasma + no comparables`, jornada a jornada (las
  fantasma y las no comparables se declaran aparte, no se reparten entre las otras tres);
- el desglose de las ambiguas por motivo suma exactamente el total;
- los motivos están en un **vocabulario cerrado**, así que no se pueden sumar motivos de diagnósticos
  distintos sin que la comprobación lo vea;
- `compruebaCifraAmbigua` rechaza publicar cualquier cifra que no sea la del manifiesto, y explica qué es
  cada contador de los que se intentan sumar.

Está probado en `packages/ingesta/test/reconstruccion-cola/manifiesto.test.ts`, con el caso concreto: un
manifiesto de 22 ambiguas y un intento de publicar 24.

## ¿Hace falta aplicar la reconstrucción para importar Euskadi? No

Medido, no razonado. `scripts/_diag-equivalencia-canonica.mjs` importa un grupo desde la copia **tal y como
está**, calcula la huella de todo lo que el canónico publica de él —inscripciones, partidos, apariciones,
eventos y clasificación reconstruida—, revierte, **aplica** la reconstrucción, vuelve a importar y compara:

```text
grupo 22610202 · 15 partidos, 4 jornadas, SIN reconstruir → huella 435a520376f0e63775240eef
grupo 22610202 · 15 partidos, 4 jornadas, RECONSTRUIDA    → huella 435a520376f0e63775240eef   ✓ idénticas
grupo 24038325 ·  3 partidos, clasificación de 4 filas, SIN reconstruir → huella 0b48221c75f77be70712d373
grupo 24038325 ·  3 partidos, clasificación de 4 filas, RECONSTRUIDA    → huella 0b48221c75f77be70712d373   ✓ idénticas
```

Y la razón está en el propio manifiesto: de las correcciones, **ninguna recupera un código federativo**. El
único efecto de la reconstrucción sobre esta cola es quitar los marcadores de estado del nombre, y eso el
importador ya lo hace por su cuenta —en la inscripción y en la reconciliación del acta—, así que el canónico
publica exactamente lo mismo con la cola limpia y sin limpiar.

Dos consecuencias:

1. **La aplicación real sobre la cola es opcional**, no un requisito para desbloquear Euskadi. Es una
   limpieza de la evidencia de ingesta, útil para que cualquier otro consumidor de la cola la lea sin los
   marcadores, pero no cambia lo que se publica.
2. **El importador tiene que ser correcto con la cola contaminada**, porque la reconstrucción es una
   operación aparte con su manifiesto y su ventana. Importando el grupo 24038325 sin reconstruir apareció un
   defecto real que la reconstrucción tapaba:

   ```text
   upsertMasivo en core.standing_snapshot (phase_group_id, matchday_id, team_entry_id, origen),
   tanda de 4: ON CONFLICT DO UPDATE command cannot affect row a second time
   ```

   `calculaClasificacion` agrupa equipos por nombre, y en Euskadi el mismo equipo aparece con el marcador en
   unas jornadas y sin él en otras: la tabla lo partía en dos filas que apuntaban a la misma inscripción.
   Corregido en `clasificacion.ts` agrupando por la **inscripción efectiva** y no por el literal de la cola,
   con prueba de regresión que falla sin el arreglo
   (`packages/canonico/test/inscripcion-sin-codigo.test.ts`).

Barrido de comprobación, en seco y sobre la copia sin reconstruir: **40/40** grupos con marcador de estado
—incluidos los 16 que antes se detenían— y **8/8** grupos de temporada completa de 380 partidos importan sin
una sola pega (`scripts/_diag-barrido-importacion.mjs`).

## Lo que queda pendiente, y no es lo mismo

- **10 filas ambiguas**: no es que el acta contradiga al calendario, es que **no hay acta** con la que
  comprobar la pareja. Se quedan fuera del lote y no detienen la importación de su grupo.
- **Los desempates por penaltis** no están en ninguna columna de la cola (ver arriba).
- **La Clase B de las PNFG** sigue sin adaptador: su sitio es el extractor del HTML, no la reconciliación.
