/**
 * Vocabularios medidos de la cola.
 *
 * Regla 2 del encargo y §2 de IMPORTADOR-SQLITE.md: los valores están MEDIDOS sobre la cola real, y
 * un valor que no esté aquí **detiene el lote**. No existe el destino `otro`: convertir un `tipo`
 * desconocido en `otro` es inventar, y se hace en silencio.
 */

export class ValorDesconocido extends Error {
  readonly vocabulario: string;
  readonly valor: string;
  readonly contexto: Record<string, unknown>;

  constructor(vocabulario: string, valor: string, contexto: Record<string, unknown>) {
    const fila = Object.entries(contexto).map(([k, v]) => `${k}=${String(v)}`).join(' ');
    super(`Valor desconocido de ${vocabulario}: «${valor}» (${fila}). Se añade al vocabulario con su medición antes de aceptarlo.`);
    this.name = 'ValorDesconocido';
    this.vocabulario = vocabulario;
    this.valor = valor;
    this.contexto = contexto;
  }
}

const mirar = <V>(vocabulario: string, tabla: Record<string, V>, valor: unknown, contexto: Record<string, unknown>): V => {
  const clave = String(valor ?? '').trim();
  const salida = tabla[clave];
  if (salida === undefined) throw new ValorDesconocido(vocabulario, clave, contexto);
  return salida;
};

/* ---------- participaciones.condicion → core.appearance.condition ---------- */

export type CondicionCanonica = 'starter' | 'substitute' | 'called_up_unknown';

const CONDICIONES: Record<string, CondicionCanonica> = {
  titulares: 'starter',
  suplentes: 'substitute',
  convocados: 'called_up_unknown',
};

export function condicionParticipacion(valor: unknown, contexto: Record<string, unknown>): CondicionCanonica {
  return mirar('participaciones.condicion', CONDICIONES, valor, contexto);
}

/* ---------- eventos_acta.tipo → core.match_event.event_type (+ subtipo) ---------- */

export type TipoEventoCanonico = 'gol' | 'tarjeta_amarilla' | 'tarjeta_roja' | 'entra' | 'sale' | 'otro';
export type SubtipoEventoCanonico = 'normal' | 'penalti' | 'propia_puerta' | 'doble_amarilla';

type MapeoEvento = { event_type: TipoEventoCanonico; subtipoFijo?: SubtipoEventoCanonico; admiteSubtipoDeGol: boolean };

const EVENTOS: Record<string, MapeoEvento> = {
  gol: { event_type: 'gol', admiteSubtipoDeGol: true },
  amarilla: { event_type: 'tarjeta_amarilla', admiteSubtipoDeGol: false },
  roja: { event_type: 'tarjeta_roja', admiteSubtipoDeGol: false },
  'doble-amarilla': { event_type: 'tarjeta_roja', subtipoFijo: 'doble_amarilla', admiteSubtipoDeGol: false },
  entra: { event_type: 'entra', admiteSubtipoDeGol: false },
  sale: { event_type: 'sale', admiteSubtipoDeGol: false },
};

const SUBTIPOS_GOL: Record<string, SubtipoEventoCanonico> = {
  normal: 'normal',
  penalti: 'penalti',
  'propia-puerta': 'propia_puerta',
};

export function tipoEvento(
  tipo: unknown,
  subtipo: unknown,
  contexto: Record<string, unknown>,
): { event_type: TipoEventoCanonico; subtipo: SubtipoEventoCanonico | null } {
  const mapeo = mirar('eventos_acta.tipo', EVENTOS, tipo, contexto);
  if (mapeo.subtipoFijo) return { event_type: mapeo.event_type, subtipo: mapeo.subtipoFijo };
  if (!mapeo.admiteSubtipoDeGol) return { event_type: mapeo.event_type, subtipo: null };
  // Un gol sin subtipo publicado no es «normal»: es un subtipo desconocido y va nulo.
  const crudo = String(subtipo ?? '').trim();
  if (crudo === '') return { event_type: mapeo.event_type, subtipo: null };
  return { event_type: mapeo.event_type, subtipo: mirar('eventos_acta.subtipo', SUBTIPOS_GOL, crudo, contexto) };
}

/* ---------- eventos_acta.sujeto_tipo ---------- */

export type SujetoTipoCanonico = 'jugador' | 'tecnico' | 'arbitro' | 'desconocido';

const SUJETOS: Record<string, SujetoTipoCanonico> = {
  jugador: 'jugador',
  tecnico: 'tecnico',
  arbitro: 'arbitro',
  desconocido: 'desconocido',
};

export function sujetoTipo(valor: unknown, contexto: Record<string, unknown>): SujetoTipoCanonico {
  const crudo = String(valor ?? '').trim();
  if (crudo === '') return 'desconocido';
  return mirar('eventos_acta.sujeto_tipo', SUJETOS, crudo, contexto);
}

/* ---------- lados ---------- */

export type LadoCanonico = 'local' | 'visitante';

const LADOS: Record<string, LadoCanonico> = { local: 'local', visitante: 'visitante' };

export function lado(valor: unknown, contexto: Record<string, unknown>): LadoCanonico {
  return mirar('lado', LADOS, valor, contexto);
}

export function ladoOpcional(valor: unknown, contexto: Record<string, unknown>): LadoCanonico | null {
  const crudo = String(valor ?? '').trim();
  if (crudo === '') return null;
  return lado(crudo, contexto);
}

/* ---------- actas.estado + actas.calidad → core.match_report.quality ---------- */

export type CalidadInforme = 'correct' | 'administrative' | 'review' | 'partial' | 'unavailable';

const CALIDADES: Record<string, CalidadInforme> = {
  correcta: 'correct',
  revisar: 'review',
  administrativa: 'administrative',
  parcial: 'partial',
  no_disponible: 'unavailable',
};

/**
 * Devuelve la calidad del informe o `null` cuando el acta no debe crear fila.
 *
 * §2 de IMPORTADOR-SQLITE.md: un acta `pendiente` es cobertura pendiente, NO un acta no disponible;
 * `unavailable` se reserva para cuando se ha comprobado que la fuente no la ofrece.
 */
export function calidadInforme(estado: unknown, calidad: unknown, contexto: Record<string, unknown>): CalidadInforme | null {
  const est = String(estado ?? '').trim();
  if (est === 'pendiente') return null;
  if (est === 'ausente_web') return 'unavailable';
  // `sin_datos` es el estado que el recolector pone a una ficha que la federación SÍ publica pero con
  // las tablas de alineaciones y cuerpo técnico vacías (405 fichas el 14/09/2026 en seis
  // federaciones). No es «correcta» ni «no disponible»: la fuente publica parte del acta. Ver §2 de
  // IMPORTADOR-SQLITE.md, donde está medido.
  if (est === 'sin_datos') return 'partial';
  if (est !== 'hecha') throw new ValorDesconocido('actas.estado', est, contexto);
  const cal = String(calidad ?? '').trim();
  if (cal === '') throw new ValorDesconocido('actas.calidad', '(vacío con estado hecha)', contexto);
  return mirar('actas.calidad', CALIDADES, cal, contexto);
}

/* ---------- actas.incidencias → jsonb estructurado ---------- */

export type Incidencia = { codigo: string; parametros?: string };

/**
 * `["sin_alineaciones","descuadre_goles:1/0"]` → `[{codigo:"sin_alineaciones"},{codigo:"descuadre_goles",parametros:"1/0"}]`.
 * Es una transformación de forma: el texto original se conserva íntegro en `parametros`.
 */
export function incidencias(valor: unknown): Incidencia[] {
  const crudo = String(valor ?? '').trim();
  if (crudo === '') return [];
  let lista: unknown;
  try {
    lista = JSON.parse(crudo);
  } catch {
    // Una incidencia ilegible no se tira: se conserva tal cual y se marca.
    return [{ codigo: 'incidencia_ilegible', parametros: crudo }];
  }
  if (!Array.isArray(lista)) return [{ codigo: 'incidencia_ilegible', parametros: crudo }];
  return lista.map((entrada) => {
    const texto = String(entrada ?? '');
    const corte = texto.indexOf(':');
    if (corte < 0) return { codigo: texto };
    return { codigo: texto.slice(0, corte), parametros: texto.slice(corte + 1) };
  });
}

/* ---------- club derivado del nombre del equipo ---------- */

/**
 * Regla 7: el club se deriva SÓLO quitando el sufijo de letra entrecomillada final.
 * `S.D. SAN JOSE "A"` → `S.D. SAN JOSE`. Ninguna otra transformación.
 */
export function clubDesdeNombreEquipo(nombre: string): string {
  const limpio = String(nombre ?? '').trim();
  const sinSufijo = limpio.replace(/\s*"[^"]{1,3}"\s*$/, '').trim();
  return sinSufijo === '' ? limpio : sinSufijo;
}

/** Categoría a partir del nombre publicado (se guarda con su confianza, nunca se inventa). */
export function categoriaDesdeNombre(publicado: string): { categoria: string; confianza: number } {
  const t = String(publicado ?? '').toLowerCase();
  const tabla: Array<[RegExp, string, number]> = [
    [/pre-?benjam/, 'prebenjamin', 0.8],
    [/benjam/, 'benjamin', 0.8],
    [/alev/, 'alevin', 0.8],
    [/infantil/, 'infantil', 0.8],
    [/cadete/, 'cadete', 0.8],
    [/juvenil/, 'juvenil', 0.8],
    [/veteran/, 'veteranos', 0.8],
    // «Sénior», «aficionados» y los nombres de división describen el fútbol adulto: la categoría es
    // aficionados, pero con menos confianza porque el nombre no lo dice literalmente.
    [/s[eé]niors?|aficionad/, 'aficionados', 0.8],
    [/primera|segunda|tercera|preferente|honor|nacional|federaci[oó]n|divisi[oó]n|auton[oó]mic|regional|provincial/, 'aficionados', 0.5],
  ];
  for (const [patron, valor, confianza] of tabla) {
    if (patron.test(t)) return { categoria: valor, confianza };
  }
  return { categoria: 'desconocida', confianza: 0 };
}

/** Modalidad a partir del nombre publicado: sólo las marcas explícitas (la ambigüedad se deja nula). */
export function modalidadDesdeNombre(publicado: string): { modalidad: string; confianza: number } {
  const t = String(publicado ?? '').toLowerCase();
  if (/f[uú]tbol\s*sala|futsal|aret?o\s*futbol|sala/.test(t)) return { modalidad: 'sala', confianza: 0.8 };
  if (/playa/.test(t)) return { modalidad: 'playa', confianza: 0.8 };
  if (/f[uú]tbol\s*8|f-?8/.test(t)) return { modalidad: 'futbol8', confianza: 0.8 };
  if (/f[uú]tbol\s*7|f-?7/.test(t)) return { modalidad: 'futbol7', confianza: 0.8 };
  return { modalidad: 'desconocida', confianza: 0 };
}

/** Género: sólo cuando el nombre lo dice; nunca se deduce por la categoría. */
export function generoDesdeNombre(publicado: string): { genero: string; confianza: number } {
  const t = String(publicado ?? '').toLowerCase();
  if (/femenin|fem\.|futfem|mujer/.test(t)) return { genero: 'femenina', confianza: 0.8 };
  if (/masculin/.test(t)) return { genero: 'masculina', confianza: 0.8 };
  if (/mixto|mixta/.test(t)) return { genero: 'mixta', confianza: 0.8 };
  return { genero: 'desconocido', confianza: 0 };
}

/** Ámbito: copa frente a liga, y territorial frente a nacional. */
export function ambitoDesdeNombre(publicado: string): { ambito: string; confianza: number } {
  const t = String(publicado ?? '').toLowerCase();
  if (/copa|trofeo|kx|txapelketa|eliminatoria/.test(t)) return { ambito: 'copa', confianza: 0.8 };
  if (/ascenso|promoci[oó]n|play\s?-?off|fase/.test(t)) return { ambito: 'ascenso', confianza: 0.7 };
  if (/nacional|rfef|espa[ñn]a|liga nacional/.test(t)) return { ambito: 'nacional', confianza: 0.6 };
  if (/provincial|comarcal|delegaci[oó]n/.test(t)) return { ambito: 'provincial', confianza: 0.6 };
  if (/auton[oó]mic|regional|territorial|vasca|catalana|gallega|andaluza|madrile|canaria|balear|navarra|aragonesa|asturiana|c[aá]ntabra|manchega|murciana|extreme[ñn]a|riojana|ceut[ií]|melillense/.test(t)) {
    return { ambito: 'regional', confianza: 0.6 };
  }
  return { ambito: 'desconocido', confianza: 0 };
}

/** Fecha de la cola (`YYYY-MM-DD` o `DD-MM-YYYY`) a ISO, o `null` si no es creíble. */
export function fechaIso(valor: unknown): string | null {
  const texto = String(valor ?? '').trim();
  if (texto === '') return null;
  let anio: number; let mes: number; let dia: number;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (m) { anio = Number(m[1]); mes = Number(m[2]); dia = Number(m[3]); }
  else {
    m = /^(\d{2})-(\d{2})-(\d{4})/.exec(texto);
    if (!m) return null;
    dia = Number(m[1]); mes = Number(m[2]); anio = Number(m[3]);
  }
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) return null;
  if (anio < 2000 || anio > new Date().getFullYear() + 3 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Hora `HH:MM` a `HH:MM:SS`, o `null`. */
export function horaIso(valor: unknown): string | null {
  const texto = String(valor ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(texto);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

/**
 * Estado oficial del partido a partir de la fecha y el marcador. NULL nunca se convierte en 0 y el
 * estado no se inventa: sin marcador y con fecha pasada queda `unknown` (la fuente no lo publicó).
 */
export function estadoPartido(golesLocal: number | null, golesVisitante: number | null, fecha: string | null, hoy = new Date()): string {
  if (golesLocal !== null && golesVisitante !== null) return 'played';
  if (!fecha) return 'scheduled';
  const fechaPartido = new Date(`${fecha}T23:59:59`);
  if (Number.isNaN(fechaPartido.getTime())) return 'unknown';
  return fechaPartido.getTime() < hoy.getTime() ? 'unknown' : 'scheduled';
}
