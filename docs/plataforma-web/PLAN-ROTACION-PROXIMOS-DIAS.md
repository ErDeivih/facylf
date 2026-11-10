# Rotación de los próximos días: cierre de antiguas frente a frescura de la temporada viva

Escrito el **10/11/2026, 20:30**, con los datos medidos ese día. Es una decisión de producto (David), no de operación:
mientras no diga otra cosa, el worker sigue con la rotación puesta a las antiguas.

## Lo que hay que decidir

El PC es el único que puede recolectar (el servidor no llega al portal: código 000 frente a 330-580 ms desde el PC).
Ese único worker, a un trabajo cada ~40-60 s con las pausas de 7-13 s que no se tocan, no llega a todo. Cada jornada
de recolección se dedica a una temporada y no a otra.

## Las dos cosas que compiten

| Trabajo | Trabajos pendientes | Para qué sirve | Días al ritmo actual |
|---|---:|---|---:|
| **Temporadas antiguas en rotación** (2018-19, 2016-17, 2019-20, 2015-16, 2013-14) | ~15.700 | **subir la cobertura** (206/867): son las que pueden cerrar ediciones | 10-12 |
| **2026-27** (la que enseña la app y la demo) | 2.634 (1.658 actas) | mantener fresca la temporada en curso en la app real | ~1,5-2 |

## Opciones (para David)

1. **Seguir con las antiguas hasta el final** (lo que hay ahora). La cobertura puede subir; la app real se queda con
   los datos de 2026-27 que ya tiene (la temporada está a medias y no puede cerrarse igualmente).
2. **Alternar**: dos o tres días de antiguas y uno de 2026-27. La cobertura sube más despacio pero la app no se
   queda atrás en la temporada en curso.
3. **Volver a 2026-27 ya**: la app se actualiza en ~2 días, pero el cierre de las antiguas se aleja otras dos
   semanas.

## Recomendación

La **opción 2** es la que menos renuncia a nada: la app enseña la temporada viva con pocos días de retraso y el
cierre avanza. Si David prefiere una cosa u otra, se cambia el fichero `temporadas-asignadas.txt` en un minuto
(está explicado en `ROTACION-TEMPORADAS-2026-11-10.md`) y no afecta a nada más.

Lo que **no** se hace en ninguna opción: bajar las pausas, duplicar el worker ni tocar el ritmo del portal.
