# Despliegue estable de la app: propuesta (14/11/2026)

**Estado real hoy:** la app se sirve con un **quick tunnel de Cloudflare** (`*.trycloudflare.com`), que cambia de URL
cuando el proceso se reinicia; el 11/11 ya se documentó la renovación del túnel. La app corre en el PC; el servidor
sigue con la imagen vieja y el canónico 45 migraciones por detrás (ver `DESPLIEGUE-FONDO-POPULAR.md`).
**Esta propuesta no ha ejecutado nada:** necesita la decisión de David y, si se elige dominio, su compra.

## Opciones, con lo que exige cada una

| Opción | Cómo queda la URL | Estable | Necesita de David | Coste |
|---|---|---|---|---|
| **A. Túnel con nombre de Cloudflare + subdominio** | `https://facylf.tudominio.com` | Sí (la URL no cambia) | Dominio (o subdominio de uno que ya tenga), cuenta de Cloudflare y **API token** con permisos `Zone:DNS Edit` + `Account:Cloudflare Tunnel Edit`; aceptar que la app queda expuesta por HTTPS | Dominio (~10-15 €/año); túnel gratuito |
| **B. Tailscale Funnel** | `https://<maquina>.<tailnet>.ts.net` | Sí, sin dominio | Aprobar Funnel en el panel de Tailscale (y que el PC esté encendido) | 0 € |
| **C. Tailscale Serve (sólo red privada)** | `https://<maquina>.<tailnet>.ts.net` sólo para dispositivos de la tailnet | Sí, sin dominio | Nada nuevo si ya usa Tailscale; la app **no** se abre a Internet | 0 € |
| **D. Servir desde el servidor con Caddy + dominio** | `https://facylf.tudominio.com` | Sí | Dominio + DNS + desplegar la app nueva y migrar el canónico del servidor (trabajo grande, hoy bloqueado por la carga y las 45 migraciones) | Dominio + trabajo de despliegue |

## Recomendación

1. **Si la app es para un grupo pequeño y no hace falta abrirla a Internet:** **C (Tailscale Serve)**. Sin dominio,
   sin tokens, sin exposición. Es la que menos superficie de riesgo añade a una instancia privada.
2. **Si hace falta una URL pública permanente:** **A (túnel con nombre + subdominio)**, con el túnel como servicio
   del sistema (`cloudflared service install`) para que sobreviva a reinicios. **B** es el atajo si no se quiere
   comprar dominio, con la pega de la URL `ts.net` y de que Funnel es público.
3. **D no se recomienda todavía**: el servidor no puede recolectar CyL, está cargado y su canónico está 45
   migraciones por detrás; mover la app allí es un proyecto aparte.

## Qué haría falta para A (comandos, NO ejecutados)

```bash
# 1) en el PC, con el token de David en la variable de entorno (nunca en un fichero versionado)
set CLOUDFLARE_API_TOKEN=...            # permisos: Zone:DNS Edit + Account:Cloudflare Tunnel Edit
cloudflared tunnel login
cloudflared tunnel create facylf
cloudflared tunnel route dns facylf facylf.tudominio.com
cloudflared tunnel run --url http://127.0.0.1:3100 facylf
# 2) como servicio para que no muera con la sesión
cloudflared service install
```

Y en el PC: la app tiene que estar arrancada (`pnpm --filter @facylf/web start -p 3100` o el contenedor que se
decida), con PostgreSQL arriba. La demo estática (`fondo-popular-demo`) no depende de esto.

## Lo que NO se hace sin el sí de David

- Comprar ni apuntar un dominio.
- Crear tokens ni instalarlos en el sistema.
- Exponer la app a Internet (hoy no lo está: sólo túnel temporal cuando se levanta a mano).
- Tocar el servidor.
