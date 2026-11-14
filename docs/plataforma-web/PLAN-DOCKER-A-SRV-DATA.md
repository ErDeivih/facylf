# Plan para mover el directorio de datos de Docker a `/srv/data` (sin ejecutarlo)

**Fecha:** 14/11/2026. **Estado:** plan medido; **no se ha movido ni borrado nada**. Necesita el sí de David y una
ventana de mantenimiento.

## 1 · Lo que hay medido

| Pieza | Medida |
|---|---:|
| `Docker Root Dir` | `/var/lib/docker` |
| Tamaño de `/var/lib/docker` | **145 GB** |
| Dentro: volúmenes | **141,7 GB** (de ellos, el volumen de PostgreSQL `facylf_facylf-pg`: 132 GB) |
| Dentro: capas de contenedores | 11,5 GB (5,6 GB reclamables con `docker container prune`) |
| Imágenes | 7,6 GB (3 imágenes `radiopv-*` antiguas: 5,4 GB) |
| Caché de build / logs de contenedores | 276 MB / 266 MB |
| Disco `/` (`sda3`, **SSD** XrayDisk, 225 MB/s lectura) | 211 GB, **190 GB usados, 19 GB libres (91 %)** |
| Disco `/srv/data` (`sdb1`, **HDD** WDC, 64 MB/s lectura) | 458 GB, 291 GB usados, **163 GB libres** |
| `/srv/ssd` | **no es otro disco**: cuelga de `sda3` (mismo SSD de 19 GB libres) |

**Dos avisos que condicionan el plan:**
1. `/srv/data` es un **disco mecánico** (64 MB/s): mover ahí el PostgreSQL y todos los contenedores los hará más
   lentos (sobre todo el acceso aleatorio de la base).
2. Copiar 145 GB sobre 163 GB libres deja solo **18 GB de margen**. Antes de mover conviene liberar espacio.

## 2 · Orden recomendado (de menos a más riesgo)

1. **Liberar las copias antiguas de la base (necesita el sí de David).** El volumen de 132 GB tiene la base viva
   (`facylf`, 16 GB) y **cuatro copias antiguas** (`facylf_canonico`, `_2`, `_3`, `_4`) de 28+29+29+30 = **116 GB**.
   Borrarlas deja `/` en ~74 GB usados (35 %) **sin mover nada ni tocar el hardware**. Se comprueba antes que la
   copia buena es `_4` o que se regeneran con `trae-federacion-servidor.ps1`.
2. **Si aun así hay que sacar Docker del SSD:** mover **solo el volumen de PostgreSQL** (141,7 GB) a `/srv/data`
   mediante un montaje `bind` en el compose; el resto de Docker se queda en el SSD. Menos downtime (solo se para
   `facylf-postgres` y sus dependientes) y no penaliza a los demás proyectos.
3. **Mover TODO el data-root** (lo que pide este plan) solo si David acepta que todo Docker pase al HDD.

## 3 · Plan completo para mover el data-root (paso 3), sin ejecutar

### Antes (con David)
- [ ] Ventana sin ingesta ni uso: la flota del servidor son 6 contenedores `facylf` entre 16 activos (también
      `cuedigital` ×3, `lyfta`, `uptime`, `ntfy`, `homepage`, `boton`, `lanzador`, `vigilante`). **Parada total
      de Docker**: ~30-45 min.
- [ ] Aprobar el borrado posterior de `/var/lib/docker` viejo (145 GB) cuando la nueva ubicación esté verificada;
      sin ese borrado, el disco no se libera.
- [ ] Copia de seguridad aparte de la base (pg_dump o la copia diaria) por si el `rsync` sale mal.

### Pasos (comandos exactos)
```bash
# 0. Comprobar que /srv/data tiene sitio y es el disco grande
df -h / /srv/data

# 1. Parar la ingesta y todos los contenedores (el orden importa: primero la flota)
cd /srv/data/facylf/docker && docker compose -p facylf -f compose.yml -f compose-turnos.yml --env-file .env stop
docker ps -q | xargs -r docker stop
systemctl stop docker docker.socket

# 2. Copiar preservando permisos, dueños, xattrs y ACLs (la vieja NO se toca: es el rollback)
sudo mkdir -p /srv/data/docker
sudo rsync -aHAX --numeric-ids --info=progress2 /var/lib/docker/ /srv/data/docker/

# 3. Verificar la copia antes de conmutar (mismo tamaño y mismo número de ficheros)
sudo du -s /var/lib/docker /srv/data/docker
sudo find /var/lib/docker -type f | wc -l; sudo find /srv/data/docker -type f | wc -l

# 4. Conmutar el data-root (Docker 27 lo lee de daemon.json; aquí no existe todavía)
sudo mkdir -p /etc/docker
printf '{\n  "data-root": "/srv/data/docker"\n}\n' | sudo tee /etc/docker/daemon.json

# 5. Arrancar y verificar antes de borrar nada
sudo systemctl start docker
docker info | grep 'Docker Root Dir'        # debe decir /srv/data/docker
docker images; docker ps -a; docker volume ls
docker run --rm hello-world                  # si la imagen no está, docker pull hello-world
# 6. Servicios de verdad
cd /srv/data/facylf/docker && docker compose -p facylf -f compose.yml -f compose-turnos.yml --env-file .env up -d
docker exec facylf-postgres psql -U facylf_admin -d facylf -c \
  "SELECT pg_size_pretty(pg_database_size(current_database()))"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/   # o el servicio que toque
```

### Verificación
- [ ] `docker info` apunta a `/srv/data/docker`.
- [ ] Las **18 imágenes** y los **3 volúmenes** siguen ahí (`docker volume ls`).
- [ ] `facylf-postgres` arranca y la base responde con **41 GB/16 GB** según la máquina.
- [ ] Los 16 contenedores vuelven a `Up` y el recolector de CyL escribe en su cola.
- [ ] `/srv/data` sigue con margen (>15 GB libres) y `/` baja a ~45 GB usados **solo después de borrar el viejo**.

### Rollback (sin pérdida: el directorio viejo se conserva)
```bash
systemctl stop docker
sudo rm /etc/docker/daemon.json          # o volver al contenido anterior (no existía)
systemctl start docker
docker info | grep 'Docker Root Dir'     # vuelve a /var/lib/docker
```
Después, arrancar de nuevo los servicios y borrar `/srv/data/docker` (copia fallida) con autorización.

## 4 · Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `/srv/data` es HDD (64 MB/s): base y contenedores más lentos | Preferir el paso 1 (borrar copias antiguas) antes que mover; si se mueve, medir TTFB y `pg_dump` antes/después |
| Copia de 145 GB sobre 163 GB libres (18 GB de margen) | Liberar primero las 4 bases antiguas (116 GB) o mover solo el volumen de PostgreSQL |
| Parada total de Docker (~30-45 min) | Ventana nocturna, avisar a los demás proyectos, parar la ingesta antes |
| Pérdida de permisos/xattrs en la copia | `rsync -aHAX --numeric-ids`; verificar tamaños y ficheros antes de conmutar |
| Olvidar borrar el directorio viejo → el disco no se libera | Aprobación explícita de David; borrar solo tras 24-48 h de verificación |
| Docker no arranca con el nuevo data-root | Rollback en 3 comandos (el directorio viejo queda intacto) |

## 5 · Qué NO se ha hecho

No se ha parado Docker, no se ha copiado nada, no se ha creado `/etc/docker/daemon.json`, no se ha borrado ninguna
base ni imagen. Este documento es el plan; la ejecución necesita la ventana y el sí de David.
