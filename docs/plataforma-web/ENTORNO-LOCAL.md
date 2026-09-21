# Entorno local de desarrollo

Estado: decisión de operación, 14 de septiembre de 2026. El canónico se desarrolla contra un
**PostgreSQL local en contenedor** ([ADR-0008](decisiones/0008-postgres-local-docker.md)). No hay
proveedor gestionado en el camino crítico: los datos incluyen nombres de menores y el volumen
objetivo son millones de actas.

## 1. Servicio

`infra/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:18
    container_name: facylf-postgres
    environment:
      POSTGRES_DB: facylf
      POSTGRES_USER: facylf_admin
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?falta POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "--locale-provider=icu --icu-locale=es-ES --encoding=UTF8"
    command:
      - postgres
      - -c
      - shared_preload_libraries=pg_stat_statements
      - -c
      - max_connections=50
      - -c
      - shared_buffers=1GB
      - -c
      - work_mem=32MB
      - -c
      - maintenance_work_mem=512MB
      - -c
      - effective_cache_size=3GB
      - -c
      - random_page_cost=1.1
      - -c
      - track_io_timing=on
    ports:
      - "127.0.0.1:5433:5432"
    volumes:
      - facylf-pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U facylf_admin -d facylf"]
      interval: 10s
      timeout: 5s
      retries: 10
volumes:
  facylf-pg:
```

Decisiones con motivo:

- **Puerto 5433 y sólo en `127.0.0.1`.** Evita chocar con un PostgreSQL ya instalado y no expone la
  base a la red local ni siquiera por accidente.
- **Colación ICU `es-ES`.** Con la colación por defecto, `Álvarez` y `Alvarez` ordenan de forma
  incoherente y `ORDER BY nombre` da resultados distintos que la búsqueda.
- **`random_page_cost=1.1`.** El disco es SSD; el valor por defecto (4) empuja al planificador a
  recorridos secuenciales y falsea todas las mediciones de índices.
- **`shared_buffers=1GB` y `work_mem=32MB`** son un punto de partida para un equipo que ya sostiene
  diecisiete recolectores. Se suben sólo con una medición delante.
- **`pg_stat_statements`** desde el primer día: sin él, la fase 7 no tiene sobre qué decidir.

Arranque:

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrar
```

La carga de muestras (`datos:semilla`) pertenece a la fase 1 y todavía no está implementada. El
arranque verificable actual termina con las migraciones.

## 2. Disco: el recurso que ya aprieta

`ESTADO-INGESTA.md` mide 32,7 GB de evidencia guardada y 96,6 GB libres, con una proyección de
cientos de GB. El PostgreSQL canónico **suma** a eso.

- El volumen del contenedor no vive en la misma partición que `descargas-*` si se puede evitar.
- El canónico no guarda HTML: guarda ruta y hash. Ese es el motivo de que quepa.
- Estimación de partida: los hechos de un grupo completo (306 partidos, ~9.000 participaciones,
  ~1.900 eventos) ocupan del orden de 2-3 MB con índices. Antes de cargar una federación entera se
  mide con una y se extrapola, en vez de descubrirlo con el disco lleno.
- El WAL de PostgreSQL durante una importación masiva crece rápido: las importaciones grandes van
  por lotes con `COMMIT` frecuente, no en una transacción única de millones de filas.

## 3. Roles

Las migraciones crean tres roles desde el principio, aunque en local se use uno solo. Descubrir en
el servidor que la web tenía permisos de escritura es tarde.

```sql
create role facylf_lector    login password :'pwd_lector'   nosuperuser nocreatedb nocreaterole;
create role facylf_publicador login password :'pwd_pub'      nosuperuser nocreatedb nocreaterole;
-- facylf_admin es el dueño de las migraciones y no se usa en ejecución.

grant usage on schema core, analytics to facylf_lector;
grant select on all tables in schema core, analytics to facylf_lector;
alter default privileges in schema core, analytics
  grant select on tables to facylf_lector;
```

`apps/web` se conecta **siempre** como `facylf_lector`. Un `INSERT` desde la web debe fallar con un
error de permisos, y hay un test que lo comprueba.

## 4. Variables de entorno

`.env.local`, nunca versionado:

```bash
POSTGRES_PASSWORD=...
DATABASE_URL_LECTOR=postgres://facylf_lector:...@127.0.0.1:5433/facylf
DATABASE_URL_PUBLICADOR=postgres://facylf_publicador:...@127.0.0.1:5433/facylf
DATABASE_URL_MIGRACION=postgres://facylf_admin:...@127.0.0.1:5433/facylf
REVALIDACION_SECRETO=...
```

La web sólo lee `DATABASE_URL_LECTOR`. Si encuentra otra, arranca y avisa en el log; en producción,
no arranca.

## 5. Migraciones

SQL plano y numerado en `infra/migraciones/NNNN-descripcion.sql`, aplicado por un script propio que
registra en `ops.migracion`. Sin ORM y sin generador: el esquema de este proyecto tiene claves
compuestas contextualizadas, índices parciales y de expresión, y extensiones; un generador los
deteriora.

Reglas:

- Una migración nunca se edita después de aplicarse en cualquier entorno; se escribe otra.
- Toda migración es reversible o declara por qué no lo es.
- Los índices grandes se crean con `CREATE INDEX CONCURRENTLY` cuando el entorno ya tiene datos.
- Antes de cerrar una migración que toca tablas de hechos, se ejecuta `ANALYZE` sobre ellas.

## 6. Conexiones

Pool único por proceso, máximo 10 conexiones para la web, 5 para el publicador. Con `max_connections=50`
sobra margen para psql y scripts. Cada consulta lleva `statement_timeout` (5 s en la web, sin límite
en el publicador) para que una consulta mal planificada no bloquee una página indefinidamente.

## 7. Del contenedor al servidor

La misma imagen, las mismas migraciones y los mismos roles. Lo único que cambia en el servidor:
PostgreSQL en red privada sin puerto publicado, copias con WAL/PITR, y el publicador ejecutándose
como trabajo independiente. Ver [SEGURIDAD-OPERACION.md](SEGURIDAD-OPERACION.md) §7 y §9.
