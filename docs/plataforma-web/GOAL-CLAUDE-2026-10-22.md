# GOAL de Claude — 22/10/2026 (encargo abierto de David, sin límite de tiempo)

> David (22/10, 15:49-16:00): «Continúa con todo… no lo dejes a la mitad… trabaja todo el tiempo que necesites».
> Este documento es la lista viva. Cada bloque se marca al terminarlo, con dónde quedó y cómo se probó.

## Prioridad 1 — Rapidez de la base de datos («la parte vital»)
Muchas páginas y muchas consultas: cada consulta de la web tiene que ir rápida con el volumen real.
- [x] Inventario de TODAS las consultas (`apps/web/src/consultas/*.ts`) y de las funciones que llaman.
- [x] Banco de volumen sintético (PGlite) + `EXPLAIN ANALYZE` de cada consulta: sin recorridos completos de
      tablas de hechos, dentro de su presupuesto.
- [x] Índices que falten, tablas desnormalizadas o resúmenes precalculados donde haga falta (migración nueva).
- [x] Caché de la web por etiquetas: el proyector invalida sólo lo que cambió (diseño + código).
- [x] Ajustes de PostgreSQL para el PC (memoria, paralelismo, autovacuum) documentados.

## Prioridad 2 — Usuarios funcionando de punta a punta
- [x] Entrar, registro, invitación, aprobación, recuperar contraseña, 2FA administradores (0043 + `codigo/auth.ts`, `codigo/acceso.ts`; m43, E2E).
- [x] Favoritos (todos los tipos), Mi panel, accesos rápidos, avisos (bandeja, push, correo, resumen).
- [x] Perfil de usuario: nombre, zona horaria, preferencias de aviso, sesiones, exportar/borrar mis datos.
- [x] Rutas y Server Actions escritas (código listo para la fase C), service worker de push.

## Prioridad 3 — Panel de administración completo
- [x] Consultas del panel (`admin.ts`, 13 consultas, probadas en m35).
- [x] Vigilancia de la plataforma (0035): avisos, push, correo, casos, capacidad, registros, accesos, publicidad.
- [x] Pantallas del panel en el prototipo: portada con resumen, identidades, procesos, avisos, accesos sensibles.

## Prioridad 4 — Cada federación es distinta
- [x] Matriz de 17 federaciones (`COBERTURA-FEDERACIONES.md`), capacidad por edición (0032).
- [x] Perfil por federación (plataforma, rasgos: árbitros unidos, «convocados» de Madrid, sin código en Cataluña,
      posiciones en Valencia…) en datos, para que la web adapte páginas sin `if (federacion === …)` sueltos.
- [x] Seguir investigando las 8 del servidor y los ficheros crudos de las que ya tenemos (23/10: las 8 en
      COBERTURA §2; crudo frente a cola en 14 casos con `scripts/claude/crudo-vs-cola.mjs`: todos los huecos son de la fuente).

## Prioridad 5 — Anuncios e ingresos
- [x] Guía de publicidad (`PUBLICIDAD.md`).
- [x] Ingresos por visitas (RPM en España, escenarios, alternativas: patrocinio, suscripción) → `INGRESOS.md`.
- [x] Mejoras: carga diferida, sin saltos de página, informe en el panel (0042 + `codigo/anuncio.tsx`, m42).

## Prioridad 6 — Calidad de páginas e interfaces
- [x] Estados vacíos y velocidad percibida: 0044 + ESTADOS-VACIOS.md + `codigo/estado-seccion.tsx` (m44); prototipo, tablero 22.
- [x] Contraste y colores reservados revisados en todo el prototipo (23/10).
- [ ] Seguir: microcopia de formularios y revisión con lector de pantalla en la fase C (axe ya está en los E2E).

## Hecho (22/10, tarde)
- Rapidez: RENDIMIENTO-BASE.md, 0036 (ojeo 93 s → 0,05 s), 55 consultas en presupuesto, caché por etiquetas.
- Usuarios: 0037 + docs/plataforma-web/codigo (acciones, proxy, sw, push, auth); m37 recorre todo el ciclo.
- Federaciones: 0038 (perfil de 24 fuentes, avisos de página); Cataluña corregida tras el arreglo del lector.
- Ingresos: INGRESOS.md. Prototipo v5: Mi cuenta y Federación.

## Siguiente
- [x] Integración continua: pruebas SQL en GitHub Actions; despliegue continuo documentado.
- [x] E2E de usuarios y administración (Playwright) para la fase C.
- [x] Sistema visual: colores, gráficos y tablas de análisis coherentes (tokens + guía de gráficos).
- [x] Más análisis de datos útiles (forma, casa/fuera, progresión de jugadores) con su rapidez medida.

## Hecho (22/10, noche)
- CI de 4 trabajos (aplicar las migraciones en PostgreSQL limpio destapó un fallo de 0030, arreglado en 0035);
  despliegue azul/verde con vuelta atrás automática, probado (DESPLIEGUE-CONTINUO.md).
- GRAFICOS.md con paleta validada para daltonismo; análisis (forma, rachas, reparto de goles); métricas de uso
  propias (0039); E2E de usuarios; prototipo: Gráficos, Inicio del panel, y Equipo/Competición/Jugador coherentes.
- 197 comprobaciones; 60 consultas en presupuesto.

## Hecho (23/10, madrugada)
- Buscador con 2 millones de personas: «garcía» 6,6 s → 0,9 s en PGlite (0041, índice de palabras). Se colgaba
  por un `left join` a core.person que el planificador hacía por recorrido completo por cada candidato: ahora
  lateral con `limit 1` por la clave (regla 10 de RENDIMIENTO-BASE §3). m41 (11), 215 comprobaciones; 60
  consultas en presupuesto en el banco de volumen.
- Publicidad medida (0042): servidas / vistas (50 % durante 1 s) / clics validados en la base, reparto uniforme
  y tope diario de campañas, interruptor general, CPM o importe fijo, informe y serie diaria en el panel;
  componente con alto reservado (sin saltos) y AdSense diferido tras consentimiento. m42 (19); 236 comprobaciones.
- Ciclo de cuentas (0043, 23/10 03:07-): invitaciones con código fuerte, personales (sólo su correo) y anulables;
  rechazar y bloquear con motivo (bloquear corta sesiones); aviso y correo al aprobar; aviso de caducidad a 7 y
  1 días; `app.estado_acceso` (una consulta por petición) con pantallas para pendiente, sin acceso, caducado y
  2FA obligatoria; freno por cuenta tras 8 contraseñas fallidas sin guardar el correo; vigilancia de
  administradores sin 2FA y pendientes que esperan. m43 (30) + 5 E2E nuevos.
- Estados de página (0044): sin calendario / empieza el… / pendiente de la federación / no publicado, sacado de la
  capacidad medida; 6 ms en el banco de volumen. m44 (8). Prototipo v6: tablero 22 y administración actualizada.

- Buscador por pares (0045): «hugo garcía» y «garcía lópez» ya salen completos (antes, sólo entre los 5.000 más
  populares) y más rápidos (0,4-0,5 s en PGlite con 2 millones). Encontrado y arreglado un fallo de 0041: la barra
  invertida de `'\s+'` se perdía en la plantilla de JS y el nombre se partía por cada «s» (m45 lo vigila).
- Accesibilidad del prototipo: contraste revisado en los 23 tableros; verde y gris de G/E/P oscurecidos (letra
  blanca 5,3:1 y 5,0:1), aviso rojo, barras de Liga, y las barras de «Qué datos publica» pasan a azul (verde/rojo/
  ámbar quedan sólo para resultados). GRAFICOS.md actualizado.
## Pendiente que no depende de Claude
- Aplicar 0023-0045 y proyectar en la base real (DeepSeek, PLAN-DEEPSEEK fase A/B: aquí no se llega a Docker).
- Copiar `docs/plataforma-web/codigo/github-workflows/*.yml` a `.github/workflows/` (ficheros protegidos).
- Reimportar Cataluña cuando se relean sus actas (las 8 del servidor ya están medidas, 23/10).

## Reglas que no cambian
Sin commits sin pedirlo · nunca sobrecargar PC/servidor · migraciones nuevas, nunca editar aplicadas · sin datos
inventados (desconocido ≠ 0) · nombres de menores nunca fuera del PC ni publicados · sin anuncios en páginas con
menores · todo probado antes de entregarlo · al terminar cada bloque: copiar al PC, plan de DeepSeek y proyecto.
