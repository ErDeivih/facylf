/** Utilidades mínimas de HTML para los adaptadores (sin dependencias). */
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  // Las del castellano y el catalán, que muchas webs viejas escriben con nombre (02/10/2026: «S&aacute;b»).
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', egrave: 'è', ograve: 'ò', Agrave: 'À', Egrave: 'È', Ograve: 'Ò', uuml: 'ü', Uuml: 'Ü', iuml: 'ï',
  ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç', ordf: 'ª', ordm: 'º', iexcl: '¡', iquest: '¿', middot: '·',
  laquo: '«', raquo: '»', euro: '€', deg: '°' };
export function decodificaEntidades(t) {
  return String(t ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? ENTIDADES[n.toLowerCase()] ?? m);
}
/** Texto plano: sin etiquetas, entidades resueltas y espacios colapsados. */
export function limpia(t) {
  return decodificaEntidades(String(t ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
