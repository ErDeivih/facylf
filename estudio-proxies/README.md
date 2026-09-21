# Estudio de calidad de proxies

Herramienta de diagnóstico, sin dependencias (Node 18+), para evaluar la calidad
de un pool de proxies **HTTP** a partir de la lista `proxies.json`.

> **Propósito**: estudiar la calidad/reutilizabilidad de un pool de proxies contra
> servicios públicos de diagnóstico (`ipwho.is`, `api.ipify.org`, `httpbin.org`,
> `postman-echo.com`). **No** se usa para acceder a sitios que prohíben la
> automatización.

## Archivos

- `proxies.json` — lista del pool + credenciales + modo de autenticación + IP de origen.
- `estudio.mjs` — estudio completo (CONNECT, latencias, IP de salida, geo/ASN,
  anonimato, velocidad). Escribe `informe.txt` y `resultados.json`.
- `check-auth.mjs` — estado HTTP de autenticación de todos los nodos.
- `diag.mjs` — diagnóstico puntual (SOCKS vs HTTP, password correcta vs incorrecta).
- `diag2.mjs` — compara CONNECT **con** y **sin** credenciales.
- `diag3.mjs` — cruza la IP de salida con varios servicios de eco.

## Uso

```bash
node estudio-proxies/check-auth.mjs   # estado de auth de todo el pool
node estudio-proxies/diag2.mjs        # confirma modo auth (ip-whitelist)
node estudio-proxies/diag3.mjs        # cruza la IP de salida
node estudio-proxies/estudio.mjs      # estudio completo -> informe.txt
```

## Autenticación (hallazgo nº 1)

- El pool **no usa usuario/contraseña**. Autentica por **IP de origen (whitelist)**.
- Con la IP autorizada, conecta **sin credenciales** (`HTTP/1.0 200 OK`).
- Enviar `Proxy-Authorization: Basic ...` provoca **`407`** ("Invalid proxy
  credentials **or missing IP Authorization**"), incluso con la contraseña correcta.
- Por eso hay que **añadir tu IP pública** al apartado "IP Authorizations" del
  proveedor y **no** enviar credenciales.
- Protocolo: **HTTP/HTTPS (CONNECT)**. El saludo SOCKS5 no recibe respuesta.

## Qué producto tengo activo (hallazgo nº 2 — Webshare)

- **Producto ACTIVE:** `Free` (lista de proxies estáticos). Autentica por **IP
  whitelist**. Es lo único que conecta ahora mismo.
- **Producto INACTIVE:** `Rotating Residential`. El endpoint rotativo (que SÍ rota
  la IP y es el que oculta la tuya) pertenece a este producto.
  - Con credenciales `ftzzvlhh-rotate` → **407 "Invalid proxy credentials"**.
  - Sin credenciales (IP) → **407 "The proxy you are connecting is not in your list"**.
  → El endpoint rotativo **no está habilitado** en tu cuenta (plan Free).
- La lista estática con usuario/contraseña (`ftzzvlhh`) → **407** (el plan Free
  solo usa IP whitelist, y además es transparente).

### Conclusión práctica

| Objetivo | ¿Sirve en el plan actual (Free)? |
|---|---|
| Anonimato (ocultar tu IP) | **NO** — los estáticos Free son **transparentes**. |
| Geolocalización / otro país | **NO** — la salida siempre es tu localización real. |
| Rotación de IP por petición | **NO** — el endpoint rotativo está INACTIVE. |
| Apuntar peticiones a un gateway sin ocultar nada | Sí (conectan y con buena latencia). |

**Para ocultar/rotar la IP de verdad** hace falta activar **Rotating Residential**
o **Static Residential** (productos de pago). Con el plan Free actual no es posible.
