# Despliegue real de Fondo Popular

**Estado:** informe de preparación, 9 de noviembre de 2026. Lo firma el agente de despliegue (task-4 del
tablero). **No se ha tocado código, ni migraciones, ni contenedores, ni compose; no hay commits.** Todo lo
que dice «medido» se midió ese día contra el servidor real (`ssh servidor`), contra el PostgreSQL del
servidor y contra el PostgreSQL del PC, y cada medición lleva el comando con el que se hizo.

**Resumen en una frase:** la web de Fondo Popular está terminada en el repositorio, pero **lo que hay
publicado en el servidor es la web vieja del 24/09** («Observatorio de fútbol»), el canónico del servidor
está en la **migración 15 de 60** (le faltan 45) y no hay dominio ni HTTPS; por eso hoy un
aficionado no puede entrar a ver una jornada, ni siquiera por Tailscale, en las rutas nuevas.

---

## 0 · Resumen ejecutivo

| Pregunta | Respuesta medida |
|---|---|
| ¿La web de Fondo Popular está desplegada? | **No.** La imagen `facylf-web:local` es del **2026-09-24 11:58 UTC** y sirve la web vieja. Las 20 rutas nuevas probadas (`/explorar/...`, `/api/v1/...`, `/entrar`, `/admin`) devuelven **404**. |
| ¿Se llega desde Internet? | **No.** Escucha sólo en `100.117.58.93:3100` (IP de Tailscale). No hay proxy, ni TLS, ni DNS, ni `tailscale serve`/`funnel` configurado. |
| ¿El canónico del servidor sirve para la web nueva? | **Hoy no.** Está en la migración **0015 de 60**: no existen `app.*`, `analytics.nombre_corto_equipo`, `analytics.zonas_de_grupo`, `ops.invalidacion`, ni el rol `facylf_app`. De las **78 referencias** (tablas, vistas y funciones de tabla) que usan las pantallas nuevas, **faltan 53**: 41 tablas/vistas y 12 funciones de tabla. En el canónico del PC existen las 78. |
| ¿Hay datos para una jornada real? | **Sí, en el servidor y en el PC.** En el servidor, CyL 2026-27 tiene 2.171 partidos (1.825 con resultado) y 370 jornadas; el grupo 368 («Primera – Palencia», 2026-27) tiene 18 partidos, 16 con resultado. En el PC, CyL tiene 243.575 partidos. |
| ¿Cuánto ocupa? | Base del servidor: **16 GB** (`pg_database_size`). Base del PC: **36 GB**. Volcado comprimido diario del servidor: **553 MB** (9/11). La huella estimada de CyL en el servidor es **~1,4 GB**. |
| ¿Cuánta máquina pide la web? | Contenedor: **139–179 MiB de RAM**, 3–13 % de CPU en reposo, límite 1 GiB. Imagen: **540 MiB**. El problema no es la web: es que comparte 4 núcleos con 19 recolectores (carga medida: **11,2**). |
| Recomendación | **Opción 1 (seguir en el servidor de David + Cloudflare Tunnel + dominio) para abrir a un grupo pequeño ya**; **VPS dedicado** (Hetzner CX33 o superior) cuando haya que atender a gente de fuera con garantías. PaaS gestionado: **descartado para esta base** (los planes gratuitos no llegan ni de lejos y los de pago salen más caros que un VPS). |

Coste incremental de la opción recomendada: **0 €/mes de infraestructura** (el servidor ya está pagado)
más el dominio (precio **no verificado** hoy: no se inventa) y, si se quiere, el túnel (sin tarifa
publicada en la documentación consultada; ver §4).

**Corrección de plan (9/11/2026, aportada por el Lead y medida aquí):** el paso 2 del plan de §5 **no
debe ser migrar la base de recolección del servidor**, sino **construir la base de publicación desde el
canónico del PC**, que ya está en 0060 y tiene 548 ediciones de CyL más. Está desarrollado en §5-bis, con
las medidas de volcado, transferencia, restauración y los riesgos de roles/versión comprobados.

---

## 1 · Qué hay hoy, medido

### 1.1 Servidor

| Qué | Medido | Comando |
|---|---|---|
| Sistema | Debian 12, kernel 6.1.0-50, 4 núcleos | `ssh servidor uname -a` |
| Memoria | 15 GiB totales, 4,8 GiB usados, 10 GiB disponibles, 8 GiB swap | `ssh servidor free -h` |
| Disco | `/dev/sda3` 211 GB, **85 GB usados, 125 GB libres (41 %)** | `ssh servidor df -h /` |
| Carga | `load average: 11,22, 9,43, 7,37` (flota de recolección en faena) | `ssh servidor uptime` |
| Docker | 24 imágenes (13,67 GB), 40 contenedores, **caché de build 15,37 GB** | `ssh servidor docker system df` |
| Web | contenedor `facylf-web`, imagen `facylf-web:local`, **creada 2026-09-24T11:58:56Z**, `Up ... (healthy)` | `docker image inspect facylf-web:local` |
| Web: puerto | `LISTEN 100.117.58.93:3100` (sólo IP de Tailscale) | `ss -ltnp \| grep 3100` |
| Web: entorno | `DATABASE_URL_LECTOR` (rol `facylf_lector`), `FACYLF_EXCLUIR=valencia,madrid,cataluna`, `NODE_ENV=production`, `PORT=3000`, `TZ=Europe/Madrid` | `docker inspect facylf-web --format '{{range .Config.Env}}...'` |
| Web: **falta** | `DATABASE_URL_APP` **y** `REVALIDACION_SECRETO` | ídem |
| PostgreSQL | contenedor `facylf-postgres`, `postgres:18` (18.6), escucha `127.0.0.1:5433`, `shared_buffers=1GB`, `max_connections=50`, `wal_level=replica`, **`archive_mode=off`** | `docker inspect` / `pg_settings` |
| Tailscale | `servidor 100.117.58.93`; `tailscale serve` → **`No serve config`**; Funnel no configurado; DNS de Tailscale **desactivado** | `tailscale status`, `tailscale serve status`, `tailscale dns status` |
| DNS del host | `/etc/resolv.conf` apunta **sólo** a `100.100.1.1` y `100.90.1.1` (los de Tailscale, que está desactivado): **`getent hosts github.com` → rc=2**. Los contenedores sí resuelven porque Docker conservó `192.168.1.1 1.1.1.1 8.8.8.8 9.9.9.9` como `ExtServers` | `cat /etc/resolv.conf`, `getent hosts`, `docker exec facylf-federacion-1 cat /etc/resolv.conf` |
| IP pública | `ip=79.117.136.11` (consultado por IP, sin DNS: `curl -sL http://1.1.1.1/cdn-cgi/trace`) | ver comando |
| Copias | `cron` 03:30 → `scripts/servidor/copias.sh`; `/srv/data/backups/facylf` **13 GB** (canónico 4,5 GB + colas 8,2 GB); **retención 7 días; mismo disco; sin WAL/PITR** | `crontab -l`, `du -sh`, `pg_settings` |

### 1.2 La web desplegada no es Fondo Popular

El manifiesto de rutas que lleva la imagen en marcha es el de la web vieja:

```bash
docker exec facylf-web cat apps/web/.next/app-path-routes-manifest.json
#  /  /competiciones  /competicion/[slug]  /competicion/[slug]/jornada/[numero]
#  /acta/[codigo]  /canonico/[federacion]/[grupo]  /equipos  /jugadores  ...
```

Título real servido: **`<title>Observatorio de fútbol</title>`** (Fondo Popular pone
`Inicio — Fondo Popular` en `apps/web/src/app/page.tsx`). La versión en marcha es **Next.js 15.5.23**;
el repositorio usa **Next `^16.4.3`**.

```
$ curl -s http://100.117.58.93:3100/ | grep -o '<title>[^<]*'
<title>Observatorio de fútbol</title>
```

### 1.3 El canónico del servidor está 45 migraciones por detrás

```
$ docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc \
    "select count(*), max(numero), max(nombre) from ops.migracion"
15|15|0015-diario-borrado.sql        # el repositorio tiene 60 (infra/migraciones/0060-...)
```

Consecuencia medida con `to_regclass` y `pg_proc` sobre las **78 referencias** (tablas, vistas y funciones
de tabla) que la web nueva consulta (extraídas de `apps/web/src/consultas/*.ts`): **existen 25 y faltan 53**
—41 tablas/vistas y 12 funciones de tabla—. En el canónico del PC existen **las 78** (66 tablas/vistas + 12
funciones). Las que más duelen:

- `app.*` (usuario, sesión, favoritos, ajustes, invitaciones, auditoría, publicidad) → cuentas, `/mi-panel`,
  favoritos y `/admin` no pueden funcionar.
- `analytics.nombre_corto_equipo` (11 ficheros de consultas), `analytics.zonas_de_grupo`,
  `analytics.ojeo_jugador`, `analytics.persona_perfil`, `analytics.estado_secciones…` → la portada, el
  catálogo, las clasificaciones con zonas, rankings y ojeo fallan.
- `core.appearance_detalle`, `core.club_asset`, `core.federacion_perfil`, `core.federation_asset` → fichas
  sin escudo ni detalle de alineación.
- `ops.invalidacion` + `ops.consume_invalidaciones()` (0036), `ops.parametro` (0033) → caché por etiquetas y
  publicidad, apagados.
- **No existe RLS** y falta la política de La Preferente (0053): `pg_class.relrowsecurity = f` y
  `pg_policy` vacío.
- **No existe el rol `facylf_app`** (0050): sólo hay `facylf_admin`, `facylf_lector` y `facylf_publicador`.

La web nueva, con esa base, no daría un 500: muestra su estado honesto «Falta una tabla del canónico: hay
migraciones sin aplicar» (`apps/web/src/consultas/adaptadores/postgres/conexion.ts`, error `42P01`). Pero
**no habría ni una jornada**.

El PC, en cambio, está al día: **60 migraciones**, 19 temporadas, 36 GB, `app`/`analytics`/`externo`/`dwh`
creados y **1 tabla con RLS** (la de 0053).

### 1.4 Los datos: comparación servidor ↔ PC

| Medida | Servidor | PC |
|---|---|---|
| Tamaño de la base | **16 GB** | **36 GB** |
| Esquemas (tablas + sus índices, sin contar dos veces) | `core` **8,7 GB**, `ops` **6,8 GB** (`batch_cambio` 6,8 GB), `source` 404 MB, `analytics` 128 kB | `core` **19 GB**, `analytics` **7,6 GB**, `ops` **7,8 GB** (`batch_cambio` 7,3 GB), `source` 1,5 GB, `externo` 777 MB, `app` 1,6 MB |
| Temporadas (`core.season`) | **7** (2020-21 … 2026-27) | **19** (2008-09 … 2026-27) |
| Ediciones de CyL | **259** (183 con `visibility_state='completa'`) | **807** (283 completas) en 15 temporadas |
| Partidos totales | **540.285** | — |
| Partidos de CyL | **90.193** (88.112 con resultado) | **243.575** (238.112) |
| Apariciones de CyL | **2.351.678** | **5.601.035** |
| Eventos de CyL | **1.450.209** | — |
| Ediciones de La Preferente | No hay columna `origen`: el esquema es anterior a 0051 | **4.651** de 20.068, ocultas a `facylf_lector` por RLS (0053) |
| Volcado diario (`pg_dump`) | **553 MB** (9/11), creciendo ~20 MB/día (494 MB el 5/11) | — |

**CyL en el servidor, por temporada** (la tabla que de verdad importa para «una jornada con datos reales»):

```
temporada | partidos | con resultado | jornadas
2026-27   |   2.171  |    1.825      |   370
2025-26   |  16.260  |   15.954      |  2.567
2024-25   |  36.587  |   35.834      |  6.448
2023-24   |   5.938  |    5.912      |    899
2022-23   |  21.042  |   20.569      |  2.920
2021-22   |     139  |      139      |     18
2020-21   |   8.056  |    7.879      |  2.830
```

Dos correcciones a los datos de partida de la tarea, medidas:
- el servidor tiene **183** ediciones de CyL con `visibility_state='completa'`, no 152;
- el PC tiene **807** ediciones de CyL (283 completas) en 15 temporadas, no 808/138. Probablemente la ficha
  usaba otro criterio (`metricas-facylf.json`, «competiciones completas»); no he podido reproducir esas
  cifras y dejo las mías con el comando al lado.

**Tamaño de CyL en el servidor (estimación con base medida).** CyL es el 16,7 % de los partidos (90.193 /
540.285), el 17,3 % de las apariciones y el 21,7 % de los eventos. Aplicado al tamaño de las tablas de
hechos: `core.appearance` 3.707 MB × 0,173 = **641 MB**; `core.match_event` 2.622 × 0,217 = **569 MB**;
`core.match` 257 × 0,167 = 43 MB; `core.match_staff` ~90 MB; `core.person*`/`source.external_ref` ~60 MB;
`core.match_report`+`match_source`+`match_official` ~63 MB. **Total ≈ 1,4–1,6 GB**. Está etiquetado como
estimación: `pg_total_relation_size` no se puede filtrar por federación sin copiar tablas, y no se copió
nada.

### 1.5 Medidas de la web (TTFB real)

Todo con `curl` desde el servidor contra `http://100.117.58.93:3100`, con la flota de recolección en
marcha (carga 5–11 sobre 4 núcleos). Los tiempos son ruidosos por eso: se dan dos vueltas.

| Página | 1.ª vuelta TTFB | 2.ª vuelta TTFB | Bytes | Estado |
|---|---|---|---|---|
| `/` (web vieja) | 0,68 s | 1,97 / 1,08 / 1,59 s | 54.222 | 200 |
| `/federaciones` | 0,97 s | 0,75 s | 126.463 | 200 |
| `/competiciones` | 2,77 s | 1,07 s | 259.896 | 200 |
| `/partidos` | 2,86 s | 3,78 s | 219.231 | 200 |
| `/canonico` | **10,99 s** | **5,17 s** | 15.369 | 200 |
| 20 peticiones a `/` en paralelo (10 a la vez) | **TTFB 4,3–15,8 s** | — | — | 200 |

Comando:

```bash
curl -s -o /dev/null -w '%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}\n' URL
docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' facylf-web
```

Contenedor web:

| Momento | CPU | RAM |
|---|---|---|
| Reposo | 3,38 % | **139,5 MiB / 1 GiB (13,6 %)** |
| Durante 20 peticiones | 13,39 % antes / 0 % después | **178,8 MiB / 1 GiB** |

**Imagen y build:** `facylf-web:local` = **566.532.320 bytes (540 MiB)**; dentro del contenedor `/app`
ocupa **82 MB** y `apps/web/.next` 4,6 MB (salida `standalone` + estáticos). En el PC, `apps/web/.next`
del árbol de desarrollo ocupa **1,2 GB** (no es lo que se despliega; se apunta para no confundirlo).

**Contexto que explica los tiempos:** la web vieja es `force-dynamic` (sin caché) y el servidor está
haciendo otra cosa a la vez. `pg_stat_statements` acumulaba 56.264 llamadas a una consulta de catálogo con
**161,6 ms de media** y 56.267 a otra con **95,1 ms** en la hora previa; con la flota de 19 recolectores
(`chromium` + `node`) y la carga a 11, cualquier petición compite por CPU con la ingesta. **Este es el
argumento técnico de por qué el servidor de casa no debe ser el host público a la vez que recolecta.**

### 1.6 Datos reales que ya existen (para la jornada)

Servidor, CyL 2026-27, grupo `368` («Primera – Palencia», `core.phase_group.id = 368`):

```
$ docker exec facylf-postgres psql -U facylf_admin -d facylf -c \
  "select pg.id, pg.nombre, count(m.id), count(m.goles_local) from core.phase_group pg
   join core.match m on m.phase_group_id=pg.id where pg.competition_edition_id=367 group by 1,2"
368 | Primera - Palencia | 18 partidos | 16 con resultado
```

Y 2024-25, grupo `8901` («Primera Fase – GRUPO VIII»): **342 partidos, los 342 con resultado**. Es decir:
**si la web nueva estuviera desplegada y el canónico migrado, el contenido existe**; lo que falta es todo
lo demás.

---

## 2 · (a) Infraestructura que exige la web tal como está

### 2.1 Aplicación

- **Node 24 (runtime `standalone`), Next.js 16**, React 19, TypeScript, App Router. La imagen se construye
  en tres etapas (`apps/web/Dockerfile`: `node:24-bookworm-slim` + `pnpm --filter '@facylf/web...' build` +
  salida `standalone`). Se ejecuta con `tini` y usuario **sin privilegios** (`web`, uid 10001).
- Variables de entorno necesarias (las tres primeras son las que usan las páginas):
  - `DATABASE_URL_LECTOR` → rol `facylf_lector` (`postgres://…@facylf-postgres:5432/facylf`), pool de **5**
    conexiones, `statement_timeout` 5 s.
  - `DATABASE_URL_APP` → rol `facylf_app` (`pool` de 3), para `app.*` (cuentas, favoritos, admin). **No
    está en el servidor** y su ausencia se anuncia en pantalla («Falta DATABASE_URL_APP…»).
  - `REVALIDACION_SECRETO` → `POST /api/revalidar` (Bearer). **No está en el servidor**: el endpoint
    responde `503 sin_configurar`.
  - Opcionales: `FACYLF_EXCLUIR` (federaciones que la web no enseña; hoy `valencia,madrid,cataluna`),
    `FACYLF_TEMPORADA_MINIMA` (vacía = `2023-24` por defecto en `lib/temporadas.ts`), `TZ`, `PORT`,
    `HOSTNAME`.
- Recursos medidos: 139–179 MiB de RAM, 1 GiB de límite (`mem_limit: 1g` en `docker/web.yml`), 12–18
  procesos. **CPU: la web no necesita mucho; la ingesta sí ocupa la máquina.**
- Salud: `healthcheck` cada 30 s contra `/` (en verde, 5/5); el contenedor se reinició con el host (uptime
  de 1 h en el momento de medir) y `restart: unless-stopped` lo levanta solo.

### 2.2 PostgreSQL

- PostgreSQL **18** (18.6), `shared_buffers=1GB`, `work_mem=32MB`, `maintenance_work_mem=512MB`,
  `effective_cache_size=3GB`, `max_connections=50`, `pg_stat_statements` precargado, `log_min_duration_statement=500`.
- **Tamaño real medido:** 16 GB en el servidor; 36 GB en el PC. **Huella de CyL en el servidor: ~1,4 GB**
  (estimación §1.4). El **41 % de la base del servidor (6,8 GB) es `ops.batch_cambio`**, el diario de
  cambios del importador: la web no lo consulta, pero cuenta para disco y copias.
- Crecimiento medido: volcado diario 494 MB (5/11) → **553 MB (9/11)**, ~20 MB/día.
- Copias actuales: `pg_dump` diario a las 03:30 + copia de las 19 colas SQLite, **retención 7 días**, todo en
  `/srv/data/backups/facylf` (**mismo disco**, 13 GB). No hay `archive_mode`, ni PITR, ni copia fuera de la
  máquina. Un `pg_dump` no cuenta como copia hasta que se restaura: **no consta una restauración probada.**
- Discos: 211 GB totales, 85 GB usados. Un VPS de 40 GB (Hetzner CX23) **no cabe** con 16–36 GB de base +
  13 GB de copias + imágenes Docker; hace falta ~80 GB y aun así justo (ver §3.3).

### 2.3 Red

- Sólo Tailscale: `LISTEN 100.117.58.93:3100`; `tailscale serve` sin configurar. **No hay puerto abierto a
  Internet** (y así debe seguir hasta decidirlo David).
- El host **no resuelve DNS** (ver §1.1). Los contenedores sí, porque el daemon de Docker conservó los
  resolutores originales. Consecuencia práctica: **cualquier cosa que se instale en el host y necesite
  resolver nombres (cloudflared como binario, `apt`, `docker pull`, `git fetch`) fallará** hasta que se
  arregle `/etc/resolv.conf` con `sudo`.
- La IP pública observada es `79.117.136.11`, pero **no hay reenvío de puertos ni certificado**: no hay
  nada publicado.
- Caudal PC↔servidor medido en su día y documentado: **1,6 MB/s (~13 Mbps)**. Para el aficionado que entre
  por un túnel, el origen sigue siendo la conexión de casa: **es el techo real de la opción 1**.

### 2.4 Caché e invalidaciones

- Las consultas públicas van con `unstable_cache` por etiquetas + `revalidateTag`; la cola vive en
  **`ops.invalidacion`** (migración 0036) y se consume con `ops.consume_invalidaciones($1)` desde
  `POST /api/revalidar` y desde un temporizador de `instrumentation.ts` **cada 60 s**. El rol `app` necesita
  `select, update` sobre esa tabla.
- En el servidor **esa infraestructura no existe** (esquema en 0015) y **falta el secreto**. La nota del
  WALL del 05/11 dice que la cola tenía 1,7 M de etiquetas pendientes de la proyección histórica, que se
  vacían a 2.000/min.
- API `/api/v1`: 7 endpoints, `ETag` fuerte + 304, `Cache-Control` con `stale-while-revalidate`,
  `X-Cache`, y **límite de 300 peticiones/minuto por IP y proceso** (en memoria; el propio `API.md` §1
  avisa: «si la API se abre de verdad, el límite tiene que vivir en el proxy»). **Con varias instancias o
  serverless ese límite no se sostiene.**

### 2.5 Secretos y variables: hueco concreto en el servidor

`/srv/data/facylf/docker/.env` (valores ocultos) tiene `POSTGRES_PASSWORD`, `DATABASE_URL_LECTOR`,
`DATABASE_URL_PUBLICADOR` y las variables de la flota y de la web. **No tiene** `DATABASE_URL_APP` ni
`REVALIDACION_SECRETO`. El `.env` del PC sí las tiene. Para publicar Fondo Popular hay que crear el rol
`facylf_app` (0050/0027) y añadir ambas variables al compose de la web.

---

## 3 · (b) Comparativa de alojamiento en €/mes

**Cómo leer los precios.** Se copian de la página oficial, **consultada el 9 de noviembre de 2026**, con
la moneda que publica cada proveedor. Los de Hetzner son **sin IVA** (para España, +21 %). Los de PaaS
están en **USD**; **no los convierto a euros con un tipo de cambio inventado**. Donde no he podido leer una
cifra en la página oficial, lo digo y **no la invento**.

### 3.1 Lo que manda en la decisión (números medidos)

1. **La base no cabe en ningún plan gratuito**: 16 GB hoy en el servidor y 36 GB en el PC.
2. **El volcado diario es de 553 MB**; el traslado no es el problema, el almacenamiento y la RAM sí.
3. **La web pide poco** (≈180 MiB, <1 vCPU salvo picos) pero **la base pide RAM y CPU**: las consultas de
   catálogo medidas rondan 100–160 ms y escanean; con 1 GB de RAM compartida se degrada.
4. **Caché y límites son de proceso**: la web asume **un Node de larga duración**. Serverless/multinstancia
   rompen el rate-limit en memoria y el temporizador de invalidaciones.

### 3.2 Opción 1 — Seguir en el servidor de David + Cloudflare Tunnel (o Tailscale Funnel) + dominio

| Concepto | Coste | Estado |
|---|---|---|
| Servidor (ya pagado, 16 GB/4 núcleos/211 GB, con la flota) | **0 €/mes incremental** | medido |
| Cloudflare Tunnel (`cloudflared` en un contenedor) | **sin tarifa publicada** en la documentación consultada: no he encontrado importe que pagar, pero **no he podido verificar una cifra oficial**; se trata como 0 € pendiente de confirmar en el alta | [docs.cloudflare.com · Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) |
| Tailscale Funnel (alternativa) | plan **Personal: $0**; Standard $8/usuario/mes; Premium $18/usuario/mes | [tailscale.com/pricing](https://tailscale.com/pricing) |
| Dominio | **no verificado hoy** (no se inventa). El dominio es el único coste seguro de esta opción | — |
| TLS | 0 €: lo termina Cloudflare; con Funnel, Tailscale emite el certificado | — |

**Límites y lo que se rompe:**
- **Caudal de casa**: el techo es la subida de la conexión y los 4 núcleos compartidos con 19 recolectores.
  Medido: 20 peticiones simultáneas → TTFB de **4,3 a 15,8 s** con la flota en marcha. Para un grupo
  pequeño (10–50 personas) da; para «abierto a Castilla y León» no.
- **DNS del host roto** (§1.1): hay que arreglarlo con `sudo` antes de instalar nada en el host. Un
  `cloudflared` **en contenedor** funciona porque la resolución de Docker sí va.
- **Un solo punto de fallo**: corte de luz, reinicio de Windows del PC… El servidor es de casa.
- **No cambia nada del código** ni de la base: la web nueva se puede desplegar aquí cuando el canónico esté
  migrado y con las dos variables que faltan.
- **Esfuerzo de migración: bajo** (días): 1) migrar el canónico del servidor 0015→0060; 2) reconstruir la
  imagen del repo y recrear el contenedor; 3) añadir dominio + túnel + variables; 4) copias fuera.

### 3.3 Opción 2 — VPS barato con la base dentro

Referencia verificada: **Hetzner Cloud**, precios **sin IVA**, 20 TB de tráfico incluido, consultados en
[hetzner.com/cloud/cost-optimized](https://www.hetzner.com/cloud/cost-optimized/) el 9/11/2026 (la página
marcaba esos modelos como «not available» en ese momento: la disponibilidad fluctúa).

| Plan | vCPU / RAM / disco | €/mes sin IVA | €/mes con IVA 21 % | ¿Sirve? |
|---|---|---|---|---|
| CX23 | 2 / 4 GB / 40 GB NVMe | **5,99** | 7,25 | **No**: 40 GB no dan para 16–36 GB de base + copias + imágenes |
| CAX11 (Ampere) | 2 / 4 GB / 40 GB | **6,49** | 7,85 | Igual que CX23 |
| **CX33** | **4 / 8 GB / 80 GB** | **8,99** | **10,88** | **Sí para empezar**: 80 GB van justos con la base de 16 GB + 7 días de copias (13 GB) + imágenes; hay que vigilar el disco |
| CX43 y superiores | más | — | — | **precio no verificado hoy** |

- **Contabo, OVH y Netcup**: sus páginas oficiales devolvieron contenido dinámico o error (Contabo
  `/en/vps/cloud-vps/` → HTTP 500; OVH y Netcup, sólo la cabecera de navegación). **No doy sus precios
  porque no los he podido verificar hoy.** Hetzner sirve como referencia de mercado; si se quiere comparar,
  hay que abrir esas páginas en el navegador y anotar la fecha.
- **Disco**: además de los 80 GB, un volumen extra de Hetzner se paga aparte (precio por GB no verificado
  hoy); para la base del **PC (36 GB) + copias** lo razonable es un plan con 160 GB o un volumen.
- **Lo que se rompe**: la decisión del 21/09 es «los datos están en el servidor [de casa] y la web
  pregunta». Mover la web a un VPS **con la base dentro** duplica la fuente de verdad o exige mover también
  el importador y la flota. Si el VPS sólo aloja la web, **la base sigue en casa** y entonces el VPS aporta
  poco (sólo saca la web de la competencia por CPU; el origen de datos sigue siendo la conexión de casa).
- **Esfuerzo de migración: alto** si se lleva la base: `pg_dump`/`pg_restore` de 16–36 GB, migraciones,
  rehacer compose, copias, DNS, y decidir qué pasa con los 19 recolectores que hoy escriben ahí.

### 3.4 Opción 3 — PaaS con PostgreSQL gestionado

Los números, tal como los publica cada proveedor el 9/11/2026 (USD):

| Proveedor | Plan gratuito | Límite que rompe esta base | Plan de pago y coste con 16 GB |
|---|---|---|---|
| **Neon** ([neon.com/pricing](https://neon.com/pricing)) | 1 GB de almacenamiento por proyecto, 100 CU-horas/mes | **16 GB > 1 GB** | Launch: **$0,35/GB-mes** → 16 GB = **$5,60/mes** sólo disco + **$0,106/CU-hora** de cómputo (su ejemplo: «typical spend $15/mo» para 1 GB y carga intermitente). Con 16 GB y consultas de 100–160 ms, más cómputo |
| **Supabase** ([supabase.com/pricing](https://supabase.com/pricing)) | **500 MB** de base (CPU compartida, 500 MB RAM) | **16 GB > 500 MB** | Pro **$25/mes** incluye 8 GB; los 8 GB extra a **$0,125/GB** = +$1. Pero el cómputo incluido es **Micro (1 GB RAM)**; Small (2 GB) +$15, Medium (4 GB) +$60 al mes |
| **Railway** ([railway.com/pricing](https://railway.com/pricing)) | $5 de crédito 30 días, luego $1/mes; **0,5 GB de volumen**, 0,5 GB RAM | **0,5 GB de volumen < 16 GB**; Hobby sólo **hasta 5 GB** | Pro $20/mes mínimo + uso: volúmenes ~**$0,155/GB-mes** (16 GB ≈ $2,5) + memoria ~**$10/GB-mes** (2 GB ≈ $20) + CPU; **≈ $40–50/mes** |
| **Fly.io** ([fly.io/pricing](https://fly.io/pricing) y [fly.io/mpg](https://fly.io/mpg)) | $1 de crédito; no hay plan gratuito de Postgres gestionado | — | App: `shared-cpu-8x · 2 GB` **$17,55/mes**; **MPG Basic $38/mes** (shared-2x, 1 GB RAM) + **$0,28/GB-mes** de almacenamiento (16 GB ≈ $4,5) → **≈ $60/mes**; con 2 GB de RAM (Starter $72) → ≈ $94/mes |
| **Vercel** ([vercel.com/pricing](https://vercel.com/pricing)) | Hobby $0 | No es base de datos: hay que sumar Neon/Supabase | Pro **$20/usuario/mes** + la base aparte |

**Por qué los planes gratuitos no aguantan, con números:**
1. **Almacenamiento**: 16 GB frente a 500 MB (Supabase), 1 GB (Neon), 0,5 GB de volumen (Railway). La base
   del PC es **36 GB**. No es cuestión de optimizar: no cabe.
2. **Cómputo**: los planes gratuitos dan CPU compartida y 0,5–1 GB de RAM; la base pide `shared_buffers=1GB`
   y las consultas de catálogo medidas rondan 100–160 ms. Con 1 GB compartida, cada visita se convierte en
   una espera.
3. **Copias**: el volcado diario son 553 MB y crece ~20 MB/día; los gratuitos no incluyen copias con
   retención más allá de 7 días o ninguna.

**Y además, lo que rompe de la web, no del precio:** el código asume **un Node de larga duración**. En
serverless/Vercel el `instrumentation.ts` (temporizador de 60 s que consume `ops.invalidacion`) no es fiable,
el **límite de 300/min por IP y proceso** deja de valer al haber varias instancias, y la compilación del
monorepo pnpm con salida `standalone` obliga a adaptar el build (eso ya es tocar código). Fly.io es el único
PaaS de la lista donde la web correría «como está» (contenedor), pero su Postgres gestionado es lo más caro
de la comparativa.

### 3.5 Comparativa final (coste mensual orientativo con 16 GB de base)

| Opción | €/mes infraestructura | Qué se rompe | Esfuerzo de migración |
|---|---|---|---|
| **1. Servidor de casa + Tunnel + dominio** | **0 € + dominio** (no verificado) | Caudal de casa, 4 núcleos compartidos con la flota, un solo punto de fallo; DNS del host roto | **Bajo** (migrar canónico + desplegar imagen + túnel) |
| **2. VPS Hetzner CX33 con la base** | **10,88 € con IVA** (+ disco/volumen si se lleva el PC) | Mover la base y decidir el futuro de la flota; 80 GB justos | **Alto** |
| 3a. Neon + Vercel/Node | ≈ $5,60 disco + cómputo + hosting (≈ $25–40 en total) | Serverless rompe caché/límites; hay que adaptar build | **Medio-alto** (código) |
| 3b. Supabase Pro | ≈ $26–86 según cómputo | 1 GB de RAM en Micro; hay que subir a Small/Medium | **Medio** |
| 3c. Railway Pro | ≈ $40–50 | Volumen y RAM se pagan; build en su plataforma | **Medio** |
| 3d. Fly.io + MPG Basic | ≈ $60 | 1 GB de RAM en el plan básico; lo demás funciona | **Medio** |

**Recomendación:** **Opción 1** para publicar «de verdad» en semanas (coste incremental ~0 € + dominio), con
la base en el servidor de casa y el túnel delante; **Opción 2 (Hetzner CX33 o un plan con más disco)** como
siguiente paso si el tráfico o la fiabilidad lo piden, asumiendo que hay que mover la base y decidir qué pasa
con la flota de recolección. **PaaS no**: la base de 16–36 GB y las suposiciones de proceso largo hacen que
el ahorro sea ficticio.

---

## 4 · (c) Qué falta para publicar de verdad

### 4.1 Dominio, DNS y TLS

- **No hay dominio.** No hay ninguna referencia a un dominio propio en la documentación ni configuración del
  servidor; la web se sirve sólo por IP de Tailscale.
- Con **Cloudflare Tunnel** no hace falta abrir puertos ni tocar el router: `cloudflared` sale a Internet
  desde la máquina (Docker resuelve DNS), Cloudflare termina TLS y el DNS del dominio es de Cloudflare. Es
  la vía que menos permisos pide (no necesita `sudo` en el host si va en contenedor).
- Con **Tailscale Funnel** el servicio se publica en un nombre `*.ts.net` de la tailnet; no he podido leer
  en la página oficial consultada los límites exactos (puertos y disponibilidad por plan) porque el
  contenido no se sirvió completo: **verificar antes de decidir**. El plan Personal es $0.
- **TLS**: con cualquiera de las dos vías no hay que gestionar Let's Encrypt. Si algún día se publica con
  proxy propio en el host, hará falta certificado y `HSTS` (la cabecera ya está prevista en
  `SEGURIDAD-OPERACION.md`).

### 4.2 El rol de sólo lectura (lo que sí está) y el rol de cuentas (lo que falta)

- `facylf_lector` **existe y es de sólo lectura de verdad**: verificado
  `has_table_privilege('facylf_lector','core.match','INSERT'|'UPDATE'|'DELETE') = false` y `SELECT = true`;
  atributos `rolsuper=f, rolcreatedb=f, rolcreaterole=f`. Es lo que usa la web para lo público.
- **Falta `facylf_app`** (0050): rol de las páginas con sesión, con `select, update` sobre `app.*` y
  `ops.invalidacion`, sin escritura en `core`. Sin él no hay cuentas, favoritos, `/mi-panel` ni `/admin`.
- La web **rechaza** arrancar con un rol de escritura en `DATABASE_URL_LECTOR`
  (`conexion.ts`: `ROL_CON_ESCRITURA`), lo cual está bien y hay que conservar.

### 4.3 Copias de seguridad

- Hoy: `pg_dump` diario + copias de colas, retención 7 días, **en el mismo disco del servidor**, sin PITR,
  sin copia externa y sin restauración probada.
- Para publicar hace falta: copia **fuera de la máquina** (otro disco o almacenamiento de objetos), prueba
  de restauración documentada (RPO 24 h / RTO 8 h que ya fija `SEGURIDAD-OPERACION.md` §9), y decidir si se
  activa WAL/PITR (`archive_mode=off` hoy).
- Si el canónico se migra a 0060, la copia de antes de migrar es obligatoria (y el `.dump` de 553 MB ya
  existe: sirve como punto de retorno).

### 4.4 Migraciones: el paso que desbloquea todo

El servidor está en **0015** y el repositorio en **0060**. Sin un esquema al día (y sin crear `facylf_app` y
la política de La Preferente) **la mayoría de las pantallas nuevas no pueden enseñar nada** (portada,
catálogo, clasificaciones con zonas, rankings, ojeo, fichas con escudo, cuentas y administración).

Dos caminos, y **el recomendado es el segundo** (§5-bis):
- **A · migrar la base de recolección del servidor** (0016→0060, 45 migraciones sobre 16 GB): escribe en la
  base del servidor (no es «medir»), necesita autorización de David y ventana tranquila con los 19
  recolectores; y **aun así le faltarían 548 ediciones de CyL que sólo están en el PC** (medido: las 259
  ediciones CYL del servidor ya existen en el PC; el PC tiene 548 más).
- **B · restaurar en el servidor una base NUEVA volcada desde el PC**, que ya viaja migrada a 0060
  (`ops.migracion` del PC: 60 migraciones). No se toca la base de recolección; el detalle y las medidas
  están en §5-bis.

### 4.5 Legal y privacidad

Lo que ya está decidido y escrito:
- **La instancia es privada.** No se abre a Internet sin decisión explícita y revisión de
  `SEGURIDAD-OPERACION.md` (§2, §5 y §11).
- **Datos de menores** (decisión de David, 05/11/2026, `DOCTRINA-CALIDAD.md` §9): la federación tiene
  consentimiento de tratamiento, así que **los nombres se publican**; **las fotos de personas, y en
  particular de menores, no se publican**. No se publican fecha de nacimiento, documento, contacto ni
  dirección. Hoy no hay ninguna foto de persona en la web; si se añade, los menores quedan fuera.
- **Publicidad**: `PUBLICIDAD.md` dice «hoy facylf no lleva anuncios y no debería llevarlos mientras sea
  privada»; la migración 0033 deja los huecos preparados y **apagados** (proveedor «ninguno»). Si algún día
  se enciende AdSense, hacen falta CMP certificado, `ads.txt`, política de cookies y contenido accesible
  (requisitos de Google, §6 de `PUBLICIDAD.md`).
- **La Preferente (D2)**: la decisión vigente (25/10 y 26/10) es **enseñar lo de LP en la web interna,
  marcado «Dato no oficial (La Preferente)»**, y **antes de abrir a Internet, permiso escrito de LP; si no
  lo dan, se apaga con el ajuste `facylf.lp_publico`**. La protección está preparada en el repositorio
  (migración 0053: RLS restrictiva para `facylf_lector` sobre `core.competition_edition`), pero **en el
  servidor no está aplicada** (esquema 0015).

Lo que **falta y bloquea una publicación real** (comprobado en el código: no hay ninguna ruta de aviso
legal, privacidad ni cookies; `apps/web/public` sólo tiene un `flutter_service_worker.js` heredado; el
layout ya declara `robots: { index: false, follow: false }`, que es lo correcto para una instancia privada):
1. **Aviso legal** (LSSI, art. 10: titular, NIF, domicilio, contacto).
2. **Política de privacidad** (RGPD arts. 13–14: finalidad, base jurídica, categorías, destinatarios,
   conservación, derechos, reclamación ante la AEPD).
3. **Política de cookies / CMP** sólo si se encienden anuncios o analítica de terceros; hoy la web no
   necesita cookies de terceros, pero la sesión propia usa cookie `httpOnly`.
4. **Base jurídica y texto informativo** para publicar nombres de menores y datos de partidos: la
   documentación dice que hay consentimiento de tratamiento de la federación, pero **esa cobertura hay que
   documentarla** antes de abrir a Internet (finalidad, minimización, retención, procedimiento de
   corrección/supresión).
5. **`noindex` y ausencia de sitemap** mientras sea privada: el `metadata` global ya pone
   `robots: { index: false, follow: false }`; falta decidir si se añade `robots.txt`/`sitemap` el día que se
   quiera indexar (hoy no hay ninguno de los dos).
6. Revisión de `SEGURIDAD-OPERACION.md` §11 (puerta de publicación): autenticación y autorización por
   objeto, TLS y cabeceras, rol mínimo, copia restaurada, registro sin PII innecesaria, ASVS básico.

### 4.6 Decisiones que tiene que tomar David

1. **¿Se abre a Internet o sigue privada?** Si se abre: ¿a quién (grupo pequeño con login, o público)? Con
   qué dominio (¿`.es`? ¿`.com`?) y quién lo registra.
2. **¿Autoriza aplicar las migraciones 0016–0060 en el canónico del servidor**, con copia previa y ventana?
   (Sin esto no hay Fondo Popular en el servidor.)
3. **¿Autoriza crear el rol `facylf_app` y las variables `DATABASE_URL_APP` y `REVALIDACION_SECRETO`** en el
   compose de la web?
4. **¿Autoriza arreglar el DNS del host** (necesita `sudo`; `primeros-pasos-sudo.sh` ya existe)?
5. **La Preferente (D2-bis)**: ¿permiso escrito de LP antes de abrir, o se apaga con `facylf.lp_publico`?
6. **Aviso legal y privacidad**: ¿los redacta él, su abogado, o los preparo yo como borrador para revisión?
7. **¿Anuncios?** La guía dice que no mientras sea privada. Si se abren, hay que decidir CMP y huecos.
8. **¿Tienda/club con licencia de datos?** No hay nada decidido; no lo incluyo en el alcance.

---

## 5 · (d) Plan por pasos con puertas de verificación

Cada paso lleva **el comando que demuestra que está hecho** (todos ejecutables desde el PC con el alias
`servidor`). Los pasos marcados 🔒 necesitan permiso de David (root, base de datos o cuenta de un tercero).

| # | Paso | Puerta de verificación | Permisos |
|---|---|---|---|
| 0 | **Decisiones de §4.6** (dominio, apertura, migraciones, LP, legal) | — | David |
| 1 | 🔒 **Arreglar DNS del host** (`/etc/resolv.conf` → resolutores que funcionen) | `ssh servidor getent hosts github.com` devuelve una IP (hoy rc=2) | `sudo` |
| 2 | 🔒 **Base de publicación desde el canónico del PC** (camino recomendado, §5-bis): volcar el PC, crear `facylf_web` + rol `facylf_app` en el servidor y restaurar. *Plan A alternativo: migrar la base de recolección 0015→0060 (no recomendado: le faltan 548 ediciones).* | `docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc "select max(numero) from ops.migracion"` en **facylf_web** → **60**; `to_regclass('app.sesion')` no nulo; `pg_roles` incluye `facylf_app`; `pg_class.relrowsecurity` de `core.competition_edition` en facylf_web = `t`; `select count(*) from core.match` coincide con el origen | David autoriza; `facylf_admin` |
| 3 | **Añadir variables de la web** (`DATABASE_URL_APP`, `REVALIDACION_SECRETO`) al `.env` y al compose, sin tocar lo demás | `docker inspect facylf-web --format '{{range .Config.Env}}{{println .}}{{end}}' \| grep -c DATABASE_URL_APP` → 1 | David (decidir); escritura en `.env` |
| 4 | **Construir y desplegar la imagen nueva** del repo (`docker compose -p facylf --env-file docker/.env -f docker/web.yml up -d --build`) | `docker image inspect facylf-web:local --format '{{.Created}}'` es de hoy; `curl -s -o /dev/null -w '%{http_code}' http://100.117.58.93:3100/explorar/competiciones` → **200**; `/api/v1/indice` → 200 y `ETag` + 304; `/explorar/competicion/368` → 200 con marcadores | David autoriza desplegar; **no** ejecutarlo en esta tarea |
| 5 | **Medir la web nueva con la flota en marcha** y decidir si se le da prioridad de CPU (cgroup/slice) | `docker stats --no-stream facylf-web`; `curl` de `/explorar/competicion/368` con TTFB repetible; sin `oom_kill` | `sudo` para límites de la rebanada |
| 6 | 🔒 **Dominio + DNS + túnel** (Cloudflare Tunnel en contenedor, o Funnel) | `curl -sI https://<dominio>/` → 200 y TLS válido; `curl -s https://<dominio>/api/v1/indice` → 200; el mismo contenido que en la IP de Tailscale | David (cuenta Cloudflare, compra del dominio); `sudo` si cloudflared va en el host |
| 7 | **Cabeceras y seguridad** (CSP, HSTS, `frame-ancestors`, `Referrer-Policy`) | `curl -sI https://<dominio>/` muestra las cabeceras; prueba de que `/admin` exige sesión | autorización de despliegue |
| 8 | **Rol de sólo lectura y de cuentas comprobados** contra la base migrada | `has_table_privilege('facylf_lector','core.match','INSERT')` = f; `has_table_privilege('facylf_app','app.favorito','INSERT')` = t; alta de usuario de prueba y borrado | `facylf_admin` |
| 9 | **Copias fuera de la máquina y restauración probada** | `pg_dump` nuevo + `pg_restore` en un contenedor vacío; recuentos (`select count(*) from core.match`) iguales; documento con RPO/RTO observado | David (destino de copia), `sudo` |
| 10 | **Legal y privacidad**: aviso legal, privacidad, `noindex` | las rutas legales responden 200; el `metadata` global mantiene `robots: { index: false, follow: false }` mientras sea privada | David/abogado |
| 11 | **Monitorización**: la web y el canónico en Uptime-Kuma + aviso ntfy si caen | `curl` de salud + aviso de prueba recibido en ntfy | permisos de configuración |
| 12 | **Cierre**: medir TTFB de las 7 rutas principales y anotar; dejar rollback (`docker tag` de la imagen anterior) | tabla de TTFB firmada y una etiqueta de imagen anterior lista para volver | David |

**Lo que no he hecho y no puedo hacer sin permiso:** nada de los pasos 1–12. En particular no he levantado
contenedores, no he construido la imagen, no he aplicado migraciones, no he tocado `.env`, ni compose, ni
he ejecutado `sudo`. Sólo lectura y medición.

---

## 5-bis · Alternativa recomendada: la base de publicación se construye desde el canónico del PC

Corrección de plan del 9/11/2026. El paso 2 de §5 (migrar la base de recolección del servidor) **no es el
camino bueno**: la base que va a tener CyL completo es la del PC. Este apartado fija el plan alternativo
con las medidas hechas ese día; **no cambia nada de §2 (infraestructura), §3 (costes) ni §4 (legal)**.

### 5-bis.1 · Por qué (medido, no opinión)

| Hecho | Medición (9/11/2026) | Comando |
|---|---|---|
| CyL en el PC | **807 ediciones** (283 con `visibility_state='completa'`), **15 temporadas**, **244.743 partidos**, **5.638.385 apariciones**, **3.354.585 eventos**, **229.995 personas** | `psql` sobre el canónico del PC |
| CyL en el servidor | **259 ediciones** (183 completas), 7 temporadas, **90.193 partidos** | `psql` sobre el canónico del servidor |
| Ediciones del servidor que no están en el PC | **0** (las 259 se encuentran por `temporada|codigo_externo`) | comparación de listas |
| Ediciones del PC que no están en el servidor | **548** | idem |
| Esquema del PC | **60 migraciones** (`0060-nombres-cortos-equipo.sql`), esquemas `app`, `auth`, `dwh`, `externo`, y **RLS de La Preferente** aplicada | `ops.migracion`, `pg_class` |
| Esquema del servidor | **15 migraciones** (`0015-diario-borrado.sql`) | `ops.migracion` |
| Consolidación en marcha (dato del Lead) | **1.265 grupos con hueco, 91.787 partidos, 86.893 actas** que se traen del servidor al PC | — |

Conclusión: migrar la base del servidor cuesta **45 migraciones sobre 16 GB** y **no aporta ni una edición
nueva** (sólo datos dentro de ediciones que el PC ya cataloga). Restaurar una base volcada del PC parte de
**0060 ya aplicado** y de las 807 ediciones. Por eso el plan pasa a ser: **consolidar en el PC, volcar, y
publicar una copia en el servidor**.

### 5-bis.2 · Los pasos

| # | Paso | Puerta de verificación | Permisos |
|---|---|---|---|
| B1 | **Consolidar en el PC** (en marcha: paquetes por temporada del servidor al PC con `extrae-temporada-cola.mjs` + `scp` + `importar-temporada.ps1`) | `node scripts/estado-importacion.mjs` sin huecos nuevos; recuento de partidos/actas de CyL creciendo hacia el objetivo | David (ritmo de la flota) |
| B2 | **Volcar el PC**: `pg_dump -Fc --no-owner` (llave del rol admin del PC) | fichero de **~1,27 GiB** (medido: 1.332.591.552 B en **455 s**); `pg_restore --list` lo lee sin error | lectura |
| B3 | 🔒 **Preparar el servidor**: crear el rol `facylf_app` **y** la base nueva `facylf_web` (el volcado **no** trae `CREATE ROLE` ni `CREATE DATABASE`: ver 5-bis.3) | `pg_roles` incluye `facylf_app`; `pg_database` incluye `facylf_web`; la base está vacía | David autoriza; `facylf_admin` |
| B4 | 🔒 **Transferir y restaurar**: `docker save`/`scp` del volcado (1,27 GiB a 1,6 MB/s ≈ **13–14 min**) y `pg_restore -d facylf_web --no-owner --exit-on-error` | `pg_restore` termina con código 0; recuentos coinciden con el origen (`count(*) from core.match`, `count(*) from core.competition_edition`, `max(numero) from ops.migracion` = 60); `pg_class.relrowsecurity` de `core.competition_edition` = `t` | David autoriza; `facylf_admin` |
| B5 | **Construir la imagen en el PC** (el host del servidor no resuelve DNS, no puede `docker build`) y llevarla: `docker save | ssh servidor docker load` (540 MiB ≈ **5,6–5,9 min** a 1,6 MB/s) | el `Id` de la imagen coincide en PC y servidor; `docker image inspect facylf-web:local` en el servidor es de hoy | escritura en Docker del servidor (autoriza David) |
| B6 | **Apuntar la web a la base de publicación**: `DATABASE_URL_LECTOR` → `facylf_lector@facylf_web`, `DATABASE_URL_APP` → `facylf_app@facylf_web`, `REVALIDACION_SECRETO`; y `FACYLF_EXCLUIR` para dejar sólo CyL si David quiere el producto CyL-only (hoy excluye `valencia,madrid,cataluna`) | `curl` de `/explorar/competiciones` → 200; `/explorar/competicion/368` → 200 con marcadores; `/api/v1/indice` → 200 y 304 con ETag; `select count(*) from core.match` de `facylf_web` = el del PC | David (decide CyL-only y variables) |
| B7 | **Dominio + Cloudflare Tunnel** (o Funnel) delante de la web | `curl -sI https://<dominio>/` → 200 con TLS; el contenido coincide con la IP de Tailscale | David (cuenta/dominio); `sudo` si cloudflared va en el host |
| B8 | **Frescura**: decidir cada cuánto se refresca la copia (re-volcar/re-restaurar) o si la recolección se traslada al PC y el servidor sólo publica | documento con la cadencia y una prueba de refresco; la web sigue respondiendo durante el refresco (restaurar en base nueva + `ALTER`/cambio de compose, nunca `DROP` de la que sirve) | David (decisión de operación) |

### 5-bis.3 · Qué se rompe al publicar una copia restaurada (y cómo se evita)

Comprobado sobre el volcado real del PC (`pg_dump --schema-only` inspeccionado):

1. **Los roles no viajan en el volcado.** `pg_dump` de una sola base **no** incluye `CREATE ROLE`,
   `CREATE DATABASE` ni `GRANT … ON DATABASE` (verificado: no aparecen en el volcado de esquema). El volcado
   sí incluye **131 referencias a `facylf_app`** y **116 a `facylf_lector`** (GRANT de esquemas/tablas y la
   política RLS `web_sin_la_preferente` de 0053). El clúster del servidor ya tiene `facylf_admin`,
   `facylf_lector` y `facylf_publicador`, pero **no `facylf_app`**: hay que **crear ese rol antes de
   restaurar** (`create role facylf_app login password '…'`), o la restauración falla en los `GRANT` y en la
   política. **No** usar `--no-acl` para esquivarlo: se perdería el mínimo privilegio y el RLS de La
   Preferente, que es justo lo que protege la decisión D2.
2. **La base se crea a mano.** `CREATE DATABASE facylf_web OWNER facylf_admin` antes de restaurar. El PC no
   tenía ACL de base propia (`datacl` vacío: `PUBLIC` puede conectar), así que una base nueva con la ACL por
   defecto deja conectar a `facylf_lector`/`facylf_app`; si se endurece, `GRANT CONNECT`.
3. **Propiedad de objetos.** El volcado medido se hizo con `--no-owner`; al restaurar como `facylf_admin`,
   todo queda a nombre de `facylf_admin` (superusuario del servidor). Con `--owner` habría que garantizar que
   cada dueño exista con el mismo nombre.
4. **Extensiones.** PC y servidor tienen **las mismas cuatro**: `plpgsql`, `pg_stat_statements`, `pg_trgm`,
   `unaccent` (medido). El volcado trae `CREATE EXTENSION IF NOT EXISTS … WITH SCHEMA public`; se restaura sin
   problema (el servidor ya las tiene y `pg_stat_statements` está precargado).
5. **Versión: riesgo descartado.** PC y servidor usan **PostgreSQL 18.6** (misma imagen `postgres:18`,
   `18.6-1.pgdg13+2`) y **`pg_dump`/`pg_restore` 18.6 en ambos**. El volcado se restaura sin saltos de
   versión. Regla para el futuro: **no se restaura un volcado con un `pg_restore` de versión menor que la del
   `pg_dump`**; mantener la imagen fijada en los dos extremos.
6. **Disco del servidor.** Restaurar la base completa son **36 GB** nuevos: 85 GB usados + 36 = 121 GB de
   211 (quedarían ~90 GB libres), más copias del nuevo dump (~1,3 GB × 7 días ≈ 9 GB). Cabe, pero hay que
   vigilarlo; la alternativa CyL-only pesa mucho menos (abajo).
7. **Frescura.** La base de publicación es una **copia**: lo que se recolecte después no aparece hasta el
   siguiente refresco. Hay que decidir cadencia (B8) y decirlo en la web si un día se abre al público; si no,
   el aficionado ve una foto. El plan de refresco seguro es restaurar en una base nueva y cambiar el compose,
   no restaurar encima de la que sirve.
8. **La base de recolección del servidor (0015) deja de ser la fuente de la web.** Sigue siendo la base donde
   trabajan los 19 recolectores; la web nueva lee `facylf_web`. Son dos bases en el mismo clúster, con roles
   separados; no se mezclan.
9. **RLS de La Preferente incluida.** La política 0053 viaja en el volcado y, al restaurar, `facylf_lector`
   sigue sin ver las ediciones de LP. Es una ventaja del plan B: la protección llega con los datos.

### 5-bis.4 · ¿Cuánto pesa CyL y qué se transfiere? (medido + estimado)

**Medido hoy en el PC:** base completa **36 GB**; volcado completo `-Fc` **1.332.591.552 bytes = 1,270,9 MiB
(1,24 GiB)**, en **455 s**. Es decir, el volcado comprime a un **3,45 %** del tamaño de la base.

**Huella de CyL en el PC (estimación con cuota medida por tabla).** Cuotas de CyL sobre el total del PC:
partidos 11,66 %, apariciones 22,93 %, eventos 28,10 %, personas 9,89 %, `match_staff` 22,90 %,
`match_report` 24,72 %, `person_source_identity` 17,69 %, `match_source` 11,75 %, `match_official` 13,15 %,
`team_entry` 8,57 %, `matchday` 9,56 %, `standing_snapshot` 12,54 %, `source.external_ref` 13,15 %.
Aplicado a los tamaños reales de cada tabla del PC: `core.appearance` 8.000 MB × 0,2293 ≈ 1.834 MB;
`core.match_event` 5.375 × 0,2810 ≈ 1.510 MB; `match_staff` 1.058 × 0,2290 ≈ 242 MB;
`person_source_identity` 1.057 × 0,1769 ≈ 187 MB; `match` 998 × 0,1166 ≈ 116 MB; `match_source` 499 ×
0,1175 ≈ 59 MB; `person` 455 × 0,0989 ≈ 45 MB; `person_name` 401 × 0,0989 ≈ 40 MB; `match_report` 345 ×
0,2472 ≈ 85 MB; `match_official` 228 × 0,1315 ≈ 30 MB; `identity_candidate` 163 × ~0,10 ≈ 16 MB;
`team_entry` 145 × 0,0857 ≈ 12 MB; `matchday` 117 × 0,0956 ≈ 11 MB; `standing_snapshot` 115 × 0,1254 ≈
14 MB; `source.external_ref` 1.515 × 0,1315 ≈ 199 MB. **Total ≈ 4,4 GB de `core` + `source`**.

- **Base de publicación completa** (restaurar todo el canónico del PC): **36 GB** de base, volcado de
  **1,24 GiB**; transferencia a 1,6 MB/s ≈ **13–14 min**; restauración **no medida** (exigiría crear una base,
  y este encargo es sólo lectura) — estimación **10–20 min** para 36 GB con reconstrucción de índices.
- **Base de publicación CyL-only**: `core`+`source` de CyL **≈ 4,4 GB**, más la proyección `analytics` de
  CyL (estimación: 10–30 % de los 7,55 GB del PC, es decir **0,8–2,3 GB**), más `app`/`ops` mínimos: total
  **≈ 5,5–7 GB**. Volcado estimado (mismo 3,45 %) **≈ 190–240 MB** → transferencia **≈ 2–2,5 min** y
  restauración de pocos minutos. **Pero** construir una base CyL-only exige un export filtrado y una
  proyección sólo de CyL que **hoy no están scriptados**: es trabajo extra. La forma honesta de empezar es
  **restaurar la base completa** y filtrar por `FACYLF_EXCLUIR` si se quiere enseñar sólo CyL.

**Imagen de la web:** 540 MiB; `docker save` sin comprimir → transferencia **≈ 5,6–5,9 min** a 1,6 MB/s
(comprimida con gzip bajaría, a costa de CPU en los dos extremos).

### 5-bis.5 · Lo que hay que decidir de este plan

1. **¿CyL-only o todo?** Restaurar la base completa es más simple y honesto; enseñar sólo CyL se hace con
   `FACYLF_EXCLUIR`, pero las demás federaciones seguirían ocupando disco y copias.
2. **¿Se para la recolección en el servidor o sigue?** Si el PC consolida y publica, hay que decidir si los
   19 recolectores del servidor siguen escribiendo en `facylf` (para consolidar luego al PC) o se trasladan.
3. **Cadencia de refresco** de `facylf_web` (B8) y quién la ejecuta.
4. **Autorización** para crear rol/base, restaurar y recrear el contenedor de la web en el servidor.
5. **Nombre de la base y del dominio**: propuesta `facylf_web` y un dominio por decidir.

---

## 6 · (e) Lo que hoy impediría que un aficionado vea una jornada real

Todo comprobado con `curl` desde el servidor contra `http://100.117.58.93:3100` el 9/11/2026. «404» = la
ruta no existe en la imagen desplegada; «OK» = responde 200 (pero es la web vieja).

| # | Ruta exacta | Estado | Causa real medida |
|---|---|---|---|
| 1 | `http://<cualquier-dominio>/` | **Inaccesible** | No hay dominio, ni DNS, ni TLS, ni túnel. Sólo `100.117.58.93:3100` (Tailscale). `tailscale serve` = «No serve config» |
| 2 | `/` (portada de Fondo Popular) | **Título viejo** | La imagen es del 24/09 y sirve «Observatorio de fútbol»; Fondo Popular no está desplegado |
| 3 | `/explorar/competiciones` | **404** | Ruta nueva no incluida en la imagen desplegada |
| 4 | `/explorar/competicion/368` | **404** | Ídem. (El grupo 368 existe y tiene 18 partidos, 16 con resultado: el dato está, la pantalla no) |
| 5 | `/explorar/competicion/368/jornadas` | **404** | Ídem |
| 6 | `/explorar/competicion/368/jornada/1` | **404** | Ídem |
| 7 | `/explorar/competicion/368/calendario` | **404** | Ídem |
| 8 | `/explorar/competicion/368/estadisticas` | **404** | Ídem |
| 9 | `/explorar/acta/<id>` | **404** | Ídem |
| 10 | `/explorar/jugador/<id>`, `/explorar/equipo/<id>`, `/explorar/club/<id>` | **404** | Ídem |
| 11 | `/explorar/rankings`, `/explorar/ojeo`, `/explorar/comparar` | **404** | Ídem |
| 12 | `/explorar/federacion/castilla-leon`, `/explorar/liga/<id>` | **404** | Ídem |
| 13 | `/explorar/datos`, `/explorar/salud`, `/explorar/estados`, `/explorar/publicidad` | **404** | Ídem |
| 14 | `/entrar`, `/crear-cuenta`, `/mi-cuenta`, `/mi-panel` | **404** | Ídem |
| 15 | `/admin`, `/admin/usuarios` | **404** | Ídem |
| 16 | `/api/v1/...` (los 7 endpoints) | **404** | Ídem; la API de Fondo Popular no existe en la imagen en marcha |
| 17 | `/api/revalidar` | **404/503** | No está en la imagen; aunque estuviera, falta `REVALIDACION_SECRETO` en el servidor |
| 18 | Portada y catálogo **si se desplegara la imagen nueva contra el canónico actual** | **«Falta una tabla del canónico»** | Esquema en 0015: faltan 53 de 78 referencias (41 tablas/vistas —`analytics.nombre_corto_equipo`, `app.*`, `ops.invalidacion`, `analytics.zonas_de_grupo`…— y 12 funciones de tabla) |
| 19 | Cuentas/favoritos/admin **incluso con la base migrada** | **Sin datos** | No existe el rol `facylf_app` ni `DATABASE_URL_APP` en el servidor |
| 20 | Invalidación de caché (tras cada importación) | **No funciona** | `ops.invalidacion`/`consume_invalidaciones` no existen (0036) y falta el secreto |
| 21 | Datos de **La Preferente** | **Ocultos por diseño** | Decisión D2: sólo en web interna marcados «no oficial»; **no hay RLS aplicada en el servidor**, así que al migrar hay que aplicarla y decidir D2-bis |
| 22 | Leyenda legal de cualquier página pública | **No existe** | No hay aviso legal, privacidad ni cookies; sin eso no se publica a Internet |
| 23 | Un aficionado con móvil por la calle | **No llega** | Sólo Tailscale; además el host no resuelve DNS y el origen es una conexión de casa (medido: 1,6 MB/s PC↔servidor) |
| 24 | Rendimiento percibido hoy (web vieja) | **2–11 s TTFB** | `force-dynamic` + compartir 4 núcleos con 19 recolectores (carga 11,2); 20 peticiones simultáneas → 4–16 s |

**Lo que sí funciona hoy** (para no exagerar): la web vieja en la IP de Tailscale responde 200 y **enseña
datos reales** — `/partidos` muestra «16 federaciones con datos · temporada 2026-27» y 15.009 partidos de
2026-27 con marcadores y actas (p. ej. partidos del 5/11 en Galicia); `/competiciones`, `/federaciones` y
`/canonico` también responden. El problema no es que falten datos: es que **ese producto no es Fondo
Popular** y no está publicado.

---

## 7 · Anexo A · Comandos de medición (reproducibles)

```bash
# Infraestructura
ssh servidor 'uname -a; free -h; df -h /; uptime; docker system df'
ssh servidor "docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' facylf-web facylf-postgres"
ssh servidor "docker image inspect facylf-web:local --format '{{.Created}} {{.Size}}'"
ssh servidor "ss -ltnp | grep -E '3100|5433'"
ssh servidor "tailscale status; tailscale serve status; tailscale dns status"
ssh servidor "cat /etc/resolv.conf; getent hosts github.com"; echo "rc=$?"
ssh servidor "curl -sL --max-time 10 http://1.1.1.1/cdn-cgi/trace | grep -E '^(ip|loc)='"
ssh servidor "crontab -l; du -sh /srv/data/backups/facylf/*"

# Base de datos (servidor)
ssh servidor "docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc \
  \"select datname, pg_size_pretty(pg_database_size(datname)) from pg_database\""
# 16 GB
ssh servidor "docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc \
  \"select n.nspname, pg_size_pretty(sum(pg_total_relation_size(c.oid))) from pg_class c \
   join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','m') \
   and n.nspname not in ('pg_catalog','information_schema','pg_toast') group by 1 order by 2 desc\""
# core 8691 MB, ops 6812 MB (batch_cambio 6783 MB), source 404 MB, analytics 128 kB
# OJO: si se añade relkind 'i' a la consulta, los índices se cuentan DOS veces (pg_total_relation_size
# ya los incluye) y los esquemas parecen mayores que la propia base. Se filtra sólo 'r','m'.
ssh servidor "docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc \
  'select count(*), max(numero), max(nombre) from ops.migracion'"   # 15 | 15 | 0015-...

# Referencias que usa la web que faltan en el servidor (53 de 78: 41 tablas/vistas + 12 funciones)
grep -rhoE '(from|join) +[a-z_]+\.[a-z_0-9]+' apps/web/src/consultas/*.ts \
  | sed -E 's/^(from|join) +//' | sort -u > /tmp/rels.txt
# y contraste con to_regclass(...) y pg_proc en psql

# TTFB (desde el servidor)
curl -s -o /dev/null -w '%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}\n' \
  http://100.117.58.93:3100/explorar/competiciones

# Base del PC (docker local, puerto 5433)
docker exec -i -e PGPASSWORD=*** facylf-postgres psql -U facylf_admin -d facylf -Atc \
  "select pg_size_pretty(pg_database_size('facylf'))"          # 36 GB
# y select count(*) from core.season / core.competition_edition por federación

# Volcado del canónico del PC (medido el 9/11/2026: 1.332.591.552 B en 455 s)
cmd /c "docker exec -e PGPASSWORD facylf-postgres pg_dump -U facylf_admin -d facylf \
  -Fc --no-owner > tmp\despliegue\pc-facylf.dump"

# Versiones de las herramientas (riesgo de restauración): PC y servidor
docker exec facylf-postgres pg_dump --version                       # 18.6
ssh servidor "docker exec facylf-postgres pg_restore --version"     # 18.6

# Qué contiene un volcado de esquema (roles, base, ACL)
cmd /c "docker exec -e PGPASSWORD facylf-postgres pg_dump -U facylf_admin -d facylf \
  --schema-only --no-owner > tmp\despliegue\pc-schema.sql"
# grep: NO aparecen CREATE ROLE / CREATE DATABASE / ON DATABASE
# grep: 131 referencias a facylf_app y 116 a facylf_lector (GRANT + política RLS)
```

## 8 · Anexo B · Fuentes de precios consultadas (9/11/2026)

- Hetzner Cloud — [hetzner.com/cloud/cost-optimized](https://www.hetzner.com/cloud/cost-optimized/):
  CX23 5,99 €/mes, CAX11 6,49 €/mes, CX33 8,99 €/mes (sin IVA, 20 TB de tráfico; modelos marcados
  «not available» en el momento de la consulta).
- Neon — [neon.com/pricing](https://neon.com/pricing): Free 1 GB/proyecto y 100 CU-horas; Launch
  0,106 $/CU-hora y 0,35 $/GB-mes.
- Supabase — [supabase.com/pricing](https://supabase.com/pricing): Free 500 MB; Pro 25 $/mes, 8 GB,
  0,125 $/GB extra; cómputo Micro/Small/Medium 10/15/60 $.
- Railway — [railway.com/pricing](https://railway.com/pricing): Free/Hobby/Pro, volúmenes y precios por
  segundo; Hobby hasta 5 GB de almacenamiento.
- Fly.io — [fly.io/pricing](https://fly.io/pricing) y [fly.io/mpg](https://fly.io/mpg): Machines
  `shared-cpu-8x·2GB` 17,55 $/mes; MPG Basic 38 $/mes (1 GB) + 0,28 $/GB-mes.
- Cloudflare Tunnel — [developers.cloudflare.com · Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/):
  **no he podido leer una tarifa** en la documentación consultada; no se usa cifra.
- Tailscale — [tailscale.com/pricing](https://tailscale.com/pricing): Personal 0 $, Standard 8 $/usuario,
  Premium 18 $/usuario. Límites de Funnel: **no verificados** en la consulta.
- **Contabo, OVH y Netcup**: páginas oficiales devolvieron contenido dinámico/error; **precios no
  verificados**, no se incluyen.
- Dominio: **no verificado**; no se usa importe en el cálculo.

## 9 · Anexo C · Discrepancias con los datos de partida de la tarea

| Dato de la tarea | Medido el 9/11/2026 | Nota |
|---|---|---|
| Servidor: 259 ediciones, 152 completas de CyL | 259 ediciones, **183** con `visibility_state='completa'` | El criterio «152» no coincide con la columna; puede venir de otro indicador |
| PC: 15 temporadas, 808 ediciones, 138 completas | 15 temporadas, **807** ediciones, **283** completas | Igual: criterio distinto o cifra de otro día (`metricas-facylf.json`) |
| «Casi nada de 2026-27 en el servidor» | **2.171 partidos / 1.825 con resultado / 370 jornadas** de CyL en 2026-27 | Hay datos suficientes para una jornada; lo que no hay es la web desplegada |
| «El contenedor facylf-web lee el canónico» | Cierto, pero es la **web vieja** (imagen del 24/09) y con el canónico en 0015 | El lector sí es `facylf_lector` |

---

*Documento escrito por el agente de despliegue (task-4). No se ha modificado código, migraciones,
contenedores ni compose; las únicas escrituras son este documento y los ficheros de trabajo de
`tmp/despliegue/`.*
