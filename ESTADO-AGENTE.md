titulo: Fondo Popular — plataforma de futbol federado de Castilla y Leon
estado: en-curso
tarea: Cerrar CyL completo en un solo canónico y desplegar Fondo Popular de verdad
nivel: 2
siguiente: **DEMO ALINEADA CON LA DECISIÓN DE DAVID (10/11, 17:45)**: los nombres personales vuelven a publicarse (hay consentimiento y no se muestran caras); se retiró la redacción a iniciales y se restauró Ojeo. Siguen fuera, por otros motivos: **Rankings** (se quedaba en «Cargando…» porque su listado se pide por JavaScript y la foto va sin JS) y las **fichas de equipo** (sus enlaces daban 404; ahora están quitados y llevan al selector). Texto corregido en la demo y en PORTFOLIO.md: «fútbol y fútbol sala de Castilla y León». La base nueva `facylf_canonico_4` está publicada y cotejada (98/98 tablas, 123.601.068 filas) y la app real sigue en el PC por túnel, sin prisa. Pendiente: recolección (206/867) y refresco de base/foto cuando haya lote.
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
