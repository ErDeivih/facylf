# Traspaso a Claude — jornada del 5 de octubre de 2026

**Para qué es.** Resumen de lo hecho y de lo que queda, escrito para que el siguiente agente pueda seguir sin
repetir el trabajo ni volver a descubrir lo mismo. Todo lo que dice está **medido**; lo que no se ha podido
comprobar se dice que no se ha podido.

**Reparto acordado:** el otro agente lleva **infraestructura** (Docker, PostgreSQL, importador, espacio en disco)
y Claude lleva **adaptadores y recolección multideporte**. Los dos escriben en `docs/plataforma-web/`.

---

## 1 · Lo más importante del día: cuatro federaciones paradas eran un disco lleno

Es el hallazgo que hay que leer primero, porque **no lo dice ningún registro**.

| | 11:30 | 12:36 |
|---|---|---|
| peticiones/hora del PC | **155** | **2.216** |
| respuesta media (Castilla y León) | 39,6 s | **1,2 s** |
| Castilla y León / Madrid / Valencia | 41 / 52 / 28 por hora | **487 / 699 / 694** |
| Cataluña | 34 por hora, **0 actas** | 336 por hora, **actas saliendo** |

Las cuatro federaciones del PC llevaban ~1 h 40 min sin hacer una sola petición, y **la misma rato las cuatro**.
No eran cuatro averías: era **C: al 99 % (3,8 GB libres)**. Chrome no arranca ni trabaja sin espacio temporal,
y no lo dice: simplemente deja de funcionar. Los recolectores HTTP (multideporte) seguían perfectos, y eso era
la pista — sólo fallaban los que abren navegador.

**Al liberar espacio, la recolección volvió sola**, en el mismo minuto.

**Y de paso se desatascó Cataluña.** Llevaba una semana sin guardar actas y los dos arreglos que se le hicieron
hoy (ver §3) no bastaban por sí solos: sin disco, el navegador no podía ni empezar. Con C: liberado, **las actas
han empezado a salir**.

---

## 2 · La fuga de temporales: 101 GB en 3.929 carpetas

`%TEMP%` ocupaba **112,7 GB** en una unidad de 464. El desglose:

```
scoped_dir      3.929 carpetas    101,42 GB   ← perfiles temporales de Chrome (Selenium)
ficheros sueltos 1.772 ficheros     6,15 GB
otros proyectos (pytest, cuedigital, opofuente)  ~1,3 GB
```

**De dónde salen:** Selenium crea una carpeta `scoped_dir*` por sesión de navegador y **sólo la borra si el
navegador se cierra en limpio**. Cuando un worker se mata —corte por tiempo, reciclado, o alguien reiniciando la
flota— la carpeta se queda. Miles de sesiones después, es la unidad entera.

**Lo hecho:**
- **Borradas las 3.904 con más de 2 h: 101,1 GB liberados.** C: pasó de 3,8 a **104,3 GB libres**.
- **`scripts/limpiar-temporales-chrome.ps1`** (nuevo) y **tarea programada cada 6 horas**. Respeta a propósito
  las carpetas de las 2 últimas horas, para no romper un Chrome que esté trabajando. Tiene `-QueSeVe` (mirar sin
  borrar) y `-SiHaceFalta -GBLibresMinimos 20` (no hace nada si hay sitio, así puede llamarse en cada arranque).
- **En el servidor NO hace falta, y está medido**: cero `scoped_dir` y `/tmp` de 2-4 MB en los 16 contenedores.
  Se reinician cada pocos días y sus temporales se van con ellos. Comprobación:
  `scripts/servidor/diagnostica-temporales.sh`.

**Lo que falta aquí:** averiguar por qué no se cierran en limpio los navegadores. La limpieza es el apósito; la
causa está en los caminos de salida (`driver.quit()` en cortes por tiempo y reciclados).

---

## 3 · Los tres bucles de Cataluña, y cómo se cortaron

Cataluña llevaba desde el 26/09 bajando de **4.685 actas al día a 25-40**, con cientos de peticiones por hora y
**3.177 trabajos de acta disponibles sin que nadie los tocara**. Eran tres problemas encadenados:

**a) Clasificaciones cuyo calendario está aplazado.** De la cola salía la clasificación de un grupo y al abrirlo
se leía también su calendario, mirando sólo si estaba `hecho` o `cancelado` — **no si estaba aplazado**. Se
volvía a pedir un calendario citado para abril, fallaba, el aplazamiento se apuntaba al calendario (rachas de
230) y la clasificación se quedaba en `en_curso`, huérfana. El arranque de sesión siguiente la devolvía a
`pendiente` y vuelta a empezar.

*Arreglo:* `scripts/lib/grupo-cataluna.mjs` (nuevo, con **9 pruebas**) y dos cambios en el recolector —
un pre-paso que aplaza en bloque, sin pedir nada, las clasificaciones cuyo calendario ya está aplazado, y una
guarda dentro del bucle. **Resultado medido: 173 trabajos en `en_curso` → 1.**

**b) «Wait timed out» confundido con «Chrome caído».** Una página que no carga en 40 s se trataba como caída de
navegador: trabajo a la cola para dentro de 5 minutos, **sin sumar intento**, sesión cerrada y Chrome nuevo 20 s
después. Resultado: **724 fallos de navegador y 6 aciertos en 24 h**, seis grupos repitiéndose hasta 136 veces, y
el PC abriendo y cerrando Chrome ~50 veces por hora.

*Arreglo:* tres cambios más — no lanzar error al agotarse la espera (seguir por el camino de «la pestaña no trae
tabla»), **preguntar al navegador si responde** antes de reciclar la sesión, y **contar el intento** con escalera
(5 min, 5 min, 24 h).

**c) El disco.** Es el de §1, y sin él los otros dos no bastaban.

**Lo que NO se ha podido cerrar de Cataluña:**
- **125.354 trabajos cancelados** de 2025-26, el **86 %** de esa temporada. Sin mirar.
- Unos **3.400 cierres de calendario y clasificación** en una hora con sólo 82 peticiones. **381 están
  explicados** (el paso `preparar` cierra en bloque `catalogo_temporada` y `grupos`, y es correcto por diseño);
  el resto se sospecha que se sirven de la evidencia ya archivada, pero **no está confirmado en el código**.
  El ritmo en sí está sano: **317 peticiones/hora a 24 h, una cada 11,4 s**.

---

## 4 · El importador del servidor: estaba colgado, no lento

Estuvo **4 horas sin cerrar un solo grupo** con 13.400 pendientes. La causa: el corte de 20 minutos mataba a
`pnpm` pero **no al `tsx` hijo**, que seguía vivo reteniendo la tubería, así que el `close` que el padre
esperaba **no llegaba nunca** y la tanda entera se quedaba muerta. La unidad atascada llevaba 1 h 53 min de
reloj y **1 h 04 min de procesador con 0 bytes leídos del disco y 0 consultas activas en PostgreSQL**.

**Arreglo** (`importar-masivo.mjs`, de Claude): proceso propio + `process.kill(-pid)`, corte configurable a 60
min y motivos de fallo que dicen la causa. **Resultado:** grupos otra vez en **17-22 segundos**
(`hecho murcia · 14.916 filas · 79 s`), donde antes eran 2 horas.

**Y una cosa que no era un fallo del software:** de las 173 unidades marcadas como «fallo», **23 ya estaban
completas en el canónico** y se reimportaban una y otra vez. Se marcaron como hechas (con respaldo del estado
previo). Quedan **150 que fallan de verdad** y necesitan una decisión sobre qué hacer cuando la tabla oficial no
cuadra con los resultados (Cataluña R1/R4) o cuando el acta no encaja con el calendario (Asturias).

---

## 5 · El servidor: mi diagnóstico anterior era equivocado

Dije que se apagaba por la batería. **La medición de hoy no lo sostiene:**

```
11:57:04 → 11:58:34 (120 s) → 0 µWh → potencia neta 0,00 W → ESTABLE
```

Y hoy la carga es **más alta** que el día que medí 1,80 W de pérdida. Tampoco hay OOM (0 líneas) ni calor ni
errores de hardware, y sobran 10,9 GB de memoria.

Lo que sí hay:
- El diario **se corta en seco**, sin secuencia de apagado, y `wtmp` lo apunta como «crash».
- Existe un **watchdog de hardware** (`iTCO_wdt`, 30 s). Si está armado en la BIOS y la máquina se cuelga, **se
  reinicia sola a los 30 segundos sin dejar ni una línea**.

**Hipótesis viva: cuelgue bajo carga sostenida, no corriente.** Para confirmarlo hace falta saber si el diario
es persistente (si vive en memoria, perder los últimos minutos es normal y no dice nada) y mirar el watchdog en
la BIOS — eso último no se puede desde Linux.

**Y una corrección importante: la carga 12-14 era el pico de arranque**, no el estado normal. Ahora es **5,2**.
Por eso **NO se ha bajado ninguna plaza de navegador**: frenaría la recolección todo el tiempo para arreglar algo
que dura dos minutos tras un reinicio. Si el pico molesta, la palanca buena es **escalonar el arranque** de los 19
recolectores, que no toca el ritmo de ninguno.

---

## 6 · Espacio: estado y decisión tomada

| unidad | libre | de |
|---|---|---|
| C: | **103,5 GB** (era 3,8) | 464,8 |
| D: | 295,3 GB | 894,2 |
| **E:** | **819,8 GB** | 931,5 |
| F: | **59,7 GB** (era 15) | 208,3 |

- **VoiceStudio borrado** (44,7 GB). Era un clon del repositorio público `debpalash/VoiceStudio`, así que el
  código se recupera de GitHub. Lo único propio era `narrar_libro.py`, **rescatado** con los metadatos en
  `F:\EspacioCodigo\_rescate-voiceStudio\`.
- **Los datos brutos NO se han movido, a propósito.** El plan es llevarlos a E: (que tiene 819 GB) **con enlace
  para no tocar rutas**, dejando en F: las colas SQLite y los perfiles de Chrome, que son lo que se escribe y se
  lee constantemente — el proyecto ya midió que el disco era el cuello de botella. No se ha hecho todavía porque
  ya no hay urgencia (F: tiene 59,7 GB libres) y **un enlace mal puesto rompería las rutas de 19 recolectores**;
  los enlaces son justo lo que tumbó el Docker del PC hace cuatro días. Se hará con calma y verificando.
- **Regla para el futuro:** lo que crezca sin parar va a **E: por diseño**; lo que se escribe mucho y se lee
  mucho se queda en el disco rápido.

---

## 7 · Estado ahora mismo

| | peticiones/h | actas/h |
|---|---|---|
| PC (4 federaciones) | **2.216** | 1.878 |
| servidor (16 federaciones) | ~2.400 | ~2.200 |

- **PC**: Castilla y León 487, Madrid 699, Valencia 694, Cataluña 336 — todas vivas, respuestas en 0,5-1,2 s.
- **Servidor**: recién encendido (11:26), los **21 contenedores subidos solos**, postgres y web *healthy*, y el
  importador trabajando. Estuvo apagado desde las ~09:22 y se recuperó sin intervención.
- **Multideporte**: **15 adaptadores** en marcha (incluidos los nuevos `siguetuliga` y `mytorneo`). ServerSports
  con **2.867 enlaces** de histórico encolados. MyGol multiplicó por 27 sus ficheros en una noche.
- **Calidad** (`calidad.mjs`): voleibol de Madrid pasó de **0 % a 100 %** en fechas y equipos, con
  `jugados sin marcador 0`. Apúntamelo 99 %/100 %, Gesdeportiva 98 %/100 %, FEB 28 % en fecha (el hueco conocido:
  la fecha está en la ficha del partido, hay que cogerla al importar).
- **Colas**: 22 comprobadas, **todas pasan `quick_check`**, ninguna corrupta.
- **Base canónica del PC**: 860.178 partidos, 434.071 actas, 1.213.588 personas — **intacta**, con **volcado
  portable verificado** en `D:\facylf-copias\`.

---

## 8 · Herramientas nuevas de estos días

| herramienta | para qué |
|---|---|
| `scripts/limpiar-temporales-chrome.ps1` | borra los `scoped_dir` viejos; ya programado cada 6 h |
| `scripts/mira-ritmo-cola.mjs` | **peticiones reales frente a trabajos cerrados**: contesta «¿vamos más rápido de lo acordado?» |
| `scripts/diagnostica-cataluna.mjs` | aplazamientos por tramos, rachas y grupos concretos |
| `scripts/lib/grupo-cataluna.mjs` + su prueba | la regla del calendario aplazado y la distinción caída/espera (9 pruebas) |
| `scripts/servidor/diagnostica-temporales.sh` | ¿acumulan temporales los contenedores del servidor? |
| `scripts/servidor/mira-unidad-atascada.sh` | ¿la unidad del importador lee del disco o gira en el aire? |
| `scripts/servidor/mira-grupo-en-canonico.sh` | ¿este grupo ya está importado? |
| `scripts/servidor/cuantos-fallidos-ya-estan.sh` | cuántos «fallos» están ya completos en el canónico |
| `scripts/servidor/marca-hechos-los-ya-completos.sh` | los marca sin reimportar (con respaldo) |
| `scripts/verifica-colas.mjs` | integridad de las 22 colas con `quick_check` |
| `scripts/copia-canonico.ps1` | volcado portable verificado del canónico |
| `scripts/estado-canonico.ps1` | el canónico entero en una pantalla |
| `scripts/diagnostica-docker-pc.ps1` · `scripts/arregla-docker-pc.ps1` | el Docker del PC y la unión de D: |
| `scripts/servidor/diagnostica-apagados.sh` · `mide-bateria.sh` | por qué se apaga el servidor |

---

## 9 · Lo que queda: competiciones por hacer y descubrir

### 9.1 Fútbol federado (lo que ya está en marcha)

**Castilla y León** — reparto de 6 temporadas por máquina, sin solaparse:
- PC: 2025-26 · 2023-24 · 2021-22 · 2019-20 · 2017-18 · 2015-16
- servidor: 2026-27 · 2024-25 · 2022-23 · 2020-21 · 2018-19 · 2016-17

Últimos porcentajes medidos: **PC 69 %, servidor 66 %** de actas hechas. La **2022-23** del servidor (23 %) y la
**2021-22** del PC (16 %) son las peores y las que están en curso. Detalle y trampas en
[`REPARTO-TEMPORADAS.md`](./REPARTO-TEMPORADAS.md).

**Historia anterior a 2015-16**: el catálogo tiene la 2014-15 y la 2013-14 (códigos 10 y 9). Se dejaron fuera a
propósito hasta cerrar la serie actual. **Es lo siguiente cuando terminen las doce.**

**Las 16 federaciones del servidor**: en la mayoría el límite **no es el ritmo, es que no hay trabajo
pendiente**. Asturias, Baleares, Canarias, Cantabria y otras están sin trabajo y con la próxima revisión
programada. Ahí no hay nada que rascar hasta que les toque revisita.

**Pendientes de verdad en federaciones del servidor:**
- **Cobertura baja**: 2019-20 está al 8 % de ediciones completas, 2018-19 al 18 %, 2017-18 al 14 %. Son las
  temporadas con más margen de mejora.
- **Euskadi**: sólo 8 ediciones completas de 468, la peor proporción de las diecinueve.
- **Aragón 2026-27**: la clasificación oficial trae equipos que aún no han jugado y el validador la rechaza. Es
  política conocida, no un fallo nuevo.

### 9.2 Fútbol aficionado (lo de Claude)

En marcha y probado: **ServerSports** (histórico completo en curso, 2.867 enlaces), **MyGol**, **Apúntamelo**,
**totalfútbol**, **La Preferente** (desde 2015-16), **Playooz**, **siguetuliga** (325 ligas de adultos),
**mytorneo** (veteranos de Cáceres).

**Decisión pendiente de David**: pedir a la vez a **hasta 3 dominios distintos** (cada uno sigue a una petición
cada 5-8 s, y el que falla tres veces se para una hora). Con eso el histórico de ServerSports pasa de 2-3 semanas
a unos 5 días. **Ninguna web recibiría más peticiones que hoy**; lo que sube es la carga del portátil.

**Aparcado**: el programa municipal de Palencia, Fuenlabrada y la UAM (su protección hay que estudiarla, y
Palencia aún no publica temporada). **Webs propias** vistas y pendientes: Rivas, Vistahermosa (Alicante, con
histórico completo) y Fuenlabrada.

**Fuera por sus condiciones, no por falta de medios**: Clupik/Leverade/Xporty y Competize prohíben la extracción.
Afecta a la Liga de Fútbol Valencia, Elche, Molina de Segura, Cartagena, Las Rozas, Fuengirola, Mijas y Badajoz.
**Hay que pedirles acceso**, no rodearlos.

### 9.3 Otros deportes (aparcados por decisión de David)

Hecho: balonmano y voleibol (iSquad), baloncesto nacional no profesional (FEB), Gesdeportiva, OWBasket, voleibol
de Madrid (arreglado), tenis iSquad.

Pendiente: **baloncesto FEB autonómicas**, **pádel (FEP)**, **lectura de las actas PDF de balonmano**
(goles y sanciones por jugador), el **modelo canónico multideporte** (migración nueva, sin escribir) y el tenis
individual y el pádel, que no caben en el modelo de equipos actual.

### 9.4 Y lo que no es de competiciones pero está abierto

1. **Cataluña**: los 125.354 cancelados de 2025-26 y confirmar de dónde salen los ~3.400 cierres locales.
2. **Los 150 fallos reales del importador**: decidir la política de tabla oficial que no cuadra.
3. **El servidor se apaga cada 2-4 días**: confirmar la hipótesis del cuelgue y, si se confirma, escalonar el
   arranque.
4. **La migración del archivo a E:**, con calma y verificando.
5. **La fuga de `scoped_dir`**: la limpieza ya está, falta la causa.

---

## 10 · Invariantes que no se pueden romper

Están en `CLAUDE.md`. Los tres que más se olvidan:

1. **Desconocido, no publicado y pendiente son estados distintos. Nunca se convierten en cero.**
2. **No se cambia el ritmo de un recolector ni los límites de un sitio** como efecto lateral de otra tarea. Un
   sitio recibe una petición cada 5-8 s, y nunca dos a la vez.
3. **Las SQLite y los archivos comprimidos son la evidencia.** Se leen, no se clonan mientras escriben, y no se
   borran. La web consulta PostgreSQL con un rol de **sólo lectura**.

Y la lección de hoy, que no está escrita en ninguna parte y debería estarlo: **cuando fallen a la vez cosas que
no tienen relación, mira el disco antes que el código.** Chrome no avisa de que no tiene espacio; simplemente
deja de funcionar.
