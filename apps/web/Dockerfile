# La plataforma web de FACyLF: Next.js que **consulta el canónico del servidor** con un rol de sólo lectura.
#
# Es la única pieza del proyecto que se despliega como software: los datos (colas, canónico, importador) viven
# en el servidor y no viajan dentro de esta imagen. La web no tiene base de datos propia: pregunta.
#
# Se construye desde la RAÍZ del repositorio (necesita los paquetes del monorepo):
#   docker build -f apps/web/Dockerfile -t facylf-web .
#
# Va en tres etapas para que la imagen final no lleve pnpm, ni TypeScript, ni las dependencias de desarrollo:
# en el servidor de 10 GB eso es memoria y disco que no se gastan.

# ── 1 · dependencias ────────────────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS dependencias
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
WORKDIR /app
RUN corepack enable
# Los manifiestos primero: si sólo cambia el código, esta capa se reutiliza.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/dominio/package.json packages/dominio/
COPY packages/ingesta/package.json packages/ingesta/
COPY packages/canonico/package.json packages/canonico/
COPY apps/web/package.json apps/web/
# La web importa `@facylf/dominio` e `@facylf/ingesta` (TypeScript sin compilar, Next los transpila), así que
# aquí sí hacen falta sus dependencias: por eso se instala el árbol entero y no sólo el de la web.
RUN pnpm install --frozen-lockfile --prod=false

# ── 2 · construcción ────────────────────────────────────────────────────────────────────────────────────────
FROM dependencias AS construccion
WORKDIR /app
COPY . .
# `NEXT_TELEMETRY_DISABLED` es cortesía con la red del servidor; `NODE_OPTIONS` da margen a Next durante la
# construcción (que es lo único que compila de verdad en esta imagen).
#
# Se construye con `@facylf/web...` (los puntos suspensivos incluyen sus DEPENDENCIAS del monorepo): la web
# importa `@facylf/dominio` e `@facylf/ingesta`, y esos paquetes publican su `dist/`, así que hay que
# compilarlos ANTES de `next build`. Sin esto el build falla con «Module not found: Can't resolve
# '@facylf/dominio'» — que es exactamente lo que pasó en el primer intento (medido el 21/09/2026).
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm --filter '@facylf/web...' build

# ── 3 · ejecución ───────────────────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS ejecucion
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Madrid \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# La salida `standalone` trae su propio `node_modules` mínimo y un `server.js` que se ejecuta con `node`.
COPY --from=construccion /app/apps/web/.next/standalone ./
COPY --from=construccion /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=construccion /app/apps/web/public ./apps/web/public

# Usuario sin privilegios: la web sólo lee.
RUN useradd --system --uid 10001 --create-home web \
 && chown -R web:web /app
USER web

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
