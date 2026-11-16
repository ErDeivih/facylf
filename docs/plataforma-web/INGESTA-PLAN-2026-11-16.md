# Ingesta: que no falte nada y que lo reciente llegue antes (16/11/2026)

Propuesta de diseño. **No cambia ningún worker ni su ritmo**: el SQL de este documento no está aplicado
y nada de lo que hay en marcha lo usa. Se apoya en lo que ya existe (colas SQLite por federación,
supervisor, vigía de colas, `ops.coverage_checkpoint`) y dice qué añadir.

> **Corrección del mismo día (ver `ENTREGA-2-2026-11-16.md`).** El calendario futuro **ya está
> descargado**: cada grupo guarda `calendario.html.gz` y nadie lo leía. No hace falta un ingestador que
> pida nada: `scripts/calendario-desde-html.mjs` lo lee del disco y lo deja en `core.calendario_previsto`
> (0067). El punto 2 del «Orden de trabajo» de este documento queda sustituido por eso.

## El hallazgo que ordena todo lo demás

En la web del 16/11, el grupo VIII de Tercera Federación dice «Jornada 10 de 34» y tiene **90 partidos
en el canónico: sólo los de las diez jornadas jugadas**. La jornada 11 no existe (404). De ahí salen
tres síntomas que parecían distintos:

| Síntoma | Causa |
|---|---|
| «Próxima jornada» abría con la jornada 1 de septiembre | Los únicos partidos sin resultado que hay en la base son aplazados y resultados sin recoger; los futuros no están |
| La clasificación estimada daba 100 % a cada equipo en su puesto | La simulación sólo tenía tres aplazados que jugar |
| Faltan el último fin de semana y parte del anterior | Lo que se recoge es la jornada cuando ya tiene acta; entre que se juega y se recoge no hay nada |

**El calendario futuro es un dato de primera, no un subproducto de las actas.** La federación publica
las 34 jornadas con sus cruces desde el sorteo. Hay que traerlas como partidos `scheduled`, con fecha
si la hay y sin ella si no.

## 1. Descubrir todo y saber cuánto falta

Un portal pnfg es un árbol de cuatro niveles, y cada nivel se obtiene con una petición al anterior:

    temporada → competición → grupo → jornada → partido (→ acta)

Recorrido sistemático, una vez por temporada y después sólo en busca de altas:

1. **Temporadas**: el desplegable de temporada de la portada de competiciones.
2. **Competiciones** de cada temporada: el desplegable de competición con esa temporada elegida.
   Guardar código, nombre y el tipo de juego (fútbol 11, sala…) si el portal lo separa.
3. **Grupos** de cada competición: el desplegable de grupo.
4. **Jornadas** de cada grupo: el desplegable de jornada da el número total. Ese número es
   `jornadas_esperadas`; no hay que deducirlo de los equipos.
5. **Partidos** de cada jornada: la página de la jornada (`NFG_CmpJornada`). Una jornada sin jugar
   trae los cruces igual, sin marcador.

Cada nivel es una URL con los códigos del anterior (`CodTemporada`, `CodCompeticion`, `CodGrupo`,
`CodJornada`, más `cod_primaria` y la delegación; ver la skill `parser-federacion`). El recolector ya
recorre este árbol (`packages/ingesta/src/catalogo.ts`); lo que no hace es **guardar lo que el portal
lista aunque todavía no lo descargue**, y por eso no se puede decir cuánto falta. Dos cosas a
comprobar antes de fiarse del recorrido: que la lista de grupos incluye las fases que se abren a
mitad de temporada (copas, segundas fases), y qué hace el portal cuando pide sesión, que el 10/11
devolvió cuerpos vacíos a varias peticiones seguidas.

**Catálogo de lo esperado.** `ops.coverage_checkpoint` ya tiene `jornadas_esperadas`,
`jornadas_descubiertas`, `partidos_esperados` y `partidos_conocidos` por grupo. Falta el nivel de
arriba (qué competiciones y grupos **deberían** existir) para detectar un grupo que nunca se descubrió:

```sql
create table ops.catalogo_esperado (
  federacion      text     not null,
  temporada       text     not null,
  nivel           text     not null check (nivel in ('competicion','grupo','jornada')),
  codigo          text     not null,            -- código del portal en ese nivel
  codigo_padre    text,                         -- competición del grupo, grupo de la jornada
  nombre          text     not null,
  partidos_esperados smallint,                  -- sólo en nivel 'jornada': cruces que lista el portal
  visto_en        timestamptz not null default now(),   -- última vez que el portal lo listó
  desaparecido_en timestamptz,                  -- dejó de listarse (grupo anulado, fusión)
  primary key (federacion, temporada, nivel, codigo)
);
```

**Avance real**, que es el número que hoy no se puede dar:

```sql
select c.federacion, c.temporada,
       count(*) filter (where c.nivel = 'grupo')                             as grupos_esperados,
       count(*) filter (where c.nivel = 'jornada')                           as jornadas_esperadas,
       sum(c.partidos_esperados) filter (where c.nivel = 'jornada')          as partidos_esperados,
       (select count(*) from ops.trabajo_ingesta t
         where t.federacion = c.federacion and t.temporada = c.temporada
           and t.tipo = 'acta' and t.estado = 'hecha')                       as actas_hechas,
       (select count(*) from ops.trabajo_ingesta t
         where t.federacion = c.federacion and t.temporada = c.temporada
           and t.tipo = 'acta' and t.estado in ('pendiente','en_curso'))     as actas_pendientes
  from ops.catalogo_esperado c
 where c.desaparecido_en is null
 group by 1, 2;
```

Un grupo en el catálogo sin fila en `core.phase_group` es un grupo por descubrir; una jornada del
catálogo sin partidos en `core.match` es calendario que falta. Las dos listas salen de un `left join`
y son las que hoy nadie puede enseñar.

## 2. Tabla de control e idempotencia

Una fila por cosa que se puede pedir. La clave natural hace que encolar dos veces lo mismo sea
imposible, no improbable.

```sql
create table ops.trabajo_ingesta (
  id            bigint generated always as identity primary key,
  federacion    text     not null,
  temporada     text     not null,
  tipo          text     not null check (tipo in ('catalogo','jornada','acta','clasificacion','escudo','foto')),
  clave         text     not null,              -- código de grupo+jornada, código de acta, id de club…
  url           text     not null,
  estado        text     not null default 'pendiente'
                  check (estado in ('pendiente','en_curso','hecha','error_permanente')),
  prioridad     smallint not null default 500,  -- menor = antes (ver §4)
  no_antes_de   timestamptz not null default now(),
  intentos      smallint not null default 0,
  maquina       text,                           -- 'pc' | 'servidor' mientras está en curso
  reclamado_en  timestamptz,
  caduca_en     timestamptz,                    -- si pasa esta hora en 'en_curso', vuelve a 'pendiente'
  etag          text,
  sha256        text,                           -- del contenido parseado, no del HTML
  ultimo_error  text,
  hecho_en      timestamptz,
  unique (federacion, temporada, tipo, clave)
);

create index trabajo_ingesta_cola_idx
  on ops.trabajo_ingesta (federacion, prioridad, no_antes_de, id)
  where estado = 'pendiente';
```

Estados y transiciones (no hay más; un valor fuera de esta lista detiene el lote, como en la cola actual):

    pendiente ──reclamar──▶ en_curso ──bien──▶ hecha
        ▲                      │
        │                      ├──fallo recuperable (5xx, 429, red)──▶ pendiente  (intentos+1, no_antes_de = ahora + espera)
        │                      ├──fallo definitivo (404 confirmado, acta anulada, 5 intentos)──▶ error_permanente
        └──caducó la reclamación (la máquina se cayó)─────────────────┘

    hecha ──el portal cambió (ETag/hash distinto en la revisita)──▶ pendiente

Encolar (idempotente; no pisa lo que ya está en curso o hecho):

```sql
insert into ops.trabajo_ingesta (federacion, temporada, tipo, clave, url, prioridad)
values ($1, $2, $3, $4, $5, $6)
on conflict (federacion, temporada, tipo, clave) do update
   set prioridad = least(ops.trabajo_ingesta.prioridad, excluded.prioridad)
 where ops.trabajo_ingesta.estado = 'pendiente';
```

**Reclamación atómica.** Dos máquinas nunca cogen lo mismo porque `skip locked` salta las filas que
otra transacción está cogiendo en ese instante:

```sql
with elegidos as (
  select id
    from ops.trabajo_ingesta
   where estado = 'pendiente'
     and federacion = $1
     and no_antes_de <= now()
   order by prioridad, no_antes_de, id
   limit $2                       -- tamaño del lote: 5-10
   for update skip locked
)
update ops.trabajo_ingesta t
   set estado = 'en_curso', maquina = $3, reclamado_en = now(),
       caduca_en = now() + interval '15 minutes', intentos = t.intentos + 1
  from elegidos e
 where t.id = e.id
returning t.id, t.tipo, t.clave, t.url, t.etag;
```

Devolver lo que una máquina caída dejó a medias (lo corre cualquiera de las dos, cada 5 minutos):

```sql
update ops.trabajo_ingesta
   set estado = 'pendiente', maquina = null, reclamado_en = null, caduca_en = null
 where estado = 'en_curso' and caduca_en < now();
```

Cerrar un trabajo:

```sql
-- bien
update ops.trabajo_ingesta
   set estado = 'hecha', hecho_en = now(), etag = $2, sha256 = $3, ultimo_error = null,
       maquina = null, caduca_en = null
 where id = $1 and estado = 'en_curso' and maquina = $4;

-- fallo recuperable: espera 30 s, 2 min, 8 min, 32 min…
update ops.trabajo_ingesta
   set estado = case when intentos >= 5 then 'error_permanente' else 'pendiente' end,
       no_antes_de = now() + (interval '30 seconds' * power(4, least(intentos, 5) - 1)),
       ultimo_error = $2, maquina = null, caduca_en = null
 where id = $1 and estado = 'en_curso' and maquina = $3;
```

El `and maquina = $n` del cierre es lo que impide que una máquina que tardó más de 15 minutos cierre un
trabajo que ya se le quitó y otra está haciendo.

**Encaje con lo que hay.** Las colas actuales son SQLite locales por federación y cada máquina tiene
la suya; el reparto es por federación (`FACYLF_EXCLUIR`). Esta tabla vive en PostgreSQL y permite
repartir **dentro** de una federación. Paso prudente: empezar sólo con los tipos nuevos (`jornada`
futura, `escudo`, `foto`), que hoy no tiene nadie, y dejar las actas donde están hasta haberlo visto
funcionar dos semanas.

## 3. Dos máquinas al máximo sin que el portal sufra

El límite no es de las máquinas, es del portal, y **es por federación, no por máquina**. Dos máquinas a
30 peticiones por minuto contra el mismo portal son 60, no 30.

- **Un presupuesto compartido por federación**: una fila con las fichas disponibles, que las dos
  máquinas descuentan antes de pedir.

```sql
create table ops.presupuesto_portal (
  federacion   text primary key,
  por_minuto   smallint not null,          -- techo total del portal, sumando las dos máquinas
  fichas       numeric  not null,
  repuesto_en  timestamptz not null default now(),
  pausa_hasta  timestamptz,                -- un 403/429 lo pone a +30 min para TODAS las máquinas
  motivo       text
);

-- pedir n fichas; si devuelve fila, se puede pedir
update ops.presupuesto_portal
   set fichas = least(por_minuto, fichas + extract(epoch from now() - repuesto_en) / 60 * por_minuto) - $2,
       repuesto_en = now()
 where federacion = $1
   and (pausa_hasta is null or pausa_hasta < now())
   and least(por_minuto, fichas + extract(epoch from now() - repuesto_en) / 60 * por_minuto) >= $2
returning fichas;
```

- **Concurrencia**: una conexión por máquina y portal. Más conexiones no dan más datos, dan más
  riesgo. La velocidad sale de no pedir lo que no hace falta (ETag, `If-None-Match`, no revisitar actas
  cerradas), no de pedir en paralelo.
- **Reparto**: el servidor, que está siempre encendido, lleva lo que tiene hora (fin de semana, lunes
  de actas). El PC, que se apaga, lleva lo que no la tiene (histórico, escudos, fotos). Con la tabla
  de control no hace falta decidirlo a mano: los dos reclaman por prioridad y el PC simplemente llega
  cuando llega.
- **Qué se limita primero cuando el portal va lento** (latencia mediana > 3 s o un 5xx): 1.º fotos y
  escudos, 2.º histórico, 3.º clasificaciones, 4.º actas de jornadas antiguas. Lo último que se toca
  es la jornada en curso. Ante un 403 o un 429: `pausa_hasta` para todas las máquinas y aviso; no se
  rodea nunca.
- **Nunca de madrugada** y nunca más deprisa de lo que hoy está medido como seguro (`RITMO-MEDIDO.md`):
  el presupuesto por minuto de esta tabla es el que ya se usa, repartido entre dos, no uno nuevo.

## 4. Lo reciente primero

La prioridad se calcula al encolar y se recalcula cada noche; menor número, antes.

| Prioridad | Qué | Revisita |
|---:|---|---|
| 10 | Jornada con partidos **hoy** (resultados) | cada 5-10 min en horario de partidos |
| 20 | Actas de partidos jugados en las últimas 48 h | cada 30 min hasta que el acta esté cerrada |
| 30 | Jornada de la semana en curso y la siguiente (horarios, cambios de campo) | cada 6 h |
| 40 | Partidos pasados **sin resultado** de las últimas 3 semanas (aplazados, actas tardías) | 1 vez al día |
| 50 | **Calendario futuro** de la temporada en curso (jornadas sin jugar) | 1 vez por semana |
| 100 + semanas de antigüedad | Resto de la temporada en curso, hacia atrás | sólo si cambia el ETag |
| 300 + 50 × temporadas atrás | Histórico, de la temporada más reciente a la más antigua | una vez |
| 800 | Escudos y fotos | una vez; refresco anual |

```sql
-- recalcular cada noche lo pendiente de la temporada en curso
update ops.trabajo_ingesta t
   set prioridad = case
         when j.fecha = current_date                         then 10
         when j.fecha between current_date - 2 and current_date - 1 and t.tipo = 'acta' then 20
         when j.fecha between current_date and current_date + 13 then 30
         when j.fecha between current_date - 21 and current_date - 1 then 40
         when j.fecha > current_date + 13                    then 50
         else 100 + least(150, (current_date - j.fecha) / 7)
       end
  from ops.jornada_de_trabajo j          -- vista: fecha de la jornada a la que pertenece cada trabajo
 where j.trabajo_id = t.id and t.estado = 'pendiente' and t.temporada = '2026-27';
```

Lo que falta hoy (el último fin de semana y parte del anterior) son las prioridades 20 y 40: hasta que
exista la tabla, el arreglo inmediato es **una pasada diaria de «pasados sin resultado»** sobre la
temporada en curso. La web ya los cuenta por competición (`proximos-por-competicion`, columna
`atrasados`), así que esa lista existe.

## 5. Escudos y fotos

**Estado**: 36 de 937 clubes de Castilla y León tienen escudo (3,8 %); el resto pinta el monograma
(`ESCUDOS-FALTAN.md`).

**De dónde salen** (medido en `ESCUDOS-FALTAN.md` §4): la página de jornada trae un `<img>` por
equipo, y la imagen vive en el host de ficheros (`rfcylf.filesnovanet.es` o `www.rfcylf.es`), que
responde **sin sesión**. Los 36 que hay salieron de dos tandas de `escudos-desde-html.mjs` sobre el
HTML de unos pocos grupos: donde pasó, el grupo quedó con 14 de 14. El hueco es de recolección. No
hace falta ninguna petición nueva al portal para **descubrir** la URL —está en HTML que ya se
descarga—, pero ese HTML de jornada hoy no se conserva en el archivo, así que la URL hay que guardarla
en el momento de parsear.

1. Al parsear una jornada o una clasificación, por cada equipo: `(club, url_escudo)` →
   `insert … on conflict do nothing` en `ops.trabajo_ingesta` con `tipo = 'escudo'`,
   `clave = código de club`. Un club que aparece en 300 jornadas genera **un** trabajo.
2. El trabajo descarga la imagen **una vez**, comprueba la firma real (PNG/JPEG/WebP), calcula el
   `sha256` y la guarda en `core.club_asset`, que ya deduplica por `(club_id, tipo, sha256)`.
3. El escudo genérico del portal (el mismo `sha256` en decenas de clubes) no es un escudo: se detecta
   por repetición (> 5 clubes con la misma huella) y **no** se guarda; el club queda con monograma.
4. Revisita: `If-None-Match` una vez al año o cuando la URL del club cambie. Nunca en cada jornada.
5. La web no pide nada al portal: sirve `/api/escudo/club/<id>` desde el canónico con un día de caché.

Coste: ~900 descargas de imagen, una sola vez, a prioridad 800 y contra el host de ficheros, no
contra el portal: a 10 por minuto, 90 minutos de una tarde entre semana. De los 901 clubes sin escudo,
345 son el mismo club partido en varias filas: una descarga los cierra a todos si antes se resuelve la
identidad (la decisión del 10/11 fue no copiar escudos entre filas hermanas; sigue en pie).

**Fotos de jugadores** (decisión del 16/11/2026): mismo patrón, `tipo = 'foto'`,
`clave = código de persona`, destino `core.person_asset` (migración 0066). La URL de la foto está en
la ficha del jugador o en el acta, según el portal: hay que confirmar en cuál antes de encolar, porque
si exige abrir la ficha de cada jugador son ~1,2 millones de peticiones y no se hace de golpe: sólo
jugadores de la temporada en curso, a prioridad 800, y el resto bajo demanda. La silueta genérica se
descarta igual que el escudo genérico.

## 6. Que el fallo de una federación se vea en una línea

Una vista, una fila por federación, que el vigía ya sabe pintar:

```sql
create view ops.salud_ingesta as
select t.federacion,
       count(*) filter (where t.estado = 'pendiente' and t.prioridad <= 40)        as urgentes_pendientes,
       count(*) filter (where t.estado = 'en_curso')                               as en_curso,
       count(*) filter (where t.estado = 'error_permanente'
                          and t.reclamado_en > now() - interval '24 hours')        as errores_24h,
       max(t.hecho_en)                                                             as ultimo_hecho,
       count(*) filter (where t.estado = 'hecha' and t.hecho_en > now() - interval '1 hour') as hechas_1h,
       (select max(m.played_at) from core.match m
          join core.phase_group g on g.id = m.phase_group_id
          join core.competition_edition e on e.id = g.competition_edition_id
          join core.federation f on f.id = e.federation_id
         where f.codigo = t.federacion and m.goles_local is not null)              as ultimo_resultado
  from ops.trabajo_ingesta t
 group by t.federacion;
```

La línea:

    castilla-leon  OK     urgentes 0 · 412 hechas/h · último resultado dom 15 nov 19:30 · errores 24 h: 2
    castilla-leon  AVISO  urgentes 183 (la más antigua, 26 h) · 0 hechas/h · último resultado dom 8 nov

Avisos nuevos para el vigía (los de portal ajeno, bloqueo, lecturas vacías y calidad de actas ya existen):

| Código | Nivel | Regla |
|---|---|---|
| `resultado_atrasado` | **crítico** | Es lunes después de las 12:00 y más del 10 % de los partidos del fin de semana siguen sin resultado |
| `sin_calendario_futuro` | aviso | Un grupo en curso con `jornadas_descubiertas` < `jornadas_esperadas` y ninguna jornada con fecha futura |
| `grupo_sin_descubrir` | aviso | Un grupo de `ops.catalogo_esperado` sin `core.phase_group` 48 h después de verse en el portal |
| `urgentes_viejos` | aviso | Algún trabajo de prioridad ≤ 40 lleva pendiente más de 6 h en horario de recogida |
| `reclamacion_caducada` | aviso | Más de 20 reclamaciones caducadas en una hora: una máquina se cae a medias |
| `errores_permanentes` | aviso | Más del 2 % de los trabajos de la semana acaban en `error_permanente` |
| `escudo_generico` | info | Un `sha256` de escudo repetido en más de 5 clubes |

`resultado_atrasado` es el que habría avisado de lo que pasa hoy. La web ya enseña el mismo dato a
quien la visita: cada competición dice «Resultados hasta el 8 nov · 12 partidos pasados sin resultado».

## Orden de trabajo

1. Pasada diaria de «pasados sin resultado» de la temporada en curso con lo que ya hay (sin tabla nueva).
2. Recoger el calendario futuro de la temporada en curso como partidos `scheduled` e importarlo. Con
   eso «Próximos partidos» deja de estar vacía y la simulación deja de deducir cruces.
3. `ops.catalogo_esperado` + las dos listas de «por descubrir».
4. `ops.trabajo_ingesta` para escudos (y fotos, si se confirma dónde están).
5. Presupuesto compartido y reparto dentro de una federación, sólo cuando 1-4 lleven dos semanas bien.
