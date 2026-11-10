titulo: Fondo Popular — plataforma de fútbol y fútbol sala de Castilla y León
estado: en-curso
tarea: Cerrar CyL completo en un solo canónico y desplegar Fondo Popular de verdad
nivel: 2
siguiente:  **Noche armada y verificada (10/11, 20:30)**: supervisor `FACyLF flota` **Running** (relanza el worker si se cae), worker único vivo, `FACyLF ciclo diario CyL` **Ready** para las **04:30** (importará 30 min de cola y traerá 4 temporadas del servidor), e `FACyLF importador incremental` **Disabled** a propósito para no pelearse por la cola. Discos con margen (F: 138,6 GB · E: 339,6 GB). **Suite completa verde (10/11, 20:20)**: `pnpm test` → 86 ficheros, **1.397 pruebas pasadas**, 1 saltada, 0 fallos; y el script `pnpm --filter @facylf/web test`, que era un `echo` (mentía), ahora ejecuta vitest. `tsc --noEmit` en 0.**10/11 (19:45) · recolección de temporadas antiguas en marcha y /explorar arreglado.** El worker recoge actas de **2018-19** (código 14 de la cola, no 2014-15) (rotación a 2018-19, 2014-15, 2012-13, 2016-17, 2019-20, 2015-16 y 2013-14; vuelta explicada en `docs/plataforma-web/ROTACION-TEMPORADAS-2026-11-10.md`). La demo vuelve a servir `/explorar` (200): el generador usaba una variable inexistente en los bucles de alias, actas y jornadas y fallaba en silencio; ahora usa `rutaReal`/`rutaActa`/`rutaJornada` y **termina con error si alguna ruta no se publica**. Medido el 10/11 a las 19:44: reimportar 2018-19 **no importa ni un grupo** porque la validación exige que el origen no traiga menos que el canónico en ningún contador, y la cola solo tiene las actas recién recogidas (sin calendario ni jornadas). Es decir: **el contador no se moverá hasta que los grupos estén re-recolectados enteros** y entonces se pasen; mientras, las actas quedan guardadas esperando (explicado en `PIPELINE-DIARIO.md`). Siguiente paso: medir cobertura cuando el ciclo de las 04:30 importe Ensayo del ciclo diario (20:05, sin tocar nada): servidor con margen (9,5 GiB libres, carga 8,8), plan de la madrugada = importar 30 min de la cola del PC + traer 2026-27, 2024-25, 2022-23 y 2020-21 del servidor; cobertura sigue 206/867. Siguiente ejecución 11/11 a las 04:30., y devolver las 15 temporadas al worker como muy tarde en uno o dos días.
bloqueado: Nada de datos. Para el dominio propio (que la app completa esté en una URL bonita) hace falta que David elija dominio y DNS; la demo pública ya no depende de nada. Recolección: el servidor no puede con el portal de CyL (página de 438 recursos y rfcylf.es a 5.687 ms desde esa IP), así que su recolector sigue parado (reversible) y el PC asume las temporadas. **Escudos**: por decisión de los coordinadores NO se copian ni se recolectan sin permiso del club (DECISIONES.md); iniciales por defecto. **Demo sin enlaces rotos (10/11, 20:45)**: la jornada de ejemplo enlazaba a la ficha de su competición, a su lista de jornadas y a la jornada contigua, que no se exportaban (3 enlaces 404). Ahora el generador exporta esas páginas vecinas: jornada de ejemplo con **25 enlaces internos y 0 rotos**, portada con 17 y 0. Commit del generador incluido.
plan: docs/plataforma-web/PLAN-ROTACION-PROXIMOS-DIAS.md · docs/plataforma-web/OPERACION-ARRANQUE.md · docs/plataforma-web/ROTACION-TEMPORADAS-2026-11-10.md · PORTFOLIO.md · docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md · docs/plataforma-web/PIPELINE-DIARIO.md · docs/plataforma-web/ESCUDOS-FALTAN.md · DECISIONES.md · docs/DESPLIEGUE.md
fecha: 2026-11-10

## Bloqueo

**Estado: sin bloqueo abierto.** Los dos frentes avanzan y están verificados.

- **(a) Dónde me quedé.** Recolección: el worker (pid 26584) recoge **actas de 2018-19** (código 14 de la cola) tras la rotación a
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
