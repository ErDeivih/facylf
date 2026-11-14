# Por qué `facylf-federacion-1` no ingería y cómo se ha dejado ingiriendo

**Fecha:** 14/11/2026. **Máquina:** servidor (`david@servidor.local`, carga 3,35 al empezar). **No se ha tocado
ningún dato del canónico ni la cola**: solo la configuración del contenedor de CyL.

## 1 · Diagnóstico (medido)

| Comprobación | Resultado real |
|---|---|
| Última petición antes de tocar nada | `2026-11-14T10:06:59Z` (más de una hora parado) |
| Estado del worker | `node recolector-local.mjs arrancar` dormido en `epoll_wait`, Chrome abierto, **sin peticiones** |
| Primer trabajo tras reiniciar | `acta|13|5273|17268|1|3741546` con `intentos=1`, `ultimo_error="timeout: Timed out receiving message from renderer: 118.399"`, `siguiente_intento=10:34` |
| Log del supervisor | `↻ La sesión del navegador se cayó (1.ª vez): se recrea y la tarea vuelve a la cola para 2026-11-14T10:34:21Z` |
| Portal desde el servidor (curl) | `https://www.rfcylf.es/` → **302 en 0,25 s**; el problema no es la red |
| Página de acta concreta (Chrome) | tardaba **118,4 s** y el `pageLoad` era **120.000 ms**: el renderer se mataba justo en el borde |

**La causa:** en el servidor, las actas de PNGF tardan **75-137 s** en cargar (el PC tarda ~1 s; el servidor
comparte 4 núcleos entre ~20 contenedores). Con `FACYLF_PAGELOAD_MS=120000`, cualquier acta que pasara de
120 s mataba la sesión de Chrome; el worker se recreaba, **esperaba 10 minutos** y volvía a la misma acta.
En bucle, eso son horas perdidas por una sola acta y explica que «no avance» aunque la máquina esté libre.

## 2 · Arreglo aplicado (config, no datos)

| Cambio | Antes | Ahora | Por qué |
|---|---|---|---|
| `FACYLF_PAGELOAD_MS` (en `entorno-servidor.env`) | 120.000 ms | **240.000 ms** | La peor página medida tras el arreglo tardó **136,8 s**: con 120 s se mataba; con 240 s termina |
| `mem_limit` del servicio `federacion` | 3000m | **4096m** | Chrome + lectura de cola; 3 GB dejaban el renderer al borde. `docker inspect`: `mem=4294967296` |
| `cpu_shares` | ausente (1024) | **2048 en ejecución, 4096 en el próximo reinicio** | Más cuota cuando hay contención; el fichero del servidor ya tiene 4096 (como el repositorio) y se aplicará al recrear |

Comandos usados (con copias `*.antes-20261114`):
```bash
# en el servidor
cp .../entorno-servidor.env .../entorno-servidor.env.antes-20261114
printf 'FACYLF_PAGELOAD_MS=240000\n' > .../entorno-servidor.env
cp /srv/data/facylf/docker/compose.yml /srv/data/facylf/docker/compose.yml.antes-20261114
# mem_limit: 4096m, memswap_limit: 4096m, cpu_shares: 4096
cd /srv/data/facylf/docker && docker compose -p facylf -f compose.yml -f compose-turnos.yml --env-file .env up -d federacion
```
(Ojo: sin `-p facylf` compose crea `docker-federacion-1`; se creó por error y se retiró en el momento. Queda un
solo contenedor, `facylf-federacion-1`.)

## 3 · Verificación: está ingiriendo (datos reales)

```
sáb 14 nov 2026 10:41:22 UTC
peticiones desde 10:27: 6   (todas ok)
hechos hoy: 1519            (eran 1513 antes del arreglo)
duraciones de las 6: 136.825 · 93.907 · 86.100 · 75.508 · 78.203 · 77.985 ms
última petición: 2026-11-14T10:38:54Z
log: ✓ acta de base guardada y analizada … → acta|13|5273|17269|1|3739369
```

La primera de la lista (136,8 s) **habría muerto con el timeout de 120 s**: es la prueba de que el arreglo era
el correcto. El worker sigue encadenando actas (`✓` + siguiente `→`), y el Chrome ya no cae.

## 4 · Estado del PC (la otra mitad)

El PC está ingiriendo: **121 peticiones en 30 min**, última `10:28:21Z`, **4.481 trabajos en 24 h**, 39.833
pendientes. Su worker lleva desde el 13/11 21:47 con la lista de rotación anterior; la lista nueva
(2026-27, 2025-26, 2024-25, 2023-24) entra **en su siguiente arranque de sesión** — ya está en 2026-27, que es la
primera de las dos listas, así que no se pierde trabajo.

## 5 · Ritmo con el arreglo y lo que falta

- Servidor tras el arreglo: ~1 petición cada **80 s** ≈ **45 trabajos/h** ≈ 1.080/día (antes 0 por los timeouts).
- PC: 4.434 trabajos/día.
- **Combinado realista: ≈5.500 trabajos/día** (antes 6.784 de la estimación optimista, con el servidor sano).
- Ventana 2020-21 … 2026-27: **682 ediciones incompletas**, ~511.500 trabajos ⇒ **≈93 días** (rango 50-115).
  Por temporadas y horas: ver `ROTACION-PRIORIDAD-2026-11-14.md` §6.

## 6 · VPS: evaluación en una línea

Un VPS (Hetzner CX32/CPX21 ≈ 6-8 €/mes) **sí ayuda** a quitar la contención de CPU (que es la causa real:
43,8 s de mediana por página frente a 1,08 s del PC) y probablemente baje la latencia al portal; pero **no
garantiza esquivar el límite por segundo del portal**: el límite que se ha visto es «sobrecarga de la fuente»
(503 global) y, si el portal limita por IP, al estar hoy PC y servidor detrás de la **misma IP pública**, un VPS
con otra IP sí separaría la cuota de esa IP; si el límite es global del portal, no. Merece la pena probarlo solo
con un VPS barato y medido (una temporada), no como compra a ciegas.

## 7 · Cómo se comprueba y cómo se revierte

```bash
# verificación
ssh servidor "docker exec facylf-federacion-1 sh -c 'env | grep FACYLF_PAGELOAD'"
ssh servidor "docker inspect facylf-federacion-1 --format 'mem={{.HostConfig.Memory}} shares={{.HostConfig.CpuShares}}'"
ssh servidor "tail -5 /srv/data/facylf/descargas-federacion/recolector-local/worker-programado.log"
# revertir
ssh servidor "cp /srv/data/facylf/descargas-federacion/recolector-local/entorno-servidor.env.antes-20261114 \
  /srv/data/facylf/descargas-federacion/recolector-local/entorno-servidor.env && cp /srv/data/facylf/docker/compose.yml.antes-20261114 /srv/data/facylf/docker/compose.yml"
```
