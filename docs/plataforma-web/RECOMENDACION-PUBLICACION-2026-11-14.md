# Recomendación de publicación: estático en Pages, app en servidor, R2 solo para copias

**Fecha:** 14/11/2026. Decisión pedida con el tamaño real medido delante.

## 1 · Los números que hay que respetar

| Pieza | Medida real |
|---|---:|
| Base de FACYLF (PC, canónica, 60 migraciones) | **41 GB** (`pg_size_pretty` con usuario `facylf_admin`) |
| Volcado comprimido de esa base (los `pg_dump` de `backups/`) | **1,3-1,4 GB** por copia (5 copias = 6,8 GB) |
| Demo estática publicada (`tmp/site-pages`, 169 páginas) | **16 MB** en disco; ~2,3 MB en objetos git |
| Límite de GitHub Pages | **1 GB de sitio**, 100 GB de ancho de banda/mes, 10 builds/hora |
| R2 (precio leído hoy en developers.cloudflare.com/r2/pricing) | **0,015 $/GB-mes** (estándar), 0,01 $/GB-mes (infrecuente), salida **gratis**, clase A 4,50 $/millón, clase B 0,36 $/millón |

## 2 · Recomendación

1. **La demo pública se queda en GitHub Pages.** 16 MB y 169 páginas caben de sobra en el límite de 1 GB; es
   gratis, sin caducidad y ya está verificado con HTTP 200. R2 no aporta nada aquí.
2. **La aplicación con la base completa NO se publica como estático.** 41 GB no caben en Pages (1 GB) ni tiene
   sentido trocearlos: la app necesita PostgreSQL. Se sirve desde el servidor (o el PC) con una URL estable
   (túnel con nombre o Funnel) y la base en PostgreSQL; el disco del servidor es el que hay que ordenar antes.
3. **R2 solo para copias de seguridad y, si algún día hace falta, para estáticos grandes.** Las 5 copias de
   1,3-1,4 GB de `backups/` costarían **≈0,09-0,10 $/mes** en R2; una sola copia, **≈0,02 $/mes**. Es útil para
   sacar las copias del PC/servidor, no para servir la base.
4. **No se sube la base a R2 como sustituto de PostgreSQL**: R2 es almacenamiento de objetos, no una base de datos
   consultable; la web no podría hacer las consultas del canónico.

## 3 · Qué implica para el disco (enlaza con el paso 3)

- Con la base en **41 GB** y `/srv/data` con **163 GB libres**, alojar la base en el servidor **cabe**; el problema
  no es el tamaño, es que el volumen de Docker (141,7 GB, con 116 GB de copias antiguas) está en el SSD del
  sistema (92 %).
- Antes de publicar desde el servidor: borrar las 4 copias antiguas (116 GB, con el sí de David) y/o mover el
  volumen; mientras tanto, la app del PC (`:3100`) es la que responde.
