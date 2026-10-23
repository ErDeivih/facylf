/*
 * ── CUANDO UN EQUIPO NO SE PUEDE CONSULTAR ───────────────────────────────────────────────────────────
 *
 * Antes, cualquier motivo acababa en \`{"error":"No se pudo consultar o descargar el informe."}\` en crudo:
 * el entrenador no sabía si el equipo no existía, si su temporada estaba a medias o si era de otra
 * federación. Aquí el motivo viaja tipado desde la consulta hasta la página.
 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class InformeNoConsultable extends Error {
  /** @param {{status:number, titulo:string, detalle?:string}} datos */
  constructor({ status, titulo, detalle = '' }) {
    super(titulo);
    this.name = 'InformeNoConsultable';
    this.status = status;
    this.titulo = titulo;
    this.detalle = detalle;
  }
}

/** Página corta y legible, sin identificadores internos ni trazas. */
export function paginaNoConsultable({ titulo, detalle = '' }) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titulo)} · Observatorio</title>
<style>body{margin:0;font:16px/1.55 system-ui,sans-serif;color:#16303d;background:#f1f4f6}main{max-width:640px;margin:10vh auto;padding:0 20px}
.card{background:#fff;border:1px solid #dce3e8;border-radius:14px;padding:26px}h1{font-size:24px;margin:0 0 10px}p{margin:8px 0}.muted{color:#607381;font-size:14px}a{color:#087e83;font-weight:700}</style>
<main><div class="card"><h1>${esc(titulo)}</h1>${detalle ? `<p>${esc(detalle)}</p>` : ''}
<p class="muted">No es un fallo del informe: con los datos disponibles hoy no se puede elaborar sin que las cifras mientan.</p>
<p><a href="/">← Buscar otro equipo</a></p></div></main></html>`;
}

/** Traduce cualquier error del servidor a código HTTP y cuerpo. Los no previstos no enseñan su mensaje. */
export function respuestaDeError(error) {
  if (error instanceof InformeNoConsultable) return { status: error.status, html: paginaNoConsultable(error) };
  if (error instanceof URIError) return { status: 400, html: paginaNoConsultable({ titulo: 'Dirección no válida', detalle: 'La dirección contiene caracteres que no se pueden interpretar.' }) };
  if (error?.killed || error?.signal === 'SIGTERM' || /timeout|tiempo/i.test(String(error?.message))) {
    return { status: 504, html: paginaNoConsultable({ titulo: 'La consulta ha tardado demasiado', detalle: 'La base está ocupada (probablemente importando). Vuelve a intentarlo en unos minutos.' }) };
  }
  return { status: 500, html: paginaNoConsultable({ titulo: 'No se pudo consultar el informe', detalle: 'Error inesperado. Consulta el registro del servicio para ver la causa.' }) };
}
