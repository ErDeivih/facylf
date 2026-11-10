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

**Estado: los arreglos del arranque están hechos y medidos; lo que frena ahora la recolección es la contención del
disco, no el código.** El desarrollo y la publicación están al día.

- **(a) Dónde me quedé.** El arranque del worker se arregló por partes y con medida: `activa-actas` pasó de
  **188,9 s a 0,4 s** (índice `actas_estado` forzado), y `actas-sin-trabajo` (110-112 s) y `aplaza-futuro`
  (66-96 s) quedaron con guardia diaria (metadatos `actas_sin_trabajo_revisadas_en` y `aplaza_futuro_revisado_en`
  escritos). Pero el arranque de las 17:49 lleva ya **14 min solo para llegar a `competiciones-sin-datos`**, un paso
  que en la traza anterior costaba 0,0 s: la cola de 2,4 GB se lee a pocos MB/min y hay 26 procesos de Chrome y
  varios recolectores de multideporte compitiendo por el mismo disco.
- **(b) Qué falta revisar.** Confirmar si el retraso es sólo contención (disco/CPU) o si algo tiene bloqueada la
  cola: el WAL no cambia desde las 17:15 y no hay peticiones nuevas desde las 16:46, con el worker sin pedir.
- **(c) Qué necesito de David u otro chat.** Nada urgente: su parte (dominio, textos legales, La Preferente) sigue
  pendiente. Si la contención sigue, lo razonable es **parar temporalmente los recolectores de multideporte mientras
  se cierra CyL**, y eso es una decisión de producto (afecta a otras federaciones), no mía.
- **(d) Siguiente paso concreto.** **No reiniciar el worker** (los reinicios de esta tarde lo interrumpían a mitad
  del arranque): dejarlo terminar; si en 30 min sigue sin pedir, medir qué proceso satura el disco y proponer a David
  parar temporalmente los recolectores de multideporte. Después, medir cobertura y refrescar base y foto si hay lote.
