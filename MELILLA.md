# Melilla (RFMF) — por qué está parada

## Lo que pasa

El portal de la Federación Melillense (`https://www.rfmf.es/pagina/index.php`) **carga bien**: 39-46 KB
y su portada completa. Pero todas las páginas de documentación que ella misma enlaza —calendarios,
clasificaciones y el índice de actas— devuelven **HTTP 500 con 0 bytes**:

```
index1.php?var=docu&tipo=Calendarios&tem=21-22       → HTTP 500
index1.php?var=docu&tipo=Clasificaciones&tem=21-22   → HTTP 500
index1.php?var=docu&tipo=Inf&cat=Actas               → HTTP 500
```

## No es un bloqueo contra nosotros

Comprobado el 12/09/2026 pidiendo esas mismas direcciones **desde un Chrome real**, como lo haría una
persona: el navegador recibe la página de error del servidor («Esta página no funciona. La página
www.rfmf.es no puede procesar esta solicitud ahora. HTTP ERROR 500»). Es un fallo del sitio, no un
filtro: no hay captcha, ni aviso de cookies, ni `robots.txt` (devuelve 404).

Por eso no hay nada que optimizar por nuestra parte: no se puede recolectar lo que el servidor no
sirve.

## Qué queda montado mientras tanto

- `scripts/sondeo-melilla.mjs` recorre el inventario enlazado por la propia web, anota el estado de
  cada página y **conserva lo ya comprobado sin volver a pedirlo**.
- La tarea `FACyLF catalogo melilla` lo reintenta cada 4 horas; la última pasada terminó con código 0
  y dejó su inventario en `descargas-federacion-sondeo/melilla-sondeo.json` (17 páginas, todas con su
  estado HTTP anotado).
- En cuanto esas rutas respondan, el mismo sondeo recoge el inventario real sin cambios.

## Qué publica de verdad (12/09/2026)

Se recorrió su web entera en un navegador real, siguiendo sólo enlaces de su propia portada:

| Zona | Estado |
| --- | --- |
| Portada (`index.php`) | 200, 39 KB |
| Calendarios y clasificaciones por temporada (`index1.php?var=docu…`) | **500 con 0 bytes** |
| Noticias, emisión, resto de `index1.php` | **500 con 0 bytes** |
| PDF administrativos (`images/rdTv*.pdf`, proveedores, avisos legales) | 200, hasta 544 KB |

Y se comprobó el contenido de esos PDF: no son resultados ni clasificaciones, son documentos de
**reparto de subvenciones** y de administración (el más pequeño se titula «Criterios de distribución
de la subvención de la Real Federación Española de Fútbol»). Se extrajo su texto sin librerías
(descomprimiendo sus flujos) para asegurarse.

Conclusión: **la federación no sirve ningún dato de competición por ninguna vía accesible**. No es un
bloqueo contra nosotros ni un problema de formato: el script que los publicaba está roto y los únicos
ficheros que funcionan son administrativos. Su alcance, si algún día lo arreglan, serían calendarios
y clasificaciones documentales, nunca actas con alineaciones.
