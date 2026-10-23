# Arquitectura objetivo de la plataforma de fútbol

Estado: decisión de diseño, 13 de septiembre de 2026. Este documento sustituye las propuestas de
arquitectura antiguas de `PROYECTO.md` y `PLATAFORMA.md` cuando entren en conflicto. No implica aún
publicar la aplicación ni contratar ningún servicio.

## 1. Resultado que buscamos

Una plataforma privada, rápida y comprensible para:

- preparar partidos y estudiar rivales;
- localizar jugadores y seguir su trayectoria por temporada, club y equipo;
- consultar competiciones, jornadas, clasificaciones, partidos y actas;
- comparar equipos y jugadores sin mezclar categorías ni temporadas;
- saber qué datos son completos, parciales, aproximados o contradictorios;
- crecer desde el uso local actual hasta un servidor sin rehacer el dominio.

El producto no es el visor de workers. El visor explica la recolección; la web responde preguntas de
fútbol. Ambos deben compartir estado, pero tener navegación, permisos y despliegue separados.

## 2. Por qué la arquitectura actual no es la definitiva

La web Next.js abre en lectura hasta 18 bases SQLite que los workers modifican continuamente. Esto ha
permitido validar el producto, pero no es una capa de consulta escalable:

- `node:sqlite` es síncrono y una consulta pesada bloquea el proceso de Next;
- la misma entidad vive con formas y códigos diferentes en cada fuente;
- las agregaciones recorren participaciones y eventos al abrir páginas;
- la publicación completa se recalcula mediante subconsultas correlacionadas;
- una búsqueda global necesita consultar bases distintas y combinar resultados en memoria;
- no existe un lugar único para identidades entre temporadas, revisiones humanas o agregados.

El volumen ya supera centenares de miles de actas y varios millones de participaciones. La proyección
del histórico es de millones de actas, por lo que la separación debe hacerse antes de diseñar más
pantallas costosas.

## 3. Arquitectura por capas

```text
Portales federativos
        │
        ▼
Recolectores independientes ──► HTML/JSON/PDF .gz inmutable
        │                         + hash + fecha + URL
        ▼
SQLite de cada federación
(cola, descubrimiento, parseo, calidad)
        │
        ▼  exportaciones incrementales idempotentes
Normalizador / publicador
        │
        ├──► PostgreSQL canónico (hechos y dimensiones)
        ├──► proyecciones de búsqueda
        └──► agregados de estadísticas y cobertura
                    │
                    ▼
             Next.js App Router
        Server Components + BFF/API interna
                    │
             caché etiquetada
                    ▼
       navegador de escritorio o móvil
```

### Responsabilidad de cada capa

| Capa | Es dueña de | No debe hacer |
|---|---|---|
| Recolector | ritmo, reintentos, evidencia, parser y cola | cálculos para una pantalla |
| SQLite de fuente | estado fiel y reanudable de esa federación | identidad global entre fuentes |
| Normalizador | mapear al contrato común, idempotencia, procedencia | inventar datos ausentes |
| PostgreSQL canónico | relaciones, búsqueda, permisos, hechos consultables | guardar lógica específica del DOM |
| Agregados | rankings y series reproducibles | sustituir los hechos originales |
| Next.js | navegación, presentación, autorización y caché | recorrer HTML o abrir 18 SQLite en producción |

## 4. Elecciones técnicas

### Aplicación

- Migrar a Next.js 16 y activar Cache Components antes de construir las pantallas nuevas
  ([ADR-0007](decisiones/0007-next16-cache-components.md)); ver [FRONTEND.md](FRONTEND.md).
- Mantener App Router y TypeScript.
- Mantener Server Components como opción normal; un gráfico, selector rico o comparación interactiva
  puede ser cliente, pero las páginas no deben descargar grandes tablas para filtrarlas en el navegador.
- Mantener `packages/dominio` independiente del framework para reglas y métricas puras.
- Crear una capa `packages/datos` o `apps/web/src/lib/consultas` con contratos de consulta; ninguna
  página escribe SQL directamente.
- Validar parámetros de URL en el límite de la aplicación y usar siempre consultas parametrizadas.

### Base de consulta

PostgreSQL 18 en contenedor local y, más adelante, en el servidor privado; sin proveedor gestionado
en el camino crítico ([ADR-0008](decisiones/0008-postgres-local-docker.md), detalles operativos en
[ENTORNO-LOCAL.md](ENTORNO-LOCAL.md)). Razones:

- claves y restricciones relacionales para identidades complejas;
- índices B-tree, parciales, de expresión y GIN;
- `pg_trgm` para nombres con tildes, erratas o apodos;
- vistas materializadas o tablas agregadas para rankings;
- roles separados de lectura, publicación y administración;
- instrumentación de consultas con `pg_stat_statements`.

SQLite permanece como staging local y fuente de reconstrucción. La migración no borra ni reemplaza
los archivos actuales.

### Archivos originales

En local continúan en `descargas-*`. En servidor, si se trasladan, irán a almacenamiento de objetos
privado con clave por federación/temporada/tipo/hash. PostgreSQL guarda metadatos y hash, no el HTML
completo. No se sirven estos archivos directamente desde la web.

## 5. Modos de ejecución

### Ahora: desarrollo local

- Workers y evidencias en el equipo actual.
- SQLite por federación.
- PostgreSQL local en contenedor o instalación nativa cuando comience la fase canónica.
- Next.js sólo enlazado a PostgreSQL para las páginas migradas; se permite un adaptador SQLite
  temporal detrás del mismo contrato para comparar resultados.

### Futuro: servidor privado

- Un servicio Next.js Node de larga duración, detrás de proxy HTTPS.
- PostgreSQL en red privada, no expuesto a Internet.
- Publicador ejecutado como trabajo independiente y con usuario de escritura limitado.
- Copia incremental desde este equipo al servidor; los scrapers no tienen que vivir junto a la web.
- Almacenamiento de objetos privado opcional para originales.

No es necesario introducir microservicios, Kubernetes, Redis ni un motor de búsqueda externo al
principio. Se añaden sólo cuando una medición demuestre el cuello de botella.

## 6. Publicación y frescura

La cobertura tiene dos ejes y no debe reducirse a un booleano:

1. `completitud_historica`: catálogo, jornadas y actas de una edición terminada.
2. `completa_hasta`: última jornada cerrada y verificada de una edición en curso.

Estados de visibilidad:

| Estado | Uso |
|---|---|
| `oculta` | descubrimiento o datos incoherentes |
| `parcial_privada` | scouting interno con cobertura visible |
| `verificada_hasta_jornada` | temporada activa, sólo jornadas cerradas |
| `completa` | edición terminada y validada |

Esto preserva la regla conservadora de no mostrar datos incompletos como finales, pero permite usar
una temporada en curso sin esperar a junio. Cualquier futura vista pública podrá limitarse a
`completa`; la instancia privada puede usar `verificada_hasta_jornada`.

El publicador emite una versión monotónica por entidad (`data_version`). Next invalida etiquetas
concretas —federación, edición, equipo o persona— en vez de desactivar toda caché. La documentación
actual de Next recomienda revalidación por etiquetas para evitar invalidaciones excesivas.

## 7. Objetivos medibles

Presupuestos iniciales, medidos en producción con datos realistas:

- búsqueda sugerida p95 menor de 200 ms en servidor;
- página de competición p95 menor de 800 ms sin contar red del usuario;
- respuesta inicial HTML menor de 1,5 s en conexión normal;
- consultas ordinarias con máximo 100 filas; exportaciones siempre asíncronas;
- cero consultas a archivos federativos desde una petición de usuario;
- cero estadísticas sin etiqueta de cobertura cuando ésta no sea completa;
- Core Web Vitals al percentil 75: LCP ≤ 2,5 s, INP ≤ 200 ms y CLS ≤ 0,1.

## 8. Decisiones que no deben tomarse todavía

- Motor externo de búsqueda.
- Separar tablas por federación mediante particiones físicas.
- Hacer pública la información nominal de menores.
- Fusionar automáticamente personas entre federaciones.

Cada una necesita volumen medido, requisitos de privacidad o una necesidad operativa real.

## 9. Documentos de implementación

Datos y consulta:

- [PLAN-DEEPSEEK.md](PLAN-DEEPSEEK.md) **(22/10/2026)**: orden de ejecución, comprobaciones y qué hacer si falla. [CASUISTICAS.md](CASUISTICAS.md): catálogo de casos de los datos.
- [PLATAFORMA-NACIONAL.md](PLATAFORMA-NACIONAL.md): **(21/10/2026)** especificación y plan de la plataforma nacional: diagnóstico medido, modelo de lectura (migración 0023), normalización en cuatro lenguas, clubes, seguridad, observabilidad, despliegue y fases.
- [MODELO-DATOS.md](MODELO-DATOS.md): entidades, claves, procedencia, identidades y métricas.
- [FEDERACIONES-MATRIZ.md](FEDERACIONES-MATRIZ.md): las 19 territoriales, qué publica cada fuente y qué no, y cómo crece la web mientras llegan los datos.
- [IMPORTADOR-SQLITE.md](IMPORTADOR-SQLITE.md): vocabularios medidos de la cola y reglas de mapeo al canónico.
- [ENCARGO-IMPORTADOR.md](ENCARGO-IMPORTADOR.md): encargo autosuficiente del importador, con alcance, reglas y criterios de aceptación.
- [IMPORTADOR-INFORME.md](IMPORTADOR-INFORME.md): informe final del importador: importaciones reales, cuánto ocupa un grupo en PostgreSQL, rendimiento medido y criterios de aceptación.
- [RENDIMIENTO-BUSQUEDA.md](RENDIMIENTO-BUSQUEDA.md): índices, búsqueda, agregados y caché.
- [JEV-EVALUACION.md](JEV-EVALUACION.md): qué se ha verificado del modelo de decisión Jev, dónde no entra (importador) y con qué criterio previo se medirá cuando haya clave.

Producto e interfaz:

- [PRODUCTO-UX.md](PRODUCTO-UX.md): navegación, filtros, páginas y gráficos.
- [SISTEMA-DISENO.md](SISTEMA-DISENO.md): tokens, tipografía, densidades, inventario de componentes y criterio visual.
- [CONTENIDO-MICROCOPIA.md](CONTENIDO-MICROCOPIA.md): glosario, abreviaturas y los textos canónicos de ausencia y cobertura.
- [FRONTEND.md](FRONTEND.md): versión de Next, estructura de carpetas, frontera servidor/cliente, caché y estado en la URL.
- [DESIGN.md](../../DESIGN.md) (raíz): contrato visual de una pantalla, autosuficiente, para entregar a cualquier agente o herramienta antes de tocar interfaz.

Operación y calidad:

- [ENTORNO-LOCAL.md](ENTORNO-LOCAL.md): PostgreSQL en contenedor, roles, migraciones y conexiones.
- [SEGURIDAD-OPERACION.md](SEGURIDAD-OPERACION.md): permisos, privacidad, despliegue y copias.
- [CALIDAD-PRUEBAS.md](CALIDAD-PRUEBAS.md): muestras de oro, presupuestos medidos, E2E y accesibilidad.
- [PLAN-DESARROLLO.md](PLAN-DESARROLLO.md): fases y criterios de aceptación.

## 10. Fuentes técnicas

- [Next.js: Server y Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js: revalidación por tiempo y etiquetas](https://nextjs.org/docs/app/getting-started/revalidating)
- [Next.js: despliegue propio](https://nextjs.org/docs/app/guides/self-hosting)
- [PostgreSQL: índices](https://www.postgresql.org/docs/18/indexes.html)
- [PostgreSQL: búsqueda de texto](https://www.postgresql.org/docs/18/textsearch.html)
- [PostgreSQL: `pg_trgm`](https://www.postgresql.org/docs/18/pgtrgm.html)
- [Core Web Vitals](https://web.dev/articles/vitals)
