# Publicación del canónico del PC en el servidor · 09/11/2026

Plan aprobado por David: **el canónico del PC es la fuente de verdad**, se vuelca, se restaura en una base
**nueva** del servidor y la web pasa a leerla. Regla: **no se borra nada**.

## Resumen de los recuentos

| Momento | Dato |
|---|---|
| Recuento en el PC antes del volcado | **98 tablas · 115.860.212 filas** (`tmp/recuentos-pc.txt`) |
| Volcado | `facylf-canonico-2026-11-09.dump` · **1,35 GiB** · `pg_dump -Fc -Z6` · creado 19:46 local |
| sha256 | `ec9faadab8dd4160fae1d3381cfeb4c10058c7a8de3dd25803ae8d66bf3ae7a3` |
| Índice del volcado | `pg_restore --list` → **1202 líneas / 1191 entradas TOC** |
| Restaurado en | base nueva `facylf_canonico` del servidor · **28 GB** |
| Recuento en el servidor después de restaurar | **98 tablas · 115.860.212 filas — SIN DIFERENCIAS** |
| Cobertura de CyL (PC y servidor) | idéntica: 183/807 ediciones completas (tabla por temporada abajo) |
| RLS de La Preferente | comprobado con `facylf_lector`: **0 ediciones `lp%` visibles** |

## Pasos ejecutados

1. **Fuente congelada.** Se pararon las importaciones (operador del PC: 0 importadores y 0 CLI vivos) y se
   desactivó temporalmente la tarea programada `FACyLF importador incremental` para que no se colara un escritor
   durante el volcado.
2. **Recuento por tabla** con `psql` sobre las 98 tablas de `core/analytics/app/ops/source/externo`.
3. **Volcado** dentro del contenedor y copia al PC:
   `docker exec facylf-postgres pg_dump -U facylf_admin -d facylf -Fc -Z6 -f /tmp/facylf-canonico-2026-11-09.dump`
   y `docker cp` a `F:\Proyectos\facylf\backups\`. Se conserva también el volcado anterior
   (`…-19h35.dump`) porque la regla es no borrar.
4. **Transferencia** `scp` al servidor a `/srv/data/facylf/backups-volcados/` (sha256 verificado en destino).
5. **Base nueva**: rol `facylf_app` creado (faltaba) y
   `create database facylf_canonico template template0 encoding 'UTF8' lc_collate 'en_US.utf8' lc_ctype 'en_US.utf8' owner facylf_admin`.
   La base `facylf` (16 GB) y sus contenedores **no se han tocado**.
6. **Restauración** con prioridad baja y 2 hilos:
   `docker exec facylf-postgres nice -n 19 pg_restore -U facylf_admin -d facylf_canonico --no-owner -j 2 /tmp/…dump`
   → **código 0, sin un solo error**; 28 GB; se conservaron las ACL y el RLS (no se usó `--no-acl`).
7. **Cotejo tabla por tabla**: 98/98 tablas iguales, 115.860.212 filas en cada lado.
8. **La web pasa a leer `facylf_canonico`**: túnel SSH `-L 5434:127.0.0.1:5433` desde el PC, y la web del PC
   arrancada con `DATABASE_URL_LECTOR` apuntando al túnel y a la base nueva
   (`tmp/sirve-web-servidor.ps1`; secreto en `.env`, clave `DATABASE_URL_LECTOR_SERVIDOR`).
   Comprobado en el servidor: la conexión de `facylf_lector` a `facylf_canonico` viene por el túnel.
9. **Comprobación en la URL pública** (quick tunnel de Cloudflare sobre la web del PC):
   `https://algorithm-infinite-sessions-assumed.trycloudflare.com/explorar/competicion/44/jornadas` → 200 en
   9,7 s con marcadores reales; `/explorar/competicion/44` con clasificación y puntos; `/explorar/acta/2000559`
   con alineaciones, goles, árbitro, tarjetas y cambios.

## Tabla de cobertura de CyL (idéntica en PC y en `facylf_canonico`)

| Temporada | Completas / ediciones |
|---|---:|
| 2026-27 | 1/56 |
| 2025-26 | 20/71 |
| 2024-25 | 41/79 |
| 2023-24 | 24/83 |
| 2022-23 | 32/70 |
| 2021-22 | 12/66 |
| 2020-21 | 9/31 |
| 2019-20 | 1/56 |
| 2018-19 | 8/61 |
| 2017-18 | 10/60 |
| 2016-17 | 6/58 |
| 2015-16 | 9/65 |
| 2014-15 | 3/3 |
| 2013-14 | 5/46 |
| 2012-13 | 2/2 |
| **Total** | **183/807** |

## Lo que hay que saber

- **Esta base es una foto** (19:46 local). Lo que se importe después en el PC **no aparece** hasta refrescar:
  volcar de nuevo y restaurar en otra base nueva (p. ej. `facylf_canonico_2`), apuntar la web y conservar la
  anterior. Nunca se restaura encima ni se borra la vieja.
- **La web del PC lee por un túnel SSH**: TTFB medido 9-10 s (antes 3 s con la base local). Para producción, la
  web debería correr en el servidor junto a la base (imagen construida en el PC y llevada con `docker save/load`),
  que es el siguiente paso del plan de despliegue.
- **`facylf_lector` tiene ahora contraseña en el servidor** (antes entraba por `trust` del contenedor). La web del
  servidor sigue funcionando por `trust`; el túnel la necesita para autenticar. Está en `.env`
  (`DATABASE_URL_LECTOR_SERVIDOR`, que no se sube al repositorio).
- **Comandos para repetir el cotejo**: `tmp/recuentos.sql` (recuento), `tmp/recuentos-pc.txt` (referencia) y
  `tmp/restaura-canonico.sh`, `tmp/sirve-web-servidor.ps1`, `tmp/conexiones.sh`.
