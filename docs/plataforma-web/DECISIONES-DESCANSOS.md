# Decisiones pendientes: filas de descanso

Escrito el 17/09/2026 para que las decisiones se puedan tomar **sin leer código**. Cada apartado dice: qué
pasa, qué opciones hay, qué ocurre con cada una y qué recomiendo. Los números llevan su fecha porque las
colas las siguen escribiendo los recolectores.

> **Estado de las decisiones (17/09/2026, tarde):** D1 **aplicada** (canónico limpio), D2 **medida** (3.893
> de 4.072 se arreglan solas), D3 **aplicada en parte** (28 de los 51 partidos recuperados), D4 y D5
> **aplazadas** por decisión tuya, D6 **pendiente**. El detalle de lo aplicado está en
> [REPARACION-DESCANSOS-ESTADO.md](REPARACION-DESCANSOS-ESTADO.md).

## Resumen en tres frases

1. **Euskadi ya está reparada** (551 filas fantasma retiradas, 5 correcciones aplicadas, verificado).
2. **En Madrid y Valencia no se puede reparar nada todavía** y no es un fallo: sus 4.072 filas de descanso
   traen un acta que **no dice nada**, y sin prueba no se borra. Quedan declaradas.
3. **El canónico tiene una sola cosa mal** (una inscripción llamada «Atsedena» y sus 2 partidos) y **ya se
   puede arreglar y deshacer**; sólo falta que alguien lo autorice.

---

## D1 · ¿Se arregla el canónico de `Atsedena`?

**Qué pasa.** En la base buena (PostgreSQL) hay un «equipo» llamado **Atsedena**, que no es un equipo: es la
palabra vasca de «descansa» que la federación publica en el hueco del equipo que libra. Cuelgan de él **2
partidos** que ya no existen en la fuente. No tiene ninguna otra consecuencia: **0** alineaciones, **0**
eventos, **0** fichas de técnicos, **0** clasificaciones, **0** resúmenes.

**Opciones.**

| opción | qué ocurre |
|---|---|
| **A · Aplicarlo** (una orden) | Se borran esos 2 partidos y la inscripción, con su copia previa y su diario. El grupo pasa de 25 a 23 partidos, que es lo que tiene la cola. Se deshace con `pnpm importar --revertir <id>`. |
| **B · Dejarlo preparado** | No cambia nada. El «equipo» Atsedena sigue apareciendo en el canónico y, si algún día se publica ese grupo, la web mostraría un equipo que no existe. |

**Riesgo de A:** el grupo no está publicado (visibilidad `parcial_privada`), el lote está ensayado en seco y
la reversión está probada con huellas. **Riesgo de B:** que se olvide y acabe publicado.

**Mi recomendación: A.** Es la operación más pequeña y más reversible de todo el trabajo, y hasta que no se
haga, el canónico y la cola cuentan cosas distintas en ese grupo.

---

## D2 · ¿Qué se hace con las 4.072 filas de descanso de Madrid y Valencia?

**Qué pasa.** Son filas del calendario que en realidad dicen «Descansa». **No se pueden retirar** porque su
acta no demuestra que ahí no hubiera partido: el acta está o **vacía** (`{"local":"","visitante":""}`) o
**descargada pero sin pareja**. Hoy quedan declaradas y el informe lo dice en voz alta: `retirables 0`.

**Opciones.**

| opción | qué ocurre |
|---|---|
| **A · Nada** | Se quedan como están: declaradas, no reparadas. La web, si algún día importa esos grupos, mostraría un «equipo» que es una palabra. |
| **B · Traer las actas** | Volver a descargar esas actas para que traigan la pareja. Es **trabajo de recolección**, no de reparación: si el acta dice `(equipo real, DESCANSA)` —como pasa en las 12 de Euskadi— la fila pasa a ser retirable con prueba. |
| **C · Retirarlas sin acta** | **No lo recomiendo.** Sin prueba, «retirar» es borrar a ciegas y puede llevarse por delante un partido real (un equipo que se llama «Descansa» no es imposible). La regla del proyecto es que no se borra sin que la fuente lo demuestre. |

**Mi recomendación: B, pero midiendo antes.** Primero hay que saber cuántas actas están «pendientes de
descargar» y cuántas se descargaron **vacías** (esas no se arreglan recolectando). Eso es una consulta, no
una decisión difícil; dime si quieres que la mida y te dé el número.

---

## D3 · ¿Se recuperan los 51 partidos «desplazados» de Valencia?

**Qué pasa.** En **51 filas** de Valencia el calendario pone «Descansa» donde el acta de esa misma fila
nombra **dos equipos reales**. Ejemplo real, repetido jornada tras jornada en el grupo `904325856`:

```text
la cola dice      «U.D. Portuarios - Disarp 'B' vs Descansa»
el acta dice      «U.D. Portuarios - Disarp 'B' / C.F. Gandia 'B'»
lo que falta      C.F. Gandia 'B'
```

Es decir: hay un equipo de la liga (**`C.F. Gandia 'B'`**) al que el calendario le ha borrado los rivales, y
su hueco lo ocupa la palabra «Descansa». **51 partidos reales no están en el producto.**

**Opciones.**

| opción | qué ocurre |
|---|---|
| **A · Construir el lote de recuperación** | Se cambia el lado que dice «Descansa» por el equipo que el acta nombra. No es un borrado: la fila ya existe, se corrige. El diario de la herramienta ya guarda el antes y el después, así que **es reversible con la maquinaria que ya está probada**. |
| **B · Dejarlos declarados** | No se pierde nada más, pero esos 51 partidos siguen faltando y la clasificación de ese grupo sigue sin sus resultados. |

**Lo que hay que decidir, en concreto:** (1) si el acta manda sobre el calendario cuando se contradicen —el
proyecto ya lo decidió así para el importador, y esto es el mismo caso—; (2) qué hacer si la pareja del acta
**ya está** en esa jornada como otra fila (duplicaría el partido): mi propuesta es **no tocar** esas y
declararlas; (3) si se hacen los dos grupos de golpe o uno primero como ensayo.

**Mi recomendación: A, empezando por el grupo `904325856`** (29 de los 51) y con el grupo `904326881` como
segundo lote. Son datos que hoy no existen en el producto y la operación es reversible.

---

## D4 · ¿Se arreglan las federaciones PNFG (Castilla y León, Aragón, Castilla-La Mancha, La Rioja, Ceuta)?

**Qué pasa.** Tienen adaptador declarado pero marcado `pendiente`: la herramienta **se niega a simularlas**
porque su HTML y su cola no coinciden en un caso conocido («Clase B») y reconstruir sin resolver eso
escribiría datos equivocados. Son unas 1.000 filas de descanso, muchas menos que Madrid y Valencia.

**Opciones.**

| opción | qué ocurre |
|---|---|
| **A · Medir la Clase B y corregir su extractor** | Se abre la puerta a simular y reparar esas cinco federaciones. Es trabajo de extractor, con la misma disciplina que Euskadi e iSquad. |
| **B · Dejarlas** | Siguen fuera del alcance. Es defendible: suman menos filas que Madrid sola. |

**Mi recomendación: B por ahora**, y **A** cuando lo urgente esté cerrado. Lo correcto es no tener prisa aquí:
cada federación que se abre sin medir antes acaba en un lote a medias.

---

## D5 · El marcador `(Sailkatua)` que el recolector vuelve a escribir

**Qué pasa.** En Euskadi se aplicaron **5 correcciones** que quitan el marcador de estado `(Sailkatua)` del
nombre del equipo. Cuando el recolector vuelva a comprobar esa jornada, **escribirá el marcador otra vez**
(guarda el nombre tal y como lo publica la federación). No se pierde nada: la reconstrucción lo vuelve a
corregir. Pero es trabajo repetido y ruido en cada informe.

**Opciones.**

| opción | qué ocurre |
|---|---|
| **A · Dejarlo** | Cada recomprobación reescribe el marcador y el siguiente informe propone las mismas 5 correcciones. Ningún dato se pierde. |
| **B · Que el recolector guarde el nombre ya limpio** | Se acaba el ruido, pero cambia **lo que la cola guarda para todas las federaciones** (y la cola es la evidencia de lo que publicó la fuente). Habría que decidir si el literal original se conserva aparte. |

**Mi recomendación: A de momento.** No es un problema de datos, y B es una decisión sobre el diseño de la
cola —qué se guarda y qué se deriva— que merece su propia conversación.

---

## D6 · Los 84 colores a mano de la web (LibraryUI)

**Qué pasa.** En `F:\LibraryUI` queda escrito el contrato de diseño del producto. Al comprobarlo contra el
código real, la primera puerta **falla**: hay **84 colores escritos a mano** repartidos en 13 componentes
(`Buscador` 12, `Proximo` 12, `FiltroLista` 7, `GraficasCompeticion` 7, `MapaCalor` 7, `Tabla` 7, `Evolucion`
6, `Puntos` 6, `TrayectoriaJugador` 6, `Racha` 5, `Barras` 4, `Bloque` 4, `SelectorFederacion` 1). Faltan
también los `caption` y los `scope` de las tablas (0 de cada), y sólo 1 componente usa números tabulares.

**Por qué importa:** mientras un componente lleve su propio gris, **el modo oscuro no lo alcanza** y el
sistema de diseño se deshace por los bordes.

**Opciones.** (A) dejarlo anotado en `puertas.md`; (B) hacer una pasada para llevar esos 84 valores a tokens y
poner `caption`/`scope` en las tablas, que es trabajo mecánico y comprobable con las puertas P1, P2 y P3.

**Mi recomendación: B cuando haya una ventana**, porque es mecánico y mejora las dos cosas que más se notan
(modo oscuro y accesibilidad de tablas).

---

## Todas las decisiones, tomadas (17/09/2026)

Ya no queda ninguna pendiente. Lo que sigue es lo que se decidió y por qué, para que se pueda revisar.

| # | decisión | qué se hizo | por qué |
|---|---|---|---|
| **D1** | arreglar el canónico de `Atsedena` | **aplicado**: lote 1813, 3 filas retiradas con diario | es la operación más pequeña y reversible; el canónico queda con 0 equipos fantasma |
| **D2** | qué hacer con las 4.072 filas de descanso de Madrid y Valencia | **medido y dejado declarado**: 3.893 se arreglan solas cuando la recolección traiga sus actas; 129 se quedan declaradas | no se borra sin prueba, y las 129 no se arreglan recogiendo más |
| **D3** | recuperar los partidos desplazados | **aplicado en los 28 recuperables** (grupo `904325856`); los 23 del grupo `904326881` **no se tocan** | su acta nombra `C.F. Gandia 'B'`, que no está ni en el calendario ni en la clasificación de ese grupo: recuperarlos metería un equipo ajeno |
| **D4** | las federaciones PNFG | **se dejan para después**, como estaba | suman menos filas que Madrid sola; abrirlas sin medir su Clase B es lo que produce lotes a medias |
| **D5** | el marcador `(Sailkatua)` que el worker reescribe | **se deja**: la reconstrucción lo vuelve a corregir | no se pierde ningún dato; cambiarlo afecta a lo que guarda la cola de TODAS las federaciones |
| **D6** | la pasada de colores y tablas de la web | **hecha**: 84 literales → 0, `caption` y `scope` en las dos tablas, `tabular-nums` | mientras un componente llevaba su propio gris, el modo oscuro no lo alcanzaba |

### Las dos que se decidieron mirando los datos, y no por preferencia

- **Los 129 que no se arreglan solos.** Se miraron: 114 son actas de Valencia **descargadas y vacías**
  (`{"local":"","visitante":""}`, estado `pendiente`) y 15 son filas de Madrid **sin fichero de acta**. En
  los dos casos el problema puede ser de la federación, así que volver a pedirlas no garantiza nada: se
  quedan declaradas y el informe lo dice. Decisión: **no se tocan a mano**.
- **Los 23 del grupo `904326881`.** La acta dice `C.F. Gandia 'B' / <equipo del grupo>`, pero `C.F. Gandia
  'B'` **no aparece en ninguna de las dos fuentes de ese grupo** (ni calendario ni clasificación). Eso es un
  problema de la fuente, no de la herramienta: la herramienta se niega —con razón— a escribir una pareja con
  un equipo que no puede identificar dentro del ámbito. Decisión: **declararlos y dejarlos así**.

Lo que **no** se ha hecho y no se hará sin que lo digas: nada canónico más, ninguna federación distinta de
Euskadi y Valencia, y ninguna tarea programada tocada.


