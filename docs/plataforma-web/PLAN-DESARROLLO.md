# Plan de desarrollo por entregas

El plan evita una reescritura total. Cada fase deja una parte utilizable, medible y reversible.

## Fase 0 — contrato y línea base

Objetivo: poder demostrar que una mejora no cambia datos ni empeora tiempos.

- congelar el contrato común de competición, partido, acta, persona y cobertura;
- capturar recuentos reales por federación/temporada/grupo;
- elegir 8 recorridos de benchmark con datos grandes y casos raros;
- añadir pruebas web de humo y accesibilidad;
- registrar tiempos actuales de búsqueda y páginas;
- identificar consultas síncronas/N+1 en `repositorio-local.ts`;
- corregir documentación antigua que ya no refleja las 19 territoriales.

Criterio de salida: pruebas reproducibles y las ocho muestras de oro de
[CALIDAD-PRUEBAS.md](CALIDAD-PRUEBAS.md) §2, que cubren fuente rica, fuente sin actas, JSON con
minutos fiables, adaptador propio, cobertura baja, catálogo masivo, actas sin condición y grupo a
medias. Salamanca es la línea base, no el objetivo.

## Fase 1 — núcleo canónico PostgreSQL

- migraciones para `source`, `core`, `analytics` y `ops`;
- claves externas contextualizadas;
- importador completo de una federación desde SQLite;
- importador incremental por cursor/data version;
- validación de recuentos, huérfanos y marcadores;
- rollback de lote;
- rol de lectura y rol publicador separados.

El orden de incorporación está en [FEDERACIONES-MATRIZ.md](FEDERACIONES-MATRIZ.md) §6 y es un orden
de riesgo decreciente, no de importancia: Castilla y León, Madrid, Comunidad Valenciana, Cataluña,
Canarias, Andalucía y después el resto de PNFG. Antes del último paso el canónico ya ha visto fuente
rica, fuente mutilada, dos formatos, adaptador propio, cobertura baja y catálogo enorme.

La tabla `core.source_capability` ([ADR-0010](decisiones/0010-capacidades-por-fuente.md)) se rellena
con evidencia al incorporar cada federación; sin ella la federación no entra.

Criterio de salida: reconstrucción desde cero e incremental producen el mismo estado canónico.

## Fase 2 — repositorio de consultas

- interfaces tipadas independientes de Next;
- adaptador PostgreSQL asíncrono con pool limitado;
- búsqueda global con `pg_trgm`;
- cobertura precalculada;
- paginación por cursor;
- agregados iniciales de equipo/jugador;
- benchmarks y planes SQL versionados como documentación de prueba.

Criterio de salida: ninguna ruta migrada abre SQLite ni agrega todos los eventos en petición.

## Fase 3 — estructura, diseño y navegación

- migración a Next 16 con Cache Components, en rama propia y antes de las pantallas nuevas
  ([ADR-0007](decisiones/0007-next16-cache-components.md));
- tokens y sistema de diseño de [SISTEMA-DISENO.md](SISTEMA-DISENO.md): paleta neutra, dos
  densidades, tema claro y oscuro;
- componentes de estado (`Esqueleto`, `Vacio`, `ErrorRecuperable`, `SinCapacidad`) antes que las
  pantallas que los usan;
- shell responsive y selector global de federación/temporada;
- búsqueda omnipresente;
- listado de competiciones con facetas en URL;
- breadcrumbs y conservación de contexto;
- estados vacío/parcial/error/cargando;
- componentes de cobertura y procedencia;
- diseño accesible WCAG 2.2 AA.

Criterio de salida: las seis tareas de aceptación de `PRODUCTO-UX.md` y los tres recorridos de datos
imperfectos de [CALIDAD-PRUEBAS.md](CALIDAD-PRUEBAS.md) §4 pasan en móvil y escritorio, en tema claro
y oscuro, sin incidencias serias de `axe`.

## Fase 4 — recorrido de competición

- resumen, clasificación, jornadas y calendario;
- clasificación por jornada y variación de puesto;
- partido/acta con línea temporal y condiciones correctas;
- equipos de esa edición y ranking con cobertura;
- caché por edición y revalidación al publicar lote.

Criterio de salida: una competición completa de Salamanca **y** una de Madrid con cobertura parcial
pueden analizarse de principio a fin sin volver al buscador, sin perder temporada/grupo y sin que
ningún dato madrileño pendiente o ausente se muestre como cero.

## Fase 5 — scouting de equipos y jugadores

- equipo-temporada separado de club;
- trayectoria de persona por temporada y por equipo;
- candidatos de identidad y pantalla de revisión;
- comparación de equipos/jugadores equivalentes;
- listas y notas privadas;
- métricas de forma, goles por tramo, disciplina y participación con confianza.

Criterio de salida: ningún homónimo se fusiona silenciosamente y ninguna métrica usa un denominador
no fiable sin indicarlo.

## Fase 6 — seguridad y operación privada

- autenticación, roles y autorización por objeto;
- CSP/cabeceras/TLS;
- límites de búsqueda/exportación;
- logs de auditoría sin secretos;
- copias y restauración;
- métricas, trazas y alertas;
- prueba de carga con volumen objetivo.

Criterio de salida: puerta de publicación de `SEGURIDAD-OPERACION.md` satisfecha para un servidor
privado. Esto no autoriza por sí mismo una publicación abierta.

## Fase 7 — optimización basada en evidencia

- revisar `pg_stat_statements` y Core Web Vitals;
- ajustar o retirar índices;
- decidir si hace falta particionado;
- decidir si PostgreSQL sigue bastando para búsqueda;
- coordinar caché si se despliegan varias instancias;
- revisar retención y agregados costosos.

No introducir infraestructura nueva sin una métrica que muestre el problema.

## Primer bloque de trabajo recomendado

Dos carriles que avanzan a la vez y se encuentran en el contrato de `consultas/`:

**Carril de datos**

1. PostgreSQL en contenedor y migración del modelo canónico ([ENTORNO-LOCAL.md](ENTORNO-LOCAL.md));
2. `source_capability` con las capacidades verificadas hoy;
3. importador desde SQLite para Castilla y León, con recuentos comparados;
4. muestras de oro `cyl-salamanca-juvenil`, `madrid-tercera` y `grupo-a-medias`;
5. `search_entity` y buscador con `pg_trgm` (hoy la búsqueda global tarda 77,7 s: es la primera
   consulta que se migra);
6. importadores de Madrid, Valencia y Cataluña.

**Carril de interfaz**

1. contrato tipado de `consultas/`, con adaptador SQLite temporal detrás para poder comparar;
2. migración a Next 16 con Cache Components;
3. tokens, densidades y tema oscuro;
4. componentes de estado, incluido `SinCapacidad`;
5. shell, selector de contexto y buscador;
6. `/competiciones` y `/competicion/[slug]` sobre el contrato nuevo;
7. E2E del recorrido competición → jornada → acta → jugador, con Salamanca y con Madrid.

Después, en común: equipo, club y jugador; agregados y comparadores; resto de federaciones por
adaptador comparando recuentos.

## Definition of Done para una funcionalidad web

- recorrido y estado vacío definidos;
- contrato de datos tipado;
- filtros y contexto reflejados en URL;
- autorización aplicada en servidor;
- consulta parametrizada, limitada y sin N+1;
- cobertura/procedencia visibles cuando corresponda;
- teclado, foco, móvil y tabla alternativa para gráficos;
- prueba unitaria de dominio y/o integración de consulta;
- prueba E2E del recorrido crítico;
- comprobación de tipos y build;
- presupuesto de consulta/página medido;
- documentación actualizada si cambia una decisión.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| seguir construyendo sobre 18 SQLite | contrato de repositorio y migración por rutas |
| identidades falsas | candidatos puntuados, margen y decisiones reversibles |
| rankings engañosos | cobertura mínima y calidad en cada agregado |
| página lenta al crecer | agregados, paginación, índices medidos y caché etiquetada |
| temporada activa invisible | `complete_through_matchday` privado |
| mezclar club/equipo/categoría | `club` → `team_season` → `team_entry` |
| datos personales expuestos | matriz de visibilidad y puerta de publicación |
| fuente cambia | evidencia cruda, parser versionado y reproceso local |
| documentos vuelven a quedar obsoletos | ADR/actualización obligatoria en Definition of Done |

## Registro de decisiones (ADR)

Toda decisión que afecte persistencia, identidad, privacidad, publicación o infraestructura se deja
en `docs/plataforma-web/decisiones/NNNN-titulo.md` con:

- contexto;
- decisión;
- alternativas consideradas;
- consecuencias;
- cómo revertirla;
- fecha y estado: propuesta/aceptada/sustituida.

Primeras decisiones aceptadas por este diseño:

- ADR-0001: SQLite es staging/evidencia; PostgreSQL es consulta canónica.
- ADR-0002: los códigos externos están contextualizados.
- ADR-0003: identidad nominal es probabilística y reversible.
- ADR-0004: cobertura es un dato precalculado y versionado.
- ADR-0005: búsqueda comienza en PostgreSQL con `pg_trgm`.
- ADR-0006: no hay microservicios/Redis/motor externo sin medición.
- ADR-0007: se migra a Next 16 con Cache Components antes de construir.
- ADR-0008: el canónico vive en PostgreSQL en contenedor local, sin proveedor gestionado.
- ADR-0009: paleta de producto neutra y dos densidades.
- ADR-0010: las capacidades de cada fuente se declaran en la base.
- ADR-0011: la identidad de una persona sin código federativo exige un contexto explícito.
