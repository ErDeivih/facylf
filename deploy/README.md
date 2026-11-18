# Despliegue de Fondo Popular

## Imagen verificada

La imagen se construye desde un archivo limpio, no desde el árbol de trabajo:

```bash
git archive --format=tar HEAD | tar -xf - -C tmp/contexto-docker
docker build -f tmp/contexto-docker/apps/web/Dockerfile -t facylf-web:test tmp/contexto-docker
```

## Opción recomendada (Coolify o VPS)

1. Copia `deploy/` al servidor.
2. `cp .env.example .env` y rellena las URLs de PostgreSQL (lector y app), el dominio y `SITE_ADDRESS`.
3. `docker compose up -d --build`.
4. Caddy obtiene el certificado y hace de proxy; la web escucha solo en la red interna.
5. Comprueba `https://TU_DOMINIO/api/salud`.

## Por qué Redis

El proxy usa Redis para el límite compartido entre réplicas. Sin `REDIS_URL`, cae a memoria por proceso:
sigue funcionando con una sola instancia, pero no reparte el contador entre varias.

## Cloudflare

Si pones Cloudflare delante, activa el proxy naranja y deja `FACYLF_CONFIANZA_PROXY=1`; la app usa
`CF-Connecting-IP` y, si falta, la última IP de `X-Forwarded-For`. Sin Cloudflare, Caddy añade la IP real
al final de XFF.

## Alternativas sin coste para probar

- **Vercel/Netlify**: la web Next puede desplegarse, pero el rate limit distribuido y el proxy persistente
  no encajan igual; para una demo estática usa GitHub Pages (ya existe).
- **AWS Sandbox**: útil para probar RDS/ElastiCache, pero no lo configures en producción sin revisar coste.
- **VPS pequeño**: la opción más parecida a este compose; 2 GB bastan para web+Redis+Caddy.

## Base de datos

No se incluye PostgreSQL con datos: la base canónica es un servicio externo. Si quieres una copia de
pruebas, usa `infra/docker-compose.yml` y las migraciones de `infra/migraciones/`.

## Seguridad

- No publiques `.env`.
- Mantén `DATABASE_URL_APP` y `DATABASE_URL_LECTOR` separadas.
- Revisa `pnpm audit --prod` en cada despliegue.
