titulo: Fondo Popular — plataforma de fútbol y fútbol sala de Castilla y León
estado: en-curso
tarea: Cerrar CyL completo en un solo canónico y desplegar Fondo Popular de verdad
nivel: 2
siguiente: **10/11 (19:45) · recolección de temporadas antiguas en marcha y /explorar arreglado.** El worker recoge actas de 2014-15 (rotación a 2018-19, 2014-15, 2012-13, 2016-17, 2019-20, 2015-16 y 2013-14; vuelta explicada en `docs/plataforma-web/ROTACION-TEMPORADAS-2026-11-10.md`). La demo vuelve a servir `/explorar` (200): el generador usaba una variable inexistente en los bucles de alias, actas y jornadas y fallaba en silencio; ahora usa `rutaReal`/`rutaActa`/`rutaJornada` y **termina con error si alguna ruta no se publica**. Lo recogido no moverá el contador hasta el ciclo diario o el empaquetado (las unidades van apartadas por protección, explicado en `PIPELINE-DIARIO.md`). Siguiente paso: medir cobertura cuando el ciclo de las 04:30 importe, y devolver las 15 temporadas al worker como muy tarde en uno o dos días.
bloqueado: Nada de datos. Para el dominio propio (que la app completa esté en una URL bonita) hace falta que David elija dominio y DNS; la demo pública ya no depende de nada. Recolección: el servidor no puede con el portal de CyL (página de 438 recursos y rfcylf.es a 5.687 ms desde esa IP), así que su recolector sigue parado (reversible) y el PC asume las temporadas. **Escudos**: por decisión de los coordinadores NO se copian ni se recolectan sin permiso del club (DECISIONES.md); iniciales por defecto.
resumen: **10/11 · DESPLIEGUE CUMPLIDO Y DEMO CORREGIDA.** La app real está publicada por túnel temporal de Cloudflare (ver `docs/DESPLIEGUE.md`): portada 1,2 s, competición 479 ms con clasificación, jornada con 36 resultados, acta con cronología y 196 nombres, ficha de equipo 299 ms, rankings 646 ms y API v1 231 ms. La demo estática sirve `/` 200, `/explorar` 200, `/explorar/` 200, competición 200 y acta 200, con contenido real (sin esqueletos de carga). Decisiones aplicadas: nombres personales publicados (consentimiento de David, sin caras), rankings fuera de la demo (se quedaba en «Cargando…»), fichas de equipo sin enlaces en la demo (sí en la app real) y texto «fútbol y fútbol sala de Castilla y León». Cierre de CyL: 206/867 ediciones completas; la recolección está activa sobre temporadas antiguas y la importación va por el ciclo diario.
plan: docs/plataforma-web/OPERACION-ARRANQUE.md · docs/plataforma-web/ROTACION-TEMPORADAS-2026-11-10.md · PORTFOLIO.md · docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md · docs/plataforma-web/PIPELINE-DIARIO.md · docs/plataforma-web/ESCUDOS-FALTAN.md · DECISIONES.md · docs/DESPLIEGUE.md
fecha: 2026-11-10

## Bloqueo

**Estado: sin bloqueo abierto.** Los dos frentes avanzan y están verificados.

- **(a) Dónde me quedé.** Recolección: el worker (pid 26584) recoge **actas de 2014-15** tras la rotación a
  temporadas antiguas; el arranque ya está domado (`competiciones-sin-datos`, `ambito-actas`, `actas-sin-trabajo` y
  `aplaza-futuro` en 0,0 s, y el repaso pesado de actas confinado a la madrugada). Demo: `/explorar` vuelve a
  responder 200; el fallo era mío, una variable inexistente (`ruta` en vez de `rutaReal`/`rutaActa`/`rutaJornada`) que
  hacía fallar en silencio los alias, las actas y las jornadas de la portada mientras el generador salía con 0.
- **(b) Qué falta revisar.** Que el ciclo diario de las 04:30 importe lo recogido y mueva la cobertura (206/867 hoy);
  las unidades de temporadas antiguas se apartan por protección si la cola trae menos datos que el canónico, así que
  el contador puede tardar en moverse y no es un fallo del recolector.
- **(c) Qué necesito de David u otro chat.** Para el despliegue definitivo: dominio y DNS. Para el cierre: nada, sólo
  tiempo de recolección respetando el ritmo (7-13 s entre peticiones).
- **(d) Siguiente paso concreto.** Medir cobertura tras la importación de la madrugada; si no ha subido, revisar qué
  unidades se apartaron y por qué. Y devolver las 15 temporadas al worker (con 2026-27 primero) como muy tarde en uno
  o dos días, según `docs/plataforma-web/ROTACION-TEMPORADAS-2026-11-10.md`.
