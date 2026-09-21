# Otras federaciones — hallazgos

Las federaciones PNFG añadidas usan **la misma plataforma de gestión federativa
que Castilla y León** (prefijo `/pnfg/`, endpoints `NFG_*` para resultados, `NBdd_*` para
documentos, `NPortada` como portada). Eso significa que **los parsers ya existentes son
reutilizables tal cual**; solo cambian la URL base, el `cod_primaria` (módulo), el directorio
de datos y el ritmo. No hace falta re-inventar el descubrimiento ni el parseo por federación.

## Federaciones

### Extremadura — https://www.fexfutbol.com
- Módulo/a de resultados confirmado por ejemplo público:
  [ficha de partido](http://www.fexfutbol.com/pnfg/NFG_CmpPartido?cod_primaria=1000120&CodActa=529202)
  → endpoint de acta **idéntico** al de CyL (`NFG_CmpPartido?cod_primaria=1000120&CodActa=…`).
- Portada: [NPortada](https://fexfutbol.com/pnfg/NPortada).
- Documentos: `NBdd_DesDocumento` con `cod_primaria=3000209` / `3000196`.
- **Ruta del acta observada: `/pnfg/NFG_CmpPartido`** (sin el segmento `/NPcd/` que sí lleva CyL).
  El sondeo lo confirmará (prueba ambas variantes).

### Galicia — https://www.futgal.es
- Documentos/circulares: [ejemplo](http://futgal.es/pnfg/NBdd_DesDocumento?cod_primaria=5000299&cod_documento=22576&descargar=1)
  y [circular](https://www.futgal.es/pnfg/NBdd_DesDocumento?cod_primaria=5000299&cod_documento=29840&descargar=0).
- `cod_primaria` visto: `5000299`, `3000209`. Se confirma con el sondeo cuál es el de resultados.

### La Rioja — https://www.frfutbol.com
- Documentos: [ejemplo](https://www.frfutbol.com/pnfg/NBdd_DesDocumento?cod_primaria=5000225&cod_documento=1010478&descargar=0).
- `cod_primaria` visto: `5000225`. Se confirma con el sondeo.

## Conclusiones del primer sondeo

Las tres federaciones usan **el mismo módulo de resultados que CyL**:

| federación | URL del módulo | cod_primaria | temporadas detectadas |
|---|---|---|---|
| Extremadura | `/pnfg/NPcd/NFG_CmpJornada` | **1000120** | 16 (con datos hasta ~2016/17) |
| Galicia | `/pnfg/NPcd/NFG_CmpJornada` | **1000120** | 14 (con datos hasta ~2014/15) |
| La Rioja | `/pnfg/NPcd/NFG_CmpJornada` | **1000120** | 19 (con datos hasta 2008/09) |

→ **Misma ruta y el mismo `cod_primaria` que CyL.** Toda la lógica y los parsers se reutilizan tal cual;
solo cambia el dominio, el directorio y el ritmo.

### `robots.txt` — importante
Los tres devuelven lo mismo: `User-agent: *` → **`Disallow: /`** (prohíben a los bots genéricos todo
el sitio), permitiendo solo a Googlebot/Twitterbot/Mediapartners (y AmazonAdBot en Galicia).
Nuestro `FacylfBot` cae en `User-agent: *`, así que **los tres sitios piden explícitamente no ser
rastreados por bots genéricos**. Verificado en los JSON de `descargas-federacion-sondeo/*sondeo.json`.

## Política de acceso (`robots.txt`)

El sondeo guardado confirmó la misma regla `Disallow: /` para el agente genérico en los seis
dominios. Las capturas quedan en `descargas-federacion-sondeo/*-sondeo.json` para conservar la
evidencia de cada consulta.

Regla que seguimos (igual que con CyL): cliente **identificado** (User-Agent con contacto),
**ritmo espaciado**, sin falsificar navegador, sin rotar proxies. **Si el robots.txt restringe
ciertas rutas o fija un ritmo, nos adaptamos a ello.** Si no hay restricción, podemos pedir más
masivamente, pero siempre con respeto y un único origen identificado.

## El sondeo (descubrimiento inicial)
`scripts/sondeo-federacion.mjs` es un descubridor por federación que:
1. Lee el `robots.txt` (informativo).
2. Prueba varias rutas/`cod_primaria` hasta dar con el módulo que tenga selector de temporada.
3. Cambia el desplegable de temporada y vuelca las competiciones de cada una.
4. Guarda un JSON con URL/`cod_primaria`/temporadas/competiciones, sin tocar la base de CyL.

Comandos:
```powershell
pnpm sondeo:extremadura
pnpm sondeo:galicia
pnpm sondeo:rioja
```

Cada uno escribe en `descargas-federacion-sondeo/<fed>-sondeo.json`.

## Arquitectura propuesta (tras el sondeo)
- **Un motor, varias federaciones.** Parametrizar el recolector por perfil: URL base,
  `cod_primaria`, directorio de datos, config y ritmo. CyL queda como un perfil (el que ya corre).
- **Reutilizar toda la lógica** (Selenium ventana real, cadena temporada→competición→grupo→jornada→
  calendario→acta) y **todos los parsers** (`parseaActa`, `parseaJornada`, `parseaCalendario`,
  `parseaGrupos`, `parseaCompeticiones`).
- **14 workers independientes** contando Castilla y León, uno por federación y cada uno en su propia carpeta
  `descargas-<fed>/` y su `recolector.<fed>.config.json`, sin compartir directorios.

## Federaciones añadidas (2026-09-10)
Se añaden las mismas que ya funcionan para Extremadura, Galicia y La Rioja (se asume la misma
plataforma `/pnfg/`; se confirma con el sondeo):

| federación | base | perfil | config |
|---|---|---|---|
| Asturias | `https://www.asturfutbol.es/pnfg/NPcd` | `perfiles/asturias.json` | `recolector.asturias.config.json` |
| Aragón | `https://www.futbolaragon.com/pnfg/NPcd` | `perfiles/aragon.json` | `recolector.aragon.config.json` |
| Cantabria | `https://www.rfcf.es/pnfg/NPcd` | `perfiles/cantabria.json` | `recolector.cantabria.config.json` |

### Pasos de puesta en marcha (una sola vez por federación)
1. **Sondeo** (descubre temporadas/competiciones): `pnpm sondeo:asturias` (ídem `aragon`, `cantabria`).
2. **Todo en uno** (sondeo + catálogo + ingesta): `pnpm recolector:asturias:todo`.
3. La **tarea programada** `FACyLF recolector asturias` reanuda la ingesta a diario (igual que las demás).

> El catálogo (`competiciones-por-temporada.json`) lo genera el paso 1/2; sin él, la tarea de
> ingesta no tiene cola que reanudar y marca error hasta que se ejecute el sondeo. Por eso el
> sondeo hay que lanzarlo una vez con red.

## Segunda ampliación verificada (2026-09-10)

Los siete portales siguientes exponen el mismo selector y la misma ruta de resultados
`/pnfg/NPcd/NFG_CmpJornada`, con `cod_primaria=1000120`. Los catálogos quedaron guardados y
convertidos en colas independientes:

| federación | temporadas con datos expuestas | competiciones expuestas | temporadas en cola desde 2014 |
|---|---:|---:|---:|
| Navarra | 15 | 743 | 13 |
| Euskadi | 20 | 707 | 13 |
| Castilla-La Mancha | 20 | 1.652 | 13 |
| Andalucía | 14 | 9.269 | 13 |
| Murcia | 12 | 1.344 | 12 |
| Canarias | 6 | 47 | 6 |
| Ceuta | 9 | 210 | 9 |

El número de competiciones es el catálogo bruto publicado: una misma denominación puede aparecer
en varias fases o modalidades y cada código se mantiene por separado. La vigilancia del catálogo
permite añadir automáticamente códigos que aparezcan más adelante.

El portal proporcionado como RFMF corresponde a la Federación Melillense y usa una aplicación
Novanet diferente. No se le ha asignado un perfil PNFG ficticio. `pnpm sondeo:melilla` registra
las páginas y documentos públicos que enlaza su web y guarda el resultado en
`descargas-federacion-sondeo/melilla-sondeo.json`; no crea competiciones ni actas que la web no
exponga. La información actual más rica parece estar en su aplicación móvil oficial, por lo que
su calendario moderno necesita un adaptador independiente y una fuente pública verificable.

## Cobertura territorial completa

La relación vigente de la RFEF contiene 19 federaciones autonómicas. Las catorce PNFG anteriores
están conectadas. No falta ninguna por identificar: las cinco pendientes son Madrid, Comunidad
Valenciana, Baleares, Cataluña y Melilla. Las cinco se mantienen fuera del motor PNFG para no
interpretar HTML incompatible como datos válidos.

| federación | portal de partida | integración prevista |
|---|---|---|
| Madrid | `https://www.rffm.es/` | adaptador RFFM independiente |
| Comunidad Valenciana | `https://ffcv.es/wp/` | adaptador FFCV/Novanet independiente |
| Baleares | `https://www.ffib.es/Fed/` | adaptador FFIB con sesión y navegación propias |
| Cataluña | `https://www.fcf.cat/ca` | adaptador FCF independiente |
| Melilla | `https://www.rfmf.es/pagina/index.php` | adaptador RFMF independiente |

El contrato de salida será el mismo para todos: temporada, competición, grupo/fase, jornada,
partido, acta y entidades normalizadas. Así la web no necesitará lógica especial por federación;
sólo cambia la capa que descubre y transforma cada portal.

## Portales personalizados: estructura comprobada

### Madrid (RFFM)

El portal usa un frontend propio pero expone catálogos JSON públicos y estables. Se comprobaron
las rutas `/api/seasons`, `/api/game-types`, `/api/competitions?temporada=…&tipojuego=…` y
`/api/groups?competicion=…`. También existen rutas separadas para jornadas/resultados,
calendario y clasificación. La temporada 2026-27, por ejemplo, devuelve cinco modalidades; en
Fútbol-11 aparecen 59 competiciones y `TERCERA FEDERACIÓN RFEF` usa competición `26738226`,
grupo `26738227`, 34 jornadas y 18 equipos.

El `robots.txt` permite los catálogos y las páginas de competición, pero excluye expresamente
las rutas de ficha de equipo, ficha de jugador y acta. El adaptador activo se limita a lo permitido:
temporadas, competiciones, grupos, jornadas, resultados, calendarios y clasificaciones. Conserva
el código de acta publicado junto al partido, sin abrir esa ficha ni las fichas individuales.

La cadena permitida quedó comprobada de extremo a extremo con `/api/group-rounds`, `/api/results`,
`/api/calendar` y `/api/standings`. La cola local es reanudable, se inicia con Windows y comparte
el mismo esquema relacional que el resto. Una competición madrileña se publica en la web cuando
ha terminado todo ese conjunto de datos disponible, sin exigir una tabla de actas que esta fuente
no se consulta.

### Comunidad Valenciana (FFCV)

La aplicación pública `https://ffcv.es/competiciones/` ofrece JSON para temporadas,
competiciones, grupos y jornadas bajo `/competiciones/api/`. Se verificaron 15 temporadas, desde
2012-13 hasta 2026-27. Para la temporada actual, `Tercera Federación` usa competición
`905431604`, grupo `905431605`, 34 jornadas y 18 equipos. También hay respuestas independientes
para resultados y clasificaciones. El adaptador ya transforma también
`api/partidos/ficha_partido_ajax.php` al contrato común: alineaciones, cuerpo técnico, árbitros,
goles (normal, penalti y propia puerta), tarjetas, cambios y minutos. Se guarda el JSON original
sin fotografías incrustadas y, por separado, las tablas normalizadas que consume la web.

### Descubridor reanudable

`scripts/sondeo-isquad.mjs` cubre Madrid y Valencia. Guarda un punto de control tras cada catálogo
y cada competición. Las temporadas históricas ya completas no se consultan otra vez; la temporada
vigente actualiza su listado de competiciones en cada ejecución y vuelve a comprobar sus grupos
como máximo una vez al día. Así descubre automáticamente competiciones o grupos publicados más
tarde.

Prueba acotada, útil para verificar una sola competición:

```powershell
node scripts/sondeo-isquad.mjs --federacion madrid --desde 2026 --max-temporadas 1 --max-competiciones 1
node scripts/sondeo-isquad.mjs --federacion valencia --desde 2026 --max-temporadas 1 --max-competiciones 1
```

Ejecución completa desde 2015: `pnpm sondeo:madrid` y `pnpm sondeo:valencia`.

### Cataluña, Baleares y Melilla

- Cataluña expone páginas públicas de competición y enlaces con identificadores de temporada,
  disciplina, competición y grupo. Su `robots.txt` permite esas páginas pero excluye `/api/` y
  `/_next/`; el adaptador debe descubrir únicamente desde HTML público permitido.
- Baleares declara `Disallow: /` para el agente genérico. El proyecto conserva la federación en el
  inventario, pero no inicia descubrimiento automatizado bajo esa regla.
- Melilla mantiene el sondeo documental existente. La web histórica observada no ha ofrecido aún
  un catálogo moderno fiable de temporadas, competiciones y grupos, por lo que no se generan
  identificadores supuestos.
