# Contrato de la pantalla 2 — competición (clasificación y jornada)

Registrado antes de implementar (2026-11-04), con la disciplina `grill-requirements` →
`red-green-tdd` → revisión adversarial → entrega. Es el contrato que se ha comprobado al final; si algo
de aquí no se cumple, la entrega no está hecha.

## Objetivo

La pantalla 2 del prototipo (competición: clasificación y jornada) se ve y se comporta como el
prototipo, construida sobre los tokens del sistema de diseño, con datos reales de Castilla y León del
canónico, verificada con pruebas ejecutadas y capturas comparables.

## Alcance

Dentro:

- `apps/web/src/app/tokens.css`: tokens nuevos con rol semántico (superficies fuertes, zonas, escala
  tipográfica, radio de control, sombra del segmento, fila densa).
- Cabecera común del sitio (`apps/web/src/componentes/cabecera/`), buscador adaptado del existente y
  `layout.tsx`.
- Componentes de la pantalla (`apps/web/src/componentes/competicion/`) y su página
  (`apps/web/src/app/explorar/competicion/[id]/`): migas con el nombre corto real, suspensión por
  debajo de la validación, esqueleto, estados vacíos y de error.
- Tabla responsiva con primera columna fija y contenedor alcanzable con teclado.
- Pruebas: Playwright de la pantalla (carga, 16 filas, 404, móvil 400, axe) y vitest de reglas, estado
  vacío y honestidad del dato.
- Capturas en `docs/plataforma-web/capturas/`.
- Actualización de `DECISIONES.md`, `BACKLOG.md`, `ESTADO-AGENTE.md`, `ESPECIFICACION.md` y
  `SISTEMA-DISENO.md`.

Fuera:

- Las otras 21 pantallas; conmutador Casa/Fuera y la proyección que necesita; pestañas
  Jornadas/Goleadores/Disciplina/Equipos; autenticación y permisos; cambios en ingesta, servidor,
  migraciones o `.env`; ramas nuevas; GitHub Actions.

## Criterios de aceptación

1. `GET /explorar/competicion/3769` (Liga Nacional Juvenil 2026-27, CyL) responde 200 y enseña 16 filas
   en orden de puntos descendente, con `PJ = G + E + P` en cada fila.
2. La cabecera del sitio es la del prototipo: marca, navegación Explorar/Rankings/Ojeo/Comparar,
   buscador global accesible, estrella, avisos y cuenta. Lo que no tiene pantalla va desactivado, sin
   contadores inventados.
3. Las migas empiezan por el nombre corto real de la federación («Castilla y León»).
4. A 400 px no hay desplazamiento horizontal del documento y la primera columna de la tabla queda fija.
5. Ningún nombre de menor aparece en el HTML; los goleadores menores se rotulan.
6. Un id inválido o inexistente responde 404 (no 200 con cuerpo de 404).
7. axe sin incidencias serias ni críticas en la pantalla, en 360 y en 1280.
8. Capturas de escritorio y móvil guardadas y comparadas con el prototipo.
9. `pnpm test`, `pnpm lint` y `tsc --noEmit` de la web en verde.
10. Commit en `fase-c` y push final.

## Modos de fallo

- Canónico caído → `SinCanonico` con motivo y sin ceros, no tabla vacía.
- Grupo sin clasificación → texto de estado vacío, no tabla.
- Sin zonas fijadas → sin franjas ni leyenda inventada.
- Goles oficiales a cero → se usan los reconstruidos **de la misma jornada** y se dice; si esa jornada
  no tiene reconstrucción, «—».
- Id no numérico o inexistente → 404.
- Menor de edad → nunca su nombre.
- Enlace a pantalla no construida → desactivado accesible, nunca enlace muerto ni badge inventado.
- Móvil → tabla con scroll interno, documento sin scroll horizontal.
- La suspensión no puede convertir un 404 en 200 (por eso no hay `loading.tsx` de ruta).
- Si el canónico no está disponible, las pruebas de integración se saltan con motivo visible, no pasan
  en falso.

## Prioridades

Primero fidelidad al prototipo y honestidad del dato; después el sistema de diseño (token antes que
color literal); después cantidad de componentes. Si algo no se puede sostener con datos reales, se deja
desactivado o se dice, no se finge. Las pruebas de flujo valen más que las de detalle interno. No se
toca lo que ya funciona (consultas, ingesta, web vieja).

## No objetivos

No rehacer las otras 21 pantallas ni la web vieja; no inventar datos, contadores, avatares,
notificaciones ni colores de club; no añadir pantallas nuevas no especificadas; no cambiar el ritmo de
la ingesta ni el servidor; no abrir ramas; no usar GitHub Actions; no instalar herramientas del
sistema; no tocar `.env`; no publicar nombres de menores.

## Resultado comprobado (2026-11-04)

Se revisó con un QA independiente que dio veredicto **NO APTA** en la primera entrega (bloqueante: el
buscador publicaba nombres de menores; más 8 importantes y varios cosméticos). Todo lo bloqueante e
importante se corrigió y se volvió a comprobar; la segunda ronda dio **APTA CON RESERVAS**, con las
reservas aceptadas y escritas en `DECISIONES.md` (decisiones 20-21).

| Criterio | Evidencia |
|---|---|
| 200, 16 filas, puntos ordenados, `PJ=G+E+P`, forma de la misma jornada | `apps/web/e2e/pantalla-2.spec.ts` (**30/30** en móvil 360 y escritorio 1280, 05/11/2026) |
| Cabecera del prototipo sin ficción; nombres publicados (también de menores) y sin fotos | e2e + `apps/web/test/cabecera-sitio.test.ts` (8/8), `sugerencias.test.ts` (9/9) y `competicion-pantalla.test.ts` |
| Migas con nombre corto real | e2e + consulta `federacion_corta` |
| 400 px sin scroll de documento, columna fija y nombre de 61 caracteres legible | e2e (grupo 17863) + `capturas/pantalla-2-nombre-largo-17863-400-2026-11-05.png` |
| Escudos reales de club y escudo de la federación | `escudos.test.ts` (30), API `/api/escudo/...` y captura 05/11 |
| Zonas según reglamento: 1 asciende, 3 descienden en Liga Nacional | migración 0055 + prueba contra 797/3769 |
| 404 de verdad | e2e (`abc`, `0`, `-3`, `999999999`) |
| axe sin serias/críticas, también con el buscador abierto | e2e en ambos proyectos y `tmp/qa.mjs` (0 violaciones) |
| Goles de la misma jornada; forma de la misma jornada | pruebas de integración contra 3769, 797 y 1181; notas al pie ya retiradas por §8 |
| Estados: vacío, parcial, carga; error revisado por código | captura `pantalla-2-estado-vacio-2026-11-05.png`, esqueleto con 16 filas en el HTML, error no se puede provocar sin parar el canónico |
| `pnpm test` / `tsc` / `lint` | **815 en verde, 1 saltada** + 30 e2e; ver `ESTADO-AGENTE.md` |

Capturas: `docs/plataforma-web/capturas/pantalla-2-clasificacion-3769-2026-11-05.png`,
`…-360-…`, `…-400-…`, `pantalla-2-clasificacion-797-2026-11-05.png`,
`pantalla-2-estado-vacio-2026-11-05.png`, `pantalla-2-oscuro-2026-11-05.png`,
`pantalla-2-nombre-largo-17863-400-2026-11-05.png` y `cabecera-sitio-2026-11-05.png`.
