# Fútbol Salamanca

Web de resultados y clasificaciones del fútbol base de la provincia de Salamanca.
El plan completo está en `PROYECTO.md` — léelo antes de empezar una fase nueva.

## Reglas que no se negocian

**Datos de menores.** Casi todas las competiciones son de menores de edad. En la base de
datos y en la interfaz se usa **dorsal, nunca nombre**, salvo que el club haya confirmado
por escrito que tiene el consentimiento de los tutores. Si una tarea te pide guardar,
mostrar o scrapear nombres de jugadores, alineaciones o fotos de categorías inferiores a
juvenil, **para y dile al usuario que eso necesita una decisión suya antes**. No lo
resuelvas por tu cuenta ni con un `TODO`.

**Nada de evasión de bloqueos.** El cliente HTTP se identifica siempre con su
`User-Agent` real y respeta `robots.txt`, rate limits y códigos 429. No se rotan proxies,
no se falsean navegadores, no se resuelven captchas. Si un endpoint deja de responder, se
para el worker y se avisa; no se busca la vuelta.

**Ningún dato inventado.** Si falta un código de competición, una fecha o una URL, se
pide. Nunca se rellena con un valor plausible, ni siquiera como ejemplo dentro de un
`seed`. Los datos de prueba van en `datos-ejemplo/` y son ficheros reales.

## Stack

- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind, desplegado en Vercel
- **Datos**: Supabase (Postgres, Realtime, Auth, RLS, Storage)
- **Ingesta**: paquete `packages/ingesta`, ejecutado por GitHub Actions con cron
- **Gráficas**: Recharts
- **Gestor**: pnpm workspaces. Node 22.

```
apps/web/            Next.js
packages/dominio/    clasificación, desempates, calendario. Sin dependencias.
packages/ingesta/    cliente HTTP, parsers, upserts
datos-ejemplo/       ficheros reales de la federación, son los casos de prueba
supabase/migrations/ SQL numerado
```

`packages/dominio` no importa nada de Supabase ni de Next. Se prueba sola y rápido.

## Cómo trabajamos

- **En español**: código, comentarios, commits, nombres de tablas y columnas. La interfaz
  la lee gente de Salamanca, no anglosajones.
- **Test antes que siguiente parser.** Cada parser nuevo trae su test con un fichero real
  de `datos-ejemplo/`. Si un parser devuelve 0 filas donde antes devolvía N, es un fallo,
  no un caso vacío.
- **Migraciones, nunca SQL suelto.** Todo cambio de esquema es un fichero nuevo en
  `supabase/migrations/`. No se edita una migración ya aplicada.
- **Commits pequeños** con mensaje en imperativo: `añade parser de clasificación`.
- No añadas dependencias sin decir por qué. Este proyecto puede vivir con muy pocas.

## Vocabulario del dominio

Usa estos términos exactos, en la base de datos y en el código:

| Término | Qué es |
|---|---|
| **competición** | un grupo concreto de una categoría (`CodCompeticion` + `CodGrupo`) |
| **jornada** | número de ronda, 1..26 |
| **partido** | un enfrentamiento con local y visitante |
| **reporte** | resultado que manda un usuario desde el campo |
| **oficial** | resultado publicado por la federación; siempre gana al reporte |
| **confianza** | 0–100, cuánto nos fiamos del resultado en vivo |

No mezcles `match`/`game`/`encuentro`. Es **partido**.

## Comandos

```bash
pnpm dev            # web en local
pnpm test           # todo
pnpm test:dominio   # rápido, el que más vas a usar
pnpm ingesta:una    # una competición, sin escribir en base de datos (--dry)
pnpm ingesta:todas  # el ciclo completo
pnpm db:migrar      # aplica migraciones
pnpm db:tipos       # regenera tipos TypeScript desde el esquema
```

## Cuando dudes

Pregunta antes de: cambiar el esquema de una tabla con datos, tocar la frecuencia del
worker, añadir un campo que guarde datos personales, o desplegar a producción.
