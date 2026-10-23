# Publicidad en una web: cómo funciona, dónde se pone y cómo se administra

> Guía para aprender (David, 22/10/2026), aplicada a facylf pero válida para otros proyectos. **Hoy facylf
> no lleva anuncios** y no debería llevarlos mientras sea privada: está detrás de un login, muestra datos de
> partidos de menores y no tiene audiencia abierta. La migración 0033 deja los huecos y la administración
> preparados y **apagados** (proveedor «ninguno»), por si un día cambia.

## 1. Las dos caras: ganar con anuncios o pagar por anuncios

| Quiero… | Herramienta | Qué es |
|---|---|---|
| **Ganar dinero** enseñando anuncios en mi web | Google **AdSense** | Pegas un código; Google subasta el hueco entre anunciantes y te paga. Lo más sencillo. |
| | Google **Ad Manager** (+ Prebid) | Servidor de anuncios profesional: mezcla AdSense/AdX, otras redes que pujan a la vez («header bidding») y patrocinios vendidos por ti. Para cuando hay mucho tráfico. |
| | Redes gestionadas (Ezoic, Raptive, Mediavine…) | Lo hacen por ti a cambio de una parte; muchas piden un mínimo de visitas. |
| | **Patrocinio directo** | Vendes tú el espacio a un comercio o marca (p. ej. una tienda de deportes en las páginas de su liga). Sin terceros ni cookies. |
| **Gastar dinero** para que me conozcan | Google **Ads**, **Meta Ads** (Facebook e Instagram) | Compras anuncios en sus redes para traer usuarios a tu web. |

**Meta no sirve para monetizar una web**: su red para editores (Audience Network) dejó de servir anuncios en
webs móviles y en vídeo en 2020 y hoy es sólo para aplicaciones. Meta Ads es para **promocionar** (con el
píxel de Meta o su API de conversiones para medir registros, siempre con consentimiento).

## 2. Google AdSense, paso a paso

1. **Requisitos**: dominio propio, contenido original y útil accesible, política de privacidad y de cookies,
   y que el rastreador de Google pueda ver las páginas. Si están detrás de un login hay que darle un usuario
   («inicio de sesión del rastreador» en AdSense); sin eso, no sabe qué anuncios poner.
2. **Alta**: cuenta en AdSense con los datos fiscales y bancarios → añadir el sitio → pegar el código en el
   `<head>` → Google revisa el sitio (días o semanas).
3. **`ads.txt`** en la raíz (`https://midominio/ads.txt`) con la línea que da AdSense: dice quién está
   autorizado a vender tus anuncios y evita fraude.
4. **Consentimiento (obligatorio en Europa)**: desde el 16/01/2024 Google exige a quien use AdSense, Ad Manager
   o AdMob con visitantes del EEE, Reino Unido o Suiza un **gestor de consentimiento (CMP) certificado por Google
   e integrado con IAB TCF v2.2**. AdSense ofrece el suyo en **Privacidad y mensajes**; también valen
   Cookiebot, Usercentrics, CookieYes… Sin CMP certificado sólo se sirven anuncios no personalizados (pagan
   menos). En España, además, la **guía de cookies de la AEPD** (en vigor desde el 11/01/2024) pide que
   «Rechazar» esté en la primera capa y sea tan fácil como «Aceptar».
5. **Formatos**: «anuncios automáticos» (Google decide dónde) o **bloques** que colocas tú (recomendado: más
   control del diseño). Cada bloque tiene un `data-ad-slot`.
6. **Cobro**: desde 2024 AdSense paga por impresión y el editor se queda el **80 %** de lo que paga el anunciante
   en display (antes 68 %). Paga cuando lo acumulado supera **70 €**.
7. **Políticas** que más se incumplen: pedir clics («pulsa aquí»), anuncios que tapan contenido o se confunden
   con él, tráfico comprado de mala calidad, y contenido para menores sin marcar. Una infracción grave puede
   cerrar la cuenta.

Lo que se gana depende del país, el tema y el tráfico (RPM = ingresos por cada 1.000 páginas vistas); en webs
deportivas regionales en España suele ser poco: con pocos miles de visitas al mes, céntimos o pocos euros. El
patrocinio local suele rendir más que AdSense en un nicho como este.

## 3. Dónde poner anuncios sin estropear la web

Principios: el contenido manda; el anuncio **nunca dentro de una tabla, un formulario o una cronología**; su
hueco **reservado con alto fijo** para que la página no salte (CLS, que Google mide); carga diferida; como mucho
uno por pantalla en móvil.

| Página | Hueco (0033) | Formato | Por qué ahí |
|---|---|---|---|
| Inicio | `inicio-entre-secciones` | nativo | Entre «Explorar» y «Tus equipos» |
| Competición | `competicion-lateral` | 300x600 pegajoso (escritorio) | La clasificación es ancha; la columna derecha está libre |
| Competición | `competicion-entre-jornadas` | 300x250 | Tras la clasificación, antes del navegador de jornadas |
| Acta | `acta-pie` | 728x90 / 320x100 | Debajo de las alineaciones: no corta la lectura |
| Equipo | `equipo-entre-secciones` | 300x250 | Entre gráficos y plantilla |
| Rankings | `rankings-entre-filas` | nativo | Cada 25 filas como mucho, fuera de la tabla |
| Todas (móvil) | `movil-ancla` | barra inferior cerrable | El formato que mejor rinde en móvil |

**Nunca** en: acceso, registro, cuenta, avisos, administración, y **en fichas o listas con datos de menores**
(`app.elige_campana` lo bloquea). Los paquetes de pago (`ojeador`, `analista`) van **sin anuncios**.

## 4. Cómo se hace técnicamente (Next.js)

- Componente `<EspacioAnuncio codigo="competicion-lateral" contexto={{federacion, edicion, club}} />`:
  1. pregunta en el servidor a `app.elige_campana(...)`;
  2. si devuelve un **patrocinio directo**, pinta la imagen (servida desde el propio dominio) con
     `rel="sponsored noopener"` y la etiqueta «Publicidad», y cuenta la impresión con `ops.cuenta_anuncio`
     (el clic pasa por `/api/anuncio/clic?id=…`, que cuenta y redirige);
  3. si devuelve **AdSense**, pinta el `<ins class="adsbygoogle" data-ad-slot=…>` sólo **después** del
     consentimiento (el CMP lo indica) y en un contenedor de alto fijo;
  4. si no devuelve nada, no pinta nada (ni un hueco vacío).
- Cabeceras: la CSP tiene que permitir los dominios de Google sólo si se activa AdSense (`pagead2.googlesyndication.com`,
  `googleads.g.doubleclick.net`, `tpc.googlesyndication.com`, `fundingchoicesmessages.google.com`).
- `app/ads.txt/route.ts` devuelve el contenido guardado en `app.ajuste` (clave `ads_txt`).
- Medición propia sin cookies: impresiones y clics por día, espacio y campaña en `ops.anuncio_dia`.
  Los ingresos de AdSense se leen con su API (AdSense Management API v2) en un script diario, si se activa.

### 4b. Medición, reparto y rendimiento de la página (0042, 23/10/2026; código en `codigo/anuncio.tsx`)

- **Tres contadores**: *servidas* (el hueco llegó a un navegador), *vistas* (50 % del anuncio en pantalla
  1 segundo seguido, norma IAB/MRC: es lo que se cobra) y *clics*. CTR = clics / servidas, como AdSense.
  Los eventos llegan del navegador por `sendBeacon` a `/api/anuncio`; la base sólo los cuenta si el hueco y
  la campaña existen y casan, y una vista o un clic sin impresión servida ese día no cuentan.
- **Sin saltos de página**: qué sale se decide en el servidor; si no sale nada no se pinta nada; si sale, el
  hueco llega con su alto reservado por formato. Un AdSense sin anuncio conserva el hueco.
- **Carga diferida**: el script de AdSense se pide cuando el primer hueco está a 300 px de la pantalla y sólo
  con consentimiento (el CMP pone `window.__tcfConsentimiento`); imágenes de patrocinio con `loading="lazy"`.
- **Reparto de campañas**: 'uniforme' (por defecto: no se adelanta más de un 10 % al ritmo que toca por días)
  o 'lo antes posible', y tope diario opcional. Antes, una campaña con tope se gastaba el primer día.
- **Interruptor general**: `update ops.parametro set valor = 0 where clave = 'anuncios_encendidos'` apaga
  todos los huecos al momento (botón rojo del panel).
- **Precio**: CPM (€ por 1.000 vistas) o importe fijo por campaña. AdSense se estima con
  `adsense_rpm_estimado` (1,5 €) hasta leer su API; el informe marca la cifra como estimada.
- **Panel**: `admin-espacios-anuncio` (servidas, vistas, % visible), `admin-campanas-anuncio` (ritmo: al día,
  retrasada, adelantada; importe), `admin-informe-anuncios` (periodo, por hueco y campaña; exportable para
  facturar) y `admin-anuncios-por-dia` (serie para el gráfico). Pruebas: `pruebas/sql/m42.mjs`.

## 5. Administración (pantalla «Publicidad» del panel)

- **Espacios**: activar/desactivar cada hueco, elegir proveedor (ninguno / AdSense / directo) y el `slot`.
  Un interruptor general «sin anuncios» para apagarlo todo de golpe.
- **Patrocinios**: alta de campañas (patrocinador, imagen, enlace, huecos, federación/competición/club, fechas,
  prioridad, tope de impresiones), vista previa y pausa.
- **Informe**: impresiones, clics y CTR por espacio y campaña; ingresos de AdSense por día; páginas con más
  impresiones. Exportable para facturar a los patrocinadores.
- **Cumplimiento**: estado del CMP, `ads.txt`, aviso si un hueco está en una página con menores.

## 6. Si un día facylf fuera pública: lista de comprobación

1. Revisión jurídica de los datos de menores (sin ella, nada público).
2. Política de privacidad y de cookies, aviso legal, CMP certificado.
3. Activar primero **patrocinio directo** (sin terceros ni cookies), medir, y sólo después AdSense.
4. Activar 2-3 huecos, no todos; vigilar en la pantalla Salud que LCP y CLS no empeoran.
5. Paquete de pago sin anuncios para quien no los quiera.

Fuentes: [AdSense: requisitos de CMP certificado (CookieYes)](https://www.cookieyes.com/blog/iab-tcf-cmp-for-publishers/) ·
[Requisitos de consentimiento de Google para editores](https://support.google.com/admanager/answer/13554116) ·
[Mensajes de regulaciones europeas](https://support.google.com/admanager/answer/10076805) ·
[AdSense pasa al 80 % y al pago por impresión (PPC Land)](https://ppc.land/google-increases-adsense-rev-share-from-68-to/) ·
[Cambios de pago de AdSense (Search Engine Land)](https://searchengineland.com/google-adsense-changes-pays-publishers-434055) ·
[Umbral de pago de AdSense](https://support.google.com/adsense/answer/1709871) ·
[Rastreador de AdSense y páginas con login](https://support.google.com/adsense/answer/2381908) ·
[Cierre de Audience Network en web móvil (AdPushup)](https://www.adpushup.com/blog/facebook-audience-network-shut-down-mobile-web-and-in-stream/) ·
[Guía de cookies de la AEPD 2023 (Cuatrecasas)](https://www.cuatrecasas.com/es/global/propiedad-intelectual/art/entra-vigor-nuevo-criterio-aepd-uso-de-cookies)
