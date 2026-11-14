# Túnel con nombre de Cloudflare: una configuración, tres subdominios

**Fecha:** 14/11/2026. **Estado:** preparado en el servidor (binario instalado), **bloqueado por permisos del
token y por falta del dominio**. No se ha creado ningún túnel ni registro DNS.

## 1 · Lo que ya está hecho y lo que falta

| Pieza | Estado real |
|---|---|
| `cloudflared` en el servidor | **Instalado**: `cloudflared version 2026.11.0` en `/usr/local/bin/cloudflared` (binario descargado en el PC y copiado; el servidor no resuelve GitHub) |
| Token de Cloudflare | El fichero `credenciales.env` tiene un token **activo** (`/user/tokens/verify` → `status: active`), pero **sin permisos** para lo que hace falta: `GET /zones` devuelve `9109 Invalid access token` y `GET /accounts/<id>/cfd_tunnel` devuelve `10000 Authentication error` |
| Dominio | **No consta** en el repositorio ni en `credenciales.env` (solo hay `SUPABASE_*`, `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`) |

**Lo que tiene que hacer David (una sola vez):**
1. En el panel de Cloudflare → *My Profile → API Tokens* → editar el token (o crear uno nuevo) y añadir:
   - `Account` → **Cloudflare Tunnel → Edit** (implica Read),
   - `Zone` → **DNS → Edit** para el dominio,
   - `Zone` → **Zone → Read** para el dominio.
   Los permisos de túnel son de cuenta; los de DNS, de zona: por eso no basta un token solo de zona.
2. Decir el **dominio** (o crearlo y delegar los NS en Cloudflare). Los subdominios propuestos son
   `facylf.`, `lyfta.` y `cuedigital.` sobre ese mismo dominio.
3. Confirmar que la app de FACYLF puede quedar arrancada en el PC escuchando en la interfaz de Tailscale
   (`100.110.114.10`): hoy no hay nada escuchando en `:3100`/`:3002`.

## 2 · La configuración (una sola, tres servicios)

El túnel va **en el servidor** (es el que está siempre encendido). FACYLF se alcanza desde ahí por Tailscale
(`100.110.114.10:3100`); Lyfta y CueDigital, en localhost del servidor.

```yaml
# /etc/cloudflared/config.yml  (nombre: facylf)
tunnel: facylf                       # id del túnel, no el nombre
credentials-file: /etc/cloudflared/facylf.json
ingress:
  - hostname: facylf.eltudominio.es
    service: http://100.110.114.10:3100
    originRequest: { connectTimeout: 10s, noTLSVerify: false }
  - hostname: lyfta.eltudominio.es
    service: http://127.0.0.1:8010
  - hostname: cuedigital.eltudominio.es
    service: http://127.0.0.1:8090
  - service: http_status:404
```

Con token (recomendado, sin `cert.pem` en el servidor): el túnel y su configuración se crean desde la API o
el panel y en el servidor solo vive el token:

```bash
# en el servidor, una vez David dé el token del TÚNEL (no el API token)
sudo install -d -m 0700 /etc/cloudflared
echo 'TUNNEL_TOKEN' | sudo tee /etc/cloudflared/token >/dev/null
sudo chmod 600 /etc/cloudflared/token
sudo cloudflared service install --token "$(sudo cat /etc/cloudflared/token)"
sudo systemctl enable --now cloudflared
```

## 3 · Creación por API (cuando el token tenga permisos)

```bash
# 1) túnel (una vez)
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel" \
  -d '{"name":"facylf","config_src":"cloudflare"}'

# 2) configuración (ingress) del túnel, con el id que devuelve el paso 1
curl -s -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/<ID>/configurations" \
  -d '{"config":{"ingress":[{"hostname":"facylf.DOMINIO","service":"http://100.110.114.10:3100"},
       {"hostname":"lyfta.DOMINIO","service":"http://127.0.0.1:8010"},
       {"hostname":"cuedigital.DOMINIO","service":"http://127.0.0.1:8090"},
       {"service":"http_status:404"}]}}'

# 3) DNS: un CNAME por subdominio, apuntando al túnel y en naranja (proxied)
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  -d '{"type":"CNAME","name":"facylf","content":"<ID>.cfargotunnel.com","proxied":true}'
```

## 4 · Si se cae y cómo se reinicia

- El túnel corre como **servicio systemd** (`cloudflared`), con `Restart=always` que pone el propio
  `cloudflared service install`. Comprobación: `systemctl status cloudflared` y `journalctl -u cloudflared -n 50`.
- Si el PC se apaga, **FACYLF deja de responder** aunque el túnel siga vivo (los otros dos subdominios siguen).
  Para que no se caiga de madrugada hace falta además:
  - el PC encendido (o la app en el servidor, que hoy no puede: canónico 45 migraciones por detrás), y
  - la app como servicio del sistema en el PC (`nssm`/tarea programada con reinicio), no lanzada a mano.
- Comprobación desde fuera: `curl -sI https://facylf.DOMINIO/` → 200; `cloudflared tunnel info facylf`
  (requiere el API token con permiso de túnel).

## 5 · Lo que NO se ha hecho

No se ha creado túnel, ni DNS, ni servicio systemd: sin permiso de túnel y sin dominio no se puede. El
binario sí está instalado (no cambia nada por sí solo) para que, en cuanto lleguen las dos cosas, sea un
solo comando.
