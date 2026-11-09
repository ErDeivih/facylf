# Cuentas y accesos · lo que solo puede hacer David

Actualizado: 09/11/2026 18:50. **Fondo Popular está sirviendo datos reales en una URL pública provisional.**
Este documento dice qué está en marcha, cómo se para, y qué cuentas o permisos hacen falta para que la URL sea
estable y el producto publicable.

## 1 · Lo que hay ahora mismo en marcha (PC de David)

| Pieza | Dónde | Cómo se arranca | Cómo se para |
|---|---|---|---|
| **Web Fondo Popular** (Next 16, build del 06/11) | PC, `127.0.0.1:3001`, lee el canónico del PC con `facylf_lector` | `cd apps\web` + `node node_modules\next\dist\bin\next start -p 3001` con `DATABASE_URL_LECTOR` del `.env` | cerrar el proceso `next start` |
| **Túnel publico** (Cloudflare quick tunnel, sin cuenta) | PC, `tmp\cloudflared.exe` | `tmp\cloudflared.exe tunnel --url http://127.0.0.1:3001 --no-autoupdate` | cerrar el proceso `cloudflared` |
| **Canónico** que sirve la web | PostgreSQL del PC (`facylf-postgres`, 127.0.0.1:5433) | Docker Desktop | `docker compose -f infra/docker-compose.yml down` |

**URL pública de hoy:** `https://algorithm-infinite-sessions-assumed.trycloudflare.com`

> **Aviso honesto:** el quick tunnel es para probar, no para producción. La URL **cambia cada vez que se reinicia
> `cloudflared`** y Cloudflare no lo da como servicio estable. Para una URL fija hace falta el paso 2.

Comprobado por HTTP contra esa URL (09/11 18:48): `/`, `/explorar/competiciones`, `/explorar/competicion/44`,
`/jornadas`, `/jornada/1`, `/calendario`, `/estadisticas`, `/explorar/acta/2000559` y
`/explorar/federacion/castilla-leon` responden **200** con marcadores reales (9-4, 1-6…), clasificación con puntos y
actas con alineaciones, goles, árbitro y tarjetas. `/api/v1/indice` da 404: la compilación desplegada es del 06/11 y
no incluye la API; se arregla reconstruyendo la web (paso 3).

## 2 · Para que la URL sea fija y gratuita: activar Tailscale Funnel (2 minutos, solo David)

Intenté `tailscale funnel 3001` y el tailnet lo tiene **desactivado**. El propio comando da el enlace:

1. Abrir **https://login.tailscale.com/f/funnel?node=njbseLxAqx11CNTRL** y activar *Funnel* para el nodo
   `desktop-7j6lbk4` (cuenta de Tailscale que ya existe; no hay que crear nada nuevo ni pagar).
2. Avisar para repetir el comando. Quedaría una URL fija
   `https://desktop-7j6lbk4.tail4263a0.ts.net` sirviendo la web del PC.
3. Alternativa equivalente: activar Funnel para el servidor (`100.117.58.93`) cuando la web nueva esté allí.

## 3 · Cuentas de alojamiento (solo si se quiere sacar del PC)

| Opción | Qué haría falta | Coste | Cuándo |
|---|---|---|---|
| **Seguir en el PC + Funnel** | solo el paso 2 (cuenta ya existente) | **0 €** | ahora, para enseñarlo |
| **Servidor propio + Cloudflare Tunnel con dominio** | cuenta Cloudflare (gratis) + dominio | dominio (~10 €/año, precio a confirmar) | cuando haya que enseñarlo con nombre propio |
| **VPS dedicado** (Hetzner CX33 o superior) | cuenta + tarjeta | ~9 €/mes IVA aparte | cuando haya usuarios fuera de casa |
| PaaS (Vercel+Neon, Railway, Fly.io) | cuenta + tarjeta | gratis no cabe: la base de CyL sola son ~2,4 GB | **descartado** |

Detalle y mediciones en [`docs/plataforma-web/DESPLIEGUE-FONDO-POPULAR.md`](plataforma-web/DESPLIEGUE-FONDO-POPULAR.md).

## 4 · Cuentas y datos que solo tiene David (para publicar de verdad)

1. **Dominio**: elegir nombre y comprarlo (o decir que se usa el subdominio de Tailscale).
2. **Aviso legal, privacidad y cookies**: hacen falta **nombre, NIF y domicilio del titular** (están en
   `F:\Proyectos\ProyectoServidor\aprender\docs\LEGAL-PENDIENTE.md`). Sin eso no se abre al público.
3. **Decisión D2-bis (La Preferente)**: se publica marcado «no oficial» o se queda en la web interna. Su volcado
   viaja con RLS que lo oculta al rol de la web; si se publica, hay que decidirlo y aplicarlo.
4. **`sudo` en el servidor**: el host no resuelve DNS (`getent hosts github.com` falla) y la base está en la
   migración 0015 de 60. Hace falta para arreglar DNS y migrar, si se elige la vía del servidor.
5. **Cuenta de Cloudflare** (gratis) solo si se quiere túnel con dominio propio en vez de Funnel.

## 5 · Lo que no hay que hacer

- No abrir PostgreSQL a Internet en ningún caso: la web consulta con `facylf_lector` desde la misma red.
- No publicar la base del servidor sin migrarla antes (le faltan 53 de 78 referencias que usa la web nueva).
- No usar el quick tunnel como dirección definitiva: la URL es efímera.
