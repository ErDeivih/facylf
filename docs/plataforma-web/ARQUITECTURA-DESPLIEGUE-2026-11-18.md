# Despliegue de Fondo Popular · VPS, datos y observabilidad

Fecha: 18/11/2026. Este documento decide **dónde vive cada pieza** y cómo llegan los resultados de la
ingesta a la web. No modifica el ingestor: sólo describe cómo conectarlo.

## 1 · Decisión recomendada

Para la primera puesta en producción: **un VPS con todo el stack junto** (PostgreSQL canónico, web,
Redis, Caddy y observabilidad), no una web remota contra una base en casa.

Motivo: la web lee el canónico en cada petición y las cuentas escriben en `app.*`. Separar web y base
añade latencia, un túnel y un punto de fallo sin resolver el problema real, que es el tamaño de la base
y las copias.

Si la ingesta debe seguir en el servidor de casa, hay dos caminos:

1. **Túnel privado** (WireGuard/Tailscale/Cloudflare Tunnel) desde el VPS a la base de casa. La web
   queda en el VPS, pero cada consulta cruza la conexión de casa: sólo vale para poco tráfico.
2. **Relación de réplica** (streaming replication) para lectura pública y una base `app` local para
   cuentas. Es la opción de escala, pero exige separar escrituras y probar failover. No es la primera.

## 2 · Topología recomendada

```text
Internet
  │  DNS + TLS + WAF + caché de estáticos
Cloudflare (o Caddy directo)
  │
Caddy :80/:443  ── rate limit de borde, compresión, HSTS
  │
  ├── web-1 :3000  Next standalone
  ├── web-2 :3000  (opcional; Redis comparte el límite)
  │
  ├── Redis :6379  límites compartidos
  ├── PgBouncer :6432
  │      └── PostgreSQL 18 (primary) :5432
  │
  └── observabilidad: Prometheus, Grafana, exporters, Uptime Kuma
```

- **PostgreSQL** guarda el canónico y `app.*`. La web usa dos roles: `facylf_lector` para leer y
  `facylf_app` para cuentas/favoritos. Nunca el superusuario.
- **PgBouncer** en modo `transaction` para que dos réplicas web no agoten `max_connections=50`.
- **Redis** es obligatorio si hay más de una réplica web; con una sola, el fallback en memoria sigue
  siendo válido.
- **Cloudflare** delante de Caddy: WAF, caché de imágenes/estáticos, TLS y protección DDoS. Si no hay
  Cloudflare, Caddy hace TLS con Let's Encrypt y el rate limit del proxy es la única barrera.

## 3 · Tamaño y coste

Referencias consultadas el 18/11/2026:

- Hetzner CX33: **4 vCPU / 8 GB / 80 GB**, ~**8,49–8,99 €/mes** sin IVA según la fuente; el precio
  cambia con la región y la disponibilidad. [Hetzner Cloud](https://www.hetzner.com/cloud/).
- Coolify: autoalojado, **sin coste de licencia**; se instala en el VPS y despliega el compose.
  [Coolify](https://coolify.io/).
- Cloudflare: plan Free para DNS/TLS/WAF básico; Tunnel no tiene precio publicado verificado.

**80 GB no bastan** si la base son 16–36 GB más copias y la imagen: usa un plan con **160 GB** o un
volumen adicional. No invento el precio del volumen: se confirma en el alta.

PaaS (Vercel/Netlify) no encaja: la app necesita un Node de larga duración (`instrumentation.ts`),
Redis y un proxy con IP fiable. Neon/Supabase tienen planes gratuitos que no llegan al tamaño de la
base; los de pago se comparan en `DESPLIEGUE-FONDO-POPULAR.md`.

## 4 · Resultados e ingesta casi en tiempo real

**Estado real, no el deseado:** el receptor de lotes del VPS (`infra/vps/receptor-lotes.sql`) es todavía
un contrato en borrador; no está desplegado y no llama a `ops.invalidacion`. La caché de la web tiene
`CADUCIDAD_CACHE_SEGUNDOS = 300`, así que hoy el retraso máximo percibido ronda **cinco minutos** más
el ciclo de invalidación de 60 s, no «segundos».

Para que la web vea un resultado en cuanto se ingiere hay dos caminos, en este orden:

### 4.1 · Recomendado: replicación lógica

- La base de casa (donde escribe el ingestor) publica las tablas de `core` y `analytics`:
  `CREATE PUBLICATION facylf_publica FOR TABLES IN SCHEMA core, analytics, ops;` — `ops.invalidacion` también debe viajar, porque es lo que dispara `revalidateTag`. No se replica `ops.lote_cargado` ni colas internas de la ingesta.
- El VPS se suscribe: `CREATE SUBSCRIPTION facylf_vps CONNECTION ... PUBLICATION facylf_publica;`
- El ingestor **no cambia**: sigue escribiendo en su primaria.
- El VPS lee la réplica; las tablas `app.*` (cuentas/favoritos) viven en el VPS y no se replican, porque
  son escrituras de la web, no del canónico. Si una consulta mezcla `app` y `core`, hay que separarla.
- Latencia: el lag de WAL, normalmente < 1 s. Se monitoriza; si supera 10 s, se muestra «datos en
  actualización» o se sirve la caché anterior, nunca una tabla a medias.
- Requiere PostgreSQL de la misma versión mayor y una publicación bien delimitada; las migraciones de
  `core/analytics` se aplican primero en la primaria.

### 4.2 · Alternativa si no se quiere replicación: lotes con invalidación

El receptor de lotes debe:

1. Conservar los `id` de casa y hacer `ON CONFLICT (id)`; la clave natural con `fecha_prevista` no
   sirve porque un aplazamiento crearía un duplicado y no hay índice único que la respalde.
2. Cargar en una transacción y, al final, llamar a `ops.invalida_grupo` para los grupos tocados.
3. Llevar lápidas para borrados/retirados, no solo inserciones.
4. Llamar a `POST /api/revalidar` (o dejar que el temporizador de `instrumentation.ts` lo recoja).
5. No cargar dos veces el mismo lote (`ops.lote_cargado`).

Con esta vía el retraso es el del lote (10–15 min) más la invalidación, no tiempo real. Es aceptable
para horarios, no para un resultado que se acaba de jugar.

### 4.3 · Cambios de horario

Actualizar `core.match` en la primaria y dejar que la replicación o el lote propaguen; la web invalida
el grupo. No se hace polling por visita.


## 4.4 · Copias y recuperación

- **RPO objetivo: 15 minutos** con WAL archiving/PITR; si no se activa PITR, RPO = última copia diaria.
- Copia diaria `pg_dump -Fc` de `core`, `analytics` y `app` a almacenamiento **fuera del VPS**
  (S3 compatible o disco distinto), retención 14 días + una mensual.
- **RTO objetivo: 2 horas** en un VPS nuevo: instalar Docker, restaurar, migrar, levantar compose.
- Ensayo obligatorio: restaurar en una base vacía y comprobar `core.match`, `app.usuario` y una consulta
  de la web; no se considera copia válida hasta que se restaura.
- **Ensayo de esquema hecho el 18/11/2026**: `pg_dump --schema-only` de 503 KB restaurado en una base
  limpia con `ON_ERROR_STOP`; 104 tablas en `core`, `analytics` y `app`. No es una restauración de los
  45 GB de datos: eso exige una ventana de mantenimiento y un disco de prueba.
- Alertar si la copia más reciente tiene más de 26 horas.

## 4.5 · PgBouncer

La web abre un `Pool` con `statement_timeout` en el arranque; PgBouncer en modo `transaction` rechaza
ese parámetro salvo que se configure `ignore_startup_parameters = statement_timeout` o se fije el
límite con `ALTER ROLE facylf_lector SET statement_timeout`. El `set local` por consulta sigue
funcionando. Sin PgBouncer, dos réplicas web pueden agotar `max_connections=50`.

## 4.6 · Balanceo

Caddy puede repartir entre `web:3000` y `web2:3000` con `lb_policy round_robin`. Redis es obligatorio
en ese caso: el límite por proceso no se comparte. Si no hay Redis, se queda una sola réplica.

## 5 · Observabilidad

Dos capas:

- **Infraestructura**: Prometheus + Grafana + `node_exporter` + `postgres_exporter` + `cAdvisor` +
  `blackbox_exporter` (sonda HTTPS de `/api/salud`). Retención 15 días; disco pequeño.
- **Producto**: ya existe `app.evento_web` y `/admin/metricas` (sin cookies). Para embudos y páginas
  más vistas se puede añadir **Umami** autoalojado, que usa PostgreSQL y no cookies; no se instala
  mientras baste con la primera capa.

Alertas mínimas: web caída, 5xx > 5 %, latencia p95 > 2 s, disco > 80 %, PostgreSQL conexiones > 80 %,
Redis caído, lag de réplica > 10 s, backup fallido.

## 6 · Anuncios locales

La base ya tiene `app.espacio_anuncio` y `app.campana_anuncio`, y la página `/explorar/publicidad`
explica los huecos. Estado actual: **cero campañas**, todo apagado; no se inventa publicidad. La vista `analytics.anuncio_publico` se probó con una campaña temporal y devolvió el anuncio; después se borró y el hueco volvió a apagado.

Cuando haya un patrocinador local:

- creatividades en `public/anuncios/` (estáticas, sin scripts de terceros);
- una vista pública o API que lea sólo campañas activas, sin exponer `app.*`;
- clic por `/api/anuncio/click` con contador propio, sin cookies publicitarias;
- nada de anuncios en páginas de menores, acceso, cuenta o administración;
- si hay personalización, consentimiento previo; si no, sólo contextual.

## 7 · Rendimiento

Antes de abrir:

1. `EXPLAIN (ANALYZE, BUFFERS)` de las consultas de portada, competición, jornada, previa y goleadores;
   índices que falten van en migración nueva.
2. PgBouncer y `max_connections`; no abrir una conexión por visita.
3. Imágenes de escudos/fotos: ya estáticas y con caché; no servirlas desde PostgreSQL.
4. Medir con Lighthouse/Playwright en 390 y 1280; presupuesto: LCP < 2,5 s en 4G, CLS < 0,1, sin
   scroll horizontal.
5. Revisar `revalidate` y tags: no cachear datos de cuenta.

## 7.1 · Imagen verificada

El 18/11/2026 se construyó la imagen desde un **archivo limpio de Git** (109 MB de contexto, no los 18 GB del árbol de trabajo):

```bash
git archive --format=tar HEAD | tar -xf - -C tmp/contexto-docker
docker build -f tmp/contexto-docker/apps/web/Dockerfile -t facylf-web:test tmp/contexto-docker
docker run --env-file ... -p 3100:3000 facylf-web:test
```

Resultado: `/api/salud` 200, `/api/ready` 200 contra PostgreSQL real, home 200 y competición 308 (redirección normal). La imagen `facylf-web:test` se construyó correctamente.

Además se levantó el stack local **web + Redis + Caddy + PostgreSQL** en el puerto 8090: `/api/salud` y `/api/ready` 200, home 200 y **11 respuestas 429** en una ráfaga de 190 peticiones, con la clave de Redis creada. El stack se apagó después de la prueba.

Caddy: `caddy validate` → `Valid configuration`. Prometheus: `promtool check config` → configuración válida y 6 reglas. Se ejecutó dentro de contenedores, copiando los ficheros, para evitar la conversión de rutas de Windows.

## 8 · Puesta en marcha

```bash
# 1. VPS con Docker y Coolify (o docker compose)
# 2. Copiar deploy/ y .env; base canónica restaurada desde copia
# 3. Levantar web + Redis + Caddy
docker compose -f deploy/docker-compose.yml up -d --build
# 4. Levantar observabilidad
docker compose -f deploy/observabilidad/docker-compose.yml up -d
# 5. Comprobar
curl -fsS https://TU_DOMINIO/api/salud
```

Antes de abrir: copia de la base, prueba de restauración, DNS, TLS, cabeceras, límites y una pasada
de Claude/Codex sobre páginas públicas.

## 9 · Lo que no se hace

- No se toca el ingestor ni su ritmo.
- No se publica PostgreSQL a Internet.
- No se usa el superusuario en la web.
- No se ponen anuncios de terceros con cookies sin consentimiento.
- No se despliega en serverless mientras `instrumentation.ts` y el rate limit dependan de un proceso
  largo.
