# Tamaño real de la base y qué ocupa el disco (14/11/2026)

**Regla de esta nota:** aquí se **mide** y se **propone**; **no se ha borrado nada**. Cualquier limpieza
necesita el sí de David.

## 1 · El disco que está al 95 % es el del sistema, y el culpable es el volumen de PostgreSQL

```
/ (sda3, 211 GB)   190 GB usados   ~19 GB libres   92 %   (llegó a 11 GB / 95 %)
/srv/data (sdb1)   291 GB usados   163 GB libres   65 %   (disco aparte, no es el problema)
```

Desglose de `/` (medido): `/var` **161 GB**, de los cuales `/var/lib/docker` **133 GB** y dentro
`/var/lib/docker/volumes/facylf_facylf-pg` = **132 GB**. `/var/log/journal` = 1,9 GB; caché de build de Docker
= 276 MB; logs de contenedores = 266 MB.

## 2 · Por qué 132 GB si la base "solo" tiene 16 GB

En ese volumen hay **cinco bases de PostgreSQL** (todas del proyecto):

| Base | Tamaño | Uso |
|---|---:|---|
| `facylf` | **16 GB** | canónico vivo del servidor (la que usa el importador) |
| `facylf_canonico_4` | **30 GB** | copia de restauración antigua |
| `facylf_canonico_2` | **29 GB** | copia antigua |
| `facylf_canonico_3` | **29 GB** | copia antigua |
| `facylf_canonico` | **28 GB** | copia antigua |
| `tienda_escudos` | 7,7 MB | otra cosa |

Es decir: **~116 GB son cuatro copias antiguas** que ya no se están usando (0 conexiones en `pg_stat_database`;
todas tocadas a la vez por el reinicio del contenedor). **Candidatas a borrar con el sí de David**, después de
comprobar que la copia buena es `facylf_canonico_4` o que se regeneran con `trae-federacion-servidor.ps1`.

Otras recuperaciones posibles, sin tocar datos:

| Candidato | Tamaño | Riesgo |
|---|---:|---|
| `journalctl --vacuum-size=200M` (`/var/log/journal`) | ~1,7 GB | bajo (solo registros) |
| `docker builder prune` (caché de build) | 276 MB | bajo (se regenera) |
| Imágenes `radiopv-{api,collector,worker}` (3 × 1,79 GB) si no se usan | ~5,4 GB | medio (otro proyecto) |
| Logs de contenedores rotados | ~200 MB | bajo |
| `facylf-web.tar` en `/srv/data` | 129 MB | bajo (imagen vieja) |

**El disco `/srv/data` tiene 163 GB libres** (colas: `descargas-federacion` 25 GB, `descargas-castilla-la-mancha`
14 GB, `backups` 12 GB, `backups-volcados` 5,5 GB). Si se quiere alojar la base ahí, hay sitio; mover el volumen
de 132 GB liberaría el disco del sistema, pero es una operación con parada y copia: **propuesta, no hecha**.

## 3 · Tamaño real de la base del PC (la buena)

`docker exec facylf-postgres psql -U facylf_admin -d facylf`:

| Esquema | Tamaño |
|---|---:|
| `core` | **20 GB** |
| `ops` | **10 GB** |
| `analytics` | **7,9 GB** |
| `source` | **1,85 GB** |
| `externo` | **856 MB** |
| `app` | 1,8 MB |
| **Total** | **41 GB** (era 36 GB en octubre) |

Tablas más grandes: `ops.batch_cambio` **10 GB** (registro de cambios: es el mayor candidato a política de
retención), `core.appearance` 8,5 GB, `core.match_event` 5,8 GB, `source.external_ref` 1,85 GB,
`analytics.ojeo_jugador` 1,8 GB, `core.match` 1,24 GB, `analytics.search_palabra` 1,1 GB, `core.match_staff` 1,1 GB.

Discos del PC: C: 46 GB libres, D: 247 GB, E: 337 GB, F: 134 GB. La base de 41 GB no está en apuros de espacio;
el límite era la RAM (WSL topado a 5 GB) y ya está corregido por David.

## 4 · CyL desde el servidor: sigue ingiriendo

Tras el arreglo del `pageLoad` (240 s) y el recorte de rotación (`2022-23 · 2021-22 · 2020-21`):
`hechos hoy 1.572`, última petición `2026-11-14T11:43:36Z`, log `✓ 27 jornadas; jornada 1 guardada; 4 partidos` y
encadenando actas de 2021-22. La clasificación guardada del §6 de `INGESTA-CYL-SERVIDOR-DIAGNOSTICO-2026-11-14.md`
sigue siendo la prueba concreta.

## 5 · Túnel estable: estado y bloqueo

- **Cloudflare con nombre:** imposible hoy con este token: `GET /zones` → `9109 Invalid access token` y
  `GET /cfd_tunnel` → `10000 Authentication error`. Falta **Account → Cloudflare Tunnel → Edit**,
  **Zone → DNS → Edit** y **Zone → Zone → Read**, y falta el **dominio**.
- **DuckDNS no sirve para Cloudflare Tunnel:** un túnel con nombre solo publica hostnames de una **zona que
  esté en tu cuenta de Cloudflare**; `duckdns.org` no es una zona tuya (no se puede delegar NS de un subdominio
  de DuckDNS), así que `algo.duckdns.org` no puede ser el hostname del túnel. DuckDNS + HTTPS exigiría abrir el
  443 del router y un proxy con Let's Encrypt, que es otro montaje (y toca el router de casa).
- **Tailscale Funnel (alternativa sin dominio):** configurado en el servidor (`tailscale funnel --https=443
  http://100.110.114.10:3100`), con certificado válido de Let's Encrypt, pero **no responde desde Internet**:
  comprobado con tres servicios externos (`microlink.io` → `EUNREACHABLE`, `codetabs` → 522, `hackertarget` →
  timeout). El tailnet tiene Funnel "on" en local, pero el ingreso público no llega; hace falta habilitar/validar
  Funnel en la consola de Tailscale (admin de la tailnet) y comprobar la política. **Bloqueo de David.**
- Mientras no haya URL estable, la demo publicada sigue en `https://erdeivih.github.io/fondo-popular-demo/`
  (200, comprobada).

## 6 · Automatismo semanal

- Tarea **`FACyLF actualizacion semanal`** registrada: domingos **05:10**, script
  `scripts/actualizacion-semanal.ps1` (ciclo completo PC + servidor, recuentos antes/después, publicación y
  comprobación de no duplicar).
- La tarea horaria **`FACyLF actualizacion por jornada`** existe; su pasada de las **12:26 falló** porque el
  sistema se quedó sin memoria a las 12:24 (Docker + DeepSeek), no por el código: `CYL FALLO: no se pudo medir la
  cobertura…`. El candado que dejó se ha liberado y ahora **se suelta también cuando el ciclo falla**, para que la
  siguiente hora reintente; el umbral de candado baja a **45 min**.
