# Pasar facylf al servidor: plan de despliegue y monitorización

Documento de propuesta. **No se ha ejecutado nada de lo que hay aquí.** Todo lo que dice «medido» se midió el
21/09/2026 contra la máquina real (`ssh david@servidor.local`) y contra este PC.

Decisión de arquitectura que manda sobre el resto (dicha por el responsable del proyecto el 21/09/2026):

> **Los datos deben estar en el servidor. Lo único que se despliega es la web, y la web consulta al servidor.**

Traducido a piezas: la recolección, el canónico, el importador y su estado viven **sólo** en el servidor; no hay
copia de datos en ningún otro sitio; y la plataforma web es lo único que se construye y se publica como software,
leyendo del servidor con el rol de sólo lectura.

## 0 · ⚠ LO PRIMERO: EL DNS DEL SERVIDOR (medido el 21/09/2026)

El servidor tiene en `/etc/resolv.conf` los resolutores de **Tailscale** (`100.100.1.1`, `100.90.1.1`) pero
Tailscale tiene el DNS **desactivado** en esa máquina (`tailscale dns status` → *Tailscale DNS: disabled*), así
que no resuelve **nada**. Medido: el router de casa (192.168.1.1), 1.1.1.1 y 8.8.8.8 responden; los de Tailscale,
no. Lo que eso bloquea, comprobado uno a uno:

| qué | cómo se ve |
|---|---|
| Clonar de GitHub | `git fetch`: «no se pudo consultar el remoto (¿red?)» |
| El autodeploy de RadioPV | fallando desde el reinicio de las 14:24 del 21/09 (`journalctl -u autodeploy-todos`) |
| Descargar imágenes de Docker | `docker pull` no resuelve el registro |
| **La recolección** | **Melilla, ya en el servidor, pedía y fallaba con `net::ERR_NAME_NOT_RESOLVED`**: sin DNS no se puede abrir ni un portal |

Se arregla con dos comandos que necesitan `sudo` (están en `docker/servidor/primeros-pasos-sudo.sh`, que además
instala el tope de 10 GB):

```bash
ssh david@servidor.local 'sudo nohup bash /tmp/primeros-pasos-sudo.sh > /tmp/primeros-pasos.log 2>&1 &'
```

Mientras eso no se haga, la flota **sigue en el PC**: allí el DNS funciona y la recolección no se interrumpe.

## 1 · Qué hay hoy en el servidor (medido, sólo lectura)
| pieza | cómo está |
|---|---|
| sistema | **Debian 12 (bookworm)**, kernel 6.1, **4 núcleos** |
| memoria | **15 907 MB** totales, 1 251 MB usados, **14 656 MB disponibles**, 8 GB de intercambio |
| disco | `/dev/sda3`, **211 GB con 191 GB libres** (19 GB usados) |
| docker | Compose **v5.5.1**; 15 imágenes (4,16 GB), 13 contenedores, 11,27 GB de caché de construcción |
| carga | `load average` 0,16 · la API de RadioPV marcaba 100 % de un núcleo durante la medición |
| datos | `/srv/data` (backups, cifrado, documents, downloads, media, photos) |
| pilas | `/opt/stacks/{agente,home,media,radiopv,wol}` — **no existe `/srv/facylf` ni `/opt/stacks/facylf`** |
| despliegue | `autodeploy-todos.timer` **cada 5 min**: recorre `/opt/stacks/*`, `git fetch`, y si hay commits nuevos hace `git pull` + (según rutas) reconstruye imágenes + `docker compose up -d`. Avisa por **ntfy** si queda a medias |
| monitorización ya instalada | **Uptime-Kuma** (3001), **ntfy** (8085), **Portainer** (9443), **Homepage** (3000), Navidrome (4533), Cockpit (9090), más `vigilante` y `lanzador-agente` |
| red | Tailscale: servidor `100.117.58.93`, PC `100.110.114.10`. **Caudal medido PC↔servidor: 1,6 MB/s (~13 Mbps)** |
| sudo | `david` está en `sudo` y en `docker`, pero **`sudo` pide contraseña**: lo que necesite root lo tiene que ejecutar el responsable (o darme la contraseña, cosa que no recomiendo) |

Consecuencia directa: **el servidor tiene sitio de sobra** para las ingestas (14,6 GB libres, 191 GB de disco) y ya
tiene la mitad de la monitorización montada. Lo que hay que traer es lo nuestro, sin tocar RadioPV.

## 2 · La forma del despliegue

```
                    ┌──────────────────────── SERVIDOR (Debian 12 · 16 GB · 4 núcleos) ────────────────────────┐
                    │                                                                                     │
  git push ────────►│  /opt/stacks/facylf  (repositorio)                                                  │
  (GitHub)          │     └── descargas-<fed>/            ← LAS COLAS: la única copia que existe          │
                    │                                                                                     │
                    │  facylf.slice  ── MemoryMax=10G, MemorySwapMax=0  (tope duro del proyecto)          │
                    │     ├── 19 recolectores (Docker)  ← recolección                                        │
                    │     ├── facylf-postgres           ← canónico (fuente de verdad para la web)          │
                    │     ├── facylf-importador         ← SQLite → PostgreSQL (por lotes, reanudable)      │
                    │     ├── facylf-monitor            ← snapshot + latido + avisos                        │
                    │     └── facylf-web                ← LO ÚNICO QUE SE DESPLIEGA (lee con facylf_lector)│
                    └─────────────────────────────────────────────────────────────────────────────────────┘
                                          ▲                                        ▲
                                          │ Tailscale (privado, nunca Internet)     │ Uptime-Kuma · ntfy · Homepage
                                          └──────────── PC / móvil ─────────────────┘
```

Todo lo de facylf cuelga de **una sola rebanada de systemd** (`facylf.slice`), así que el techo de 10 GB se cumple
para el conjunto y no por casualidad. La web no tiene base de datos propia: **pregunta al servidor**.

## 3 · El tope de 10 GB

El repo ya trae el fichero (`docker/servidor/facylf-slice.conf`) y su runbook (`docker/servidor/LEEME.md`). Lo que
falta es **instalarlo, y eso necesita `sudo`** (lo tiene que hacer el responsable):

```bash
sudo mkdir -p /etc/systemd/system/facylf.slice.d
sudo cp /opt/stacks/facylf/docker/servidor/facylf-slice.conf /etc/systemd/system/facylf.slice.d/limite.conf
sudo systemctl daemon-reload
systemctl show facylf.slice -p MemoryMax      # debe decir MemoryMax=10737418240
```

### Reparto del presupuesto de 10 GB (propuesta, medida contra lo que ya sabemos)

| pieza | tope propio | gasto esperado | notas |
|---|---|---|---|
| 19 recolectores | `mem_limit: 1600m` cada uno | **6,0-7,5 GB** | `FACYLF_MEMORIA_GB=8` → **8 plazas** de navegador (medido: 480-630 MB por navegador; ~70-90 MB por worker sin navegador) |
| `facylf-postgres` | `mem_limit: 2g` | 1,2-1,8 GB | `shared_buffers=1GB` ya configurado; **`oom_score_adj: -500`** para que el kernel no se lo lleve por delante cuando la rebanada apriete |
| `facylf-web` | `mem_limit: 1g` | 300-500 MB | Next.js en modo standalone |
| `facylf-importador` | `mem_limit: 1g` | 100-600 MB | sólo cuando corre; `cpu_shares` bajo para no robarle CPU a la recolección |
| `facylf-monitor` | `mem_limit: 256m` | 60-100 MB | Node midiendo cada minuto |
| holgura | — | ~0,5-1 GB | para picos y para no rozar `MemoryHigh=9G` |

**Por qué 8 plazas y no 11**: el LEEME dice 11 plazas con `FACYLF_MEMORIA_GB=10`, pero eso deja fuera de la cuenta a
PostgreSQL y a la web, que **también viven dentro de los mismos 10 GB**. Con 8 plazas el presupuesto cuadra con
holgura; si al medir sobra memoria, se sube a 9 (10 plazas) tocando **una línea** de `docker/.env`.

**Puerta de aceptación obligatoria antes de dar por bueno el tope**: correr en el servidor la prueba que ya existe
(`scripts/prueba-tope-10gb-docker.mjs`), que crea la rebanada, mete lastre y comprueba que el pico se queda en
10,00 GB, que el kernel sólo mata al lastre y que los recolectores siguen pidiendo. Ya funcionó en el PC; en el
servidor hay que repetirla porque el kernel y el disco no son los mismos.

**CPU**: 4 núcleos para 19 recolectores + importador + la API de RadioPV (que ya usa un núcleo entero a ratos). El
compose ya limita cada recolector con `cpus: ${FACYLF_CPUS_POR_RECOLECTOR:-0.5}`; la importación masiva se lanza
con prioridad baja (`nice`/`cpu_shares`) y **de noche** en tandas, para no competir con la recolección.

## 4 · Qué se copia, cuánto pesa y cuánto tarda

Medido en este PC (`descargas-*`): **34,88 GB en 957 331 ficheros**.

| qué | peso | ¿se copia? | por qué |
|---|---|---|---|
| **colas SQLite** (19 × `cola-v2.sqlite`) | **6,56 GB** | **sí, lo primero** | es el estado del trabajo; sin ellas el servidor volvería a pedir 375 213 actas ya hechas |
| catálogos y JSON por federación (`grupos-por-temporada.json`, `competiciones-…`, informes) | ~1,2 GB | sí | el descubrimiento hecho es trabajo irrecuperable |
| **HTML archivado comprimido** (`.gz`) | **21,14 GB** | sí, **en segundo plano** | es la evidencia y hace falta para importar la clasificación **oficial**; no bloquea arrancar |
| perfiles de Chrome (`perfil-chrome`, dentro de cada `descargas-*`) | ~3-4 GB (`.tflite`, `.wasm`, cachés) | **no** | se regeneran solos; copiarlos sería mover basura y resetear el perfil es aceptar una vez el aviso de cookies |
| `descargas-federacion-sondeo` | 1,56 GB | no | es material de sondeo |
| `pruebas/` | — | no | informes de este PC (el LEEME ya lo dice) |
| `node_modules`, `.estado-workers` | — | no | se instala dentro de la imagen; las plazas son de cada máquina |

**A 1,6 MB/s** (medido): 6,56 GB de colas ≈ **1 h 10 min**; los catálogos, minutos; los 21 GB de archivo ≈ **3 h 40 min** en segundo plano con `rsync` reanudable. No se copia nada en caliente sin parar la recolección del PC
(ver §8).

**El canónico no se copia: se vuelca.** Y ojo con lo que hay: **la base canónica está VACÍA** (35 tablas, 0 filas;
los cinco grupos importados en septiembre se perdieron, casi seguro al ejecutar una prueba con `down -v`, ya
corregida). Así que no hay nada que restaurar: el servidor empieza su canónico desde cero y la plataforma se
llenará con la **importación masiva** (§6).

## 5 · Cómo se despliega (y el problema del repositorio público)

### El problema que hay que resolver ANTES de tocar el servidor

El repositorio `github.com/ErDeivih/facylf` es **PÚBLICO** y está **vacío** (no tiene ni un commit subido: el
trabajo de este PC nunca se ha publicado). Publicar el proyecto tal cual no es aceptable: hay documentación de
operación, informes con datos y el invariante del proyecto prohíbe abrir datos a Internet sin decisión expresa y
revisión de `SEGURIDAD-OPERACION.md`.

**Dos caminos, y hace falta elegir uno:**

| camino | cómo | ventaja | inconveniente |
|---|---|---|---|
| **A (recomendado)** | Poner el repo en **privado** y subir el trabajo en commits por temas | despliegue por `git push` como RadioPV, historial auditable, `git pull` en el servidor, vuelta atrás por commit | hay que revisar antes qué ficheros se suben (informes, muestras) |
| B | **rsync** del árbol de trabajo (sin `descargas-*`, sin `node_modules`) | no depende de GitHub | sin historial ni vuelta atrás por commit; cada actualización es una copia a mano |

### Dónde vive y cómo se actualiza

- **Repositorio en `/opt/stacks/facylf`** (la convención del servidor, al lado de `radiopv`), con las colas dentro
  (`/opt/stacks/facylf/descargas-<fed>/`) porque el compose las monta como `../descargas-<fed>`.
- **Un `docker-compose.yml` en la raíz** que reúne las tres piezas con `include:` (compose v5 los admite):
  `docker/compose.yml` (los 19 recolectores + fin de semana), `infra/docker-compose.yml` (PostgreSQL) y los nuevos
  `docker/web.yml` y `docker/monitor.yml`. Así **un solo `docker compose up -d`** levanta todo.
- **Actualización**: `autodeploy-todos` sólo reconstruye imágenes para rutas de RadioPV (`backend/`, `frontend/`,
  `radiov/`), así que para facylf **no sirve tal cual**. Propuesta: un `facylf-deploy.timer` propio (cada 5 min,
  mismo estilo) que hace `git fetch` → si cambió algo de `docker/`, `scripts/`, `package.json` o `pnpm-lock.yaml`
  reconstruye la imagen de los recolectores → `docker compose up -d` → y avisa por ntfy si algo falla. **No se toca
  el script de RadioPV** (es compartido y su copia buena está en su repo).
- **La imagen** (`facylf-recolectores:local`, 2,13 GB) se construye **en el servidor**: `docker build -f docker/Dockerfile -t facylf-recolectores:local .`
- **Variables**: `docker/.env` creado una vez en el servidor a partir de `docker/.env.ejemplo` (no se sube).

## 6 · La web (lo único que se despliega) y la importación masiva

### La web

Hoy `apps/web` es Next.js 15 que lee del canónico con `DATABASE_URL_LECTOR` y **exige el rol `facylf_lector`**
(rechaza cualquier cadena con permiso de escritura). Falta lo mínimo para desplegarla:

1. **`apps/web/Dockerfile`** (no existe): construcción multi-etapa del monorepo pnpm (instalar → `next build` →
   `output: 'standalone'` → imagen final con Node y sólo lo necesario). Se compila **dentro** del contenedor, así
   que en el servidor no hace falta Node instalado (igual que hace la web de RadioPV).
2. **Rol de lectura**: `facylf_lector` ya lo crean las migraciones (`0001`), en el servidor nace con la base.
3. **Dónde se sirve** (decisión abierta, con recomendación):
   - **(A) recomendada**: contenedor en el mismo servidor, escuchando sólo en `127.0.0.1:3100`, publicado al móvil
     y al PC con **`tailscale serve`** (HTTPS dentro de la tailnet). Cumple `SEGURIDAD-OPERACION.md`: instancia
     privada, sin Internet, sin exponer la base.
   - (B) en Vercel (era la idea de los últimos commits) apuntando por TLS a la base del servidor: **no la
     recomiendo** para la primera puesta en marcha — saca de la red privada datos personales y de menores, y
     obliga a exponer PostgreSQL a Internet o a montar un túnel permanente. Si algún día se quiere, primero la
     revisión de finalidad/legitimación y autenticación real que pide ese documento.
4. **Qué enseñará al principio**: nada, porque el canónico está vacío. La web funciona desde el primer día, pero
   las pantallas se irán llenando conforme avance la importación (por eso el orden de §7 importa).

### ⚠ Lo que se encontró al mirar la web desplegada (21/09/2026): la portada no lee el canónico

La web está en pie y **la vía canónica funciona**: `/canonico` enseña, leído con el rol de sólo lectura, lo que
hay en PostgreSQL —medido con la importación recién arrancada: 6 federaciones, 21 ediciones, 28 grupos,
**522 partidos, 492 actas**, 17 354 participaciones, 13 199 eventos y 12 032 personas—.

Pero **la portada, `/federaciones` y `/competiciones` siguen leyendo el repositorio local** (`src/lib/repositorio-local.ts`,
`datos.ts`, `competiciones.ts`: las SQLite y los XLSX de `descargas-*`), y dentro del contenedor de la web esas
carpetas no están montadas. Por eso la portada dice «18 federaciones · **0 competiciones · 0 partidos · 0 actas**»
mientras el canónico ya tiene cientos de partidos. En el PC pasaba lo mismo (decía 0 con 9 148 partidos
importados): **no es un fallo del despliegue, es que esas pantallas todavía no se han pasado al canónico**.

Queda por tanto una tarea de producto, no de infraestructura: **llevar las páginas a la capa canónica**
(`src/consultas/*`, que ya existe y ya se usa en `/canonico`). Tiene dos partes:

1. portada, federaciones, competiciones, partidos, equipos, jugadores y técnicos → consultas del canónico;
2. decidir qué hacer con lo que el repositorio local sabía y el canónico todavía no (por ejemplo, el
   descubrimiento: `competiciones`/`grupos` que existen en la cola pero aún no se han importado).

Mientras eso no se haga, la plataforma **enseña los datos en `/canonico`** pero no en las pantallas de consulta.


### La importación masiva (el trabajo grande de verdad)

Medido en las colas: **375 213 actas ya recogidas** repartidas en **29 539 calendarios/grupos** descubiertos
(59 078 trabajos de grupo/clasificación/calendario). La referencia de tiempo del importador es **~1-2 min por
grupo** (2 min 16 s con 342 partidos; 43 s con 240). Es decir: **días de CPU**, no minutos — 29,5 k grupos, con
2-4 grupos en paralelo, son del orden de **4-7 días** de máquina. Eso es exactamente lo que no cabía en el PC (su
propio informe lo dice) y lo que sí cabe aquí, porque el servidor tiene 191 GB de disco y 14,6 GB libres.

Propuesta:

- **Por lotes de grupo** (es la unidad del importador: un grupo = un lote = una transacción) y **reanudable**: se
  lleva la cuenta de lo importado en `ops.batch` (el diario ya existe) y el lanzador salta lo hecho.
- **Incremental, no de una vez**: primero las temporadas recientes y las federaciones con más actas (Valencia,
  Andalucía, Murcia, Castilla y León); lo viejo después.
- **Prioridad baja y por tandas**: `nice`, `cpu_shares` bajo y ventanas de noche, para no quitarle CPU a la
  recolección ni a RadioPV.
- **Incidencias que detienen el lote**: hoy hay **242 partidos donde el calendario y el acta no comparten ningún
  equipo** (Euskadi 167, Castilla y León 62, Aragón 5, CLM 3, Rioja 3, Ceuta 2). El importador **para el lote** al
  encontrarlos. Propuesta: el lanzador masivo **los aparta y los cuenta** (lista de grupos bloqueados con el
  motivo), sigue con el resto y **no los salta en silencio**; se revisan aparte.
- **El HTML archivado** hace falta para la clasificación **oficial**; por eso el `rsync` de los 21 GB va en segundo
  plano desde el primer día, aunque la importación empiece con la reconstruida.

### ⚠ Lo que se encontró al probar la importación de verdad (21/09/2026)

Antes de dar la carga masiva por lanzable se probaron unidades reales con `scripts/importar-masivo.mjs`. Resultado:
**todas las probadas fallan la validación del lote**, y el motivo es de datos, no del despliegue:

```
✗ La validación del lote 2454 ha fallado: actas analizadas 18≠9,
  participaciones 672≠331, eventos 522≠267, técnicos 163≠82
```

**Qué pasa exactamente** (medido en el grupo 22841470 de Navarra, 2026-27): la cola tiene **27 actas hechas pero
sólo 18 partidos**, y de esas 27 **9 no las cita ningún partido** (`partidos.codigo_acta` no las referencia; la
25449854, por ejemplo, no la cita nadie). El importador escribe las 18 que sí enlazan —no puede hacer otra cosa:
un informe de partido sin partido no existe— y la validación compara con las 27 del origen. Como el lote es
**una transacción entera**, se revierte y el grupo no entra.

Números medidos en las 19 colas: **377 131 actas hechas** y **81 521 partidos sin acta enlazada (9,4 %**, normal:
partidos todavía sin acta publicada). Lo que rompe la validación es lo contrario: actas **de más** cuyo `grupo` no
corresponde a ningún partido de ese grupo.

**Tres salidas, y hay que elegir** (ninguna se ha aplicado):

1. **Arreglar la cola** (lo correcto si las actas están mal etiquetadas de grupo): reasignar el `grupo` de esas
   actas a partir del partido que las cita —o del que debería—, de modo que los recuentos cuadren. Antes hay que
   entender **por qué** están en ese grupo: puede ser que el portal publique el acta del mismo partido en dos
   grupos (fase y grupo) y el recolector la guarde con el grupo de la competición en la que la encontró.
2. **Que el importador tolere las actas sin partido**: escribir las que enlazan y registrar la incidencia
   («N actas del grupo no corresponden a ningún partido») en el lote, sin fallarlo y sin callarlo. Es lo que el
   proyecto hace con todo lo que no entiende: **no se convierte en cero, se registra**.
3. **Apartar esos grupos** (lo que ya hace el lanzador): la carga masiva avanza con los que validan y deja
   listados los que no, con su motivo, en `estado/importacion.json`. Es lo que está pasando ahora mismo.

Mientras no se decida, la carga masiva **no puede empezar de verdad**: el lanzador apartará los grupos afectados y
seguirá, pero conviene saber qué proporción son (se medirá en la primera tanda, que lleva el contador de
apartados).

### ✅ RESUELTO (21/09/2026): la opción 2, con la incidencia contada y listada

Se aplicó la **opción 2**: el importador ahora compara el destino con **las actas que de verdad enlazan con un
partido** (`partidos.codigo_acta`) y las que no enlazan **no se importan pero se cuentan y se listan una por una**.
Medido con el mismo grupo que antes fallaba (Navarra 22841470):

```
✓ recuentos origen/destino: cuadran
✓ actas sin partido en el grupo: 9 acta(s) de la cola no las cita ningún partido del grupo
  filas rechazadas: 9
    · acta sin partido en el grupo: acta 25449854 J2
    · acta sin partido en el grupo: acta 25449855 J2   (…hasta la 25449862)
RESUMEN: 1 grupo(s) · 2656 filas insertadas · 9 rechazadas · validación correcta en 1/1
```

Nada se silencia: cada acta que no encaja queda en `ops.batch.validacion` y en la lista de rechazadas con su
motivo. Y la carga masiva ya avanza sola: `scripts/importar-masivo.mjs` importó dos unidades de Canarias
(1 136 + 565 filas) y el canónico creció de 9 148 a **9 175 partidos**, 7 310 a **7 337 informes** y 21 639 a
**22 167 personas**. Las 146 pruebas del paquete canónico siguen en verde.


### Corrección: el canónico NO está vacío

Una medición anterior de este documento (`pg_stat_user_tables.n_live_tup`, que estaba sin actualizar) hizo pensar
que el canónico no tenía datos. **No es así**: medido con `count(*)` el 21/09/2026, el canónico del PC tiene
**9 148 partidos, 7 310 informes de partido, 21 639 personas, 34 ediciones de competición y 270 lotes**. Los
agregados `analytics.*` **sí están vacíos** (el informe del importador lo dice: «el importador todavía no las
rellena»), pero la web no los usa: lee de `core.*` (`core.match`, `core.match_report`, `core.appearance`,
`core.match_event`, `core.person`…). Por eso la portada enseña «0 competiciones · 0 partidos» **de la temporada en
curso**: filtra por temporada y la 2026-27 todavía no tiene nada importado.


## 7 · Monitorización: qué se mide, dónde se ve y cuándo avisa

El objetivo que pediste es «ver todo lo que ocurre para poder depurar». Cuatro capas, la mitad ya existe en el
servidor:

### Capa 1 · Registros por federación (dentro)
- El `worker-programado.log` de cada federación, en **volumen montado** (no dentro del contenedor), con
  **rotación** (`logrotate` del host o `logging: json-file max-size=10m max-file=5` en el compose) para que no se
  coman el disco.
- Los mensajes del supervisor único (`registros/supervisor-flota.log`) con el mismo formato de siempre.

### Capa 2 · Herramientas del proyecto, en `cron` del host (ya escritas)
| guion | qué contesta |
|---|---|
| `vigilar-docker.mjs --informe` | memoria por contenedor, reinicios, plazas ocupadas, veces por encima del presupuesto |
| `vigilar-flota.mjs --informe` | ritmo por federación, navegadores huérfanos, federaciones atascadas |
| `ajustar-flota.mjs --aplicar` (cada 15 min) | **para** el contenedor de la federación que no tiene trabajo y **levanta** el que vuelve a tenerlo (menos memoria en marcha) |
| `ritmo-por-federacion.mjs` | configurado frente a medido: inicio→inicio, página, pet/min, errores, y **por qué no pide** |
| `auditar-capacidad.mjs` | foto completa de la capacidad |
| `prueba-tope-10gb-docker.mjs` | que el pico sigue dentro de 10 GB |

### Capa 3 · Lo que falta y propongo añadir: `facylf-monitor` (un contenedor pequeño)
Un único proceso que cada minuto escribe **`/estado/facylf.json`** (para mirar) y **`/estado/historial.jsonl`**
(para ver tendencias), con:
- memoria de la rebanada: `memory.current`, `memory.peak`, **`memory.events` (oom, oom_kill, high)** y por
  contenedor (`docker stats`), CPU y reinicios;
- por federación: trabajos hechos/pendientes, última petición, peticiones de la última hora, errores por tipo,
  plaza ocupada, sesión actual;
- importador: lotes hechos/fallidos, grupos bloqueados por incidencia, filas/hora;
- canónico: tamaño de la base, filas por tabla, último lote;
- disco, y **latido** para Uptime-Kuma.

Y sobre eso, **alertas a ntfy** (que ya está montado y ya se usa para el autodeploy) con umbrales explícitos:

| condición | aviso |
|---|---|
| `oom_kill > 0` en la rebanada | **crítico**: alguien se quedó sin memoria |
| federación con trabajo pendiente y **0 peticiones en 20 min** | alto: atascada |
| errores > 10 % en una federación durante 30 min | alto |
| `MemoryHigh` sostenido > 9 GB durante 15 min | medio |
| disco libre < 15 % | medio |
| PostgreSQL no responde o último lote falla | alto |
| el monitor no late (lo ve Uptime-Kuma) | alto |

### Capa 4 · Integración con lo que ya está en el servidor
- **Uptime-Kuma**: monitor *push* del latido del monitor (si la flota se para, avisa) + monitor HTTP de la web.
- **ntfy**: tema propio (`/facylf`) para no mezclar con `/alertas-servidor` de RadioPV.
- **Homepage**: una tarjeta con enlaces (web, Portainer, Kuma, `/estado/facylf.json`).
- **Portainer**: ya sirve para ver contenedores y logs a mano.

### Depurar una federación concreta (lo que se hace de verdad a las 3 de la mañana)
```bash
cd /opt/stacks/facylf
docker compose logs --tail 100 -f <federacion>          # su salida en vivo
tail -f descargas-<federacion>/recolector-local/worker-programado.log
docker compose exec <federacion> node scripts/recolector-local.mjs estado
docker compose exec <federacion> node scripts/_diag-plazas.mjs 10
sqlite3 descargas-<federacion>/recolector-local/cola-v2.sqlite "select estado, count(*) from trabajos group by 1"
node scripts/vigilar-flota.mjs --informe
```
Más un ayudante `scripts/servidor/facylf.sh` (`estado`, `cola <fed>`, `plazas`, `loguear <fed>`, `parar`,
`reanudar`, `importar`, `copiar-cola`) para no tener que recordar rutas.

### Copias de seguridad (sin ellas la monitorización no sirve de nada)
- Cada noche: `sqlite3 .backup` de cada cola (en caliente y coherente) + `pg_dump` del canónico, a
  `/srv/data/backups/facylf/`, con retención de 7 días y aviso por ntfy si falla. **El PC deja de ser la copia
  de seguridad** en cuanto el servidor arranque: hay que decidir si se conserva una copia fría en el PC.

## 8 · Traspaso sin duplicar la flota (y vuelta atrás)

Dos flotas sobre las mismas colas son trabajadores duplicados: la misma federación pedida dos veces. El orden
importa (es el del `LEEME.md`, §6):

1. **En el PC, parar la recolección** (no el resto): deshabilitar las 19 tareas de recolector y la de fin de
   semana; comprobar que no queda ningún `recolector-*.mjs` vivo. *El supervisor único que montamos hoy hace esto
   en un paso: parar la tarea `FACyLF flota` y comprobar que no quedan workers.*
2. **Copiar las colas** con la recolección parada (6,56 GB, ~1,2 h) y, en paralelo, arrancar el `rsync` del archivo
   comprimido.
3. **Arrancar en el servidor**: PostgreSQL → recolectores → monitor → web, con las puertas de verificación (§9).
4. **Comprobar que no hay dos**: en el servidor `_diag-plazas.mjs` debe decir las plazas del presupuesto y
   listar las federaciones del servidor; en el PC **cero** workers.
5. **Dejar el PC como respaldo**, con las tareas deshabilitadas. Vuelta atrás: `docker compose down` en el
   servidor y volver a habilitar las tareas del PC (las colas del PC siguen intactas hasta que se decida borrar).

### 8-bis · El estado final del PC: se para todo y se libera la memoria

Requisito del responsable del proyecto: **cuando el servidor esté configurado y verificado, en el PC no debe
seguir corriendo ningún proceso de facylf**, y esa memoria queda libre. Esto es exactamente lo que hay que apagar,
medido el 21/09/2026:

| qué se para en el PC | cómo | memoria que libera (residente, medido) |
|---|---|---|
| **supervisor único** (`FACyLF flota`) | `Stop-ScheduledTask 'FACyLF flota'` + `Disable-ScheduledTask` | 0,07 GB |
| **19 recolectores** (`node recolector-*.mjs`, hijos del supervisor) | se cierran con el supervisor | 0,84 GB |
| **navegadores Chrome de la flota** | se cierran al terminar su sesión (o al parar el supervisor) | **2,55 GB** |
| 19 tareas de recolector | ya están **Disabled** desde hoy; se quedan así | — |
| **4 descubridores** (`FACyLF catalogo baleares/cataluna/madrid/valencia`) | `Disable-ScheduledTask` | ~0,1 GB (y, sobre todo, **dejan de pedir a los portales**) |
| `FACyLF ingesta fin de semana` | `Disable-ScheduledTask` | la pasada de las 07:30 pasaría a hacerla el servidor |
| `FACyLF vigilar flota`, `FACyLF visor` | `Disable-ScheduledTask` | la vigilancia y el visor se mudan al servidor |
| `FACyLF-LimpiarChrome` | `Disable-ScheduledTask` | ya no hay navegadores de la flota que limpiar |
| contenedor `facylf-postgres` del PC | `docker compose -f infra/docker-compose.yml down` (con la base ya en el servidor) | ~0,40 GB |
| **Todo el proyecto** | — | **≈ 4,0 GB** |

Y hay una palanca más, que decide el responsable: **si en el PC no hace falta Docker para nada más, apagar Docker
Desktop libera además la máquina virtual de WSL (~2,3-3 GB)**. Comprobado: el único otro contenedor del PC es
`factucore-worker`, que **no depende de nuestro PostgreSQL** (su `DATABASE_URL` apunta a `database:5432/factucore`),
así que no se rompe nada nuestro al pararlo.

**Qué NO se toca en el PC**: el código y las colas (se quedan como copia fría en disco, sin gastar memoria), los
documentos, y nada del resto del equipo (ni el arnés del agente, ni los programas del usuario).

**Verificación de que el PC está limpio** (las tres tienen que dar cero y no basta con mirar las tareas):

```powershell
(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*recolector-*' -or $_.CommandLine -like '*supervisor-flota*' }).Count
(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*facylf*' }).Count
Get-ScheduledTask | Where-Object { $_.TaskName -like '*FACyLF*' -and $_.State -eq 'Ready' } | Measure-Object
```

**Vuelta atrás** (si el servidor falla y hay que volver al PC): habilitar las tareas
(`Get-ScheduledTask | Where-Object { $_.TaskName -like '*FACyLF*' } | Enable-ScheduledTask`), arrancar
`FACyLF flota`, y parar la flota del servidor (`docker compose down`) **antes** de que el PC lance nada. Las colas
del PC son las de antes del traspaso: lo que haya recogido el servidor en ese tiempo hay que traerlo de vuelta
(rsync inverso de `descargas-*`) para no perderlo.


## 9 · Orden de ejecución (para cuando des el visto bueno)

| fase | qué | puerta de verificación |
|---|---|---|
| 0 | **Decisiones y permisos**: repo privado (o rsync), contraseña de `sudo` para la rebanada, dónde se sirve la web | — |
| 1 | Subir el código a `/opt/stacks/facylf` y construir la imagen en el servidor | `docker build` sin errores; `node scripts/supervisor-flota.mjs --una-vuelta --federacion prueba-10gb` funciona |
| 2 | Instalar la rebanada de 10 GB y levantar PostgreSQL + la federación de prueba | `prueba-aceptacion-docker.mjs --federaciones prueba-10gb` en verde; `prueba-tope-10gb-docker.mjs` con pico ≤ 10 GB y **0 `oom_kill` fuera del lastre** |
| 3 | Parar el PC y copiar las colas; arrancar los 19 recolectores | `_diag-plazas.mjs` con las plazas del presupuesto; ritmo ≥ 98 % de lo configurado; 0 workers en el PC |
| 4 | Arrancar el monitor y las alertas | `facylf.json` actualizado cada minuto; un aviso de prueba en ntfy; monitor en Uptime-Kuma |
| 5 | Desplegar la web (sólo por tailnet) | la web responde y enseña «sin datos todavía» sin error; el rol lector rechaza escribir |
| 6 | Lanzar la importación masiva en tandas | lotes creciendo en `ops.batch`; grupos bloqueados listados; la web empieza a enseñar datos |
| 7 | Copias de seguridad y rotación de registros | un `pg_dump` y 19 `.backup` correctos; aviso si se fuerza un fallo |

## 10 · Riesgos y lo que no haré sin permiso

- **RadioPV**: no toco sus contenedores, sus volúmenes, su `.env`, ni su script de autodeploy. La rebanada de
  10 GB es de facylf; si el servidor aprieta, se ve en `facylf.json` y se baja el presupuesto.
- **La máquina del servidor**: nada de `reboot`, ni de tocar `sudo`, ni de publicar puertos a Internet; la web
  sale por Tailscale.
- **Los datos del PC**: no borro nada; las colas se copian, no se mueven, hasta que tú digas que el servidor manda.
- **El tope de 10 GB**: es un techo, no un objetivo; si al medir el pico se acerca a 9 GB con 8 plazas, bajo el
  presupuesto antes de subirlo.

## 11 · Decisiones que necesito de ti

1. **Repositorio**: ¿lo pongo en privado y subimos el trabajo por commits (recomendado), o desplegamos por rsync?
2. **`sudo` para la rebanada**: son cuatro comandos que tienes que ejecutar tú (o me das la contraseña, que no
   recomiendo).
3. **Dónde se sirve la web**: sólo tailnet (`tailscale serve`, recomendado) o también LAN.
4. **Importación masiva**: ¿la lanzo en cuanto el servidor esté en marcha (días de CPU, de noche y con prioridad
   baja) o prefieres ver primero una federación importada entera?
5. **El PC** (ya decidido por el responsable): cuando el servidor esté verificado, **no seguirá corriendo nada de
   facylf en el PC** — se para todo lo del cuadro de §8-bis y se queda como copia fría en disco. Lo único que
   queda por decidir aquí es si, además, se apaga **Docker Desktop** en el PC (libera otros 2,3-3 GB y no rompe
   nada de facylf; el único otro contenedor es de otro proyecto y no usa nuestra base).
6. **Los 242 partidos** que hoy detienen el lote: ¿los aparto y sigo con el resto (recomendado), o prefieres que la
   importación se pare hasta revisarlos?
