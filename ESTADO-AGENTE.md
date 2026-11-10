titulo: Fondo Popular — plataforma de futbol federado de Castilla y Leon
estado: en-curso
tarea: Cerrar CyL completo en un solo canónico y desplegar Fondo Popular de verdad
nivel: 2
siguiente: **EL WORKER PAGA UN ARRANQUE LARGUÍSIMO (10/11, 16:00)**: el de las 14:49 estuvo más de una hora en la fase local de arranque sin hacer una petición; lo maté y el supervisor lo relanzó con el arranque **instrumentado** (cada paso local escribe «arranque: <paso> N s» si tarda más de 1 s). Con esa traza se identifica el paso culpable y se arregla (consulta reescrita o índice, con prueba en rojo antes). Medido ya: la consulta de `reparaActasSinTrabajo` son 1,5 s y las jornadas futuras 0,4 s, así que el tiempo se va en el bucle que encola o en `prepaVigilanciaActual`. Cuando el arranque baje de un minuto: medir cobertura y, si se mueve, refrescar la base publicada (`facylf_canonico_4`) y la foto de Pages. La demo pública ya está arreglada y verificada (ver resumen). De David sigue pendiente: dominio propio, textos legales y La Preferente.
bloqueado: Nada de datos. Para el dominio propio (que la app completa esté en una URL bonita) hace falta que David elija dominio y DNS; la demo pública ya no depende de nada. Recolección: el servidor no puede con el portal de CyL (página de 438 recursos y rfcylf.es a 5.687 ms desde esa IP), así que su recolector sigue parado (reversible) y el PC asume las 15 temporadas. **Escudos**: por decisión de los coordinadores NO se copian ni se recolectan sin permiso del club (DECISIONES.md); iniciales por defecto.
resumen: **10/11 · DEMO ARREGLADA Y PUBLICADA.** El fallo era que la foto estática hidrataba Next y su router navegaba a rutas sin el prefijo `/fondo-popular-demo/` (404/503 en todos los enlaces). Ahora la foto se genera **sin JavaScript** (navegación de página completa contra ficheros que existen), con **404.html** que redirige al índice, `/buscar` dentro, las páginas de navegación y todas las competiciones/jornadas de la portada. Además: **un solo buscador** (el de la cabecera), **fuera «Mi panel» y «Avisos»**, **casillas de provincia de 44 px**, en la demo **solo 2026-27 y opciones con datos** (sin «sin determinar»), y **jornada de ejemplo** en la portada con fecha, equipos, marcador y «Ver partido» (abre la jornada del partido). Verificación abriendo cada URL: `/` 200, `/explorar/competiciones/` 200, `/explorar/competicion/44/` 200 (con clasificación), `/explorar/acta/2000559/` 200 (cronología y alineaciones), `/buscar/` 200 y **18 enlaces internos de la portada con 0 rotos**. Pruebas: web 815 (813 pasan, 1 saltada) y `tsc` 0. Queda pendiente regenerar la foto cuando la cobertura se mueva, y lo de David (dominio, legal, La Preferente).
plan: PORTFOLIO.md · docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md · docs/plataforma-web/PIPELINE-DIARIO.md · docs/plataforma-web/ESCUDOS-FALTAN.md · DECISIONES.md · docs/DESPLIEGUE.md
fecha: 2026-11-10

## Bloqueo

**Estado: parcialmente bloqueado en la recolección; el desarrollo está al día.** Publicación, demo pública, pruebas y
documentos están hechos y verificados.

- **(a) Dónde me quedé.** El worker de CyL del PC estuvo más de una hora en la fase local de arranque («Preparando
  vigilancia y ámbito de actas») sin hacer una sola petición, con la cola leída a unos 8 MB/min y el WAL quieto: no
  estaba colgado, estaba pagando trabajo local. Lo reinicié con la fase instrumentada; el supervisor lo relanza solo
  (máximo 5 min) y a partir de ahí el registro dice qué paso se lleva el tiempo.
- **(b) Qué falta revisar.** Cuál de los pasos locales consume la hora. Ya está medido que **no** son la consulta de
  actas sin trabajo (1,5 s, 5.767 filas) ni las jornadas futuras (0,4 s); la sospecha pasa al bucle que encola por
  acta y a la preparación de vigilancia. La traza nueva lo resuelve en el siguiente arranque.
- **(c) Qué necesito de David u otro chat.** De David, nada para esto: su parte pendiente (dominio, textos legales,
  La Preferente) no bloquea. Si el culpable resultase ser el esquema de la cola, necesito una segunda opinión antes
  de añadir un índice a la SQLite en caliente, que es lo que el operador del PC desaconsejó.
- **(d) Siguiente paso concreto.** Leer los tiempos por paso en `worker-programado.log`, arreglar el que se lleva el
  tiempo (consulta reescrita o índice, con prueba en rojo antes), y cuando el arranque baje de un minuto volver a
  medir cobertura y refrescar la base publicada y la foto de Pages si hay lote.
