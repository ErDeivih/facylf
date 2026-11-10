# Despliegue de Fondo Popular

## Dos cosas distintas (no confundirlas)

| Qué | URL | Qué es |
|---|---|---|
| **Demo pública** | **https://erdeivih.github.io/fondo-popular-demo/** | Foto **estática** de la web, generada desde la app. **Solo enseña la temporada 2026-27**. No tiene API ni base de datos detrás: las páginas y los escudos son ficheros del propio sitio. Sirve para que cualquiera vea la web sin abrir nada. |
| **App completa (local)** | `http://127.0.0.1:3001` en el PC · y por túnel, en el servidor propio | La aplicación real: todas las temporadas del canónico, búsqueda, selector con filtros, actas, historial, panel. Es la que se usa para trabajar. |

La demo se regenera con `node scripts/claude/espeja-para-pages.mjs` (ver más abajo) y **no es la app**: si algo no aparece en
la demo, primero se comprueba en la app completa. Las dos se llaman igual (Fondo Popular) pero tienen alcances
distintos; cuando se hable de «la web», conviene decir cuál.

Actualizado: 10/11/2026. **URL pública: <https://erdeivih.github.io/fondo-popular-demo/>**

## Lo que hay publicado (y lo que es)

GitHub Pages **no ejecuta Next.js ni PostgreSQL**: solo sirve ficheros estáticos. Lo publicado es una **foto
estática** de la web real, generada desde la aplicación que corre en el equipo propio y lee la base
`facylf_canonico_3` del servidor. Las páginas llevan **datos reales de Castilla y León** (resultados, clasificación,
actas, historiales), no maquetas.

| Pieza | Dónde está | Estado |
|---|---|---|
| **Web (foto estática)** | GitHub Pages · repo público `ErDeivih/fondo-popular-demo` · <https://erdeivih.github.io/fondo-popular-demo/> | **publicada y comprobada** |
| **Web completa (dinámica)** | Equipo propio (PC), Next 16 en el puerto 3001, lee `facylf_canonico_3` por túnel SSH | en marcha, con URL efímera de quick tunnel |
| **API (`/api/v1`) y base de datos** | Servidor propio (`facylf-postgres`), sólo accesible por Tailscale / túnel | privada, sin exposición a Internet |
| **Canónico publicado** | `facylf_canonico_3` (29 GB), copia exacta del canónico del PC de las 23:20 del 09/11 | cotejada: 98 tablas · 116.986.467 filas · 0 diferencias |

### Páginas publicadas (todas responden 200 con datos reales)

`/` · `/explorar/competiciones` · `/explorar/competicion/44` · `…/jornadas` · `…/jornada/1` · `…/calendario` ·
`…/estadisticas` · `/explorar/acta/2000559` · `/explorar/jugador/19057/historial` · `/explorar/federacion/castilla-leon` ·
`/explorar/rankings` · `/explorar/estadisticas`.

Comprobado el 10/11/2026: la jornada enseña marcadores reales (9-4, 1-6, 1-4…), la clasificación con puntos y el
acta con alineaciones, goles, árbitro y tarjetas; los escudos reales (71) y el fallback de iniciales (110) cargan
desde el propio sitio; CSS, JS y fuentes del build también.

### Límites de la foto estática (dichos, no escondidos)

- **No hay navegación completa**: los enlaces a páginas que no están en la foto dan 404 en GitHub Pages. La web
  completa (dinámica) sigue en el equipo propio.
- **No hay cuentas, administración ni API**: `/api/v1`, `/entrar`, `/mi-panel` y `/admin` no se publican.
- **Los datos son una foto** del 09/11 a las 23:20. Para refrescarla hay que regenerarla (abajo).
- `robots.txt` bloquea a los buscadores: es una demostración pública, no la publicación definitiva.

## Cómo se regenera y se publica (sin esperar a nadie)

La aplicación tiene que estar sirviendo en `http://127.0.0.1:3001` (ver `tmp\sirve-web-servidor.ps1`, que arranca el
túnel SSH a la base y la web). Después:

```powershell
node scripts\claude\espeja-para-pages.mjs http://127.0.0.1:3001 tmp/site-pages /fondo-popular-demo
cd tmp\site-pages
git add -A ; git -c user.email=agente@facylf.local -c user.name="Agente FACyLF" commit -m "Fondo Popular: refresco de la foto"
git push origin main
```

GitHub Pages reconstruye solo en ~1 minuto. El repositorio de la foto es `ErDeivih/fondo-popular-demo`
(público, creado con `gh`); la web publicada usa el prefijo `/fondo-popular-demo/` y el script reescribe enlaces y
descarga los escudos para que no dependan de la API.

## Lo que necesitaría David (sudo / DNS / cuentas)

Nada de esto hace falta para la URL actual; son los pasos para pasar de foto a **producción con dominio**:

1. **Dominio propio** (comprarlo, p. ej. `fondopopular.es`).
2. **Opción A · GitHub Pages con dominio**: en el repo de la foto, Settings → Pages → Custom domain, y en el DNS
   del dominio:
   - `CNAME www → erdeivih.github.io`
   - cuatro registros `A @ → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153`
   - luego marcar «Enforce HTTPS». (No necesita sudo: es panel de GitHub + panel del registrador.)
3. **Opción B · web dinámica en el servidor propio** (la buena para producción):
   - activar **Tailscale Funnel** en el panel (enlace de un clic `https://login.tailscale.com/f/funnel?node=njbseLxAqx11CNTRL`),
     y quedará `https://desktop-7j6lbk4.tail4263a0.ts.net` sirviendo la web del PC con base de datos real y API;
   - o **Cloudflare Tunnel con dominio** (cuenta gratuita) apuntando a la web del equipo propio.
   - **DNS del servidor**: ya resuelto el 09/11 con sudo (`nmcli` + `/etc/resolv.conf`); si se reinicia la red y
     vuelve a perder, el bloque exacto está en `docs/CUENTAS-Y-ACCESOS.md`.
4. **Textos legales** (aviso legal, privacidad y cookies) con nombre, NIF y domicilio del titular, y la decisión
   sobre La Preferente (D2-bis). Sin eso no se abre al público con dominio propio.

## Comprobación rápida de que sigue en pie

```powershell
(Invoke-WebRequest -Uri 'https://erdeivih.github.io/fondo-popular-demo/explorar/competicion/44/jornadas/' -UseBasicParsing).StatusCode  # 200
```

## App real publicada (túnel temporal, 10/11/2026)

La app completa está disponible por **https://ringtones-studies-plastic-assumptions.trycloudflare.com** mientras se decide el dominio propio. Es un túnel rápido de Cloudflare (cloudflared tunnel --url http://127.0.0.1:3001, sin cuenta ni DNS): la URL **cambia cada vez que se reinicia** el túnel, así que sirve para enseñar el producto, no como dirección definitiva.

Comprobado por HTTP: portada 1,2 s, selector 285 ms, competición 479 ms (clasificación, 19 filas), jornada 450 ms (36 resultados y árbitros), acta 341 ms (cronología, alineaciones, 196 nombres), ficha de equipo 299 ms, historial de jugador 729 ms, rankings 646 ms, y /api/v1 231 ms. En la app real **sí funcionan las fichas de equipo y los rankings**; es la demo estática la que no los lleva (sus enlaces daban 404 y su listado se cargaba por JavaScript).

Para levantarla de nuevo: 	mp\cloudflared.exe tunnel --url http://127.0.0.1:3001 --no-autoupdate, con la app sirviendo en el 3001 (	mp\sirve-web-servidor.ps1, base acylf_canonico_4).
