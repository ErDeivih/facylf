---
name: ingesta-federacion
description: Cómo se pide, se programa y se registra la descarga de datos de la federación — cliente HTTP educado, rate limits, ETag, frecuencia adaptativa según sea domingo por la tarde o martes, detección de cambios por hash y scrape_log. Úsala siempre que trabajes en el worker de ingesta, en el cron de GitHub Actions, en la frecuencia de actualización, en el polling de resultados en vivo, o cuando algo relacionado con descargar datos falle o dé 429. Consúltala también antes de añadir cualquier petición nueva hacia rfcylf.es.
---

# Worker de ingesta

## Por qué el cliente es educado

El bloqueo que se encontró al principio del proyecto venía de una herramienta que respeta
`robots.txt`, **no de una defensa anti-bots de la federación**. No hay captcha ni bloqueo
por IP. Eso significa que no hay nada que evadir — y que la única forma de perder el
acceso es comportarse mal.

Reglas del cliente, en `packages/ingesta/src/cliente.ts`. No las relajes sin hablarlo:

- **Un `User-Agent` identificable** con URL de explicación y correo de contacto real.
- **30 peticiones por minuto como techo, y una sola concurrente.** No hay ninguna prisa:
  el peor caso es que un resultado tarde 5 minutos más en aparecer.
- **`If-None-Match` con el ETag guardado** en cada petición. La mayoría de ciclos
  devuelven `304` y no cuestan nada a nadie.
- **Backoff exponencial** ante `429` y `5xx`: 30 s, 2 min, 8 min. Al tercer fallo seguido
  de la misma competición, se marca como caída y se deja de intentar hasta el ciclo largo.
- **Nunca de madrugada.** Fuera de la ventana de partidos no hay motivo para tocar el
  servidor.
- **Atribución visible en la web**: "Datos oficiales: Federación de Fútbol de Castilla y
  León", enlazando a la ficha del partido en su sitio. Les mandamos tráfico.

```ts
const UA = 'FutbolSalamancaBot/1.0 (+https://DOMINIO/bot; contacto@DOMINIO)';
```

## Frecuencia adaptativa

Pedir todo cada 5 minutos serían ~17.000 peticiones diarias. Con esta tabla son ~900 en
el pico del domingo, y el usuario no nota la diferencia porque Realtime empuja el cambio
en cuanto la base de datos se mueve.

| Cuándo | Cada | Qué se pide |
|---|---|---|
| Sáb y dom 09:00–21:30 | **5 min** | sólo competiciones **con partido hoy** |
| Sáb y dom, resto | 1 h | jornada en curso |
| Lun 09:00–23:00 | 30 min | actas que se cierran tarde |
| Mar–Vie | 6 h | clasificaciones, cambios de horario |
| Julio–Agosto | 1 día | altas de competiciones nuevas |

El filtro "con partido hoy" es lo que hace que esto escale. Con 60 competiciones, un
domingo juegan quizá 25. No pidas las otras 35.

```ts
const competicionesActivasHoy = await db
  .from('partidos').select('competicion_id')
  .eq('fecha', hoy())
  .then(r => [...new Set(r.data.map(p => p.competicion_id))]);
```

## Detección de cambios

Dos filtros antes de escribir nada:

1. **ETag** → si es `304`, se acabó el ciclo para esa competición.
2. **Hash del contenido** (`sha256` del cuerpo parseado, no del HTML crudo: el HTML lleva
   timestamps que cambian solos). Si coincide con el anterior, **no escribas**.

Esto importa más de lo que parece: cada `UPDATE` en `partidos` dispara un evento de
Realtime hacia todos los navegadores abiertos. Escribir sin cambios significa despertar a
cientos de móviles para nada.

Haz `upsert` sólo de las filas cuyo resultado difiere, nunca de la jornada entera.

## scrape_log

Cada petición deja una fila en `scrape_log`: competición, url, etag, hash, código de
estado, filas cambiadas, milisegundos, error. Sin esto no se puede depurar nada un
domingo por la tarde.

Alertas que deben saltar (correo o Telegram, da igual):

- 3 errores seguidos en la misma competición
- un parseo que devuelve **0 partidos** donde el anterior devolvía más de 0 ← el síntoma
  clásico de que la federación cambió el formato
- ratio de `304` por debajo del 50% en un ciclo tranquilo — señal de que el ETag no se
  está mandando bien
- un ciclo que tarda más de 10 minutos

## Estructura del worker

```
packages/ingesta/src/
  cliente.ts        pedir(), rate limit, backoff, ETag
  planificador.ts   qué competiciones toca ahora
  parsers/          ver skill parser-federacion
  upsert.ts         escribe sólo diferencias
  registro.ts       scrape_log y alertas
  cli.ts            pnpm ingesta:una --comp=X --dry
```

`--dry` imprime lo que haría sin tocar la base de datos. Es el modo por defecto mientras
se desarrolla.

## GitHub Actions

Un solo workflow con `schedule` cada 5 minutos; el planificador decide dentro si toca
hacer algo o salir en dos segundos. Es más simple que varios crons y evita solapes.

```yaml
on:
  schedule: [{ cron: '*/5 * * * *' }]
concurrency:
  group: ingesta
  cancel-in-progress: false      # nunca dos ciclos a la vez
```

Los secretos van en Secrets del repo o en `.env.local`, jamás en el código. Desde
[ADR-0008](../../../docs/plataforma-web/decisiones/0008-postgres-local-docker.md) el destino no es
Supabase: la ingesta escribe en su SQLite y el publicador es quien lleva los datos al PostgreSQL
canónico (`DATABASE_URL_PUBLICADOR`). GitHub Actions puede retrasar los crons en horas punta: no asumas puntualidad,
usa la hora real al decidir la ventana.

## Cuando el resultado oficial llega

Al recibir un resultado oficial de un partido que tenía resultado en vivo:

1. Se escribe en `gl_oficial` / `gv_oficial` y `estado = 'oficial'`.
2. Se comparan los `reportes` de ese partido con el oficial.
3. **Reputación**: `+2` a quien acertó, `−5` a quien falló.
4. Se deja de mostrar el vivo; manda el oficial siempre.

Este paso es el que hace que el sistema de confianza mejore solo con el tiempo. No lo
dejes para después: sin él, la reputación nunca sube y nadie llega a `verificado`.
