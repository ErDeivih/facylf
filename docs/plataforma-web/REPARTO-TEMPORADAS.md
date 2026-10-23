# Reparto de temporadas entre el PC y el servidor (y las actas que no tenían trabajo)

Esta guía existe porque el 29/09/2026 se descubrieron **dos fallos silenciosos** que llevaban semanas haciendo que
media Castilla y León no se pudiera recoger aunque todo pareciera funcionar. Los dos están arreglados y los dos
tienen la misma firma: **la cola decía que había trabajo, el recolector decía que no había nada, y nadie daba
ningún error**.

Léelo antes de tocar `temporadas-asignadas.txt`, antes de dar por bueno un porcentaje de temporada y antes de
concluir que «esa temporada ya está casi hecha».

## 1 · Quién recoge qué

Castilla y León se recoge **en las dos máquinas a la vez**, y para no pedir dos veces la misma acta cada una se
queda con temporadas completas y disjuntas. El reparto alterna, así que las dos avanzan en paralelo y en conjuntos
que no se tocan:

| máquina | temporadas |
|---|---|
| **PC** | 2025-26 · 2023-24 · 2021-22 · 2019-20 · 2017-18 · 2015-16 |
| **servidor** | 2026-27 · 2024-25 · 2022-23 · 2020-21 · 2018-19 · 2016-17 |

El fichero que manda es `descargas-federacion/recolector-local/temporadas-asignadas.txt` **dentro de cada
máquina** (en el servidor viaja dentro del volumen montado). En el repositorio hay una copia de la lista del
servidor en `scripts/servidor/temporadas-asignadas-servidor.txt`, para poder revisarla sin entrar por SSH.

- Se admiten comentarios con `#` y saltos de línea. **Cuidado con las comas dentro de los comentarios**: se
  quitan primero los comentarios de cada línea y sólo después se parte por comas, precisamente porque la primera
  versión lo hacía al revés y las palabras de un comentario entraron como si fueran temporadas.
- Las temporadas se escriben como **etiqueta** (`2025-26`), nunca como código: el código de temporada no
  significa lo mismo en cada federación (en La Rioja el 9 es 2013-14 y en Andalucía el 9 es otra cosa).
- Sin ese fichero no cambia nada: el reparto es opt-in por federación y por máquina.

### Añadir una temporada nueva: hay TRES puertas, y las tres tienen que estar abiertas

Esto es lo que costó una tarde. El suelo de temporadas (`TEMPORADA_MINIMA`, hoy `2023-24`) no actúa en un solo
sitio, y abrir sólo una puerta deja el recolector **sin trabajo y sin ningún error**:

1. **Elegir trabajo** — `siguienteTrabajo` (`scripts/lib/recolector-local.mjs`). Sin esto, el suelo excluye la
   temporada por mucho que esté asignada.
2. **Levantar el aplazamiento** — `reactivaTemporadasAsignadas` (`scripts/lib/temporadas-asignadas.mjs`). El suelo
   no sólo excluye: cuando se aplicó, **aplazó** el trabajo antiguo al año 2099. Asignar una temporada sin esto
   deja sus tareas fechadas en 2099 y el recolector contesta «ningún trabajo disponible», pareciendo que ya está
   todo hecho. Se reactiva sólo lo asignado, y queda escrito en el registro: «se han reactivado N trabajos».
3. **Dejar que CREZCA** — `encola` y `preparaDesdeCatalogo`. Esta es la que faltaba: `encola` no crea trabajo de
   una temporada por debajo del suelo y `preparaDesdeCatalogo` ni la registra. Sin esta puerta la asignación
   **sólo podía vaciar lo que ya hubiera**, nunca crear trabajo nuevo. Lo cazó la prueba «una temporada asignada
   a mano crece aunque esté por debajo del suelo» (`scripts/lib/recolector-local.test.mjs`).

Las tres usan el mismo criterio: **lo asignado explícitamente es una decisión, no un descuido**. Y sin asignación
nada de esto cambia.

**Cómo se comprueba que una temporada recién añadida va a trabajar de verdad** (no basta con que no dé error):

    node scripts/diagnostica-cyl-temporadas.mjs "descargas-federacion/recolector-local/cola-v2.sqlite" PC

En la columna `DISPONIBLE` tiene que aparecer un número > 0 en esa temporada. Y en el registro del worker,
«Plan local preparado: N temporadas y M competiciones candidatas» — si `N` es 4 en el PC o en el servidor, el
plan se ha quedado con las de siempre y las asignadas no están entrando.

## 2 · El fallo gordo: 27.000 actas en ámbito que no tenían ningún trabajo

Una acta `pendiente` no se descarga sola: necesita su fila en `trabajos` (tipo `acta`) que la pida. **Si esa fila
falta o está en un estado que el selector no elige, el porcentaje de la temporada se queda clavado y nada lo
avisa.**

Medido el 29/09/2026 en las dos colas de Castilla y León:

| | actas en estado `pendiente` | con trabajo que las pidiera |
|---|---|---|
| PC | 28.171 | **13.439 no tenían ninguna fila** |
| servidor | 28.644 | **14.839 sin fila** + 6.767 con la fila en `cancelado` |

La 2022-23 era el caso extremo: 17.374 actas pendientes y sólo 2.535 con trabajo — **y las 2.535 canceladas**.
De ahí su 18 %: no es que fuera lenta, es que casi todo su trabajo no existía en la cola.

### Por qué aparece el hueco

`reconciliaAmbitoActas` **cancela** el trabajo de un acta que la configuración de ámbito no permite (categorías de
menores o de adultos) y `activaActasPermitidas` lo vuelve a encolar cuando el ámbito se amplía. Pero `encola`
sólo actualiza `url`, `prioridad` y `actualizado_en` en su `on conflict`: **nunca resucita un trabajo cancelado**,
y tampoco crea la fila si se perdió. Así que un acta que vuelve al ámbito se queda en `pendiente` —que significa
«hay que ir a por ella»— con un trabajo `cancelado` que el selector no elige jamás.

### El arreglo

`reparaActasSinTrabajo` en `scripts/recolector-local.mjs`, ejecutable como comando y **llamado automáticamente en
cada arranque de sesión**, justo después de reconciliar el ámbito. Deja la cola coherente con su propio
vocabulario: si el acta está en `pendiente`, su trabajo existe y está pendiente. Ni una cosa más:

- sólo mira actas en estado `pendiente` — las de `pendiente_ambito` y `pendiente_permiso` **no se tocan**: ahí
  manda la configuración de ámbito;
- respeta los permisos de menores y adultos, con la misma condición que `activaActasPermitidas`;
- sólo las temporadas asignadas a esa máquina;
- **no pide nada a la federación**: deja trabajo en la cola, y el ritmo, las pausas y los reintentos del
  recolector deciden cuándo se hace.

    # PC (Windows)
    node scripts/recolector-local.mjs reparar-sin-trabajo
    # servidor (dentro del contenedor de la federación)
    docker exec facylf-federacion-1 node /app/scripts/recolector-local.mjs reparar-sin-trabajo

Es **idempotente**: la segunda pasada devuelve `sinTrabajoCreadas: 0, reactivadas: 0`. Se comprobó.

**Cómo se comprueba que no vuelve a haber hueco:**

    node scripts/diagnostica-actas-sin-trabajo.mjs "descargas-federacion/recolector-local/cola-v2.sqlite" PC

Tiene que decir `0 de ellas SIN NINGÚN trabajo que las pida`. Cualquier otra cosa es trabajo invisible.

## 3 · Lo que se movió, medido

Antes y después del arreglo, el 29/09/2026:

| | antes | después |
|---|---|---|
| PC · actas sin trabajo | 13.439 | **0** |
| servidor · actas sin trabajo | 14.839 sin fila + 12.000 canceladas | **0** |
| PC · trabajo disponible ahora | 15.603 | **44.668** |
| servidor · trabajo disponible ahora | 9.662 | **41.680** |
| PC · actas hechas de Castilla y León | 52.412 de 80.569 (65 %) | 53.998 (67 %) |
| servidor · actas hechas de Castilla y León | 52.498 de 81.128 (65 %) | 53.447 (66 %) |
| PC · 2021-22 | 5 % | **16 %** |
| servidor · 2022-23 | 18 % | **23 %** |

Y en tres horas y media de reloj, la progresión fue **exactamente** la de las dos temporadas peores: 1.586 actas
en el PC (todas de 2021-22) y 949 en el servidor (todas de 2022-23). Las dos máquinas se pusieron a trabajar en
la temporada peor de su lista y no en otra cosa.

## 4 · Las herramientas de medida

| qué quieres saber | con qué |
|---|---|
| porcentaje honesto de cada temporada | `node scripts/porcentaje-exacto-cyl.mjs <cola.sqlite> [etiqueta]` |
| qué puede trabajar AHORA cada temporada | `node scripts/diagnostica-cyl-temporadas.mjs <cola.sqlite> [etiqueta]` |
| actas en ámbito sin trabajo que las pida | `node scripts/diagnostica-actas-sin-trabajo.mjs <cola.sqlite> [etiqueta]` |
| ritmo de descargas (peticiones y actas por hora) | `node scripts/ritmo-descargas.mjs [--horas N]` |
| en qué minuto se ha parado una cola | `node scripts/servidor/huecos-peticiones.mjs <cola.sqlite> [minutos]` |
| ritmo de las 16 federaciones del servidor | `bash scripts/servidor/ritmo-descargas-servidor.sh [--horas N]` |

### El porcentaje honesto se calcula con `actas`, no con `partidos`

`hechas / (hechas + pendientes)` sobre la tabla `actas`. Divider actas entre partidos *descubiertos* da 95-99 % y
engaña: sólo cuenta lo que ya se encontró. Y ahora se sabe que ni siquiera la tabla `actas` basta por sí sola, si
parte de esas actas no tiene trabajo: **un porcentaje sólo es verdad si antes has comprobado que hay trabajo
detrás**. Por eso `diagnostica-actas-sin-trabajo.mjs` es el compañero obligatorio de `porcentaje-exacto-cyl.mjs`.

## 5 · Trampas que ya nos han costado tiempo

- **El PC se suspende por la noche y la flota se queda congelada.** No es un fallo del software: el 29/09/2026 una
  tanda que empezó a las 00:35 «terminó» a las 10:30, y el evento `Kernel-Power 42` está a las 00:58. El PC tiene
  «Suspender tras: nunca» con corriente alterna, así que lo suspende alguien. El servidor sí corrió las 24 horas.
  Coste medido: el PC recoge unas 14,5 h al día, alrededor del **30 % de la capacidad combinada de Castilla y
  León**. La palanca menos invasiva es activar «WakeToRun» en la tarea `FACyLF flota`, que ya tiene un disparador
  diario a las 06:05 que hoy no puede despertar la máquina — pero eso significa que el PC se encienda solo, y es
  una decisión del responsable.
- **En el PC no hay `bash`.** El del PATH es el de WSL y falla con `Bash/Service/0x8007274c` (el servicio no está
  levantado); dentro de una tubería falla **sin dar error visible**. Las herramientas de este PC van en
  PowerShell (`.ps1`); los `.sh` de `scripts/servidor/` son para el servidor, que sí tiene bash.
- **El histograma de `ritmo-descargas.mjs` va en hora UTC.** Los sellos de `peticiones` son ISO en UTC. Decía
  «hora local del PC» y eso hizo leer mal el hueco de la suspensión (parecía a las 00:00 y era a las 02:00
  locales). La etiqueta ya dice UTC.
- **Un mensaje de error que miente sobre el presupuesto.** El aviso de tiempo agotado del adaptador de la web
  estaba escrito a mano con «5 s», aunque una consulta puede declarar más. La prueba de contrato fallaba diciendo
  «(5 s)» cuando se habían agotado 20. Ya informa del presupuesto **en vigor**.
- **Un `count(*)` sobre tablas de hechos vive en el borde del presupuesto, y por eso una prueba se volvió
  intermitente.** Ver el comentario de `RESUMEN_CANONICO` en `apps/web/src/consultas/cobertura.ts`: `appearance`
  tarda 12,9 s en caliente y 25,4 s en frío, `match_event` 6,6 s y 10,3 s, y `/canonico` las usa — pero en frío
  el resumen suma ~40 s y en caliente ronda los 20 s del presupuesto. La prueba de contrato pasa o falla **según
  lo templada que esté la caché**, que no es lo que dice comprobar. No se arregla subiendo el límite; hace falta
  una tabla de recuentos mantenida por el importador (ver §7). Se mide con `scripts/mide-resumen-canonico.ps1`.

## 6 · La pasada del fin de semana (lunes)

Lo que hace que los informes tengan la última jornada jugada. **Reabre con prioridad 2 las competiciones del
último fin de semana**, por delante del trabajo histórico, y recorre todas las federaciones de una pasada.

- **PC**: tarea programada `FACyLF ingesta fin de semana`, disparador **semanal, lunes a las 07:30**
  (`scripts/ejecutar-fin-de-semana.ps1` → `scripts/ingesta-fin-de-semana.mjs`).
- **servidor**: contenedor `facylf-fin-de-semana-1`, `bash docker/entrada-fin-de-semana.sh 07:30`. Ojo: **su bucle
  no distingue el día —duerme hasta las 07:30 y vuelve a pasar todos los días**, lo que incluye el lunes y
  además reintenta el resto de la semana si algo quedó a medias.

Comprobado el 29/09/2026: el PC tiene la próxima ejecución el **lunes 5 de octubre a las 07:30**, y su última
pasada (que se retrasó a las 10:26 porque el portátil estaba suspendido) salió con código 0 cubriendo 4
federaciones, 599 jornadas y 3.502 actas. En el servidor, la última pasada real (25/09) cubrió **18 federaciones,
671 jornadas, 4.518 partidos y 4.910 actas**, y reabrió 118 jornadas incompletas.

## 7 · Lo que queda pendiente

1. **La suspensión nocturna del PC** (§5). Espera decisión del responsable.
2. **El resumen del canónico** (§5, último punto). Necesita una migración nueva con una tabla de recuentos
   mantenida por el importador. Mientras tanto su prueba de contrato es intermitente —pasa en caliente y falla en
   frío—, que es peor que estar en rojo: un test que depende de la caché no avisa de nada.
3. **Añadir historia anterior a 2015-16.** El catálogo tiene la 2014-15 y la 2013-14 (códigos 10 y 9). Se
   quitaron de las listas a propósito: con doce temporadas por delante, añadir más sólo reparte el mismo ritmo
   entre más sitio. Volverán cuando la serie 2015-16 → 2026-27 esté cerrada.
