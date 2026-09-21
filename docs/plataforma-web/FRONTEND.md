# Arquitectura de la aplicación web

Estado: decisión de diseño, 14 de septiembre de 2026. Define cómo se organiza el código de
`apps/web`, dónde vive cada cosa y qué reglas no se negocian por página.
Complementa a [ARQUITECTURA.md](ARQUITECTURA.md) (capas del sistema) y a
[SISTEMA-DISENO.md](SISTEMA-DISENO.md) (aspecto).

## 1. Versión de Next: migrar a 16 antes de construir

La aplicación está en Next 15.1 con App Router. Next 16 introduce **Cache Components**, que sustituye
`dynamic`, `revalidate` y `fetchCache` por la directiva `use cache` con `cacheLife` y `cacheTag`, e
integra el prerenderizado parcial que antes era experimental.

**Decisión: migrar a Next 16 y activar `cacheComponents` antes de escribir las pantallas nuevas.**
Ver [ADR-0007](decisiones/0007-next16-cache-components.md). Razones:

- El modelo de invalidación que necesita el publicador es exactamente `cacheTag('edition:123')` +
  `revalidateTag`. En Next 15 hay que montarlo sobre `unstable_cache`, que luego habría que migrar.
- Hoy hay ~25 rutas; después de las fases 3 a 5 habrá cuarenta y tantas. El coste de migrar crece
  con cada pantalla.
- `RENDIMIENTO-BUSQUEDA.md` §7 constata que hoy `noStore()` anula la caché: no se pierde nada al
  cambiar, porque prácticamente no hay caché que conservar.
- La validación de navegación instantánea de Next 16 señala en desarrollo exactamente las páginas
  que bloquean el shell estático. Es una red de seguridad contra la regresión de rendimiento que
  este proyecto tiene como riesgo principal.

Lo que cambia en la práctica:

| Antes (Next 15) | Después (Next 16 + Cache Components) |
|---|---|
| `export const revalidate = 60` | `'use cache'` + `cacheLife('minutes')` |
| `export const dynamic = 'force-dynamic'` | nada: sin `use cache` ya es dinámico |
| `noStore()` | nada: sin caché por defecto |
| `unstable_cache(fn, claves, {tags})` | función con `'use cache'` + `cacheTag(...)` |
| `await params` arriba del componente | `params` se pasa a un hijo dentro de `<Suspense>` |
| `searchParams` leído en la página | leído en un hijo envuelto en `<Suspense>` |

Trampas que no perdona la migración: `generateStaticParams` no puede devolver `[]`;
`dynamicParams` desaparece; `runtime = 'edge'` no está soportado; `new Date()`, `Math.random()` y
`crypto.randomUUID()` durante el prerenderizado rompen el build y no se arreglan con `instant = false`;
y el estado de los componentes ahora **sobrevive** a la navegación, así que un desplegable abierto
sigue abierto al volver.

La migración se hace en una rama propia, con la codemod `cache-components-instant-false` para dejar
todo construyendo, y después ruta por ruta. No se mezcla con cambios de producto.

## 2. Estructura de carpetas

```text
apps/web/src/
  app/                      rutas: sólo composición, jamás SQL
    (publico)/              grupo de rutas sin autenticación
    (privado)/              scouting, revisión de identidades, operación
    layout.tsx  globals.css  tokens.css
  componentes/
    estructura/  datos/  dominio/  estados/   (ver SISTEMA-DISENO.md §5)
  consultas/                única frontera con la base
    contratos.ts            tipos de entrada y salida, sin dependencias de Next
    competiciones.ts  partidos.ts  personas.ts  busqueda.ts  cobertura.ts
    adaptadores/postgres/   implementación real
    adaptadores/sqlite/     puente temporal para comparar resultados
  parametros/               esquemas zod de searchParams y slugs
  formato/                  fechas, números, nombres, es-ES
  auth/                     sesión, roles, autorización por objeto
```

Reglas de dependencia, verificables con lint:

- `app/` puede importar de `componentes/`, `consultas/`, `parametros/` y `formato/`.
- `consultas/` **no** importa nada de `next` salvo `next/cache`. Así es testeable sin servidor y
  reutilizable por el publicador o por un script.
- `componentes/` no importa de `consultas/`: recibe datos por props. La única excepción son los
  componentes de servidor que son la raíz de una sección, y se nombran `*Servidor.tsx`.
- `packages/dominio` no importa nada del framework; las reglas de clasificación, desempate y
  cálculo viven ahí y se prueban ahí (ver la skill `dominio-futbol`).

### 2.1 Estado de esa estructura

La frontera con la base ya está en pie para la cobertura (14/9/2026):

- `src/consultas/contratos.ts` — tipos de fila y `ESTADOS_VISIBILIDAD`. Sin Next y sin driver.
- `src/consultas/cobertura.ts` — catálogo de consultas: nombre, descripción, presupuesto (`presupuestoMs`)
  y **las columnas que promete**. Toda consulta lleva `LIMIT` y ningún valor se interpola.
- `src/consultas/adaptadores/postgres/conexion.ts` — pool de sólo lectura con `DATABASE_URL_LECTOR`
  (rechaza la cadena si apunta a `facylf_publicador`, `facylf_admin` o `facylf_migracion`),
  `statement_timeout` de 5 s y los fallos traducidos a algo que se le pueda enseñar a una persona.
- `apps/web/test/consultas.test.ts` — prueba de contrato: `LIMIT` obligatorio, prohibición de
  interpolar o concatenar valores, columnas prometidas y las invariantes del dato (nunca más
  resultados que partidos; «completa» implica todos los resultados y todas las actas parseadas). Se
  salta con aviso si no hay canónico.
- `src/app/canonico/page.tsx` — primera pantalla alimentada por el canónico: qué hay importado y
  hasta dónde llega cada grupo, leído de `ops.coverage_checkpoint`. Si no hay credenciales o la base
  no responde, la página **lo dice**; no enseña datos de ejemplo en su lugar.
- `src/consultas/partidos.ts` y `src/app/canonico/[federacion]/[grupo]/page.tsx` — detalle de un grupo
  importado: jornadas, resultados con campo y árbitro, goleadores con su minuto y **tabla de
  clasificación**. Tres reglas visibles en pantalla: un marcador que la fuente no publicó es un guion
  (nunca un 0-0), un penalti y una propia puerta se distinguen del gol normal, y quien sólo se conoce
  por su nombre va marcado con «n» como identidad nominal. La tabla dice de dónde sale: `oficial` si la
  publicó la federación, `reconstruida desde los resultados` si la suma el importador — y entonces
  avisa de que **no incluye sanciones ni ajustes**, y de que el desempate empate a puntos lo resuelve el
  reglamento.

`apps/web/.env.local` (no versionado) lleva `DATABASE_URL_LECTOR`. Sin ese fichero la web arranca
igual, pero la página del canónico explica que no puede leer.

### 2.3 El puente y el canónico, conectados

Mientras el catálogo se navega por el puente de las colas, el canónico tiene sólo los grupos
importados. Para que el visitante lo sepa, la ficha de competición del puente consulta el canónico
(`src/lib/canonico-grupos.ts`, caché de 60 s) y, si ese grupo está importado, enseña un aviso con su
cobertura real y un enlace a la ficha del canónico:

> **Este grupo está importado en el canónico**: sus 342 partidos están completos y verificados.
> Ver la ficha del canónico: resultados, actas, goleadores y clasificación →

Si el grupo no está importado no se pinta nada, y si el canónico no responde la página sigue
funcionando: un fallo del canónico no puede tumbar el catálogo. Comprobado en marcha: el aviso sale en
CyL 2024-25 y 2025-26 (importados) y no sale en 2023-24 (todavía no).



Desde el 14/9/2026 la recolección se limita a **2023-24 en adelante** (`scripts/lib/temporada-minima.mjs`).
La web aplica el mismo suelo, y lo hace en **una sola puerta**: `competicionPublicable()`
(`src/lib/repositorio-local.ts`) añade el filtro de ventana además del de publicación, así que ninguna
de las 18 consultas que pasan por ahí puede saltárselo. Los recuentos de cabecera también lo respetan.

- `src/lib/temporadas.ts` — `TEMPORADA_MINIMA` (cambiable con `FACYLF_TEMPORADA_MINIMA`, validada como
  `AAAA-AA` antes de entrar en SQL), `filtroVentana(alias)` y `enVentana(etiqueta)`.
- Se compara **por etiqueta, nunca por código**: en La Rioja el código 9 es 2013-14 y en Andalucía el 19
  es 2023-24.
- El pie lo dice con palabras: «Se publican las temporadas 2023-24 en adelante. Las anteriores están
  recopiladas y aplazadas». Ocultar sin explicar se leería como una pérdida de datos.
- Comprobado en marcha: `/competiciones` sólo ofrece 2023-24, 2024-25, 2025-26 y 2026-27, y ninguna de
  las páginas principales muestra una temporada anterior.

Lo que falta de esta estructura: las demás secciones (`competiciones.ts`, `partidos.ts`, `personas.ts`,
`busqueda.ts`) siguen leyendo ficheros locales por `src/lib/repositorio-local.ts`; se irán moviendo a
`consultas/` a medida que la importación cubra sus datos.

## 3. Servidor y cliente

Server Component por defecto. Un componente es cliente sólo si necesita una de estas cuatro cosas:
evento de entrada del usuario, estado efímero que no debe ir a la URL, API del navegador, o una
librería de gráficos. Se marca lo más abajo posible del árbol.

Consecuencias prácticas:

- El buscador es cliente; la lista de resultados es servidor. El cliente sólo cambia la URL.
- Una tabla ordenable es servidor: el orden va en `searchParams` y lo aplica la consulta SQL. Ordenar
  10.000 filas en el navegador es enviar 10.000 filas al navegador.
- Un gráfico es cliente y se carga con `next/dynamic`; su tabla equivalente se renderiza en servidor
  para que exista aunque el JavaScript falle.

## 4. Streaming y Suspense

Cada página define su **shell**: lo que se puede prerenderizar sin datos de petición (cabecera,
navegación, títulos, esqueletos). Todo lo que depende de `params`, `searchParams`, cookies o de una
consulta no cacheada va dentro de su propio `<Suspense>` con un esqueleto del mismo tamaño.

Orden de llegada deseado en una ficha de competición: shell → cabecera con cobertura → clasificación
→ jornadas → rankings. Nunca se retrasa el bloque principal esperando a un agregado secundario: si
un `<Suspense>` agrupa los dos, el lento manda.

## 5. Caché e invalidación

```ts
// consultas/competiciones.ts
import { cacheLife, cacheTag } from 'next/cache';

export async function clasificacion(grupoId: number) {
  'use cache';
  cacheTag(`grupo:${grupoId}`);
  cacheLife('hours');          // histórico; una edición activa usa 'minutes'
  return adaptador.clasificacion(grupoId);
}
```

- Etiquetas canónicas: `federacion:{id}`, `edicion:{id}`, `grupo:{id}`, `equipo:{id}`,
  `persona:{id}`, `cobertura:{grupoId}`.
- **El publicador invalida sólo después de confirmar el lote canónico**, con `revalidateTag(tag, 'max')`
  desde un route handler protegido por secreto compartido. Nunca invalida antes de escribir.
- Nada personalizado —notas de scouting, listas privadas, resultados filtrados por rol— entra en una
  caché compartida. Si una consulta depende de la sesión, no lleva `use cache`.
- Con una sola instancia Next, la caché en memoria basta. Con varias hace falta caché compartida o
  las instancias servirán datos distintos; esa decisión se toma cuando exista la segunda instancia,
  no antes.

## 6. Estado en la URL

Todo lo que cambia lo que se ve va en la URL: federación, temporada, facetas, orden, cursor, pestaña.
Un enlace compartido debe reproducir la pantalla exacta.

```ts
// parametros/competiciones.ts
export const filtrosCompeticiones = z.object({
  federacion: z.string().regex(/^[a-z-]{2,32}$/).optional(),
  temporada:  z.string().regex(/^\d{4}-\d{2}$/).optional(),
  ambito:     z.enum(['nacional','regional','provincial','ascenso','copa']).optional(),
  genero:     z.enum(['masculina','femenina','mixta']).optional(),
  orden:      z.enum(['nombre','temporada','cobertura']).default('nombre'),
  cursor:     z.string().max(120).optional(),
  limite:     z.coerce.number().int().min(1).max(100).default(50),
});
```

- Se valida **en el límite de la aplicación** y la consulta recibe un tipo ya seguro.
- El orden nunca es un nombre de columna que venga del usuario: es un enum que la consulta traduce a
  una lista de columnas permitida.
- Un parámetro inválido no revienta la página: se ignora y se avisa con un chip ("se ha ignorado un
  filtro no reconocido").
- Los filtros por defecto no se escriben en la URL, para que las URL compartidas sean legibles.

## 7. Rutas, slugs y redirecciones

El mapa de rutas está en [PRODUCTO-UX.md](PRODUCTO-UX.md) §3. Añadidos técnicos:

- Un slug es `texto-legible--{idCanonico}`. Se resuelve por el identificador; el texto es decorativo.
  Si el texto no coincide con el actual, se responde `308` al slug correcto en vez de renderizar.
- `generateStaticParams` devuelve los grupos más visitados de la temporada en curso (nunca `[]`); el
  resto se sirve con shell estático y contenido en tiempo de petición.
- `not-found.tsx` por sección, con el contexto conservado ("esta jornada no existe en este grupo;
  el grupo tiene 30").

## 8. Metadatos, indexación y compartir

La instancia es privada. La política por defecto es **no indexar nada**:

- `robots.txt` con `Disallow: /` y sin sitemap mientras la instancia no sea pública.
- `metadata.robots = { index: false, follow: false }` en el layout raíz.
- Ninguna página de persona genera Open Graph con el nombre. Si algún día hay parte pública, será
  por lista blanca explícita de rutas, nunca por omisión.
- `generateMetadata` que lea la base lleva `'use cache'`; si necesita datos de petición, rompe el
  shell y hay que replantear la página.
- Títulos útiles de todos modos, porque se ven en la pestaña y en el historial:
  `Primera Provincial Juvenil · Grupo A · 2026-27 — Salamanca`.

## 9. Formato en español

Todo formateo pasa por `formato/`, nunca por `toLocaleString` suelto en un componente.

- Fechas: `dom 14 sep 2026`, con `<time dateTime="2026-09-14">`. Hora sólo si la fuente la publica.
- Números: separador de millar `.` y decimal `,` (`es-ES`). Promedios con un decimal como máximo.
- Un promedio estimado se muestra con la marca `~` **y** el texto "estimado" en el título accesible.
- Nunca se abrevia un nombre propio; sí se abrevian encabezados de columna, con `<abbr>` y el
  glosario de [CONTENIDO-MICROCOPIA.md](CONTENIDO-MICROCOPIA.md).
- Zona horaria fija `Europe/Madrid` en el servidor; las fechas se guardan en `timestamptz`.

## 10. Imágenes y fuentes

- Escudos: `next/image` con dimensiones fijas y marcador de posición determinista. Nunca se enlaza
  directamente a la imagen del portal federativo: se copia al almacenamiento propio o no se muestra.
- Fuentes con `next/font`, subconjunto latino, `display: swap`, precargada sólo la variable.
- Ninguna imagen sin `alt`. El escudo dentro de un enlace que ya dice el nombre del club lleva
  `alt=""`, porque repetirlo es ruido para un lector de pantalla.

## 11. Mutaciones

Las únicas mutaciones previstas son privadas: notas, listas de scouting y decisiones de identidad.

- Server Actions con validación zod del `FormData` y comprobación de autorización **dentro** de la
  acción, no en el componente que la llama.
- Una acción devuelve estado tipado para `useActionState`; el formulario funciona sin JavaScript.
- Tras una mutación cuyo resultado el usuario debe ver de inmediato se usa `updateTag`, no
  `revalidateTag`.
- Recordatorio de Cache Components: el estado del formulario sobrevive a la navegación, así que el
  reseteo tras enviar es explícito.

## 12. Errores y observabilidad

- `error.tsx` por sección: mensaje humano, identificador de incidencia correlacionable con el log,
  botón de reintento. Nunca el mensaje de la excepción.
- Cada consulta lleva nombre lógico y registra duración y filas. **No se registra el texto buscado**
  si puede ser el nombre de una persona.
- Web Vitals reales (LCP, INP, CLS) se envían a un endpoint propio desde `useReportWebVitals`, con
  muestreo y sin identificadores de usuario.

## 13. Lo que no se hace

- No se añade una librería de componentes completa: el inventario de
  [SISTEMA-DISENO.md](SISTEMA-DISENO.md) §5 es pequeño y específico del dominio. Sí se admiten
  primitivas accesibles sin estilos para menús, diálogos y pestañas.
- No se añade un gestor de estado global: la URL y el servidor son el estado.
- No se hace SPA ni se descarga una tabla entera para filtrarla en el navegador.
- No se crea una página especial por federación. Si algo sólo funciona en una federación, el
  problema está en el modelo canónico o en `source_capability`, no en la vista.
