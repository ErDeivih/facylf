# Las 116 GB de copias del servidor: ¿están en `/srv/data` y afecta borrarlas a la ingesta?

**Fecha:** 16/11/2026. Paso 8 del encargo. **No se ha borrado nada.** Todo lo que sigue está medido con
`ssh servidor`, `docker exec facylf-postgres psql` y `find`/`du` en el servidor.

## 1 · Qué son los 116 GB (y dónde están)

Las cuatro bases antiguas siguen ahí, dentro del **volumen de Docker** de PostgreSQL
(`facylf_facylf-pg` → `/var/lib/postgresql`), no como ficheros sueltos:

| Base | Tamaño | Conexiones ahora | `xact_commit` acumuladas |
|---|---:|---:|---:|
| `facylf_canonico_4` | **30 GB** | **0** | 22.493 |
| `facylf_canonico_3` | **29 GB** | **0** | 20.098 |
| `facylf_canonico_2` | **29 GB** | **0** | 20.108 |
| `facylf_canonico` | **28 GB** | **0** | 20.521 |
| **Suma** | **116 GB** | | |
| `facylf` (viva, la que usa todo) | 16 GB | 0 en el instante de la medida | 641.241 |

`pg_stat_database` las ve, pero **ninguna tiene una sola conexión**: son puntos de restauración, no bases
en uso. El volumen completo son 132 GB y el disco `/` está al **91 % (190 GB usados, 20 GB libres)**; el
disco `/srv/data` es otro (`/dev/sdb1`, 291 GB usados, **163 GB libres**) y no es el que se llena.

## 2 · ¿Están replicadas en `/srv/data`? **No.**

`/srv/data` **no contiene** las cuatro bases ni una copia equivalente de 116 GB. Lo que hay, medido:

| Qué | Tamaño | Dónde | Qué es |
|---|---:|---|---|
| `/srv/data/backups/facylf` | **9,5 GB** | `/srv/data/backups/facylf` | Copia diaria de la base **viva** (`facylf-2026-11-16.dump`, 601 MB) + colas SQLite y catálogos |
| `/srv/data/facylf/backups-volcados` | **5,5 GB** | `/srv/data/facylf/backups-volcados` | **Cuatro volcados lógicos de `facylf-canonico`** de los días 9 y 10/11 (1,45-1,54 GB cada uno) |
| `/srv/data/facylf` (código y estado) | — | `/srv/data/facylf` | Repositorio de operación del servidor, no bases |

Los cuatro volcados de `backups-volcados` son de **una** base (`facylf-canonico`), no de las cuatro
(`_2`, `_3`, `_4`), y son de hace una semana. **No hay copia lógica de `facylf_canonico_2`, `_3` ni `_4`
en `/srv/data`.** Es decir: los 116 GB **no están replicados**; lo que hay es un 5 % de ellos en volcados
de una sola de las bases.

## 3 · ¿Borrar los 116 GB afectaría a la ingesta? **No.**

La ingesta del servidor no lee ninguna de las cuatro:

| Pieza | Qué base usa | Prueba |
|---|---|---|
| Importador (`facylf-importador`) | `facylf` | `docker inspect facylf-importador` → `DATABASE_URL_PUBLICADOR=…/facylf` |
| Cron del canónico | `facylf` | `crontab -l` → `psql -d facylf` cada minuto |
| Copias (`scripts/servidor/copias.sh`) | `facylf` | `pg_dump … -d facylf -Fc` (línea 91) |
| Web publicada (`facylf-web`) | `facylf` | `DATABASE_URL_LECTOR=…/facylf` |
| Recolectores | sus colas SQLite | no hablan con PostgreSQL |

Ni `scripts/`, ni `config/`, ni el compose del servidor referencian `facylf_canonico*`. La única referencia
viva del proyecto es la del PC: `DATABASE_URL_LECTOR_SERVIDOR=…/facylf_canonico_4` en `.env`, que usa
`tmp/sirve-web-servidor.ps1` para enseñar la web apuntando a esa copia. **Borrar `_4` rompería esa vía
opcional del PC, no la ingesta ni la web del servidor.**

## 4 · Qué se ganaría y qué se perdería

- **Ganancia:** ~116 GB en `/`, que pasarían de 190 GB usados a ~74 GB (unos 65 GB libres). `/srv/data` no
  cambia. El volumen de Docker bajaría de 132 GB a ~16 GB.
- **Pérdida:** los cuatro puntos de restauración antiguos. El único volcado alternativo es el de
  `backups-volcados` del 10/11 (1,5 GB, una sola base) y el dump diario de la base viva (`facylf`).
- **Riesgo real:** bajo para la ingesta; medio para una restauración histórica. Antes de borrar habría que
  decidir si se conserva `facylf_canonico_4` (el más nuevo, 30 GB) o se genera un volcado comprimido suyo
  (cabe de sobra en `/srv/data`, que tiene 163 GB libres) y se borran las cuatro.

## 5 · Recomendación (sin ejecutar)

1. **No borrar hoy.** El disco `/` tiene 20 GB libres y la ingesta no está en riesgo; no hay urgencia.
2. Cuando David lo autorice: `pg_dump -Fc facylf_canonico_4` a `/srv/data/backups/facylf/` (≈1,5 GB),
   comprobar que restaura en una base de prueba, y después `drop database` de `facylf_canonico`,
   `facylf_canonico_2`, `facylf_canonico_3` y `facylf_canonico_4`. Eso libera los 116 GB.
3. Si solo se quiere aliviar `/`: borrar primero `facylf_canonico` y `_2` (57 GB) deja margen y conserva
   las dos más recientes.
4. Revisar antes si algún proceso del PC sigue usando `facylf_canonico_4` (`sirve-web-servidor.ps1`); si
   se quiere mantener esa vía, conservar `_4` o reapuntarla a `facylf`.

## 6 · Reproducir la medida

```bash
ssh servidor 'docker exec facylf-postgres psql -U facylf_admin -d postgres -Atc \
  "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database order by 2 desc;"'
ssh servidor 'docker exec facylf-postgres psql -U facylf_admin -d postgres -Atc \
  "select datname, numbackends from pg_stat_database where datname like '"'"'facylf%'"'"';"'
ssh servidor 'du -sh /srv/data/backups/facylf /srv/data/facylf/backups-volcados'
ssh servidor 'docker inspect facylf-importador --format "{{range .Config.Env}}{{println .}}{{end}}" | grep DATABASE'
ssh servidor 'crontab -l; grep -n "pg_dump" /srv/data/facylf/scripts/servidor/copias.sh'
```
