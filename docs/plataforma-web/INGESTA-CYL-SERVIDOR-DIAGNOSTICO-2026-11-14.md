# CyL en el servidor: por qué no avanzaba (y qué se ha hecho)

**Fecha:** 14/11/2026. **Corrige una premisa**: el servidor **sí tiene** un recolector de Castilla y León. Es
`facylf-federacion-1` (servicio `federacion` en `compose.yml`). No falta el contenedor: estaba **atascado en un
bucle de timeout** y, además, estaba gastando el tiempo en temporadas fuera de la ventana prioritaria.

## 1 · La prueba de red: no es IP, ni DNS, ni TLS

| Prueba | PC | Servidor |
|---|---|---|
| `curl -A FacylfBot/1.0 https://www.rfcylf.es/` | **302 en 0,24-0,28 s** | **302 en 0,27-0,28 s** |
| DNS (`getent hosts`) | resuelve | resuelve `195.53.102.51` en 6-8 ms |
| TLS | TLSv1.3, `Verify return code: 0 (ok)` | TLSv1.3, `Verify return code: 0 (ok)` |
| TTFB | 0,24-0,28 s | 0,27-0,28 s |

**Conclusión: el portal responde al servidor igual que al PC.** No hay bloqueo por IP, ni DNS roto, ni problema de
TLS en el host. El «error 000» documentado no se reproduce hoy desde el servidor con `curl`.

## 2 · La causa real: el renderizado de las actas en el servidor

| Medida (24 h) | PC | Servidor |
|---|---:|---:|
| Mediana por petición | **1,08 s** | **43,9 s** |
| Actas de PNGF | ~1 s | **75-137 s** |
| Núcleos | — | 4, compartidos por 15 navegadores (carga 15,17, por diseño) |
| Contenedor CyL | — | `cpus=1.0`, `shares=2048`, 4 GB (ya es el más privilegiado; el resto, 0,85-0,9 CPU y 1,6 GB) |

Comparativa de medianas de TODAS las federaciones del servidor (24 h): **federacion (CyL) 43,9 s** es la más
lenta; castilla-la-mancha 42,6 s; el resto 12,8-30,3 s. Las actas de CyL son las páginas más pesadas y, con 4
núcleos repartidos entre 15 Chromes, el renderer tarda decenas de segundos.

El bucle: con `FACYLF_PAGELOAD_MS=120000`, cada acta que pasaba de 120 s mataba la sesión de Chrome (timeout
registrado: **118,4 s**), el worker esperaba **10 minutos** y volvía a la misma acta. Eso es lo que se veía como
«CyL no se recolecta».

## 3 · Arreglo aplicado y verificación

- `FACYLF_PAGELOAD_MS=240000` (peor página medida después: **136,8 s**: con 120 s moría, con 240 s termina).
- `mem_limit` 4 GB (antes 3 GB); `cpu_shares` 2048 en ejecución y 4096 en el próximo reinicio.
- **Rotación de CyL recortada a la ventana prioritaria**: servidor solo `2022-23 · 2021-22 · 2020-21`; PC solo
  `2026-27 · 2025-26 · 2024-25 · 2023-24`. Antes el servidor gastaba el tiempo en actas de **2017-18** (código 13),
  fuera de la ventana. Se reinició solo `facylf-federacion-1` y se comprobó que lee la lista nueva.
- **Verificación real (tras el arreglo)**: `peticiones desde 10:27: 9, todas ok`; `hechos hoy 1513 → 1522`;
  `última petición 10:42:54`; **0 caídas de sesión** desde el reinicio; duraciones 75,5-136,8 s.

**Ritmo resultante del servidor:** ~1 petición cada 2 min ≈ **30 trabajos/h ≈ 720/día** (antes: 0 por el bucle).
El PC, con el mismo código, hace **4.434/día**.

## 4 · VPS con IP distinta: evaluación

**Proveedor y precio (leídos hoy en su web):** Hetzner Cloud, plan de entrada **5,49 €/mes excl. IVA** (≈6,64 € con
IVA; el IPv4 puede ir aparte). Netcup VPS 500 G12.5 aparece a **8,26 €**. Contabo no publica precio estático
legible sin JavaScript (no se cita). Recomendación: **Hetzner CX22/CPX11 (~2 vCPU, 4 GB)** si se quiere una IP
dedicada y CPU no compartida.

**¿La IP distinta esquiva un límite por segundo?** No es el problema medido: el servidor **ya llega al portal**
(302, TLS 1.3, 0,27 s). La lentitud es de CPU de renderizado, no de red ni de cuota por IP. Una IP distinta solo
serviría si en el futuro el portal aplicara un límite por IP (hoy no se ve; las respuestas 503 vistas son
«sobrecarga de la fuente», globales). Lo que sí aporta un VPS es **CPU dedicada**: con 2 vCPU sin 14 Chromes
compitiendo, el renderizado de actas debería bajar mucho de 44 s (a confirmar con una medición).

**Qué haría falta para montarlo, si David lo aprueba:**
1. Cuenta Hetzner + clave SSH (y aceptar el coste, ~5-7 €/mes).
2. Docker o Node 22 + Chromium en el VPS (o construir allí la imagen `facylf-recolectores` desde el repo).
3. Copiar la cola de CyL (~2,6 GB, `cola-v2.sqlite` + WAL) por `rsync`; arrancar **solo** el worker de CyL con las
   mismas pausas (10-13 s) y el mismo `FacylfBot/1.0`; respetar robots como hoy.
4. **Sacar CyL de las listas del PC/servidor** para que no haya peticiones duplicadas: una temporada, una máquina.
5. Sincronización diaria de la cola de vuelta (parar 1 min el worker + `sqlite3 .backup` o `rsync` del WAL) y
   lanzar en el PC/servidor el importador (`pnpm importar` / `ciclo-diario-cyl.ps1`) y la publicación de la demo.
6. Verificación: `peticiones` nuevas con `ok`, `trabajos` hechos subiendo, y los dos recuentos antes/después del
   importador iguales (no duplica).

**Recomendación:** antes de pagar, una semana de la configuración actual (servidor arreglado + PC) para ver si el
ritmo real de CyL sube; si no basta, VPS de 2 vCPU **solo para CyL**, con el plan de sincronización de arriba.

## 5 · Cómo se comprueba y se revierte

```bash
ssh servidor "docker exec facylf-federacion-1 sh -c 'env | grep FACYLF_PAGELOAD'"
ssh servidor "docker inspect facylf-federacion-1 --format 'cpus={{.HostConfig.NanoCpus}} shares={{.HostConfig.CpuShares}} mem={{.HostConfig.Memory}}'"
ssh servidor "tail -5 /srv/data/facylf/descargas-federacion/recolector-local/worker-programado.log"
# revertir: copias entorno-servidor.env.antes-20261114, compose.yml.antes-20261114 y temporadas-asignadas.txt.*.antes-*
```
