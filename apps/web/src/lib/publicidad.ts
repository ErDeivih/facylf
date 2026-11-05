/**
 * Los huecos de publicidad y su estado, en un solo sitio.
 *
 * ── POR QUÉ ESTO ES UN FICHERO Y NO UNA CONSULTA ──────────────────────────────────────────────────
 *
 * `app.espacio_anuncio` y `app.campana_anuncio` sólo son legibles con el rol `facylf_app`, que la web
 * reserva a las páginas con sesión (y la pantalla de administración). La web pública lee con
 * `facylf_lector`, que no tiene permiso sobre esas tablas, y abrir un privilegio nuevo exigiría una
 * migración, que no entra en este encargo. Por eso la página pública de publicidad es **informativa**:
 * cuenta el diseño y el estado comprobado en el canónico el 05/11/2026, y no finge campañas que no
 * existen.
 *
 * Estado comprobado ese día (rol de administración, sólo lectura):
 *  · 7 huecos en `app.espacio_anuncio`, todos con proveedor `ninguno` y `activo = false`;
 *  · 0 filas en `app.campana_anuncio`;
 *  · 0 impresiones, 0 vistas y 0 clics en `ops.anuncio_dia`.
 *
 * Los datos de los huecos son los que dejó la migración 0033 (código, página, posición y formato).
 * Si algún día se contrata un patrocinio, esta página tendrá que leerlo de una vista pública o de una
 * API; mientras tanto, dice la verdad: no hay espacios contratados.
 */

/** Un hueco publicitario con su nombre legible, la página donde va y su estado. */
export type HuecoPublicitario = {
  codigo: string;
  /** Nombre corto para la tabla. */
  nombre: string;
  /** Páginas donde se pinta, en palabras. */
  paginas: string;
  /** Formato publicado por la migración 0033. */
  formato: string;
  /** Nombre del formato en palabras (300×250, nativo, barra inferior…). */
  formatoTexto: string;
  posicion: string;
  /** `apagado` = no se sirve nada en este hueco. Hoy los siete lo están. */
  estado: 'apagado';
};

/** Los siete huecos que existen en el canónico, tal y como los dejó la migración 0033. */
export const HUECOS_PUBLICITARIOS: readonly HuecoPublicitario[] = [
  {
    codigo: 'inicio-entre-secciones',
    nombre: 'Inicio · entre secciones',
    paginas: 'Inicio',
    formato: 'nativo',
    formatoTexto: 'Nativo',
    posicion: 'entre-secciones',
    estado: 'apagado',
  },
  {
    codigo: 'competicion-lateral',
    nombre: 'Lateral · competición',
    paginas: 'Competición, sólo escritorio',
    formato: 'media_pagina_300x600',
    formatoTexto: '300 × 600',
    posicion: 'lateral',
    estado: 'apagado',
  },
  {
    codigo: 'competicion-entre-jornadas',
    nombre: 'Entre bloques · competición',
    paginas: 'Competición',
    formato: 'rectangulo_300x250',
    formatoTexto: '300 × 250',
    posicion: 'entre-secciones',
    estado: 'apagado',
  },
  {
    codigo: 'acta-pie',
    nombre: 'Pie del acta',
    paginas: 'Actas de adultos',
    formato: 'banner_728x90',
    formatoTexto: '728 × 90 · 320 × 100 en móvil',
    posicion: 'pie',
    estado: 'apagado',
  },
  {
    codigo: 'equipo-entre-secciones',
    nombre: 'Entre secciones · equipo',
    paginas: 'Ficha de equipo',
    formato: 'rectangulo_300x250',
    formatoTexto: '300 × 250',
    posicion: 'entre-secciones',
    estado: 'apagado',
  },
  {
    codigo: 'rankings-entre-filas',
    nombre: 'Entre filas · rankings',
    paginas: 'Rankings',
    formato: 'nativo',
    formatoTexto: 'Nativo, fuera de la tabla',
    posicion: 'entre-secciones',
    estado: 'apagado',
  },
  {
    codigo: 'movil-ancla',
    nombre: 'Ancla móvil',
    paginas: 'Todas, sólo móvil',
    formato: 'ancla_movil',
    formatoTexto: 'Barra inferior cerrable',
    posicion: 'ancla-movil',
    estado: 'apagado',
  },
];

/** El estado de la publicidad hoy: sin espacios contratados y todo apagado. */
export const ESTADO_DE_PUBLICIDAD = {
  /** Fecha de la comprobación contra el canónico. */
  comprobadoEl: '05/11/2026',
  espaciosContratados: 0,
  campanas: 0,
  /** Los siete huecos están apagados: no se sirve ninguna publicidad. */
  encendida: false,
} as const;

/** Dónde NO va nada. Se enseña porque es la regla que más importa al visitante. */
export const REGLAS_DE_PUBLICIDAD: readonly string[] = [
  'Nunca hay publicidad en páginas con datos de menores, en el acceso, en el registro, en la cuenta ni en la administración.',
  'Los planes Ojeador y Analista no ven publicidad.',
  'Sin consentimiento no se serviría publicidad personalizada: como mucho, anuncios no personalizados.',
  'Nada de publicidad dentro de una tabla, un formulario o un listado de partidos.',
  'Cada hueco reserva su alto antes de cargar, para que la página no salte.',
  'En móvil, como mucho un hueco por pantalla y una barra inferior que se puede cerrar.',
];

/**
 * Lo que tendría que cumplirse antes de encender publicidad. No es una lista de estado del panel:
 * es el compromiso público de lo que se exigirá. Hoy no hay ninguna campaña.
 */
export const REQUISITOS_PARA_ANUNCIOS: readonly string[] = [
  'Consentimiento de cookies certificado, con «Aceptar» y «Rechazar» en la primera capa.',
  'Política de privacidad y de cookies que nombre a los terceros que intervengan.',
  'Fichero ads.txt en la raíz del dominio.',
  'Revisión jurídica de los datos de menores antes de que nada sea público.',
  'Medición sin cookies y sin seguimiento de personas.',
];

/** Los formatos que se pueden usar, en palabras (para la leyenda del esquema). */
export const FORMATOS_DE_HUECO: readonly string[] = [
  'Nativo',
  '300 × 250',
  '300 × 600',
  '728 × 90',
  '320 × 100 en móvil',
  'Barra inferior cerrable',
];
