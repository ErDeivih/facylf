# Recolectores de FACyLF en un contenedor: Node + Chromium, sin escritorio y con el presupuesto de memoria
# puesto por fuera (compose) y por dentro (el gobernador de plazas).
#
# Por qué Debian y no una imagen de Selenium: aquí sólo hacen falta Node, Chromium y su conductor. La imagen
# oficial de Selenium trae VNC, servidor gráfico y grabación, que para esto es peso muerto en un servidor de
# 10 GB. Chromium y chromium-driver de Debian se llevan bien con Selenium 4 (lo encuentra en el PATH).
#
# Se construye desde la RAÍZ del repositorio:
#   docker build -f docker/Dockerfile -t facylf-recolectores .
FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Europe/Madrid \
    NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    FACYLF_CHROME_HEADLESS=1 \
    CHROME_BIN=/usr/bin/chromium

# Chromium sin cabeza, su conductor, certificados, `tini` (recoge los hijos huérfanos: Chrome deja procesos) y
# `procps` (para poder mirar los procesos del perfil desde dentro del contenedor).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      chromium-driver \
      ca-certificates \
      fonts-liberation \
      tini \
      procps \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

WORKDIR /app

# Primero los manifiestos: así la capa de dependencias se cachea y no se repite en cada cambio de código.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/dominio/package.json packages/dominio/
COPY packages/ingesta/package.json packages/ingesta/
COPY packages/canonico/package.json packages/canonico/
COPY apps/web/package.json apps/web/
# La web no se instala (no la usa nadie aquí): sus dependencias son la mitad del peso de un Next. Y se pide
# `--prod=false` a propósito: `selenium-webdriver` y `node-html-parser` son dependencias de DESARROLLO del
# proyecto y sin ellas los recolectores no arrancan; con `NODE_ENV=production` pnpm se las saltaría.
RUN pnpm install --frozen-lockfile --prod=false --filter '!@facylf/web'

# Y ahora el programa.
COPY . .
# El parser de actas vive en TypeScript y los recolectores lo importan compilado desde `packages/ingesta/dist`.
# Se construye con sus DEPENDENCIAS (`@facylf/ingesta...`): sólo `tsc -b` de ingesta falla si `dominio` no está
# compilado antes, que es justo lo que pasó en el primer intento de esta imagen.
RUN pnpm -r --filter '@facylf/ingesta...' build

# El contenedor se para entero de un tirón y sin dejar Chrome vivo.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "docker/entrada-recolector.sh"]
