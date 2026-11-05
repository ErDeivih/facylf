/**
 * Piezas puras del recolector de escudos de federación (`scripts/escudos-federacion.mjs`).
 *
 * Están aquí, y no dentro del script, para poder probarlas sin red ni base de datos: qué es una imagen
 * de verdad, qué URL se puede pedir, qué logo del HTML merece la pena y qué federación no se toca.
 *
 * ── POR QUÉ SE MIRA LA FIRMA Y NO EL `Content-Type` ───────────────────────────────────────────────────
 *
 * Un portal que devuelve una página de error con `200` y `Content-Type: image/png` existe (y es lo
 * normal cuando un WAF bloquea). Guardar esos bytes en la base sería guardar basura que luego la web
 * serviría como imagen rota. Los primeros bytes no mienten.
 *
 * ── POR QUÉ EL TOPE DE TAMAÑO ESTÁ AQUÍ ───────────────────────────────────────────────────────────────
 *
 * Un escudo de federación se enseña a 56×56. Un PNG de 4 MB no aporta nada y sí cuesta disco y ancho de
 * banda; el encargo fija 512 KB y esta constante es la única fuente de ese número.
 */

/** El recolector se identifica siempre: las webs tienen que poder saber quién las pide. */
export const BOT_UA = 'FacylfBot/1.0';

/** Tope duro del fichero que se guarda. */
export const TAMANO_MAXIMO = 512 * 1024;

/** Tamaño mínimo: por debajo de esto no es un logo, es un píxel de seguimiento o un error vacío. */
export const TAMANO_MINIMO = 200;

/** Formatos que admite `core.federation_asset` (mismo check que la tabla). */
export const MIME_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

/** Extensiones que no se proponen siquiera: no son formatos admitidos. */
const EXTENSION_NO_ADMITIDA = /\.(?:ico|cur|bmp|gif|tiff?|avif|heic|heif)$/i;

/** Pistas de que una imagen es el logo/escudo y no un banner o una foto. */
const PISTA_LOGO = /logo|logotipo|escudo|crest|shield|imagen[-_\s]?corporativa|corporativ|marca/i;

/** Ruido que no se pide nunca: píxeles de seguimiento y espaciadores. */
const RUIDO = /pixel|spacer|blank|transparent|1x1|tracking|analytics|estadistic/i;

/** Convierte cualquier entrada razonable en bytes; `null` si no hay nada que mirar. */
function aBytes(entrada) {
  if (entrada === null || entrada === undefined) return null;
  if (entrada instanceof Uint8Array) return entrada;
  if (typeof entrada === 'string') return new TextEncoder().encode(entrada);
  return null;
}

/**
 * Tipo real de la imagen por su firma. `null` si no es uno de los cuatro admitidos.
 *
 * El SVG se reconoce por texto al principio del fichero (con BOM, prólogo XML, doctype o comentarios
 * delante), no por contener `<svg>` en cualquier parte: un HTML con un `<svg>` incrustado no es un SVG.
 */
export function detectaMimeImagen(entrada) {
  const bytes = aBytes(entrada);
  if (bytes === null || bytes.length < 8) {
    // Algunos SVG mínimos pueden tener menos de 8 bytes, pero no son un logo: se descartan.
    if (bytes === null) return null;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12) {
    const cabecera = new TextDecoder().decode(bytes.subarray(0, 12));
    if (cabecera.slice(0, 4) === 'RIFF' && cabecera.slice(8, 12) === 'WEBP') return 'image/webp';
  }
  const texto = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 2048));
  // BOM, espacios, prólogo XML, doctype y comentarios delante del elemento raíz.
  if (/^\ufeff?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype[\s\S]*?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(texto)) {
    return 'image/svg+xml';
  }
  return null;
}

/**
 * URL absoluta y válida de una imagen, o `null`.
 *
 * Se resuelve contra la URL REAL de la página (la de después de las redirecciones) y se exige http(s):
 * `data:`, `javascript:` y `mailto:` no se piden jamás. Las entidades HTML del atributo (`&amp;`) se
 * deshacen, porque un `&amp;` dentro de una URL no es un parámetro.
 */
export function resuelveUrlImagen(src, urlBase) {
  const limpio = String(src ?? '').trim().replace(/&amp;/g, '&');
  if (limpio === '' || urlBase === null || urlBase === undefined || String(urlBase).trim() === '') return null;
  if (/^(?:data|javascript|mailto|tel|blob|about):/i.test(limpio)) return null;
  let url;
  try {
    url = new URL(limpio, String(urlBase));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Un `#fragmento` en una imagen no sirve de nada y ensucia la huella de la fuente.
  url.hash = '';
  return url.href;
}

/** Atributos de una etiqueta HTML, sin necesitar un parser completo. */
function atributos(etiqueta) {
  const salida = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
  let m;
  while ((m = re.exec(etiqueta)) !== null) {
    salida[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
  }
  return salida;
}

/** Peso de una pista de tamaño (`sizes="192x192"`): 192; `any` se queda en 0. */
function ladoDeSizes(sizes) {
  const m = /(\d+)\s*[xX]\s*(\d+)/.exec(String(sizes ?? ''));
  return m ? Math.max(Number(m[1]), Number(m[2])) : 0;
}

/**
 * Candidatos a logo/escudo del portal, en orden de preferencia y sin repetir URL.
 *
 * Orden: primero las `<img>` que se anuncian como logo o escudo (suelen ser el logo grande y a color);
 * después los iconos del sitio, con los `apple-touch-icon` y los de mayor tamaño delante (un favicon de
 * 16 px no se ve a 56 px). Se descartan `.ico` y los píxeles de seguimiento.
 *
 * Devuelve `{ url, motivo }[]`. Una lista vacía significa «este HTML no trae logo», y es una respuesta
 * legítima: el script lo informa y sigue, no se inventa una URL.
 */
export function extraeCandidatosLogo(html, urlBase) {
  const texto = String(html ?? '');
  if (texto === '' || urlBase === null || urlBase === undefined) return [];
  const encontrados = [];
  const vistos = new Set();
  const anade = (src, motivo, peso = 0) => {
    const url = resuelveUrlImagen(src, urlBase);
    if (url === null || vistos.has(url)) return;
    const pathname = new URL(url).pathname;
    if (EXTENSION_NO_ADMITIDA.test(pathname)) return;
    vistos.add(url);
    encontrados.push({ url, motivo, peso });
  };

  const imgs = [];
  for (const m of texto.matchAll(/<img\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const src = a.src ?? a['data-src'] ?? a['data-original'] ?? '';
    if (src === '') continue;
    const pista = `${a.alt ?? ''} ${a.class ?? ''} ${a.title ?? ''} ${a.id ?? ''} ${src}`;
    if (!PISTA_LOGO.test(pista)) continue;
    if (RUIDO.test(pista)) continue;
    const lado = Math.max(Number(a.width ?? 0) || 0, Number(a.height ?? 0) || 0);
    if (lado === 1) continue;
    imgs.push({ src, lado });
  }
  for (const img of imgs.sort((a, b) => b.lado - a.lado)) {
    anade(img.src, 'imagen del portal con logo o escudo', 1_000 + img.lado);
  }

  const iconos = [];
  for (const m of texto.matchAll(/<link\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const rel = String(a.rel ?? '').toLowerCase();
    if (!/icon/.test(rel)) continue;
    const peso = (/apple-touch-icon/.test(rel) ? 10_000 : 0) + ladoDeSizes(a.sizes);
    iconos.push({ src: a.href ?? '', peso });
  }
  for (const icono of iconos.sort((a, b) => b.peso - a.peso)) {
    anade(icono.src, 'icono del portal de la federación', icono.peso);
  }

  return encontrados.map(({ url, motivo }) => ({ url, motivo }));
}

/**
 * Candidatos a logo de la FEDERACIÓN en la cabecera de una página suya.
 *
 * Se usa cuando el portal no se puede leer directamente (PNFG exige una cookie de sesión que un
 * cliente sin navegador no acepta: devuelve una página de 117 bytes con «No se ha aceptado el cookie»).
 * En ese caso el logo está en el HTML que el recolector YA archivó de esa misma web, y se recupera de
 * ahí con su procedencia. No se esquiva nada: no se pide la página con credenciales ni se reintenta.
 *
 * Se descartan los `escudo_widget` (son los escudos de los equipos, no el de la federación) y se
 * prefiere lo que se anuncia como logo de cabecera. Devuelve `{ url, motivo }[]`.
 */
export function extraeLogoDeCabecera(html, urlBase) {
  const texto = String(html ?? '');
  if (texto === '' || urlBase === null || urlBase === undefined) return [];
  const candidatos = [];
  const vistos = new Set();
  for (const m of texto.matchAll(/<img\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const src = a.src ?? a['data-src'] ?? '';
    if (src === '') continue;
    const pista = `${a.alt ?? ''} ${a.class ?? ''} ${a.title ?? ''} ${a.id ?? ''} ${src}`;
    if (/escudo_widget/i.test(pista)) continue;
    if (!/logo/i.test(pista)) continue;
    if (RUIDO.test(pista)) continue;
    const url = resuelveUrlImagen(src, urlBase);
    if (url === null || vistos.has(url)) continue;
    if (EXTENSION_NO_ADMITIDA.test(new URL(url).pathname)) continue;
    vistos.add(url);
    const esCabecera = /cabecera|header|top|brand/i.test(pista) ? 2 : 0;
    const esLogo = /logo/i.test(pista) ? 1 : 0;
    candidatos.push({ url, motivo: 'logo de la cabecera del portal de la federación', peso: esCabecera + esLogo });
  }
  return candidatos.sort((a, b) => b.peso - a.peso).map(({ url, motivo }) => ({ url, motivo }));
}

/**
 * Dominio «de sitio» de una URL: las dos últimas etiquetas del host, sin el `www.`.
 *
 * Es lo que permite comprobar que el logo que se va a guardar pertenece a la federación que se está
 * tratando y no a otra: en el modo `--desde-archivo` la página sale de un fichero del disco y una
 * carpeta mal elegida podría tener el logo de otra federación. Comparar el dominio lo detecta.
 */
function dominioDeSitio(hostname) {
  const etiquetas = String(hostname ?? '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (etiquetas.length < 2) return '';
  return etiquetas.slice(-2).join('.');
}

/**
 * ¿La URL de la imagen es del mismo sitio que el portal de la federación?
 *
 * `www.rfcylf.es` y `files.rfcylf.es` son el mismo sitio; `rfcylf.es` y `rfaf.es` no. Se usa para no
 * guardar el escudo de una federación en otra por un archivo mal emparejado.
 */
export function esDelMismoSitio(url, portalUrl) {
  let imagen;
  let portal;
  try {
    imagen = new URL(String(url));
    portal = new URL(String(portalUrl));
  } catch {
    return false;
  }
  const a = dominioDeSitio(imagen.hostname);
  const b = dominioDeSitio(portal.hostname);
  return a !== '' && a === b;
}

/**
 * ¿Se puede aceptar este logo como de esta federación?
 *
 * Vale si es del mismo sitio que el portal. Y también si, aun estando en otro host (las federaciones
 * PNFG sirven las imágenes desde un CDN compartido tipo `filesalgo.filesnovanet.es`), el HTML archivado
 * nombra el dominio del portal: eso prueba que la página es de la federación que se está tratando y no
 * de otra. Es la comprobación que evita el fallo real del primer intento (guardar el logo de CyL en
 * diecinueve federaciones por leer el archivo equivocado), sin rechazar los logos legítimos del CDN.
 */
export function esDelSitioDelPortal(url, portalUrl, html) {
  if (esDelMismoSitio(url, portalUrl)) return true;
  let host;
  try {
    host = new URL(String(portalUrl)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return host !== '' && String(html ?? '').toLowerCase().includes(host);
}

/** Códigos de las federaciones de pruebas del entorno: no son federaciones reales y no se piden. */
const CODIGO_DE_PRUEBA = /^pruebas?(?:\b|-|$)/i;

/** Hosts que son ejemplos o locales: pedirles un escudo no tiene sentido. */
const HOST_DE_EJEMPLO = /^(?:localhost|127\.0\.0\.1|\[::1\])$/i;
const DOMINIO_DE_EJEMPLO = /(?:^|\.)(?:ejemplo\.(?:test|com|es|org)|example\.(?:test|com|org)|test)$/i;

/**
 * ¿Es una federación a la que se le puede pedir el escudo?
 *
 * Se quedan fuera las de pruebas (código `pruebas…` o portal de ejemplo), las que no tienen portal y
 * las que lo tienen con un esquema que no es http(s). Una federación sin portal no se inventa: no hay
 * a dónde pedir.
 */
export function esFederacionObjetivo(fila) {
  const codigo = String(fila?.codigo ?? '').trim();
  const portal = String(fila?.portal_url ?? '').trim();
  if (codigo === '' || portal === '') return false;
  if (CODIGO_DE_PRUEBA.test(codigo)) return false;
  let url;
  try {
    url = new URL(portal);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (HOST_DE_EJEMPLO.test(url.hostname) || DOMINIO_DE_EJEMPLO.test(url.hostname)) return false;
  return true;
}
