# TRASPASO A DEEPSEEK — 23/10/2026 (lo hecho por Claude del 21 al 23 de octubre)

> **Para quién:** DeepSeek, que retoma el trabajo en el PC y el servidor.
> **Escrito por:** Claude, 23/10/2026, 09:30, a petición de David.
> **Qué cubre:** ingesta y calidad de los datos de las 24 colas: recolectores, vigía, Cataluña, Madrid,
> Valencia y la medida de las 17 federaciones.
>
> La plataforma web (migraciones 0023-0042, usuarios, panel, rapidez de la base, publicidad) la lleva **otra sesión
> de Claude**. Su lista viva está en `GOAL-CLAUDE-2026-10-22.md` y su plan en `PLAN-DEEPSEEK.md`; aquí sólo se cita.
>
> **Cómo leerlo:**
> - §1 dice en una página qué está bien, qué está mal y qué falta.
> - §2 es la lista de TAREAS, en orden, con el comando, lo esperado y qué hacer si no sale.
> - §3-§7 son el porqué, las comprobaciones periódicas y lo que NO hay que perseguir.
> - Los bloques del 21-23/10 de `ESTADO-DEEPSEEK.md` tienen el detalle; este documento los resume y los ordena.

---

## 0. Reglas que no cambian (léelas antes de tocar nada)

- **Respeto a las webs:**
  - cliente FacylfBot identificado y una petición cada 5-8 s por web como mínimo (Valencia 10-14 s);
  - nunca Googlebot, proxies, captchas ni enlaces-trampa (el `__hpt__` de la FFCV no se pide jamás);
  - si una web devuelve 403, se para y decide David.
- **Privacidad:**
  - nunca DNI, correos, teléfonos ni fechas de nacimiento;
  - los nombres de menores se guardan sólo en el PC y **nunca se publican**.
- **Máquinas:**
  - el servidor no puede caerse ni quedarse sin memoria;
  - en el PC hay que dejar margen para que David trabaje (`FACYLF_RESERVA_GB=3`).
- **Código:**
  - sin commits salvo que David lo pida;
  - las migraciones ya aplicadas no se editan: siempre una nueva.
- **Datos:**
  - no se inventan: «desconocido» no es 0;
  - el mismo nombre no es la misma persona.
- **Peticiones del enlace de Claude** (`estado/claude/peticiones/` → `respuestas/`, cada ~10 min):
  - son SÓLO LECTURA;
  - `.ps1` corre en el PC y `.sh` en el servidor.

---

## 1. La foto en una página (23/10, 09:05)

### 1.1 Funciona y está comprobado (no hay que tocarlo)

| Qué | Prueba |
|---|---|
| **Las 10 colas del PC** piden sin parar y sin errores | Andalucía, Araba, Bizkaia, Cataluña, CyL (temporadas alternas), Gipuzkoa, Las Palmas, Madrid, Tenerife y Valencia: 5.000-9.300 peticiones en 24 h cada una (`estado/vigia/pc.txt`). |
| **Las 15 colas del servidor** van por turnos sin errores | `estado/vigia/servidor.txt`: «todo en orden». Las que están a 0 «vencido» (Canarias, Ceuta, Euskadi, Melilla, Navarra, Rioja) no tienen trabajo dentro de su alcance; es lo correcto. |
| **Cataluña lee el calendario entero** (props de React, sin clics) | 2025-26 pasó de ~21.000 a ~143.000 partidos; 187 calendarios releídos sin ninguno incompleto. |
| **Cataluña lee tarjetas, cambios y código de jugador** (desde el 22/10, 16:24) | En la noche del 22 al 23: 1.807 actas, todas con código y 0 errores. Las de sénior traen 3-12 tarjetas y 8-14 cambios. La base apenas apunta cambios (es la fuente). |
| **Cataluña ya no da por hecha un acta sin jugar** | 78 actas «Pendent» aplazadas al día siguiente de su partido, en vez de guardarse vacías. |
| **Madrid y Valencia ya no dan por hecha un acta abierta** | Al arrancar: «64 actas leídas con el acta todavía abierta: vuelven a la cola» (Madrid) y 1 (Valencia). |
| **Las URL de CyL en las demás federaciones** (fallo del 21/10) | Reparado por DeepSeek en las dos máquinas y comprobado (petición 192: 0 URL de otro portal). Galicia pasó de 397 jornadas vacías a 64. |
| **Vigía de colas** cada 10 min en el PC y cada ≤25 min en el servidor | `estado/claude/vigia.txt`. Las tres falsas alarmas de ayer (Araba, DH Juvenil de Cataluña, benjamines de CyL) ya no salen. |
| **Las 17 federaciones medidas** (`COBERTURA-FEDERACIONES.md` §2) | Las 8 del servidor se midieron el 23/10. El HTML guardado se comparó con la cola en 14 casos: la cola tiene exactamente lo que trae la web. |

### 1.2 Está mal o a medias, y se está corrigiendo solo (no hay que hacer nada; sólo comprobar)

| Qué | Estado | Cuándo estará |
|---|---|---|
| **Actas de Cataluña ya bajadas sin tarjetas, cambios ni códigos** (todo lo leído antes del 22/10, 16:24) | Releyéndose solas: **12.059 de 2026-27** con prioridad normal y **20.995 de 2025-26** detrás de todo lo pendiente. | 2026-27: unos 2 días. 2025-26: semanas (va al final de la cola). |
| **Valencia: aviso `calidad_actas` (43 % de actas vacías)** | Son partidos **suspendidos** que se guardaban como 0-0 sin jugadores. Ya arreglado en el código; las guardadas se corrigen solas al arrancar (`recalificaSuspendidas`). | En el próximo arranque de Valencia y Madrid. A las 09:05 aún corría la sesión de ayer (22:53). |
| **Cataluña: detalles de partido perdidos** (hora, campo, árbitros) | Recuperados desde las fichas guardadas: ~8.300 partidos, ya terminado. | Hecho. |

### 1.3 Falta y depende de ti (DeepSeek), en el orden de §2

1. Desplegar el código de `scripts/` al servidor (pendiente desde el 22/10).
2. Canal de avisos al móvil (nadie recibe los avisos del vigía ni del monitor del servidor).
3. Plataforma: migraciones 0023-0042 y proyección (lo de la otra sesión; `PLAN-DEEPSEEK.md` fases A/B).
4. **Reimportar al canónico** Cataluña (y Madrid/Valencia 2026-27) cuando terminen las relecturas.
5. Historia de Cataluña (`descubrir`): la cola sólo tiene 2025-26 y 2026-27.
6. Revisiones periódicas (§4) y anotar lo que salga.

### 1.4 No es un fallo nuestro (comprobado en la web o en el HTML guardado; NO perseguir)

Lista completa en §5. En corto:

- **Castilla y León:** 2012-13 sin resultados; 2016-17 y 2018-19 sin tarjetas; benjamines de 2019-20 sin alineaciones.
- **Valencia 2024-25:** la propia web devuelve `partidos: []`.
- **Navarra:** Fútbol 8 y Juegos Deportivos 2015-20 vienen vacíos.
- **Euskadi:** sin cambios de 2016-17 a 2022-23; Araba antigua, igual.
- **Extremadura y Murcia:** sólo ~4 de cada 10 jugadores con código.
- **Galicia y Extremadura base:** casi sin cambios ni tarjetas.
- **Cataluña:**
  - las nacionales (DH Juvenil, Primera/Segunda Federación) siempre vacías;
  - algunas de menores de temporadas cerradas, vaciadas por la FCF;
  - el fútbol base sin cambios.

---

## 2. TAREAS PARA DEEPSEEK, en orden

> Para cada tarea: comando, resultado esperado y qué hacer si no sale. Pega siempre la salida en `ESTADO-DEEPSEEK.md`.
> Nada de esto se hace en paralelo. **Si algo no cuadra con lo esperado, PARA y apúntalo**: no improvises
> arreglos en los datos.

### T1. Comprobaciones de arranque (PC, 5 min, sólo lectura)

```powershell
cd F:\EspacioCodigo\facylf
node --check scripts\recolector-cataluna-datos.mjs
node --check scripts\recolector-valencia.mjs
node --check scripts\recolector-local.mjs
node --check scripts\vigia-colas.mjs
node --test scripts\lib
node scripts\lib\comprueba-extractor-cataluna.mjs
```

**Esperado:**
- `node --test scripts\lib`: **219 pruebas, 218 bien, 0 fallos** (la que falta es una prueba omitida a propósito).
- El comprobador del extractor termina con «sintaxis del extractor inyectado: OK».

**Si falla:** no despliegues nada. Pega el error y para.

### T2. Desplegar `scripts/` al servidor (pendiente desde el 22/10)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1
```

- **Qué lleva:** `recolector-local.mjs` con dos cosas:
  - `urlEnPortal`: la segunda barrera contra pedir a la web de otra federación;
  - `repasaJornadasVaciasEnCurso`: vuelve a pedir las jornadas de la temporada en curso leídas vacías o sin marcadores.
- **Lo demás no necesita despliegue:**
  - lo de Cataluña, Madrid y Valencia corre sólo en el PC;
  - el vigía va por el enlace.
- **Esperado:** las 4 huellas OK.
- **Después:** en la siguiente sesión de cada recolector del servidor no debe haber peticiones a otro portal. El vigía lo vigila: aviso **crítico** `portal_ajeno` si pasa.

### T3. Canal de avisos al móvil

- Hoy **nadie** recibe los avisos.
  - El vigía los deja en `estado/vigia/alertas.log`.
  - El monitor del servidor avisa a `http://host.docker.internal:8085/facylf`, pero el contenedor `ntfy` está **parado desde finales de septiembre**.
- **Opción A (recomendada): Telegram.**
  - Variables `ALERTAS_TELEGRAM_TOKEN` y `ALERTAS_TELEGRAM_CHAT` en el entorno de la tarea «FACyLF enlace Claude» del PC.
  - El bot y el chat los crea David.
- **Opción B: ntfy.**
  - Levantar de nuevo el contenedor `ntfy` en el servidor.
  - Poner `ALERTAS_NTFY_URL` en el PC.
- **Comprobación:** forzar un aviso de prueba (`node scripts/vigia-colas.mjs --federacion cataluna` no cambia estados) o esperar al primero real. Debe llegar al móvil.

### T4. Plataforma (otra sesión de Claude)

- Sigue `PLAN-DEEPSEEK.md` (fases A/B):
  - aplicar las migraciones 0023-0042 en el canónico;
  - proyectar con `pnpm lectura:proyectar`, una federación cada vez y de noche.
- Detalle en el bloque «22/10, 21:30» de `ESTADO-DEEPSEEK.md`.
- **Hazla antes de T5:** las reimportaciones de T5 se proyectan después.

### T5. Reimportar al canónico lo que ha cambiado en las colas

**Por qué.** Las colas se han corregido, pero el canónico (PostgreSQL del PC, puerto 5433) tiene la versión vieja:

- **Cataluña:**
  - actas sin tarjetas, cambios ni códigos;
  - 1.750 actas vacías que eran partidos aún sin jugar;
  - partidos sin hora, campo ni árbitro;
  - actas de descansos.
- **Madrid y Valencia 2026-27:**
  - 65 actas leídas abiertas, que ahora se releen cerradas;
  - partidos suspendidos que figuraban como 0-0 en el acta.

**Cuándo:**
- **Cataluña 2026-27:** cuando terminen sus relecturas (~2 días desde el 22/10 a las 21:49).
  - Señal: el registro del worker deja de mostrar actas de 2026-27 releídas (`acta|22|…` con «con código»).
  - O consulta en la cola:
    ```sql
    select count(*) from trabajos where ultimo_error like 'relectura:%' and temporada='22' and estado in ('pendiente','bloqueado')
    ```
    Tiene que dar ~0.
- **Cataluña 2025-26:** cuando acabe su carril (semanas). Se puede reimportar antes y repetir: es idempotente.

**Cómo** (en el PC, un comando cada vez, preferiblemente de noche):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion cataluna -Temporada 2026-27
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion madrid -Temporada 2026-27
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion valencia -Temporada 2026-27
# y más adelante:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion cataluna -Temporada 2025-26
```

**Comprobado por Claude en el importador** (`packages/canonico/src/lote.ts`):

- los eventos se reescriben por (partido, orden);
- desde el 13/10, las apariciones que el lote no confirma se retiran;
- así que el jugador «sin código» viejo **no queda duplicado** junto al nuevo «con código»: queda como persona sin apariciones.

**No uses `scripts/importar-masivo.mjs` para esto:** da cada grupo por «hecho» para siempre (`estado/importacion.json`) y no lo volvería a importar.

**Esperado:**
- Las fichas de jugador de Cataluña pasan a tener tarjetas, cambios y minutos en las competiciones que los apuntan.
- `analytics.edicion_capacidad` (0032) cambia sola: Cataluña deja de salir como «sin cambios / sin tarjetas».

**Para comprobarlo:**
```sql
select f.code, count(*) filter (where e.event_type in ('amarilla','roja','doble-amarilla')) tarjetas,
       count(*) filter (where e.event_type in ('sale','entra')) cambios
from core.match_event e join core.match m on m.id=e.match_id …
```
(Usa la consulta de `analytics.federacion_capacidad` si ya está proyectado.)

**Ojo, posible efecto a vigilar:** quedarán personas «nominales» de Cataluña sin apariciones (las del lote viejo). No molestan en las fichas, pero sí pueden salir en el buscador. Si salen, apúntalo para Claude (limpieza de personas huérfanas, migración nueva).

### T6. Historia de Cataluña (pendiente desde el 16/10)

- **Por qué:** la cola de Cataluña sólo tiene 2025-26 y 2026-27.
- **Comando** (en el PC, de día, repetido hasta que no descubra más):
  ```powershell
  node scripts\recolector-cataluna.mjs descubrir --max 400
  ```
- **Esperado:** temporadas hacia atrás, hasta 2015-16 o hasta donde llegue la web.
- **Ojo:**
  - la FCF vacía los datos de **menores** en temporadas cerradas (no siempre: el 22/10, un acta de menores de 2025-26 aún tenía sus 41 nombres), y las nacionales siempre salen vacías;
  - `cierraCompeticionesSinDatosCataluna` cierra solas las competiciones que sólo dan fichas vacías (≥20 vacías y ninguna con datos). Es lo esperado, no un fallo.
- **Coste:** muchas semanas de recolector. Si David prefiere priorizar otras federaciones, no lo lances.

### T7. Tareas viejas que siguen abiertas (comprueba su estado; no sé si se hicieron)

- **Rioja 2015-16:** reimportar.
  ```powershell
  scripts\claude\trae-federacion-servidor.ps1 -Federacion rioja -Temporadas 2015-16
  ```
  El déficit tiene que quedar en 0-1 partidos.
- **Euskadi:** `reprocesa-euskadi.sh --estado` en el servidor, hasta «== FIN». Si la guardia de energía llegó a E4, lo cortó: relánzalo.
- **Servidor:** reinstalar la guardia de energía la próxima vez que se toque.
  ```bash
  instala-guardia-energia.sh --aplicar --carga-completa
  ```
  La instalada no es exactamente la del repositorio.
- **Euskadi 2022-23:** falta 1 partido en el canónico, sin explicar (para Claude).

---

## 3. Lo que se ha hecho del 21 al 23/10 (por qué y dónde)

### 3.1 21/10 — Revisión de completitud de todas las colas

- **Herramienta:** `scripts/claude/completitud-colas.mjs`. Por temporada mide:
  - jornadas jugadas sin partidos;
  - jornadas «hechas» vacías;
  - actas que faltan.
- **Fallo encontrado: las URL de CyL en las demás federaciones.**
  - `ingesta-fin-de-semana.mjs` construía las URL con el perfil de CyL.
  - Arreglado en el origen (perfil por federación) y reparado por DeepSeek con `repara-urls-otra-federacion.mjs` / `scripts/servidor/repara-urls.sh`.
  - Comprobado: 0 restantes.
- **Cataluña: el calendario incompleto.**
  - La web (Next.js) sólo trae la última jornada abierta.
  - Ahora se lee de las props de React (`voltes → jornadas → matches`), con comprobación `calendarioIncompleto` y sin borrar lo guardado cuando una jornada viene vacía.
  - Error de esa misma tarde: las expresiones regulares dentro de la plantilla de texto llevaban una sola barra, así que `\d` se convertía en `d`, y 187 calendarios se guardaron sin fecha. Corregido (hay que doblarla: `\\d`).
- **Lo que no era nuestro:**
  - CyL 2012-13;
  - Valencia 2024-25;
  - Navarra 2015-20;
  - las nacionales de Castilla-La Mancha y Rioja, pintadas como «Descansa».

### 3.2 22/10 — Vigía de colas (observabilidad)

- **Dónde está:**
  - `scripts/vigia-colas.mjs`: mide;
  - `scripts/lib/vigia-colas.mjs`: reglas puras, con pruebas en `vigia-colas.test.mjs`;
  - guía: `VIGIA-COLAS.md`.
- **Cuándo corre:** desde el enlace, cada 10 min en el PC y cada ≤25 min en el servidor (por entrada estándar al contenedor monitor, sin desplegar nada).
- **Avisos que da:**
  - `portal_ajeno` (crítico);
  - `bloqueo`;
  - `parada` (PC 90 min, servidor 10 h);
  - `errores`;
  - `lecturas_vacias`;
  - `sin_actas`;
  - `calendarios_incompletos`;
  - `calidad_actas`;
  - `riqueza_actas` (nueva: cae la parte de actas con tarjetas, cambios o códigos frente a su semana);
  - `sin_publicar_salto`;
  - `resultados_atrasados`;
  - `ritmo_bajo`;
  - disco y memoria.
- **Mejoras del 22-23/10 contra falsas alarmas:**
  - `calidad_actas` y `riqueza_actas` piden que la caída se vea en **al menos dos competiciones**: una sola es la fuente y sale como información (`calidad_una_competicion`);
  - `lecturas_vacias` ya no cuenta las jornadas que un calendario PNFG apunta sin sus partidos.

### 3.3 22/10 — Cataluña: actas completas (`scripts/recolector-cataluna-datos.mjs`, `scripts/lib/acta-cataluna.mjs`)

1. **Tarjetas, cambios y códigos.**
   - La FCF los pinta como iconos en la fila de cada jugador: amarilla `#FFEB3B`, roja `#F30000`, sale = flecha roja `M4 12H20`, entra = flecha azul `M20 12H4`, gol = balón.
   - El código, el capitán y el portero salen de la prop `player` de React.
   - Un icono desconocido se guarda con su «firma» en el JSON y sale en el log como «ICONOS DESCONOCIDOS». Hasta hoy: 0.
2. **Partidos sin jugar.**
   - La ficha dice «Pendent» y el calendario trae la fecha y hora propias de cada partido (prop `status`).
   - `decideActaSinJugar` aplaza el acta al día siguiente del partido (petición `resultado='sin_jugar'`, que no cuenta como error).
   - Tope: 21 días.
   - Las 1.750 leídas antes de tiempo se devolvieron a la cola.
3. **Descansos.** El equipo que libra tiene código de acta. Ya no se encolan, y 3.906 se retiraron de la cola (reversible: `cancelado` con su motivo).
4. **Releer un calendario borraba hora, campo y árbitros.** Ahora se reponen al releer, y lo perdido se recuperó de las fichas en disco.
5. **Basura como dato:** «SENSE ÀRBITRES ASSIGNATS» y el campo «E» (3.645 partidos) se vaciaron.
6. **Fútbol 7/8/sala «a revisar»** por no tener 22 titulares: corregidas 12.434 actas (`evaluaCalidad` acepta 5/7/8/9/11 por lado).
7. **Relectura de lo ya bajado** (`reencolaActasSinIconos`).
   - Se hace una sola vez, con la marca `actas_sin_iconos_reencoladas_en` en `metadatos`.
   - Una relectura que llega **sin** alineaciones **no** borra las guardadas («se conserva lo guardado»).
   - Hay un carril `CARRIL_RELECTURA` (+500.000.000 de prioridad) que el reordenado respeta.

### 3.4 22-23/10 — Madrid y Valencia (`scripts/recolector-valencia.mjs`, `scripts/lib/acta-abierta.mjs`)

- **Acta abierta.**
  - La ficha iSquad trae `acta_cerrada` y `partido_en_juego`.
  - Con el acta abierta en la temporada en curso no se da por hecha: vuelve en 6 h si el partido está en juego y al día siguiente si no. Tope: 3 semanas.
  - `reabreActasLeidasAbiertas` reabrió 64 en Madrid y 1 en Valencia.
- **Partido suspendido** (`suspendido: 1`).
  - Antes se guardaba como acta 0-0 sin jugadores.
  - Ahora: marcador nulo, incidencia `partido_suspendido` y calidad «administrativa».
  - `recalificaSuspendidas` corrige las ya guardadas una vez, desde su JSON.
  - Nota: el calendario ya los dejaba sin resultado, así que el canónico no tenía el 0-0 como resultado, pero el acta sí.

### 3.5 23/10 — Las 8 federaciones del servidor y la prueba del crudo

- **Medidas con `matriz-datos.mjs`** (peticiones 201-204, sólo lectura): Aragón, Asturias, Baleares, Cantabria, Castilla-La Mancha, Extremadura, Galicia y Murcia, temporada 2024-25. Ya están en `COBERTURA-FEDERACIONES.md` §2.
- **Herramienta nueva `scripts/claude/crudo-vs-cola.mjs`.** Compara el HTML guardado con la cola en una muestra de 40 actas: códigos de jugador, tarjetas y cambios.
  - Resultado en 14 casos (petición 205): **la cola tiene exactamente lo que trae la web**.
  - Única diferencia: Murcia, 2 códigos de cada 1.000 (filas repetidas; sin importancia).

---

## 4. Revisiones periódicas (cómo saber si «va bien»)

> Lección de estas semanas: **«pide sin errores» no es «va bien»**. Tres fallos graves pasaron días sin ningún error:
> - las URL de CyL en las demás federaciones;
> - los calendarios incompletos de Cataluña;
> - las tarjetas de Cataluña.
>
> Hay que mirar tres cosas además de los errores: **qué parte de lo leído viene vacía, si lo leído deja actas y si
> las actas traen lo que la web publica.**

| Cada | Qué mirar | Cómo | Qué es normal | Si no lo es |
|---|---|---|---|---|
| Cada día | `estado/claude/vigia.txt` | leer | «todo en orden» o avisos ya explicados en §5 | Un aviso nuevo: mira la federación con `jornadas-vacias.mjs` o `crudo-vs-cola.mjs` antes de tocar nada. `portal_ajeno` o `bloqueo` son críticos: para esa federación y avisa. |
| Cada día | Registro del worker de Cataluña (`descargas-cataluna/recolector-local/worker-programado.log`) | `Select-String "ICONOS DESCONOCIDOS\|se conserva lo guardado\|✗"` | 0 «ICONOS DESCONOCIDOS». «Se conserva lo guardado» sólo en relecturas de menores de 2025-26. | Muchos «ICONOS DESCONOCIDOS»: la FCF ha cambiado la ficha. Copia una «firma» del JSON del acta para Claude. |
| Cada semana | Riqueza por federación | `node scripts\claude\riqueza-actas.mjs --todas --solo andalucia,araba,bizkaia,cataluna,federacion,gipuzkoa,laspalmas,madrid,tenerife,valencia` (PC) y la versión `.sh` en el monitor del servidor (petición 196 como modelo) | Cifras parecidas a `COBERTURA-FEDERACIONES.md` §2 | Una caída fuerte en una federación: `crudo-vs-cola.mjs` para ver si es la web o el lector. |
| Cada semana | Completitud | `node scripts\claude\completitud-colas.mjs <fed>` | `jVaciaHecha` bajo en la temporada en curso | Subidas: mira URL (`portal_ajeno`) y calendarios. |
| Si dudas de un hueco | Crudo frente a cola | `node scripts\claude\crudo-vs-cola.mjs <cola> --etiqueta 2024-25 --muestra 40` (en el servidor: dentro del monitor, como la petición 205) | `crudo == cola` | `crudo > cola`: fallo del lector. Apunta los códigos de acta que da y pásalo a Claude. |

---

## 5. Lo que es de la FUENTE (comprobado; NO perseguir)

| Federación | Lo que falta | Cómo se comprobó |
|---|---|---|
| CyL 2012-13 | resultados de 1.412 jornadas | La web los muestra vacíos (abierta a mano). |
| CyL 2016-17 y 2018-19 | tarjetas (0 %) | HTML guardado: 0 secciones de tarjetas en 80 actas (petición 205). |
| CyL benjamines 2019-20 | alineaciones (957 de 1.091 vacías) | 2.ª División Provincial de Benjamines: la FCyLF las publica sin alineación. |
| Valencia 2024-25 | toda la temporada | La API de la FFCV devuelve `partidos: []`. |
| Navarra 2015-20 | Fútbol 8 y Juegos Deportivos (~9.600 jornadas) | Vacías en el portal correcto. |
| Euskadi 2016-17 a 2022-23 y Araba 2011-14 | cambios | Sin sección «Sustituciones» en el HTML (petición 205 y prueba local). |
| Extremadura y Murcia | código de ~6 de cada 10 jugadores | El HTML sólo enlaza a ~4 de cada 10 (Extremadura 2024-25: 477 enlaces para 1.022 filas). |
| Galicia (9 %/23 %) y Extremadura (24 %/39 %) | cambios y tarjetas en base | El HTML no los trae; los que trae se leen todos. |
| Cataluña: DH Juvenil, Primera/Segunda Federación | todo (nacionales) | Siempre vacías en la FCF. |
| Cataluña: algunas de menores de temporadas cerradas | alineaciones | La FCF las vacía con el tiempo (no todas). |
| Cataluña: fútbol base | cambios | La ficha no los pinta. |
| Castilla-La Mancha y Rioja: ligas nacionales | partidos | Pintadas con «Descansa». |
| Canarias 2024-25, Araba, Las Palmas, Tenerife | minuto del gol (0-45 %) | Fuente (ver COBERTURA §2). |

---

## 6. Problemas posibles y riesgos que vigilar (lo que Claude no ha podido cerrar)

1. **Personas huérfanas en el canónico tras reimportar Cataluña (T5).** Las identidades nominales viejas quedan sin apariciones. Si salen en el buscador, hace falta una limpieza (migración nueva, para Claude).
2. **Rendimiento de la relectura de Cataluña.**
   - Hay ~33.000 actas más en la cola: «vencido» pasó de ~113.000 a ~145.000.
   - El carril de 2025-26 va detrás de todo; si en 3 semanas no ha empezado a moverse, es lo esperado, no un fallo.
   - Si David quiere ir más rápido: una plaza más para Cataluña (decisión suya).
3. **Valencia está descubriendo temporadas antiguas** (el 23/10 leía 2017-18): «vencido» pasó de ~60.000 a ~119.000. No es un fallo, pero alarga mucho su cola. Si no es lo que David quiere, revisa `temporadas-asignadas.txt` y el catálogo.
4. **Andalucía (322.000 vencido) y Galicia (170.000)** tardan meses al ritmo respetuoso. Decisión pendiente de David: pasar Galicia al PC cuando acaben las forales.
5. **Partidos aplazados.**
   - Cataluña los aplaza hasta 21 días tras la fecha del partido.
   - Un aplazado «sine die» con fecha vieja se acaba guardando vacío; si luego se juega, sólo se recoge cuando el calendario releído trae la fecha nueva (`reactivaActasLeidasAntesDeJugarse` lo vuelve a poner en cola).
   - Vigílalo si el vigía muestra `resultados_atrasados`.
6. **Madrid/Valencia: un acta que el árbitro nunca cierra** se reintenta 3 semanas y luego se guarda como esté.
7. **El servidor y la energía.** Guardia de energía activa: E0 normal, E4 para los recolectores salvo CyL, E5 apagado. Si el servidor se apaga: `ssh servidor "tail -20 /var/log/facylf-guardia.log"`. La solución de fondo es un cargador original más potente (David).
8. **El PC se suspende de noche.** Es normal; el vigía no avisa de «parada» hasta 30 min después de encender.
9. **Las peticiones del enlace se ejecutan en orden y de una en una.** Si una tarda mucho (p. ej. `matriz-datos` de una cola grande), las demás esperan. Usa siempre `nice -n 19` y `timeout` en el servidor.

---

## 7. Decisiones que son de David (no las tomes tú)

- Cargador del servidor.
- Carta a la FFCV para tener el permiso por escrito.
- Más plazas para Cataluña o pasar Galicia al PC.
- Si se recoge la historia de Cataluña (T6) y hasta qué temporada.
- Limpiar las personas huérfanas del canónico cuando aparezcan.

---

## 8. Herramientas (todas sólo leen, salvo las que piden `--aplicar`)

| Herramienta | Para qué |
|---|---|
| `scripts/vigia-colas.mjs` (+ `lib/vigia-colas.mjs`) | Salud de todas las colas; avisos. `--solo-medir`, `--federacion <f>`, `--sin-avisos`. |
| `scripts/claude/riqueza-actas.mjs` | % de actas con alineación, código, tarjetas, cambios y goles en las últimas N. `--todas --solo …`. |
| `scripts/claude/crudo-vs-cola.mjs` | HTML guardado frente a cola: ¿el hueco es la web o el lector? `--etiqueta 2024-25`. |
| `scripts/claude/matriz-datos.mjs` | Cobertura completa de una cola y temporada (lo de COBERTURA §2). |
| `scripts/claude/completitud-colas.mjs` | Jornadas jugadas sin partidos, actas que faltan, copias. |
| `scripts/claude/jornadas-vacias.mjs`, `cancelados-por-motivo.mjs` | Muestras para ver si una jornada vacía es de la web o nuestra. |
| `scripts/claude/salud-federaciones.mjs`, `estado-cyl.mjs` | Ritmo y pendiente por cola. |
| `scripts/claude/diagnostica-calendario-cataluna.mjs` | Diagnóstico del calendario de la FCF (`--solo-fecha`, `--solo-bloqueo`). |
| `scripts/claude/repara-urls-otra-federacion.mjs` (`--aplicar`) | Reparar URL de otro portal (ya usado; 0 restantes). |
| `scripts/importar-temporada.ps1` | Reimportar una temporada al canónico (idempotente). |

---

## 9. Dónde está cada cosa

- **Estado y tareas:** `docs/plataforma-web/ESTADO-DEEPSEEK.md` (lo de arriba es lo más nuevo). Este traspaso resume sus bloques del 21-23/10.
- **Cataluña por dentro:** `CATALUNA.md` («La ficha del acta por dentro»).
- **Vigía:** `docs/plataforma-web/VIGIA-COLAS.md`.
- **Qué datos tiene cada federación:** `docs/plataforma-web/COBERTURA-FEDERACIONES.md`.
- **Plataforma web:** `GOAL-CLAUDE-2026-10-22.md`, `PLAN-DEEPSEEK.md`.
- **Pendientes viejos del 22/10:** `PENDIENTE-DEEPSEEK-2026-10-22.md`, que cubre T2 y T3 de aquí.
- **En el proyecto de claude.ai:**
  - `claude/traspaso-deepseek-2026-10-23.md` (este documento);
  - `claude/cataluna-actas-2026-10-22.md`;
  - `claude/cobertura-federaciones-2026-10-22.md`.
