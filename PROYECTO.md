# Fútbol Salamanca — plan de proyecto

> **Documento histórico.** Conserva decisiones e investigación iniciales, pero ya no describe el
> estado multifederación ni la arquitectura web vigente. Para desarrollar la plataforma consulta
> [`docs/plataforma-web/ARQUITECTURA.md`](docs/plataforma-web/ARQUITECTURA.md) y la skill
> `.claude/skills/plataforma-web-futbol`. En caso de conflicto, prevalece esa especificación.

Documento de trabajo para continuar en local con Claude Code.
Estado actual: prototipo de una sola liga en un HTML (`temporada-pizarrales.html`).
Objetivo: web pública con todas las competiciones de la delegación de Salamanca,
resultados en vivo aportados por la gente y estadísticas.

---

## 0. Lo primero: sí hay bloqueo, y es explícito

**Decisión (actualizada).** Este proyecto es **personal, sin ánimo de lucro y de
aprendizaje**; no se publica ni se vende la base de datos. Con ese marco, el acceso a la
federación se hace con un cliente HTTP **identificado** (User-Agent real con URL de
explicación y correo) y **ritmo espaciado y respetuoso**, nunca con una ráfaga. No se
falsifica el navegador ni se suplanta a Googlebot, no se rotan proxies, no se resuelven
captchas. Si un día el proyecto se hace público o comercial, **hay que pedir permiso** a
la delegación y respetar su respuesta (ver `CORREO-DELEGACION.md`).

Aun así, conviene conocer los hechos, porque definen la arquitectura del cliente:

**Corrección importante.** La primera versión de este documento decía que el error
`ROBOTS_DISALLOWED` venía de una herramienta mía y no de la federación, y que un
cliente normal entraría sin problema. Eso era una suposición, y era falsa. Este es el
`robots.txt` real de `www.rfcylf.es`, leído el 19/08/2026:

```
User-agent: Twitterbot
Disallow:

User-agent: Googlebot
Allow: /

User-agent: Mediapartners-Google
Disallow:

User-agent: *
Disallow: /
```

Léelo despacio, porque decide la arquitectura del proyecto entero:

- **`User-agent: * → Disallow: /`**. Todo el sitio, cerrado a cualquier automatismo.
- Las tres únicas excepciones son **Googlebot**, **Twitterbot** y **Mediapartners-Google**
  (el bot de AdSense). Es decir: la federación quiere salir en Google y que sus enlaces
  se vean bonitos en redes. Nada más.
- No hay una regla más permisiva para los `.xls` ni para ninguna otra ruta.

### Qué significa para nosotros

1. **No hay ningún scraper conforme.** Ni siquiera el "cliente educado" del §3. Da igual
   que se identifique honestamente, que vaya a 30 peticiones por minuto y que respete
   los ETag: `Disallow: /` aplica a `FacylfBot` exactamente igual que a cualquier otro.
   Un cliente educado que ignora `robots.txt` no es educado, es sólo lento.

2. **Un servicio externo tampoco lo arregla.** Octoparse, Apify, Browserless o quien sea
   hacen la misma petición prohibida desde otra IP. Cambia quién la hace, no qué es.

3. **Ponerse el `User-Agent` de Googlebot está descartado**, y no por remilgos: es
   suplantar a un tercero identificable para saltarse una regla escrita. Es lo peor de
   las dos opciones anteriores a la vez.

4. **Lo que sí es legítimo: que una persona se descargue el fichero.** `robots.txt`
   regula rastreadores, no personas. Tú entrando en la web y pulsando "Calendario Excel"
   no infringe nada. Y nuestro parser ya lee ese fichero perfectamente.

### La consecuencia de verdad

El proyecto deja de ser un "scraper masivo" y pasa a ser **"ingesta espaciada y respetuosa
+ aportaciones de la gente"**. El dato de cada competición entra por dos vías que se
complementan:

| Dato | Cómo entra |
|---|---|
| Calendario del grupo | `.xls` bajado con el cliente identificado y espaciado, o a mano como respaldo. |
| Resultados en vivo | De la gente en el campo. Es la parte diferencial del producto y no necesita scraping. |
| Resultado oficial | Se contrasta con el calendario/clasificación publicados; la confirmación le da el **delegado del club**. |

La clave para que esto escale a las 40–80 competiciones de la provincia (o de Castilla y
León entera) sin cargar su servidor es la **cadencia por competición** de `frecuencia.ts`:
nunca una ráfaga, ETag para no repetir contenido, y parada ante `429` o fallos.

### Si el proyecto se hace público o comercial

El acceso espaciado y honesto es defendible para un uso **personal**, pero la reputación
del §6 y la cobertura completa dependen de contrastar con el dato oficial, y una base de
datos completa puede estar protegida por el derecho *sui generis*. Si algún día se publica
o se monetiza, **hay que pedir permiso** a la delegación: que no hagan nada, sólo que
autoricen leer sus `.xls` a un ritmo pactado, o que faciliten un volcado. Está redactado
en `CORREO-DELEGACION.md` y es la mejor inversión del proyecto.

---

## 1. Qué es el producto

**Para el aficionado del fútbol base de Salamanca**: saber cómo va su equipo sin pelearse
con la web de la federación, que sólo publica la clasificación cuando el acta está
cerrada (a veces el martes).

**La propuesta**: resultado en vivo el mismo domingo, puesto por la gente que está en el
campo, contrastado entre varios, y sustituido por el dato oficial en cuanto la
federación lo publica.

Tres tipos de usuario:
- **Mirón** (95%): entra, mira el resultado y la clasificación, se va. No se registra.
- **Reportero**: está en el campo, manda el resultado y los goles. Se registra.
- **Delegado / club**: gestiona los equipos de su club, corrige datos, modera.

---

## 2. Arquitectura

Ya tienes Supabase y Vercel conectados, así que el stack natural es:

```
┌──────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router) en Vercel                       │
│  · páginas públicas con ISR (rápidas, cacheadas)         │
│  · suscripción Realtime para el marcador en vivo         │
│  · Recharts para las gráficas                            │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
             ▼                             ▼
┌────────────────────────┐    ┌──────────────────────────┐
│  Supabase              │    │  Worker de ingesta       │
│  · Postgres            │◄───┤  GitHub Actions (cron)   │
│  · Realtime (websocket)│    │  · descarga los .xls     │
│  · Auth (magic link)   │    │  · parsea y hace upsert  │
│  · RLS                 │    │  · escribe scrape_log    │
│  · Storage (escudos)   │    └──────────────────────────┘
└────────────────────────┘
```

**Por qué el worker fuera de Vercel**: las funciones serverless tienen límite de
tiempo y son mal sitio para un proceso que recorre 60 competiciones. Un job de GitHub
Actions cada N minutos es gratis, tiene logs, y si falla te avisa por correo. Alternativa
equivalente: un contenedor pequeño en Fly.io o un Raspberry Pi en tu casa.

**Por qué no leer de la federación desde el navegador del usuario**: cada visita sería
una petición a su servidor. Con 500 visitas un domingo les montas un pequeño ataque sin
querer. Todo pasa por tu base de datos.

---

## 3. Ingesta de datos

### 3.1 Los endpoints

Partiendo de tu URL:

```
https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada
  ?cod_primaria=1000120
  &CodCompeticion=24218963   ← la competición
  &CodGrupo=24218968         ← el grupo dentro de la competición
  &CodTemporada=22           ← 2026/27
  &CodJornada=1
  &Sch_Codigo_Delegacion=1   ← Ávila=?, Salamanca=?  (hay que mapearlo)
```

Los ficheros que me diste vienen de los botones de descarga de esa misma página. **Primera
tarea del proyecto**: abrir la página con el inspector de red del navegador, pulsar los
dos botones de Excel y **anotar las URLs exactas que se piden**. Con eso tienes la API de
facto. Yo no las tengo, y no me las voy a inventar.

De cada grupo salen tres cosas:
- **Calendario** → todos los emparejamientos con jornada y fecha (ya sé parsearlo).
- **Clasificación** → puntos, PJ, G/E/P, GF/GC (ya sé parsearlo, mismo formato).
- **Jornada** → resultados de la jornada en curso. Es la que hay que mirar cada pocos
  minutos el fin de semana.

### 3.2 Catálogo de competiciones

Para cubrir toda Salamanca hacen falta los `CodCompeticion` + `CodGrupo` de cada
categoría: 1ª/2ª/3ª Provincial Aficionados, Juveniles, Cadetes, Infantiles, Alevines,
Benjamines, Prebenjamines, femenino, fútbol sala, copas. Son del orden de 40–80 grupos.

Se descubren recorriendo los desplegables de la página de competiciones. Se guardan en
tabla, no en código, para poder añadir provincias sin tocar nada. Cada temporada cambian
los códigos: hay que dejar un comando `pnpm descubrir-competiciones` que rehaga el
catálogo.

### 3.3 Cliente educado

```ts
// packages/ingesta/src/cliente.ts
const UA = 'FacylfBot/1.0 (+https://tudominio.es/bot; contacto@tudominio.es)';

// una petición cada 2 s como mucho, y nunca dos a la vez
const cola = new Semaforo(1);
const limite = new RateLimit({ porMinuto: 30 });

export async function pedir(url: string, etagPrevio?: string) {
  await cola.adquirir();
  await limite.esperar();
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      ...(etagPrevio ? { 'If-None-Match': etagPrevio } : {}),
    },
  });
  if (r.status === 304) return { sinCambios: true };          // no ha cambiado, 0 coste
  if (r.status === 429 || r.status >= 500) throw new ReintentarDespues(r);
  return { html: await r.text(), etag: r.headers.get('etag') };
}
```

Reglas que el worker debe respetar y que conviene dejar escritas en el repo:

- **User-Agent identificable** con una URL donde expliques qué hace el bot y un correo.
- **Máximo 30 peticiones/minuto**, una concurrente. No hay prisa.
- **ETag / If-Modified-Since** siempre. La mayoría de ciclos devolverán 304.
- **Backoff exponencial** ante 429 o 5xx, y parada total tras 3 fallos seguidos.
- **Ventana horaria**: no golpear de madrugada ni entre semana sin motivo (§3.4).
- **Atribución visible**: "Datos oficiales: Federación de Fútbol de Castilla y León",
  con enlace a la ficha del partido en su web. Les mandas tráfico, no se lo quitas.

### 3.4 Frecuencia adaptativa

Los "cada 5 minutos" que pides sólo tienen sentido mientras se juega. El resto del tiempo
es ruido:

| Cuándo | Cada cuánto | Qué se mira |
|---|---|---|
| Sáb y dom, 09:00–21:30 | **5 min** | sólo los grupos con partidos hoy |
| Sáb y dom, resto | 1 h | jornada en curso |
| Lun 09:00–23:00 | 30 min | actas que aún se cierran |
| Mar–Vie | 6 h | clasificaciones y cambios de horario |
| Julio–Agosto | 1 vez al día | altas de competiciones nuevas |

Con esto pasas de ~17.000 peticiones diarias (si machacaras todo cada 5 min) a unas 900
en el pico del domingo. Es la diferencia entre un vecino y una molestia.

Además: si el hash del contenido no cambia, no se escribe en la base de datos. Así
Realtime sólo dispara cuando de verdad hay novedad.

### 3.5 Trabajo previo recomendado

Escribe un correo a la Delegación de Salamanca antes de lanzar: qué es, que es sin ánimo
de lucro, que citas la fuente y enlazas a su web, y qué frecuencia usas. En el peor caso
te dicen que no y te ahorras el disgusto. En el mejor te dan un contacto técnico y quizá
un volcado directo. Es un correo de diez líneas y es la mejor inversión del proyecto.

---

## 4. Modelo de datos

```sql
-- ---------- catálogo ----------
create table delegaciones (
  id            smallint primary key,          -- código de la federación
  nombre        text not null                  -- 'Salamanca'
);

create table temporadas (
  id            smallint primary key,          -- CodTemporada (22 = 2026/27)
  etiqueta      text not null,                 -- '2026/27'
  activa        boolean default false
);

create table competiciones (
  id            bigserial primary key,
  cod_comp      text not null,
  cod_grupo     text not null,
  temporada_id  smallint references temporadas,
  delegacion_id smallint references delegaciones,
  nombre        text not null,                 -- '1ª División Provincial de Juveniles'
  categoria     text not null,                 -- juvenil | cadete | infantil | ...
  genero        text not null default 'm',
  slug          text unique not null,
  activa        boolean default true,
  unique (cod_comp, cod_grupo, temporada_id)
);

-- ---------- entidades ----------
create table clubes (
  id       bigserial primary key,
  nombre   text not null,
  slug     text unique not null,
  escudo   text,                                -- Storage
  color1   text default '#CE2028',
  color2   text default '#16181C'
);

create table equipos (
  id        bigserial primary key,
  club_id   bigint references clubes,
  nombre    text not null,                      -- 'C.D. Munibar Pizarrales "B"'
  nombre_fed text not null,                     -- tal cual lo escribe la federación
  slug      text unique not null
);
create index on equipos using gin (to_tsvector('spanish', nombre_fed));

create table equipos_competicion (
  equipo_id      bigint references equipos,
  competicion_id bigint references competiciones,
  primary key (equipo_id, competicion_id)
);

-- ---------- partidos ----------
create table partidos (
  id             bigserial primary key,
  competicion_id bigint references competiciones not null,
  jornada        smallint not null,
  fecha          date,
  hora           time,
  campo          text,
  local_id       bigint references equipos not null,
  visitante_id   bigint references equipos not null,

  -- resultado oficial (viene de la federación)
  gl_oficial     smallint,
  gv_oficial     smallint,

  -- resultado en vivo (viene de la gente)
  gl_vivo        smallint,
  gv_vivo        smallint,
  confianza      smallint default 0,            -- 0..100, ver §6
  estado         text default 'programado',     -- programado|jugando|descanso|final|oficial
  minuto         smallint,

  actualizado    timestamptz default now(),
  unique (competicion_id, jornada, local_id, visitante_id)
);
create index on partidos (fecha, competicion_id);
create index on partidos (estado) where estado in ('jugando','descanso');

-- ---------- aportaciones de la gente ----------
create table usuarios (
  id          uuid primary key references auth.users,
  alias       text unique not null,
  club_id     bigint references clubes,          -- de qué club es
  reputacion  smallint default 0,                -- ver §6
  verificado  boolean default false,
  rol         text default 'usuario',            -- usuario|delegado|moderador|admin
  creado      timestamptz default now()
);

create table reportes (
  id         bigserial primary key,
  partido_id bigint references partidos not null,
  usuario_id uuid references usuarios not null,
  gl         smallint not null,
  gv         smallint not null,
  minuto     smallint,
  estado     text,
  creado     timestamptz default now(),
  descartado boolean default false
);
create index on reportes (partido_id, creado desc);

create table goles (
  id          bigserial primary key,
  partido_id  bigint references partidos not null,
  equipo_id   bigint references equipos not null,
  minuto      smallint,
  dorsal      smallint,                          -- ojo §9: dorsal, no nombre
  jugador     text,                              -- sólo si hay consentimiento
  tipo        text default 'gol',                -- gol|penalti|propia
  reportado_por uuid references usuarios,
  confirmado  boolean default false
);

create table mensajes (
  id         bigserial primary key,
  partido_id bigint references partidos not null,
  usuario_id uuid references usuarios not null,
  texto      text not null check (length(texto) between 1 and 500),
  creado     timestamptz default now(),
  oculto     boolean default false,
  motivo_oculto text
);
create index on mensajes (partido_id, creado desc);

-- ---------- operación ----------
create table scrape_log (
  id             bigserial primary key,
  competicion_id bigint references competiciones,
  url            text,
  etag           text,
  hash_contenido text,
  estado         smallint,                       -- 200, 304, 500...
  cambios        smallint default 0,
  ms             integer,
  error          text,
  creado         timestamptz default now()
);
```

**Clasificación**: no se guarda como tabla, se calcula. Vista materializada refrescada
cuando cambia un partido:

```sql
create materialized view clasificaciones as
with r as (
  select competicion_id, local_id as equipo_id, gl_oficial gf, gv_oficial gc from partidos
   where gl_oficial is not null
  union all
  select competicion_id, visitante_id, gv_oficial, gl_oficial from partidos
   where gl_oficial is not null
)
select competicion_id, equipo_id,
       count(*) pj,
       count(*) filter (where gf > gc) g,
       count(*) filter (where gf = gc) e,
       count(*) filter (where gf < gc) p,
       sum(gf) gf, sum(gc) gc, sum(gf) - sum(gc) dg,
       count(*) filter (where gf > gc) * 3 + count(*) filter (where gf = gc) pts
  from r group by 1, 2;

create unique index on clasificaciones (competicion_id, equipo_id);
```

El desempate por enfrentamiento directo va en la capa de aplicación, como en el
prototipo. En Postgres se vuelve ilegible.

---

## 5. Tiempo real en el cliente

Nada de `setInterval` pegándole a la API. Supabase Realtime empuja el cambio:

```ts
const canal = supabase
  .channel(`partido:${id}`)
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'partidos', filter: `id=eq.${id}` },
      ({ new: p }) => setPartido(p))
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `partido_id=eq.${id}` },
      ({ new: m }) => añadirMensaje(m))
  .subscribe();
```

El worker escribe en `partidos` cada 5 min → el UPDATE llega solo a todos los navegadores
abiertos. Un único polling contra la federación alimenta a todos los usuarios.

---

## 6. Resultados de la gente y confianza

El problema real: alguien pondrá 10-0 por la cara.

**Puntuación de confianza (0–100)** que se recalcula con cada reporte:

```
confianza = min(100,
    35 * (nº de usuarios distintos que coinciden en el mismo resultado)
  +  1 * (suma de reputación de esos usuarios, tope 30)
  + 15 si alguno es delegado de uno de los dos clubes
  - 25 si hay un reporte contradictorio reciente y sin resolver
)
```

Qué se muestra según el valor:

| Confianza | Etiqueta en pantalla |
|---|---|
| < 35 | "Sin confirmar — lo ha puesto una persona" |
| 35–69 | "Coincide entre varias personas" |
| ≥ 70 | "Confirmado por la grada" |
| oficial | "Resultado oficial" (y se descarta el vivo) |

**Reputación del usuario**: empieza en 0. +2 cuando su reporte coincide con el oficial que
llega después. −5 cuando se desvía. Debajo de −15, sus reportes dejan de sumar confianza
(sin decírselo: si le avisas, se hace otra cuenta). Con reputación ≥ 20 pasa a
`verificado` y su reporte solo ya llega a 35.

**Delegados**: un club puede reclamar sus equipos. Verificas por correo del club o a mano
al principio. El delegado tiene prioridad y puede corregir.

**Antiabuso barato y efectivo**: un reporte por usuario y partido (se edita, no se
duplica), no se puede reportar un partido cuya hora aún no ha llegado, y límite de 6
partidos reportados por persona y jornada — nadie está en seis campos a la vez.

---

## 7. Chat de partido

Es lo que más tráfico da y lo que más problemas trae. Recomendación firme: **fase 3, no
fase 1**, y con estas restricciones desde el minuto uno:

- Sólo abierto desde 1 h antes hasta 3 h después del partido. Un chat permanente por
  partido se convierte en un foro sin dueño.
- Sólo usuarios registrados con correo verificado y una antigüedad mínima (24 h).
- Filtro de palabras + límite de 1 mensaje cada 10 s.
- Botón de denuncia visible; 3 denuncias ocultan el mensaje automáticamente hasta
  revisión.
- Cada club puede nombrar un moderador para sus partidos.
- **Ningún mensaje sobre árbitros o jugadores concretos por nombre en categorías de
  menores.** Esto no es delicadeza: es §9.

Si no tienes a nadie que modere los domingos por la tarde, sustituye el chat por
reacciones y un muro de "momentos" (gol, tarjeta, final) sin texto libre. El 80% del valor,
el 5% del problema.

---

## 8. Estadísticas y gráficas

Con la base de datos anterior salen solas. Por equipo:

- **Evolución de la posición** por jornada (línea, invirtiendo el eje Y).
- **Puntos acumulados** contra la media del grupo (área).
- **Racha**: últimos 10, cuadraditos de color.
- **Casa vs fuera**: barras apiladas G/E/P.
- **Goles por tramo de partido** si se recogen minutos (histograma 0–15, 15–30…).
- **Mapa de calor de la temporada**: filas = equipos, columnas = jornadas, color = puntos.
  Se lee la temporada entera de un vistazo.

Por competición:
- Goles por jornada, media del grupo.
- Ventaja de jugar en casa (% victorias locales) — dato curioso y muy compartible.
- Tabla de "forma en las últimas 5" ordenada, que es distinta de la clasificación.

Por club (todos los equipos del Pizarrales a la vez):
- **Panel de club**: una fila por equipo con posición, racha y próximo partido. Es la
  pantalla que más va a usar la gente del club, y no existe en ningún sitio hoy.

Recharts sirve para todo esto. El mapa de calor, a mano con divs y CSS grid.

---

## 9. Menores: la parte que no es opcional

Casi todas las competiciones que quieres cubrir son de menores. Eso mete el proyecto de
lleno en el RGPD y en la LOPDGDD (art. 7: por debajo de 14 años el consentimiento lo dan
padres o tutores), y en la Ley de Protección Integral a la Infancia.

Reglas de diseño, no de aviso legal:

1. **Por defecto, dorsales y no nombres.** El esquema tiene `dorsal` y `jugador`
   separados aposta. `jugador` se rellena únicamente si el club ha recogido el
   consentimiento y te lo confirma por escrito.
2. **Nada de alineaciones, fotos ni datos de contacto** de jugadores menores.
3. **El alias del usuario no puede ser el nombre de un menor.** Revisión manual de alias
   en el registro las primeras semanas.
4. **Sin geolocalización** de usuarios. El campo lo eliges de una lista.
5. **Vía de borrado rápida**: un correo visible y un compromiso de retirar en 48 h
   cualquier dato de un menor a petición de su familia, sin pedir explicaciones.
6. **Registro cerrado a mayores de 16** para reportar y chatear. Los menores pueden mirar.

Además, sobre los datos de la federación: resultados y clasificaciones son hechos y no
tienen protección por derecho de autor, pero **una base de datos completa sí puede estar
protegida como tal** (derecho *sui generis* del fabricante de la base de datos). Extraer
una parte sustancial y republicarla es zona gris. Otra razón para hablar con la
delegación antes que después.

**Esto no es opinión mía sobre lo que es prudente: son obligaciones legales.** No soy
abogado y este documento no es asesoramiento jurídico. Antes de abrir el registro al
público, una consulta de una hora con alguien que lleve protección de datos te sale por
poco dinero y te evita un problema serio.

---

## 10. Fases

**Fase 0 — una semana.** Repo, Supabase, esquema, y el parser de los dos `.xls` que ya
funciona, convertido a TypeScript. Carga manual del juvenil del Pizarrales. Web pública
de sólo lectura con lo que ya tiene el prototipo. *Sale algo que se puede enseñar.*

**Fase 1 — dos semanas.** Catálogo de competiciones de Salamanca. Worker con cron y
frecuencia adaptativa. Todas las categorías del Pizarrales. Panel de club. Sin registro
todavía.

**Fase 2 — dos semanas.** Auth, reportes en vivo, confianza y reputación. Realtime.
Aquí es donde el producto se vuelve distinto de lo que ya existe.

**Fase 3 — según respuesta.** Chat, o reacciones si no hay moderadores. Resto de
provincias de Castilla y León (el mismo scraper vale, cambia la delegación).

**Fase 4.** Notificaciones push del partido de tu equipo. Es lo que engancha, pero no
sirve de nada si los datos no son fiables.

---

## 11. Qué necesito de ti

Sin esto no puedo avanzar en local:

**Imprescindible**
1. **Las URLs de los dos botones de Excel.** **Ya confirmadas**: la descarga de Excel es
   la propia página (`NFG_VisCalendario_Vis`, `NFG_VisClasificacion`) con
   `&excel=1&NPcd_File=1`. Ver `packages/ingesta/src/urls.ts`.
2. **El `Sch_Codigo_Delegacion` de Salamanca** y, si puedes, el de un par de provincias
   más para confirmar el patrón. En la práctica parece no filtrar por provincia; lo que
   cambia por competición son `CodCompeticion` y `CodGrupo`.
3. **Lista de los equipos del Pizarrales** y el enlace de la federación de cada uno
   (prebenjamín, benjamín, alevín, infantil, cadete, juvenil, y los sénior).

**Importante**
4. **El escudo del club** en SVG o PNG grande, y confirmación del rojo exacto. He usado
   `#CE2028`; si tenéis un manual de marca o el escudo vectorial, sale el tono real.
5. **Un contacto en el club** con quien hablar de lo de los nombres de menores, y a poder
   ser alguien que conozca a alguien en la delegación.
6. **Campos y horarios habituales** de los equipos del club (La Salud, Luis Camoens...),
   que la federación no siempre publica.

**Decisiones tuyas**
7. Nombre y dominio. Un par de ideas: *La Jornada*, *Charro FC*, *Salamanca en Juego*.
8. ¿Sólo Salamanca al principio o Castilla y León entera? Mi recomendación: Salamanca,
   y bien. Si funciona ahí, replicarlo es un fin de semana.
9. ¿Chat de texto o reacciones? Depende de si tienes moderadores. Sé sincero contigo
   mismo aquí.

**Cuentas que hay que tener**
- GitHub (repo + Actions para el worker)
- Supabase (plan gratis sobra para empezar)
- Vercel (plan gratis sobra)
- Un dominio (~12 €/año)

---

## 12. Cómo arrancamos en local

```bash
mkdir facylf && cd facylf
git init
claude
```

Y en la primera sesión de Claude Code:

```
Lee PROYECTO.md. Vamos con la Fase 0.
Monta el repo: pnpm workspaces con apps/web (Next.js 15, TypeScript, Tailwind)
y packages/ingesta. Después escribe el parser de los .xls de la federación
(están en /datos-ejemplo) con tests, y las migraciones de Supabase del §4.
No toques todavía nada de scraping en vivo.
```

Mete en el repo, desde el principio:
- `PROYECTO.md` — este documento
- `datos-ejemplo/` — los dos `.xls` y el PDF que me pasaste, que son los casos de prueba
- `CLAUDE.md` — reglas cortas para las sesiones: idioma español, nada de nombres de
  menores en la base de datos, el cliente HTTP siempre con rate limit, tests antes del
  siguiente parser

El prototipo `temporada-pizarrales.html` no se tira: su lógica de clasificación,
desempates, fines de semana y festivos se traduce casi línea a línea a
`packages/dominio`. Los festivos de Salamanca ya están dentro y son reutilizables.

---

## 13. Los tres riesgos reales

1. **Nadie manda resultados.** Es el más probable. Un domingo con 4 partidos y 0 reportes
   y el producto es un calendario bonito. Mitigación: la Fase 1 (datos oficiales, aunque
   lleguen tarde) tiene que valer por sí sola. El vivo es un extra, no el cimiento.

2. **La federación cambia el formato.** Pasará. Mitigación: `scrape_log`, un test por
   parser con fichero real guardado, y una alerta si un parseo devuelve 0 partidos donde
   antes devolvía 182.

3. **Un incidente con un menor.** Baja probabilidad, consecuencias graves y personales.
   Mitigación: §9 desde el día uno, no cuando haya usuarios.
