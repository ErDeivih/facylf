# Encargo: importador incremental de SQLite a PostgreSQL

Estado: encargo aprobado, 14 de septiembre de 2026. Este documento es autosuficiente: contiene todo
lo necesario para empezar sin leer la conversación en la que se decidió.

## 1. Qué hay que construir

Un importador que lleva los datos ya recolectados de una cola SQLite al PostgreSQL canónico, por
grupo, de forma incremental, reanudable e idempotente. Es el trabajo que desbloquea todo lo demás:
hoy la web recorre dieciocho SQLite y su portada tarda más de noventa segundos.

**No se construyen pantallas en este encargo.** Construir más interfaz sobre el lector actual agrava
el problema que este trabajo existe para resolver.

## 2. Lecturas obligatorias, en este orden

1. `CLAUDE.md` — invariantes del repositorio.
2. `docs/plataforma-web/IMPORTADOR-SQLITE.md` — **el contrato de este encargo**: vocabularios
   medidos, reglas de mapeo y orden dentro de un lote.
3. `docs/plataforma-web/MODELO-DATOS.md` §3-§6 — entidades, identidad y procedencia.
4. `docs/plataforma-web/FEDERACIONES-MATRIZ.md` §3 — capacidades por fuente.
5. `docs/plataforma-web/CALIDAD-PRUEBAS.md` §2 — qué prueba una muestra de oro.
6. `infra/migraciones/0001`…`0008` — el esquema real. Las restricciones son el contrato; si algo no
   compila contra ellas, lo que está mal es el importador, no la migración.

Los ADR de `docs/plataforma-web/decisiones/` son decisiones cerradas. Cambiar una exige escribir un
ADR nuevo que la sustituya, no editarla.

## 3. Preparar el entorno

```bash
# Docker Desktop tiene que estar iniciado.
pnpm db:arrancar          # PostgreSQL 18 en 127.0.0.1:5433
pnpm db:migrar            # aplica 0001-0008
pnpm db:estado            # debe decir «Nada pendiente»
```

Las migraciones `0001`-`0008` ya están escritas y verificadas contra un PostgreSQL real. No se
tocan. Si hace falta un cambio de esquema, se añade `0009`.

## 4. Alcance

### Entra

- Paquete nuevo `packages/canonico` con el importador y sus pruebas.
- Lectura de una cola `descargas-<federacion>/recolector-local/cola-v2.sqlite`.
- Escritura de catálogo, equipos, partidos, actas, personas, participaciones, eventos, cuerpo
  técnico, árbitros, campos y clasificación oficial.
- Registro del lote en `ops.batch` y recálculo de `ops.coverage_checkpoint` del grupo.
- Comparación de recuentos contra el origen y validación del lote.
- Pruebas con una muestra de oro.

### No entra

- Agregados de `analytics` (siguiente encargo).
- `analytics.search_entity` y el buscador (siguiente encargo).
- Cualquier cambio en `apps/web`.
- Cualquier cambio en los recolectores, parsers, perfiles o tareas programadas.
- Fusión automática de personas entre temporadas: este importador **no** crea `identity_candidate`.

## 5. Dónde va el código

```text
packages/canonico/
  package.json                  name: @facylf/canonico
  src/
    origen/cola.ts              lectura en SÓLO LECTURA de la SQLite
    origen/vocabularios.ts      tablas de traducción; valor desconocido = error
    destino/pool.ts             pg con DATABASE_URL_PUBLICADOR
    destino/repositorio.ts      upserts por entidad
    resolucion/temporada.ts     .../edicion.ts, grupo.ts, equipo.ts, persona.ts, campo.ts
    lote.ts                     orquestación, transacción y ops.batch
    validacion.ts               recuentos origen vs destino
    cli.ts
  test/
```

El importador **no depende de Next ni de nada de `apps/web`**.

## 6. Contrato de la CLI

```bash
pnpm importar --federacion castilla-y-leon --grupo <codigo> [--temporada 2025-26]
pnpm importar --federacion castilla-y-leon --temporada 2025-26        # todos sus grupos
pnpm importar --federacion castilla-y-leon --grupo <codigo> --seco    # no escribe; informa
pnpm importar --estado --federacion castilla-y-leon                   # lotes y cobertura
pnpm importar --revertir <batch_id>
```

Siempre imprime, al terminar: entidades creadas y actualizadas por tabla, filas rechazadas con su
motivo, y la comparación de recuentos origen/destino.

## 7. Reglas que no se negocian

Estas ocho producen datos falsos si se incumplen, y lo hacen en silencio:

1. **La SQLite se abre en sólo lectura y no se toca su WAL.** Los diecisiete recolectores siguen
   escribiendo mientras esto corre.
2. **Un valor fuera del vocabulario detiene el lote.** No existe el destino `otro` para un `tipo` de
   evento o una `condicion` desconocidos. Se informa del valor, la federación y la fila.
3. **`NULL` nunca se convierte en `0`.** Un marcador sin publicar es `NULL`. 532 de 2.725 partidos de
   Canarias están así.
4. **Ninguna clave externa se usa sin su federación y su contexto.** El `context_key` de
   `source.external_ref` es la tupla completa de la cola.
5. **Personas sin código federativo**: `context_key` con el formato exacto
   `rol=<normalizado>;temporada=<AAAA-AA>;ambito=<edicion|equipo>:<id>;nombre=<normalizado>`, y
   `core.person.identidad_nominal = true`. Árbitros con `ambito=edicion`, cuerpo técnico con
   `ambito=equipo`. **Nunca `partido` ni `acta`.** La migración 0008 lo rechaza si está mal.
6. **Un nombre igual no une a dos personas.** Este importador no fusiona nada entre temporadas ni
   entre contextos. La unión es una `identity_decision` posterior y reversible.
7. **El club se deriva sólo quitando el sufijo de letra entrecomillada final** (`S.D. SAN JOSE "A"`
   → `S.D. SAN JOSE`). Ninguna otra transformación. Consolidar dos denominaciones distintas es una
   decisión curada, no del importador.
8. **Un evento de técnico no es un evento de jugador.** `sujeto_tipo` se copia de la cola; un evento
   `desconocido` no se atribuye a nadie.

## 8. Idempotencia y lotes

- Todo el lote va en una transacción; un fallo en cualquier punto lo revierte entero. Un lote a
  medias es peor que ninguno, porque parece cobertura.
- Los `INSERT` masivos van por tandas con `COMMIT` intermedio **dentro del lote lógico**, no una
  única transacción de millones de filas: el WAL crece rápido y el disco ya está justo (32,7 GB de
  evidencia guardada, ~96 GB libres).
- Las claves naturales del canónico gobiernan el `on conflict … do update`.
- Lo que la fuente deja de publicar se marca, no se borra.
- `ops.batch` registra cursor, versiones de parser y normalizador, recuentos y validación.

## 9. Pruebas obligatorias

Se ejecutan contra un PostgreSQL efímero y se saltan con aviso si no hay ninguno disponible.

1. **Idempotencia**: de cero, dos veces seguidas y por mitades producen el mismo estado canónico.
2. **Recuentos**: competiciones, grupos, jornadas, partidos, actas, participaciones y eventos
   cuadran con la cola de origen para el grupo importado.
3. **Marcador contra eventos**: coinciden, o la diferencia queda como incidencia estructurada en
   `core.match_report.incidencias`, nunca silenciada.
4. **Identidad**: dos árbitros con el mismo nombre en ediciones distintas siguen siendo dos personas;
   ninguna persona se fusiona sin `identity_decision`.
5. **Ausencias**: un partido sin resultado llega como `NULL`; un acta `pendiente` no crea
   `match_report`.
6. **Reversión**: `--revertir` deja la base exactamente como antes del lote.
7. **Vocabulario**: una fila con un `tipo` inventado detiene el lote y no escribe nada.

## 10. Criterios de aceptación

El encargo está terminado cuando, sobre un grupo completo de Castilla y León:

- [ ] `pnpm importar` lo importa y los siete puntos de §9 pasan;
- [ ] el mismo importador procesa un grupo de Canarias sin un solo cambio de código;
- [ ] un grupo de la temporada en curso, a medias, importa y su `coverage_checkpoint` refleja
      `complete_through_matchday` correctamente;
- [ ] `pnpm test`, `pnpm lint` y `tsc --noEmit` siguen en verde;
- [ ] ninguna consulta del importador se escribe por concatenación de cadenas;
- [ ] el informe final cuadra con los recuentos de la cola;
- [ ] `docs/plataforma-web/IMPORTADOR-SQLITE.md` queda actualizado si aparece un vocabulario nuevo.

## 11. Prohibiciones absolutas

- Editar una migración ya aplicada.
- Escribir en las SQLite de los recolectores.
- Cambiar el ritmo, las pausas o los reintentos de los recolectores.
- Conectarse a la base como `facylf_admin` o `facylf_lector` para escribir; el importador usa
  `DATABASE_URL_PUBLICADOR`.
- Inventar un dato que la fuente no publica: titularidad, minutos, posición, asistencias, edad.
- Fusionar personas.
- Subir a Git bases, HTML, logs o estados de ingesta.

## 12. Qué entregar

El paquete, sus pruebas, y un informe corto con: recuentos del grupo importado, tiempo de
importación, tamaño ocupado en PostgreSQL, y la lista de vocabularios nuevos encontrados. Ese tamaño
por grupo es lo que permitirá estimar si el canónico completo cabe en el disco antes de cargarlo.
