# Observatorio local de fútbol

> **Fondo Popular tiene dos caras, y conviene no confundirlas.** La **demo pública**
> <https://erdeivih.github.io/fondo-popular-demo/> es una foto estática de la web con **solo la temporada
> 2026-27**: no tiene API ni base de datos, las páginas son ficheros del propio sitio y sirve para que cualquiera
> vea el producto sin abrir nada. La **app completa** corre en local (`http://127.0.0.1:3001`) y en el servidor
> propio: es la que tiene todas las temporadas del canónico, búsqueda, filtros, actas, historial y panel. Detalle
> en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

Plataforma privada para consultar calendarios, clasificaciones, actas, equipos y jugadores de
varias federaciones territoriales. El objetivo principal es preparar rivales y estudiar posibles
incorporaciones, con prioridad para Salamanca y para las competiciones regionales o nacionales
relevantes.

La arquitectura y las reglas de identidad están explicadas en
[`PLATAFORMA.md`](PLATAFORMA.md); el funcionamiento del recolector, en
[`RECOLECCION-LOCAL.md`](RECOLECCION-LOCAL.md), y el estado de las nuevas fuentes, en
[`HALLAZGOS-FEDERACIONES.md`](HALLAZGOS-FEDERACIONES.md).

La especificación vigente para construir la web profesional —modelo canónico, UX, búsqueda,
rendimiento, seguridad y plan por fases— comienza en
[`docs/plataforma-web/ARQUITECTURA.md`](docs/plataforma-web/ARQUITECTURA.md). La skill
`.claude/skills/plataforma-web-futbol` obliga a los agentes a consultar esas decisiones antes de
trabajar en la plataforma.

## Estado actual

- Dieciocho fuentes con cola de datos: catorce PNFG y los adaptadores de Madrid, Comunidad
  Valenciana, Baleares y Cataluña. El inventario de las 19 territoriales está en
  `config/federaciones-espana.json`. Melilla conserva un sondeo programado mientras su portal de
  calendarios, clasificaciones y actas no devuelve contenido utilizable.
- Una cola y una base SQLite separadas por federación. Sus códigos nunca se mezclan.
- Reanudación automática: los trabajos terminados no vuelven a pedirse y los pendientes continúan
  después de apagar o reiniciar el equipo.
- Descubrimiento progresivo de temporadas, competiciones, grupos, jornadas y actas.
- Actas originales conservadas y parser versionado: se pueden corregir y reprocesar localmente sin
  descargar otra vez la fuente.
- Web local con filtros por federación, temporada, categoría, ámbito, provincia/zona, modalidad y
  género. Sólo publica una competición cuando todos sus grupos, calendarios, clasificaciones,
  jornadas y actas descubiertas están procesados; entonces aparece automáticamente y sin caché.
- Fichas de competición, jornada, partido, acta, equipo, club, jugador, técnicos, árbitros y campos.
- Clasificación oficial cuando está disponible y reconstrucción por resultados como contraste.
- Gráficas de evolución y métricas iniciales de equipo y jugador, mostrando siempre la cobertura
  real de los datos.

El proyecto no utiliza Supabase en esta etapa. La web lee directamente las bases locales en modo
de sólo lectura mientras los recolectores siguen trabajando.

## Uso habitual

Instalar las dependencias una sola vez:

```powershell
pnpm install
```

Abrir la web:

```powershell
pnpm dev
```

Después visita [http://localhost:3000](http://localhost:3000). El acceso conjunto a las fuentes
está en [http://localhost:3000/federaciones](http://localhost:3000/federaciones).

Consultar el avance de todos los recolectores:

```powershell
pnpm workers:estado
```

Auditar integridad y coherencia de las actas guardadas, sin realizar peticiones:

```powershell
pnpm workers:auditar
```

Comprobar el código y los parsers:

```powershell
pnpm test
pnpm build
```

## Tareas automáticas

Cada federación tiene su propia tarea programada de Windows. Al iniciar sesión, sólo recupera los
trabajos pendientes de su base; no repite los que ya constan como terminados.

Ver las tareas:

```powershell
Get-ScheduledTask -TaskName "FACyLF recolector*"
```

Registrar o actualizar de una vez las catorce tareas federativas, incluida Castilla y León:

```powershell
powershell -ExecutionPolicy Bypass -File "F:\EspacioCodigo\facylf\scripts\registrar-tarea-federaciones.ps1"
```

Los perfiles y destinos están en `perfiles/` y `recolector.*.config.json`. Cada worker conserva su
propio perfil de Chrome, registro, exclusión mutua y carpeta `descargas-*`.

Madrid y Comunidad Valenciana ya tienen verificada la primera capa de su adaptador propio. Sus
descubridores reanudables obtienen temporadas, modalidades, competiciones y grupos y actualizan la
temporada vigente:

```powershell
pnpm sondeo:madrid
pnpm sondeo:valencia
```

Los resultados se guardan en `descargas-federacion-sondeo/*-isquad-sondeo.json`. Estos comandos
inventarían la estructura; todavía no publican esas federaciones en la web hasta que el adaptador
de jornadas y actas complete una competición de extremo a extremo.

Para que ambos catálogos continúen al iniciar Windows y revisen a diario la temporada vigente:

```powershell
powershell -ExecutionPolicy Bypass -File "F:\EspacioCodigo\facylf\scripts\registrar-tareas-catalogos-personalizados.ps1"
```

## Modelo de datos

La identidad completa sigue esta jerarquía:

`federación → temporada → competición → grupo → jornada → partido/acta`

Un equipo pertenece al contexto exacto de temporada, competición y grupo; las plantillas de dos
categorías de un mismo club no se unen. El jugador se identifica primero por
`federación + código federativo`. Las coincidencias por nombre entre temporadas sólo generan
candidatos para revisión, reforzados por territorio, club y equipo, nunca fusiones automáticas.

Las participaciones distinguen convocatoria de partido jugado. Goles, tarjetas, cambios y minutos
sin marca temporal se guardan sin inventar datos. Las actas se clasifican como `correcta`,
`administrativa` o `revisar`, y conservan la incidencia que motivó esa valoración.

## Estructura

```text
apps/web/             interfaz Next.js local
packages/dominio/     reglas, estadísticas e identidad
packages/ingesta/     recolector, parsers y validación
scripts/              worker, supervisión y tareas programadas
perfiles/             configuración propia de cada federación
descargas-*/          HTML, cola SQLite, registros y datos derivados
```

## Privacidad

La aplicación se mantiene en local. Algunas actas contienen datos personales y datos de menores;
por ello, la base completa y esas vistas no deben publicarse sin una revisión específica de
privacidad, legitimación y minimización. Ninguna estadística rellena información que la fuente no
publique.
