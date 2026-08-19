# Fútbol Salamanca

Resultados y clasificaciones del fútbol base de la provincia de Salamanca.

El plan completo está en [`PROYECTO.md`](PROYECTO.md). Las reglas de trabajo, en
[`CLAUDE.md`](CLAUDE.md). Lee las dos antes de empezar una fase nueva.

## Qué hay hecho (Fase 0)

- `packages/dominio` — clasificación, desempates, calendario, festivos y confianza.
  Sin dependencias, se prueba en milisegundos.
- `packages/ingesta` — cliente HTTP educado y el parser del `Calendario.xls`,
  probado contra el fichero real y contrastado con la cuadrícula del PDF.
- `supabase/migrations` — el esquema entero, RLS incluida.
- `apps/web` — la web pública, leyendo por ahora el calendario de `datos-ejemplo/`.

## Qué falta para la Fase 1

**Las URLs de los botones "Calendario Excel" y "Clasificación Excel"** de la
federación. Se sacan en dos minutos: abrir la página de la competición, F12 →
pestaña Red, pulsar el botón, copiar la URL. Van en
`packages/ingesta/src/urls.ts`, donde ahora hay una excepción a propósito.

También hacen falta el `Sch_Codigo_Delegacion` de Salamanca y los códigos de las
demás competiciones (PROYECTO.md §11).

## Arrancar

```bash
pnpm install
pnpm test          # 53 pruebas
pnpm dev           # http://localhost:3000
pnpm ingesta:una   # parsea el fichero de ejemplo y lo valida, sin escribir nada
```

Base de datos, cuando haya proyecto de Supabase:

```bash
pnpm db:migrar
pnpm db:tipos
```

## Estructura

```
apps/web/             Next.js 15, App Router
packages/dominio/     reglas del fútbol. No importa Supabase ni Next.
packages/ingesta/     cliente HTTP, parsers, validación
datos-ejemplo/        ficheros reales de la federación: son los casos de prueba
supabase/migrations/  SQL numerado
.claude/skills/       lo que ya sabemos del formato de la federación y del dominio
```

## Tres cosas que conviene no olvidar

1. **Menores.** Casi todas las competiciones son de menores de edad. En la base de
   datos se guarda dorsal, nunca nombre, y hay un *trigger* que lo impide salvo que
   haya un consentimiento registrado. No lo quites.
2. **Nada de evadir bloqueos.** El cliente se identifica, respeta el ritmo y para
   cuando le dicen que pare. Es lo que mantiene el acceso abierto.
3. **Ningún dato inventado.** Si falta un código o una URL, se pide. En el
   repositorio no hay ni un valor de relleno.

## Despliegue

La web está en Vercel, plan gratis (Hobby): <https://fcylf.vercel.app>

El proyecto de Vercel se llama `fcylf`. Para que cada `git push` despliegue solo:

1. Vercel → proyecto `fcylf` → Settings → Git → conecta este repositorio.
2. En Settings → General, pon **Root Directory** = `apps/web`.
3. Listo: `main` va a producción y cada rama crea su propia preview.

El plan gratis de Vercel es para uso **no comercial**. Sin anuncios ni cuota,
cumple; si algún día monetizas, hay que pasar a Pro.

Alternativas gratis equivalentes, por si acaso: Netlify, Cloudflare Pages y
Render sirven Next.js igual de bien.

### Lo que hace GitHub Actions ahora mismo

- `.github/workflows/test.yml` — corre `pnpm test` en cada push y cada PR. **Activo.**
- `.github/workflows/ingesta.yml` — el worker de datos. **Desactivado a propósito**:
  sin las URLs de la federación termina en error, y con el cron puesto te llenaría
  el correo de fallos. Se activa descomentando el bloque `schedule`.
