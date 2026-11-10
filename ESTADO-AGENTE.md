titulo: Fondo Popular — plataforma de futbol federado de Castilla y Leon
estado: en-curso
tarea: Cerrar CyL completo en un solo canónico y desplegar Fondo Popular de verdad
nivel: 2
siguiente: **EL WORKER PAGA UN ARRANQUE LARGUÍSIMO (10/11, 16:00)**: el de las 14:49 estuvo más de una hora en la fase local de arranque sin hacer una petición; lo maté y el supervisor lo relanzó con el arranque **instrumentado** (cada paso local escribe «arranque: <paso> N s» si tarda más de 1 s). Con esa traza se identifica el paso culpable y se arregla (consulta reescrita o índice, con prueba en rojo antes). Medido ya: la consulta de `reparaActasSinTrabajo` son 1,5 s y las jornadas futuras 0,4 s, así que el tiempo se va en el bucle que encola o en `prepaVigilanciaActual`. Cuando el arranque baje de un minuto: medir cobertura y, si se mueve, refrescar la base publicada (`facylf_canonico_4`) y la foto de Pages. La demo pública ya está arreglada y verificada (ver resumen). De David sigue pendiente: dominio propio, textos legales y La Preferente. **Rutas cortas verificadas externamente (10/11, 16:00)**: /explorar y /rankings daban 404 porque no había fichero en esas carpetas (no era el prefijo: /explorar/competiciones/ y /explorar/competicion/44/ ya daban 200). El generador crea ahora páginas alias reales para /explorar, /rankings y /competiciones con el contenido de sus rutas canónicas, así que las tres devuelven 301→200 y el 404.html sigue en la raíz del sitio. **Privacidad en la demo (10/11, tarde)**: por RGPD, la demo pública no publica nombres completos de personas (jugadores ni árbitros): se sustituyen por iniciales (489 nombres); fuera Rankings y Ojeo (publicaban nombres de categorías de menores), fuera las fichas de equipo y sus enlaces (las plantillas incluyen menores; los enlaces van al selector, sin 404) y el ejemplo de jugador es adulto. Decisión en DECISIONES.md; auditoría en tmp/audita-demo-privacidad.mjs. Texto corregido: «fútbol y fútbol sala de Castilla y León» en la demo y en PORTFOLIO.md.
bloqueado: Nada de datos. Para el dominio propio (que la app completa esté en una URL bonita) hace falta que David elija dominio y DNS; la demo pública ya no depende de nada. Recolección: el servidor no puede con el portal de CyL (página de 438 recursos y rfcylf.es a 5.687 ms desde esa IP), así que su recolector sigue parado (reversible) y el PC asume las 15 temporadas. **Escudos**: por decisión de los coordinadores NO se copian ni se recolectan sin permiso del club (DECISIONES.md); iniciales por defecto.
resumen: **10/11 · DEMO ARREGLADA Y PUBLICADA.** El fallo era que la foto estática hidrataba Next y su router navegaba a rutas sin el prefijo `/fondo-popular-demo/` (404/503 en todos los enlaces). Ahora la foto se genera **sin JavaScript** (navegación de página completa contra ficheros que existen), con **404.html** que redirige al índice, `/buscar` dentro, las páginas de navegación y todas las competiciones/jornadas de la portada. Además: **un solo buscador** (el de la cabecera), **fuera «Mi panel» y «Avisos»**, **casillas de provincia de 44 px**, en la demo **solo 2026-27 y opciones con datos** (sin «sin determinar»), y **jornada de ejemplo** en la portada con fecha, equipos, marcador y «Ver partido» (abre la jornada del partido). Verificación abriendo cada URL: `/` 200, `/explorar/competiciones/` 200, `/explorar/competicion/44/` 200 (con clasificación), `/explorar/acta/2000559/` 200 (cronología y alineaciones), `/buscar/` 200 y **18 enlaces internos de la portada con 0 rotos**. Pruebas: web 815 (813 pasan, 1 saltada) y `tsc` 0. Queda pendiente regenerar la foto cuando la cobertura se mueva, y lo de David (dominio, legal, La Preferente).
plan: PORTFOLIO.md · docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md · docs/plataforma-web/PIPELINE-DIARIO.md · docs/plataforma-web/ESCUDOS-FALTAN.md · DECISIONES.md · docs/DESPLIEGUE.md
fecha: 2026-11-10

## Bloqueo

**Estado: diagnóstico cerrado; queda confirmar el arranque rápido.** El desarrollo está al día (demo arreglada y
verificada, publicación y pruebas hechas).

- **(a) Dónde me quedé.** El worker se pasaba una hora en el arranque sin pedir. La instrumentación nueva lo
  localizó: no era una sola cosa sino cuatro pasos locales caros en frío. Ya arreglados: `activa-actas`
  **188,9 s → 0,0 s** forzando el índice `actas_estado` (el planificador hacía SCAN de la tabla entera);
  `actas-sin-trabajo` (110,5 s) y `aplaza-futuro` (65,9 s) pasan a hacerse **una vez al día** con la guardia
  `tocaRepaso`; `competiciones-sin-datos` y `ambito-actas` ya estaban guardados (0,0 s).
- **(b) Qué falta revisar.** Que el segundo arranque tras las guardias baje de ~3 min a ~20 s: el primero paga los
  110+66 s y deja los metadatos `actas_sin_trabajo_revisadas_en` y `aplaza_futuro_revisado_en`; el siguiente
  debe saltarlos. El worker actual (17:21) todavía está arrancando y el registro no ha llegado a esa parte.
- **(c) Qué necesito de David u otro chat.** Nada para esto. Su parte (dominio, textos legales, La Preferente)
  sigue pendiente y no bloquea.
- **(d) Siguiente paso concreto.** Leer el arranque del worker en curso, comprobar que escribe los dos metadatos y
  que empieza a pedir; reiniciar una vez más para verificar que el arranque se queda en segundos. Después, medir
  cobertura y refrescar la base publicada y la foto de Pages cuando haya lote.
