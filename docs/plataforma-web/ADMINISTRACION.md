# Panel de administración — como en una plataforma grande

> Diseño (22/10/2026). Pantallas en el prototipo v4 (12 Salud, 15 Administración, 16 Calidad de datos,
> 17 Publicidad). Todo lo que se cambia aquí queda en `app.auditoria` (0034) con autor, antes y después.

## 1. Quién entra y qué puede hacer

Hoy hay dos roles (0027): **administrador** (todo) y **usuario** (su paquete). En una plataforma grande el
trabajo de administración se reparte por **capacidades**, no por más roles; ya existen y se conceden persona a
persona en `app.usuario_capacidad`:

| Capacidad | Para quién | Qué abre |
|---|---|---|
| `administrar_usuarios` | administrador | usuarios, invitaciones, paquetes, ajustes de registro, publicidad, salud |
| `confirmar_identidades` | revisor de datos | unir/separar jugadores, revisar casos de datos |
| `gestionar_reglamentos` | revisor de datos | ascensos, descensos y promociones de un grupo; parámetros de sanción |
| `ver_menores_nombres` | sólo quien lo necesite, con motivo | nombres de menores (cada acceso queda en `app.registro_acceso`) |

Seguridad del panel: 2FA obligatorio para entrar en `/admin`; sesión de administración de 8 h; cada acción
de escritura pide confirmar; nada de borrar en caliente (se desactiva y se audita).

## 2. Las áreas del panel

| Área | Qué se ve | Qué se hace | De dónde sale |
|---|---|---|---|
| **Salud** | estado por área, alertas abiertas, frescura por federación, tiempos frente a presupuesto, copias, errores | silenciar una alerta 24 h, ver el detalle | `ops.salud`, `ops.chequeo_diario`, `ops.consulta_minuto`, `ops.copia`, `ops.evento_app` (0030) |
| **Usuarios** | lista con estado (pendiente, activo, bloqueado), paquete, último acceso, favoritos | aprobar, cambiar paquete y caducidad, bloquear, conceder capacidades sueltas | `app.usuario`, `app.usuario_capacidad` |
| **Invitaciones** | códigos, usos, caducidad | crear (paquete, usos, caducidad), revocar | `app.invitacion` (0031) |
| **Registro** | modo actual | invitación / aprobación / abierto, paquete por defecto, tope de favoritos | `app.ajuste` |
| **Calidad de datos** | casos abiertos por tipo (con su tratamiento), cobertura de cada federación y competición | confirmar, marcar corregido, descartar (no vuelve a abrirse) | `ops.caso_dato`, `ops.casos_resumen`, `analytics.federacion_capacidad` (0032) |
| **Identidades** | uniones automáticas y candidatos por confirmar, con su evidencia | unir, separar | `core.identity_candidate`, `core.identity_decision` (0024) |
| **Competiciones** | zonas aprendidas y su confianza | fijar ascensos/descensos a mano | `analytics.zonas_de_grupo`, `core.reglamento_grupo` (0026) |
| **Procesos** | última pasada del proyector, importador y avisos; lotes; pendientes | relanzar un grupo (`--grupo`), ver un lote | `analytics.proyeccion_grupo`, `ops.batch`, `app.estado_generador` |
| **Avisos** | avisos generados por día y canal, suscripciones push, correos fallidos | — | `app.notificacion`, `app.suscripcion_push` |
| **Publicidad** | espacios, campañas, impresiones y clics | activar huecos, crear patrocinios, apagar todo | `app.espacio_anuncio`, `app.campana_anuncio`, `ops.anuncio_dia` (0033) |
| **Auditoría** | cada cambio de administración | filtrar por persona, tabla o fecha; ver antes/después | `app.auditoria` (0034) |
| **Accesos sensibles** | quién vio nombres de menores, quién exportó datos | — | `app.registro_acceso` |

## 3. Observabilidad «de plataforma grande», en una casa

Las cuatro señales doradas (latencia, tráfico, errores, saturación) más frescura y calidad de datos:

| Señal | Medida | Dónde | Alerta |
|---|---|---|---|
| Latencia | p50/p95 por consulta y minuto; LCP/INP por ruta | `ops.consulta_minuto`, `ops.web_vital` | p95 > presupuesto 1 h |
| Tráfico | consultas por minuto, usuarios activos por día | `ops.consulta_minuto`, `app.usuario.ultimo_acceso` | — (informativo) |
| Errores | errores por tipo; 5xx | `ops.evento_app` | ≥ 5 en 15 min = fallo |
| Saturación | conexiones, bloqueos, consultas largas, memoria, disco | `ops.chequeos()`, vigilancia | umbrales en `ops.parametro` |
| Frescura | horas desde el último lote por federación; grupos por proyectar | `ops.chequeos()` | > 48 h / > 200 |
| Calidad | casos de datos abiertos, % minutos calculables, actas a revisar | `ops.caso_dato`, `ops.chequeos()` | subida brusca |

Prácticas que se aplican: identificador de petición en cada línea de registro (correlación web ↔ base);
registros estructurados en JSON sin datos personales; presupuestos de tiempo por consulta (los tiene cada
`Consulta`); alertas con recordatorio y no repetitivas; parte diario; copias comprobadas y restauración de
prueba mensual; cambios de esquema sólo por migraciones probadas; auditoría de cada acción manual.
Cuando haga falta más (varias máquinas): exportar las métricas a Prometheus + Grafana (las tablas `ops.*` se
pueden leer con un exportador SQL) y los registros a Loki; la estructura actual no cambia.
