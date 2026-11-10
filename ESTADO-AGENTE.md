titulo: Fondo Popular — plataforma de futbol federado de Castilla y Leon
estado: en-curso
tarea: Cerrar CyL completo en un solo canónico y desplegar Fondo Popular de verdad
nivel: 2
siguiente: **DEMO ALINEADA CON LA DECISIÓN DE DAVID (10/11, 17:45)**: los nombres personales vuelven a publicarse (hay consentimiento y no se muestran caras); se retiró la redacción a iniciales y se restauró Ojeo. Siguen fuera, por otros motivos: **Rankings** (se quedaba en «Cargando…» porque su listado se pide por JavaScript y la foto va sin JS) y las **fichas de equipo** (sus enlaces daban 404; ahora están quitados y llevan al selector). Texto corregido en la demo y en PORTFOLIO.md: «fútbol y fútbol sala de Castilla y León». La base nueva `facylf_canonico_4` está publicada y cotejada (98/98 tablas, 123.601.068 filas) y la app real sigue en el PC por túnel, sin prisa. Pendiente: recolección (206/867) y refresco de base/foto cuando haya lote.
bloqueado: Nada de datos. Para el dominio propio (que la app completa esté en una URL bonita) hace falta que David elija dominio y DNS; la demo pública ya no depende de nada. Recolección: el servidor no puede con el portal de CyL (página de 438 recursos y rfcylf.es a 5.687 ms desde esa IP), así que su recolector sigue parado (reversible) y el PC asume las 15 temporadas. **Escudos**: por decisión de los coordinadores NO se copian ni se recolectan sin permiso del club (DECISIONES.md); iniciales por defecto.
resumen: **10/11 · DEMO ARREGLADA Y PUBLICADA.** El fallo era que la foto estática hidrataba Next y su router navegaba a rutas sin el prefijo `/fondo-popular-demo/` (404/503 en todos los enlaces). Ahora la foto se genera **sin JavaScript** (navegación de página completa contra ficheros que existen), con **404.html** que redirige al índice, `/buscar` dentro, las páginas de navegación y todas las competiciones/jornadas de la portada. Además: **un solo buscador** (el de la cabecera), **fuera «Mi panel» y «Avisos»**, **casillas de provincia de 44 px**, en la demo **solo 2026-27 y opciones con datos** (sin «sin determinar»), y **jornada de ejemplo** en la portada con fecha, equipos, marcador y «Ver partido» (abre la jornada del partido). Verificación abriendo cada URL: `/` 200, `/explorar/competiciones/` 200, `/explorar/competicion/44/` 200 (con clasificación), `/explorar/acta/2000559/` 200 (cronología y alineaciones), `/buscar/` 200 y **18 enlaces internos de la portada con 0 rotos**. Pruebas: web 815 (813 pasan, 1 saltada) y `tsc` 0. Queda pendiente regenerar la foto cuando la cobertura se mueva, y lo de David (dominio, legal, La Preferente).
plan: docs/plataforma-web/OPERACION-ARRANQUE.md · PORTFOLIO.md · docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md · docs/plataforma-web/PIPELINE-DIARIO.md · docs/plataforma-web/ESCUDOS-FALTAN.md · DECISIONES.md · docs/DESPLIEGUE.md
fecha: 2026-11-10

## Bloqueo

**Estado: sin bloqueo de código; el worker está pagando el repaso diario que le tocaba.**

- **(a) Dónde me quedé.** Los arreglos del arranque están medidos y guardados (`activa-actas` 188,9 s → 0,4 s por el
  índice; `actas-sin-trabajo` y `aplaza-futuro` con guardia diaria). El worker de las 17:49 lleva desde las 18:00
  en `competiciones-sin-datos`: al comprobar los metadatos se ve que `competiciones_sin_datos_revisadas_en` había
  caducado justo a las 18:00 (24 h desde la última), así que **toca el repaso completo de actas** (0,81 GB) y no es
  un cuelgue; ya lo ha marcado y el siguiente arranque lo saltará. Con la contención actual (39 procesos node y 26
  de Chrome, CPU al 49 %) ese barrido tarda decenas de minutos.
- **(b) Qué falta revisar.** Sólo confirmar que, al terminar ese barrido, empieza a pedir y que el siguiente arranque
  se queda en ~20-30 s con las cuatro guardias. La cola no está bloqueada (escritura de prueba en 3 ms).
- **(c) Qué necesito de David u otro chat.** Nada urgente. Si la contención sigue impidiendo cerrar CyL, proponerle
  **parar temporalmente los recolectores de multideporte**; es decisión de producto y no la tomo yo.
- **(d) Siguiente paso concreto.** **No reiniciar** el worker: dejarlo terminar el barrido (máximo una vez al día) y
  comprobar en el registro que pasa a pedir; después, medir cobertura y refrescar base y foto si hay lote. El
  procedimiento completo queda en `docs/plataforma-web/OPERACION-ARRANQUE.md`.
