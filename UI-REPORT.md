# UI-REPORT — FACyLF · Fondo Popular

**Encargo:** `F:\Inforepositorios\TAREAS-POR-PROYECTO.md` §facylf y `ENCARGO-UI-COORDINADOR.md`.
**Fecha:** 13/11/2026. **Alcance:** capa de componentes shadcn/Radix, tres pantallas (**panel**,
**listado**, **detalle**), estados, medición a 390×844 y escritorio, puertas. **No se toca la ingesta
ni los datos** (ver §7).

**Resultado en una frase:** las tres pantallas usan ya el sistema `componentes/ui` (shadcn sobre
Radix), con estados de vacío, carga y error; la medición contra la demo estática pasa de **1 de 8
mediciones incumpliendo** (28 textos cortados en el detalle a 390 px) a **0 de 8**, con **0 controles
tapados por barras fijas**, **0 scroll horizontal** y la **suite, el lint, el `tsc` y el build en
verde**.

---

## 1 · Before | After | Why

| Before | After | Why |
|---|---|---|
| Cada pantalla inventaba sus clases: tres copias de `TARJETA`, `CONTROL`, `BOTON` en `controles.ts` | Capa única `apps/web/src/componentes/ui/` (Button, Card, Badge, Table, Input, Select, Label, Checkbox, Dialog, TabsNav, Alert, Progress, Skeleton, estados) | Un solo sitio que corregir; `Button asChild` sobre **Radix Slot** y `Dialog` sobre **Radix Dialog** (foco atrapado y Escape resueltos por la primitiva) |
| Colores literales sueltos (`border-[#D6D6D4]` en los filtros) | `border-[var(--borde)]` y resto de roles | DESIGN.md: ningún color literal en un componente |
| Panel de calidad: 249 filas de golpe (18.149 px de alto a 390 px), sin cabecera fija y con `aria` de tabla incompleto | Resumen en tarjetas, filtro por texto y «solo incidencias» con el estado en la URL, **paginación de 30**, cabecera y primera columna fijas, insignias de regla y barra de actas | Con 249 filas nadie encuentra nada; el DOM baja de **2.087 a 637 nodos** |
| Panel: `500` si el canónico falla; no había estado vacío ni error con salida | `error.tsx` con reintento, `loading.tsx` con esqueleto y `EstadoVacio` («Ningún grupo encaja con ese filtro» + quitar filtros) | Un 500 no dice qué pasa ni deja actuar; el vacío no puede parecer «todo OK» |
| Listado: 8 controles siempre abiertos; en 390 px los resultados quedan a dos pantallas | `Input`/`Select`/`Checkbox` del sistema; los secundarios se pliegan con `<details>` **nativo** (sin JS) y se abren solos si hay filtros activos; chips como `Button` | El primer pantallazo enseña resultados; funciona también en la foto estática y con teclado/lector |
| Listado: 4 colores/estilos de control distintos entre formulario, chips y paginación | Todos por la capa `ui`, con el mismo alto táctil (44 px) y el mismo anillo de foco | Se reconoce un solo lenguaje de controles |
| Detalle: pestañas como `<a>` sueltas con estilos a mano | `TabsNav` (enlaces con `aria-current`, fijas y apagadas con `aria-disabled`) | El estado sigue en la URL y las pestañas sin pantalla no fingen un enlace |
| Detalle: línea de procedencia con jerga («CSV de partidos jugados», «Fuente federativa: J1») | «Resultados hasta la jornada 7 · tabla oficial de la jornada 1 · Descargar los partidos jugados (48) en CSV» | Texto de interfaz que se entiende sin conocer el sistema |
| Detalle: 28 textos cortados a 390 px (nombres de equipo, campo y árbitro con `truncate`, y nombres de la clasificación a 60 px de ancho) | Se quita el recorte: `break-words` y ancho disponible; el marcador sigue en columna fija del 44 % | Criterio «sin texto cortado» del encargo; el nombre completo deja de estar escondido |
| Detalle: `text-[9px]`/`text-[10px]` en las insignias de forma (por debajo del suelo tipográfico de 11 px) | `text-etiqueta` (11 px) | Escala tipográfica con suelo; lo detectó `ai-design-check` (`type-scale`) |
| Detalle: panel de calidad con OK/KO a color y texto pequeño | `Badge` con **texto** («Cuadra», «No cuadra (+3)») y `Alert` con `role=alert` cuando hay incoherencia; barra de actas con `aria` y % | Nunca sólo color: daltonismo e impresión en blanco y negro leen lo mismo |
| Detalle: cabecera con barra de temporada y desplegables a mano | `Card` + `Progress` (anuncia «jornada 7 de 26») + `Select` del sistema | Un solo componente de progreso y de desplegable |
| Filtros: sin pistas de que hay más controles | `<details>` con «Más filtros (n)» y el recuento de filtros activos | Se ve qué hay aplicado y cómo plegarlo |
| Pie sin reserva para la zona segura del teléfono | `pb-[max(1.5rem,env(safe-area-inset-bottom))]` en el pie | El último enlace no queda bajo el gesto del sistema (el fallo de pie tapando campos de Garmin/EntrenoLab) |
| Error sólo con color en cualquier aviso de la casa | `Alert` fuerza `role=alert`/`status` y cada insignia lleva su texto | Regla nueva del aviso de revisiones externas |

## 2 · Capturas

Antes y después, a 390×844 y 1440×900 (pantalla completa y primer pantallazo), en `capturas/`:

- Antes: `capturas/ui-antes-<ruta>-<ancho>.png` y `...-completa.png` (`ui-antes-*`, 16 actuales).
- Después: `capturas/ui-despues-<ruta>-<ancho>.png` y `...-completa.png` (`ui-despues-*`, 16).
- Rutas: `/`, `/explorar/calidad` (panel), `/explorar/competiciones` (listado),
  `/explorar/competicion/2939` (detalle).

Las capturas se generan con `scripts/ui/medir-ui.mjs` (Chromium de Playwright), no a mano.

## 3 · Medición (390×844 y 1440×900)

`medicion-antes.json` (foto anterior) y `medicion-despues.json` / `medicion.json` (foto nueva). Ambos
con el **mismo medidor** (`scripts/ui/medir-ui.mjs`), al que se le añadió en esta entrega el criterio
**«controles tapados por barras fijas»** y el inventario de barras (`barrasFijas`) que pidió la
revisión externa.

| Ruta | Tamaño | Nodos DOM | Textos cortados | Controles tapados | Objetivos < umbral | Veredicto |
|---|---|---|---|---|---|---|
| `/` | 1440x900 | 145 → **145** | 0 → **0** | 0 → **0** | 9 → 9 | OK → **OK** |
| `/` | 390x844 | 145 → **145** | 0 → **0** | 0 → **0** | 9 → 9 | OK → **OK** |
| `/explorar/calidad` | 1440x900 | 2087 → **637** | 0 → **0** | 0 → **0** | 253 → 4 | OK → **OK** |
| `/explorar/calidad` | 390x844 | 2087 → **637** | 0 → **0** | 0 → **0** | 13 → 5 | OK → **OK** |
| `/explorar/competicion/2939` | 1440x900 | 757 → **775** | 0 → **0** | 0 → **0** | 20 → 6 | OK → **OK** |
| `/explorar/competicion/2939` | 390x844 | 757 → **775** | **28 → 0** | 0 → **0** | 50 → 22 | **FALLA → OK** |
| `/explorar/competiciones` | 1440x900 | 477 → **547** | 0 → **0** | 0 → **0** | 13 → 13 | OK → **OK** |
| `/explorar/competiciones` | 390x844 | 477 → **547** | 0 → **0** | 0 → **0** | 13 → 14 | OK → **OK** |

- **Incumplen: 1 de 8 antes → 0 de 8 después.**
- **Controles tapados = 0** en las 8 mediciones; **barras fijas inferiores = 0**. En FACyLF no hay
  pie fijo (el pie va en flujo), así que el fallo de Garmin/EntrenoLab no existía; se mide igual y
  queda registrado en `medicion.json` (`controlesTapados`, `barrasFijas`), y además el pie reserva la
  zona segura.
- **Scroll horizontal:** 0 en todas. **Primer contenido visible:** sí en todas.
- Nodos del panel: la paginación de 30 y los componentes compartidos bajan el DOM un 69 %.
- Nota: los «objetivos < umbral» que quedan son de la cabecera del sitio (buscador, avatar, tema), que
  es cromo compartido fuera de las tres pantallas; se listan como pendiente.

## 4 · Estados (vacío, carga, error)

| Pantalla | Vacío | Carga | Error |
|---|---|---|---|
| Panel `/explorar/calidad` | `EstadoVacio` con «Ningún grupo encaja con ese filtro» + quitar filtros; y «Todavía no hay grupos…» sin datos | `loading.tsx` + esqueleto con el alto real (resumen, filtro y filas) | `error.tsx` + `EstadoError` con «Reintentar»; `CanonicoNoDisponible` se trata como estado honesto |
| Listado `/explorar/competiciones` | `EstadoVacio` con temporadas con datos y quitar filtros | `loading.tsx` + esqueleto | `error.tsx` + «Reintentar» |
| Detalle `/explorar/competicion/[id]` | «Sin clasificación publicada.» (contrato de pruebas) | `EsqueletoContenido` dentro del `Suspense` (sin `loading.tsx` de ruta: convertiría el 404 en 200) | `error.tsx` + «Reintentar» |

## 5 · Puertas

| Puerta | Comando | Resultado real |
|---|---|---|
| Pruebas | `npx vitest run --shard=1/4` … `4/4` | **0 fallos**: 482 + 255 (1 saltada) + 355 + 325 = **1.417 pruebas en verde**, 91 ficheros. Incluye `apps/web/test/ui-componentes.test.ts` (8 pruebas de la capa). |
| Lint | `pnpm lint` | `exit 0` (`tsc -b --noEmit packages/dominio packages/ingesta packages/canonico`) |
| Tipos web | `pnpm --filter @facylf/web exec tsc --noEmit` | `exit 0` |
| Build | `pnpm --filter @facylf/web build` | `exit 0` (webpack, 20 rutas; `postbuild` poda 27 entradas de datos) |
| Herramientas del medidor | `node --test scripts/ui/medir-ui.test.mjs scripts/ui/servir-estatico.test.mjs` | **15 pruebas, 0 fallos** (incluye el criterio nuevo «control tapado») |
| `ai-design-check` (MIT) | `npx @enmera/ai-design-check <ficheros de la entrega>` | **0 errores** (17 avisos en subrutas heredadas y 2 en la página de detalle: `toFixed` y repetición de chips; quedan listados). App completa: 249 errores de deuda anterior en las 19 pantallas no migradas; no se silencian, se dejan en la línea base. |
| `unslop` (CC-BY-4.0) | método: auditoría → dirección → pasadas | La auditoría **es la tabla §1** (`Before \| After \| Why`), una fila por hallazgo; sin animación decorativa, sin degradados, sin emojis de interfaz, sin texto de relleno. No hay binario de `unslop`: es una habilidad de criterio; se aplica el método y se atribuye (Damir Sokolovsky, CC-BY-4.0). |

Configuración de la puerta: `apps/web/ai-design-check.json` (MIT). Sólo se permiten, con motivo, los
radios que son **tokens** del sistema (`--radius-*`): la regla `radius-scale` no puede leer valores de
CSS y los marcaría como literales; y el pulso del esqueleto (`pulse-for-live-only`), que es el patrón
estándar de un estado de carga. Cualquier otro silencio tendría que llevar su razón.

## 6 · Demo comprobada

- Foto estática regenerada **desde la app real** (PostgreSQL del PC y temporada 2026-27, `FACYLF_DEMO=1`):
  178 rutas pedidas, **168 páginas** escritas, 21 escudos descargados.
- Servida en local (`scripts/ui/servir-estatico.mjs`, puerto 4173) y medida: **0 de 8 mediciones
  incumplen**, 0 textos cortados, 0 scroll horizontal, 0 controles tapados.
- Enlaces de la foto: **169 páginas, 7.579 enlaces/recursos internos, 0 rotos** (`tmp/audita-enlaces-total.mjs`).
  Se corrigieron dos escudos que ya faltaban en la foto anterior (5524 y 1519: los generaba la segunda
  pasada de fichas de equipo y no se descargaban).
- **Servidor de la foto: 0 respuestas 404** durante la medición (contador de `servir-estatico.mjs`).
- **Demo publicada (13/11/2026):** commit `075a0d7` en `ErDeivih/fondo-popular-demo`.
  `https://erdeivih.github.io/fondo-popular-demo/` responde **200** y sirve ya la versión nueva
  (contiene `Sin incidencias`, `Más filtros` y `Cuadra`). Comprobadas con HTTP real **10 rutas y
  recursos, todos 200**: `/`, `/explorar/competiciones/`, `/explorar/calidad/`,
  `/explorar/competicion/2939/`, `/explorar/competicion/44/`, `/explorar/competicion/44/jornada/1/`,
  `/explorar/acta/2000559/`, `/escudos/5524.png`, `/escudos-fed/castilla-leon` y `/404.html`.
- **Medida contra la URL publicada** (`medicion-publicada.json`, misma herramienta y mismas rutas):
  **0 de 8 incumplen**, con los mismos números que la local (0 textos cortados, 0 scroll horizontal,
  0 controles tapados).

## 7 · Qué NO se ha tocado

- **Ingesta**: ni `packages/ingesta`, ni `packages/canonico`, ni `recolector*.json`, ni
  `docker/compose.yml` (los cambios que ya estaban en el árbol no son de esta entrega). `pnpm lint`
  compila esos paquetes y pasa: no se han roto.
- **Datos**: ninguna migración, ninguna escritura. Las consultas de lectura de las tres pantallas son
  las mismas.
- **Dos `LIMIT`**: el contrato de pruebas (`competicion-pantalla.test.ts`) exige que toda consulta de
  la pantalla lleve `LIMIT`; tres no lo llevaban (`frescura-del-grupo`, `calidad-del-grupo`,
  `partidos-csv-del-grupo`) y la suite estaba en rojo por eso antes de esta entrega. Se añaden
  `limit 1` (agregados, una fila) y `limit 2000` (descarga CSV) **sin cambiar el resultado**.
- **Otras 19 pantallas**: no se rediseñan; heredan tokens y se migrarán con la misma capa.

## 8 · Ficheros tocados

Nuevos: `apps/web/src/componentes/ui/` (16 ficheros: alert, badge, button, card, checkbox, dialog,
estado, index, input, label, progress, select, skeleton, table, tabs, …), `apps/web/src/lib/cn.ts`,
`apps/web/src/lib/plural.ts`, `apps/web/test/ui-componentes.test.ts`, `apps/web/ai-design-check.json`,
`apps/web/src/app/explorar/calidad/{loading,error}.tsx`,
`apps/web/src/app/explorar/competiciones/{loading,error}.tsx`,
`apps/web/src/app/explorar/competicion/error.tsx`, `scripts/ui/medir-ui.mjs` (criterio nuevo),
`UI-REPORT.md`.

Modificados: `apps/web/src/app/tokens.css` (alias shadcn), `apps/web/src/app/globals.css` (filtros
plegables), `apps/web/src/app/layout.tsx` (zona segura del pie), las páginas de las tres pantallas,
`componentes/{catalogo,competicion}/*` (filtros, lista, estados, paginación, cabecera, panel de
calidad, clasificación y partidos), `apps/web/src/consultas/competiciones.ts` (los `LIMIT`),
`ESPECIFICACION.md` (§ UI), `apps/web/test/jornada-pantalla.test.ts` (la aserción de `truncate` pasa a
`break-words`, con el motivo escrito), `apps/web/package.json` y `pnpm-lock.yaml` (dependencias).

## 9 · Dependencias y licencias

| Paquete | Versión | Licencia | Para qué |
|---|---|---|---|
| `clsx` | 2.1.1 | MIT | clases condicionales de `cn()` |
| `tailwind-merge` | 3.7.0 | MIT | resolver conflictos de Tailwind en `cn()` |
| `class-variance-authority` | 0.7.1 | MIT | variantes de `Button`, `Badge` y `Alert` |
| `@radix-ui/react-slot` | 1.5.0 (ya estaba) | MIT | `Button asChild` |
| `@radix-ui/react-dialog` | 1.3.x (ya estaba) | MIT | `Dialog` accesible (foco, Escape, `aria-modal`) |
| `tailwindcss` | 4.x (ya estaba) | MIT | utilidades y `@theme` |
| `@enmera/ai-design-check` | npx, no instalado | MIT | puerta (se ejecuta desde npx, sin añadirlo al proyecto) |
| `heydamir/unslop` | método, no instalado | CC-BY-4.0 | auditoría y tabla Before/After/Why (atribución: Damir Sokolovsky) |

No se ha añadido ningún componente Pro de Wensity ni código copiado de webs ajenas: los componentes
se implementan en el repositorio.

## 10 · Pendientes (con motivo)

1. **19 pantallas heredadas**: siguen con las clases antiguas. `ai-design-check` sobre la app completa
   da 249 errores anteriores (mayúsculas con tracking, `text-[9px]`, radios literales) que se migrarán
   pantalla a pantalla con la misma capa.
2. **Objetivos táctiles de la cabecera** (buscador, avatar, tema): fuera de las tres pantallas, no se
   tocan aquí.
3. **Aviso de `ai-design-check` en la página de detalle**: `toFixed` (usar `Intl.NumberFormat`) y chips
   KPI repetidos que piden componente; se deja porque el chip es un patrón de tres cifras y el cambio
   no aporta al alcance.
4. **Revisión de «ojos frescos» a la mañana siguiente**: pendiente por definición del método.

## 11 · Cómo reproducir

```bash
pnpm --filter @facylf/web dev --port 3002            # o start, con FACYLF_DEMO=1 para la foto
npx vitest run --shard=1/4   # y 2/4, 3/4, 4/4
pnpm lint && pnpm --filter @facylf/web exec tsc --noEmit && pnpm --filter @facylf/web build
node scripts/ui/servir-estatico.mjs --puerto 4173
node scripts/ui/medir-ui.mjs --base http://127.0.0.1:4173 --prefijo /fondo-popular-demo \
  --rutas /,/explorar/calidad,/explorar/competiciones,/explorar/competicion/2939 \
  --etiqueta despues --salida medicion-despues.json
cd apps/web && npx @enmera/ai-design-check src/componentes/ui src/app/explorar/calidad \
  src/app/explorar/competiciones "src/app/explorar/competicion/[id]/page.tsx" src/componentes/catalogo
```

---

# Segunda tanda — pantallas heredadas, cabecera y avisos (13/11/2026)

**Encargo:** cerrar lo que la primera tanda dejó como pendiente: (1) migrar las pantallas heredadas a
la misma capa; (2) objetivos táctiles y foco de la cabecera compartida; (3) los 2 avisos de
`ai-design-check` de la página de detalle. Sin tocar la ingesta ni los datos.

**Resultado en una frase:** las pantallas heredadas consumen ya la capa `componentes/ui` (a través de
un adaptador que conserva su JSX y su lógica), no queda **ningún color literal** en el código de la web
(203 → 0), la cabecera tiene 44 px y foco visible en todos sus controles, la página de detalle pasa de
2 avisos a **0**, y la medición de las pantallas migradas queda con **0 controles tapados**, 0 texto
cortado y 0 scroll horizontal.

## 12 · Before | After | Why (segunda tanda)

| Before | After | Why |
|---|---|---|
| 15 ficheros de pantallas antiguas usaban clases sueltas (`boton-primario`, `control-filtro`, `etiqueta-filtro`, `insignia*`, `subnav`) definidas a mano en `globals.css` | `componentes/ui/legado.ts`: esas clases pasan a ser constantes construidas con `buttonVariants` y los mismos tokens; las pantallas importan del sistema (`import { BOTON_SECUNDARIO } from '@/componentes/ui/legado'`) | Se migran sin reescribir su JSX ni su lógica (que es lo que pedía el encargo); un solo origen para botón, campo, insignia y pestañas |
| `.boton-primario`/`.boton-secundario` heredados: 39 px de alto, versalitas con tracking y hover con color de club | 44 px, 12–13 px, caja baja, acento de producto y `focus-visible` con `--foco` | Objetivo táctil y foco visibles; además el botón ya no parece de otra aplicación |
| `.control-filtro` con 41 px, sin radio y foco por `:focus` | 44 px, radio de control y `:focus-visible` con anillo del sistema; etiqueta de campo en caja baja | Los formularios heredados se comportan como los nuevos |
| `.insignia` a 10 px con versalitas | Insignia del sistema a 11 px, con su borde y su texto (nunca sólo color) | Suelo tipográfico y regla de «no sólo color» |
| `subnav` sin estado activo | `.subnav` con `aria-current` marcado con borde y color de acento; 44 px por enlace | Se ve en qué pestaña estás y se puede tocar |
| **203 colores literales** en 12 ficheros (`#5C646C`, `#D6D6D4`, `#EDF0ED`, `#F4F5F3`, `#FAFBFA`, `#8A8E91`, `#1F7A46`, `#C6892B`…) | **0** literales en `.tsx`: todos por roles (`--texto-suave`, `--borde-fuerte`, `--fondo-sutil`, `--victoria`, `--amarilla`, `--texto-tenue`) | DESIGN.md: si no hay token se crea; ningún componente con color literal |
| 57 ficheros con versalitas y `tracking-[…em]` (slop) en etiquetas | Caja baja; el énfasis por peso y tamaño | Regla de `unslop`/GUIA-UI: sin etiquetas en mayúsculas con tracking |
| Cabecera: el foco venía sólo del `:focus-visible` global; sin anillo explícito en logo, secciones, cuenta y tema | Anillo de foco explícito con `--foco` y `ring-offset` de la superficie fuerte; todos los controles miden 44 px (`size-11`, `min-h-11`, campo `h-11`) | El encargo lo pedía explícito; medido: **0 objetivos pequeños en la cabecera** |
| Paginación del panel y del listado con botones `size="sm"` (36 px) | Botones de tamaño normal (44 px) | El «Siguiente →» era el último objetivo pequeño del flujo de listado |
| Detalle: `(goles/partidos).toFixed(2).replace('.', ',')` y 3 chips KPI copiados | `lib/formato.ts` con `Intl.NumberFormat('es-ES')` y `componentes/competicion/IndicadoresGrupo.tsx` | Los 2 avisos de `ai-design-check` (`locale-number-format` y `repeated-markup`) desaparecen: 0 avisos en la página |
| Casilla de provincia contada como objetivo de 20 px | El medidor mide la etiqueta que la envuelve (44 px) cuando la casilla va dentro de una `label` | La casilla no es el objetivo: lo es la etiqueta que se toca; el criterio deja de dar falsos positivos |

## 13 · Medición de las pantallas migradas (390×844 y 1440×900)

`medicion-segunda-antes.json` (build anterior) y `medicion-segunda-despues.json` (código migrado), misma
base de datos y mismas rutas; umbral táctil 44 px en móvil y 32 en escritorio.

| Ruta | Tamaño | Nodos (antes → después) | Textos cortados | Controles tapados | ¿Scroll horizontal? | Objetivos < umbral (antes → después) | Veredicto |
|---|---|---|---|---|---|---|---|
| `/competiciones` | 390×844 | 1382 → 1405 | 0 → 0 | 0 | no | 18 → 8 | FALLA → **FALLA** (el `main` de la web antigua empieza a 1.500 px: es un fallo de la pantalla heredada, ya existía) |
| `/competiciones` | 1440×900 | 1382 → 1405 | 0 → 0 | 0 | no | 4 → 4 | OK → **OK** |
| `/equipos` | 390×844 | 1092 → 1112 | 0 → 0 | 0 | no | 68 → 62 | OK → **OK** |
| `/equipos` | 1440×900 | 1092 → 1112 | 0 → 0 | 0 | no | 75 → 79 | OK → **OK** |
| `/jugadores` | 390×844 | 101 → 120 | 0 → 0 | 0 | no | 7 → 3 | OK → **OK** |
| `/jugadores` | 1440×900 | 101 → 120 | 0 → 0 | 0 | no | 3 → 3 | OK → **OK** |
| `/partidos` | 390×844 | 1226 → 1245 | 0 → 0 | 0 | no | 102 → 97 | OK → **OK** |
| `/partidos` | 1440×900 | 1226 → 1245 | 0 → 0 | 0 | no | 156 → 157 | OK → **OK** |
| `/buscar` | 390×844 | 104 → 123 | 0 → 0 | 0 | no | 10 → 3 | OK → **OK** |
| `/buscar` | 1440×900 | 104 → 123 | 0 → 0 | 0 | no | 3 → 3 | OK → **OK** |
| `/federaciones` | 390×844 | 153 → 154 | 0 → 0 | 0 | no | 4 → 4 | OK → **OK** |
| `/federaciones` | 1440×900 | 153 → 154 | 0 → 0 | 0 | no | 4 → 4 | OK → **OK** |
| `/canonico` | 390×844 | 3348 → 3349 | 0 → 0 | 0 | no | 8 → 8 | OK → **OK** |
| `/canonico` | 1440×900 | 3348 → 3349 | 0 → 0 | 0 | no | 19 → 202 | OK → **OK** |

- **Incumplen: 1 de 14 antes y 1 de 14 después** (la misma: `/competiciones` a 390, por el arranque de
  la web antigua, no por esta tanda). **0 textos cortados, 0 scroll horizontal y 0 controles tapados en
  las 14 mediciones.** No hay barras fijas (`barrasFijas = 0`).
- El único pico al alza, `/canonico` a 1440 (19 → 202 objetivos «pequeños»), es un **efecto de la
  limpieza de versalitas**: los enlaces de la lista de grupos, antes en mayúsculas, ocupaban dos líneas
  (32 px) y ahora caben en una (15 px). Son enlaces de texto de una pantalla de documentación interna;
  quedan como pendiente con su motivo (no son un control de la cabecera ni de las tres pantallas).
- La foto estática de la demo, medida aparte: **0 de 8 incumplen** (`medicion-despues.json`), con
  **0 controles tapados** y 4 objetivos pequeños en panel y listado (los de la cabecera que se miden en
  todas las páginas).

## 14 · Puertas de la segunda tanda

| Puerta | Comando | Resultado real |
|---|---|---|
| Pruebas | `npx vitest run --shard=1/4 … 4/4` | **0 fallos**: 482 + 254 (1 saltada) + 355 + 325 = **1.416 pruebas**, 91 ficheros |
| Lint | `pnpm lint` | `exit 0` |
| Tipos | `pnpm --filter @facylf/web exec tsc --noEmit` | `exit 0` |
| Build | `pnpm --filter @facylf/web build` | `exit 0` (webpack, 20 rutas; `postbuild` poda 27 entradas) |
| `ai-design-check` | ficheros de la entrega (ui, tres pantallas y las heredadas migradas) | **0 errores**, 116 avisos (botones/desplegables nativos heredados, espaciado y repetición) |
| Medidor | `node --test scripts/ui/medir-ui.test.mjs` | 7 pruebas, 0 fallos (incluye «control tapado») |
| Demo publicada | commit `d34f148` en `ErDeivih/fondo-popular-demo` | 200 en `/`, `/explorar/competiciones/`, `/explorar/calidad/`, `/explorar/competicion/2939/` y `/buscar/`; medida: **0 de 8 incumplen** |

## 15 · Pendientes de la segunda tanda (con motivo)

1. **`/competiciones` a 390 px**: el contenido útil de la web antigua empieza a ~1.500 px (debajo de la
   cabecera y un bloque de resumen). No es una regresión: ya fallaba antes y esta pantalla se retira con
   la web vieja (W9). Se migran sus estilos, no su estructura.
2. **Enlaces de texto de `/canonico`** (202 a 1440 px, 15 px de alto): son una lista de documentación
   interna; convertirlos en objetivos de 44 px multiplicaría la altura de la página. Queda propuesto
   como grupo de enlaces con `min-h-11` si esa pantalla se conserva.
3. **116 avisos de `ai-design-check`** en las pantallas heredadas: `Raw <button>`/`Raw <select>` (usan
   los elementos nativos con las clases del sistema) y bloques repetidos. No son errores y migrarlos
   exige reescribir esos componentes uno a uno; queda para la pasada de cada pantalla.
4. **La foto publicada (`d34f148`) no incluye los últimos 3 tamaños tipográficos** (9 → 11 px en acta,
   equipo, comparar y estadísticas): republicarla exige otra pasada de render de ~6 min. La app sí los
   tiene; la medición de la foto es anterior a ese ajuste cosmético.

---

# Revisión externa (Codex) — pantalla de calidad a 390 px (13/11/2026)

**Alcance:** los cinco puntos de la revisión sobre `/explorar/calidad`, **sin cambiar los datos ni la
lógica de coherencia**: mismas reglas (PJ=V+E+D, Puntos=3V+E, ΣGF=ΣGC), mismos contadores y mismas
métricas. Sólo cambia cómo se presentan y cómo se busca en ellas.

## 16 · Before | After | Why (revisión del panel)

| Before | After | Why |
|---|---|---|
| Una sola tabla de 6 columnas y 30 filas por página incluso a 390 px: nombre y cifras apretadas, indicadores sin jerarquía | En móvil cada grupo es un bloque `<details>`: **nombre legible** (15 px, negrita), **métrica principal** (¿cuadra? + % de actas con su barra) y el resto (3 reglas, PJ, puntos, goles, enlace a la ficha) al desplegar | Punto 2: fila adaptada al móvil; se lee de un vistazo y el detalle está a un toque, sin desplazar la tabla |
| Buscador sólo por nombre de grupo/competición; buscar «Ribert» no encontraba «Primera - Salamanca» | Buscador por **equipo, grupo o competición**: nombres de equipo leídos aparte (`EQUIPOS_DE_LA_TEMPORADA`, acotada a 400 grupos y sólo si hay texto) y casados con el filtro | Punto 1: el equipo es la forma natural de buscar un grupo en fútbol base |
| Orden fijo por nombre; no se veía qué criterio manda | **Ordenación explícita** (`orden=nombre\|incidencias\|actas`) con desplegable «Ordenar por» y texto «Ordenado por: …»; `aria-sort` en la columna correspondiente de la tabla | Punto 3: el usuario decide qué ver primero (incidencias o menos actas) y lo sabe |
| Sin explicación de qué significa «calidad» | `<details>` «Qué significa “calidad” aquí», enganchado a la tabla con `aria-describedby`: las tres reglas, qué implica «cuadra» y qué implica «no cuadra» | Punto 3: explicación accesible sin texto de relleno ni jerga |
| Contador sólo al pie de la tabla | Contador visible sobre la lista, con `aria-live`: «Mostrando 1–30 de 249 grupos · página 1 de 9», y **siempre** paginación con Anterior/Siguiente de 44 px | Punto 1: no se recorren cientos de filas y se sabe cuántas quedan |
| Cabecera fija y primera columna fija sólo en la tabla (ya existían) | Se conservan en escritorio; el contenedor sigue siendo el que se desplaza (el documento no) | Punto 3 y 6: se mantiene la estructura comparable de la tabla |
| Tipografía pequeña y apretada en la tabla | Nombre a 15 px en negrita con el grupo debajo en 12 px; la cifra principal en 16 px; celdas con más aire (`py-3`); insignias con texto («Cuadra»/«No cuadra») | Punto 4: peso distinto para nombre, métrica y fila; nada de 9–11 px en datos principales |

**Punto 5 (comparar 2–3 grupos) — propuesto, NO implementado**, como pedía la revisión:
1. **Selección**: casilla por fila/bloque («Comparar») con `2–3` máximo; sin JS no se puede sostener la
   selección, así que la selección viajaría en la URL (`?comparar=44,2939,3947`) con un botón
   «Comparar seleccionados»; el formulario sería GET, igual que el resto del panel.
2. **Vista compacta**: una fila por grupo y una columna por regla/cobertura, con la **diferencia**
   marcada (no sólo el valor): p. ej. «PJ −3», «actas −18 %» respecto a la mediana o al primero de los
   seleccionados; sin semáforo de color: la diferencia va con signo y texto.
3. **Datos**: no hace falta consulta nueva: con las filas de `CALIDAD_GLOBAL` bastan; el trabajo es de
   presentación (una tabla transpuesta de 2–3 columnas) y de estado en la URL.
4. **Coste**: ~1 sesión de implementación + pruebas de la tabla transpuesta; **no** se ha hecho en esta
   tanda para poder revisar el diseño antes (instrucción de la revisión).

## 17 · Medición (390×844 y 1440×900)

`medicion-calidad-antes.json` (panel anterior) y `medicion-calidad-despues.json` (código final), misma
base de datos y misma ruta `/explorar/calidad`.

| Tamaño | Nodos DOM | Textos cortados | Controles tapados | ¿Scroll horizontal? | Objetivos < umbral | Veredicto |
|---|---|---|---|---|---|---|
| 390×844 | 637 → **1.519** | 0 → **0** | 0 → **0** | no → **no** | 4 → 4 | OK → **OK** |
| 1440×900 | 637 → **1.522** | 0 → **0** | 0 → **0** | no → **no** | 4 → 4 | OK → **OK** |

El DOM sube porque el panel sirve **dos presentaciones** de las mismas 30 filas (tarjetas en móvil y
tabla en escritorio): 1.519 nodos siguen por debajo de los 2.087 del panel sin paginar de la primera
tanda. Criterios de aceptación: 0 textos cortados, 0 scroll horizontal y **0 controles tapados**.

La demo estática regenerada y medida aparte: **0 de 8 incumplen** (`medicion-despues.json`), con
`/explorar/calidad` a 0 cortados, 0 scroll horizontal y 0 tapados.

## 18 · Puertas de la revisión

| Puerta | Comando | Resultado real |
|---|---|---|
| Pruebas | `npx vitest run --shard=1/4 … 4/4` | **0 fallos**: 482 + 254 (1 saltada) + 355 + 328 = **1.419 pruebas**, 92 ficheros (incluye `calidad-panel.test.ts`, 3 pruebas nuevas) |
| Lint / tipos | `pnpm lint`, `tsc --noEmit` web | `exit 0` / `exit 0` |
| Build | `pnpm --filter @facylf/web build` | `exit 0` |
| `ai-design-check` | `src/app/explorar/calidad`, `src/componentes/calidad`, `src/consultas/calidad.ts` | **0 errores**, 1 aviso |
| `unslop` (método) | auditoría → dirección → pasadas | Aplicado: tabla Before/After/Why §16; sin versalitas con tracking, sin texto de relleno, sin animación decorativa |
| Demo publicada | commit `6fe1d66` en `ErDeivih/fondo-popular-demo` | `/`, `/explorar/calidad/` (y `?q=ribert`), `/explorar/competiciones/` → **200**; contiene el buscador, el contador y las 30 tarjetas móviles |

**Sin tocar la ingesta**: 0 cambios en `packages/ingesta`, `packages/canonico` e `infra/migraciones`.
