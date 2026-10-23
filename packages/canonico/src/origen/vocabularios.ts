/**
 * Vocabularios medidos de la cola.
 *
 * Regla 2 del encargo y §2 de IMPORTADOR-SQLITE.md: los valores están MEDIDOS sobre la cola real, y
 * un valor que no esté aquí **detiene el lote**. No existe el destino `otro` PARA UN VALOR DESCONOCIDO:
 * convertir en `otro` algo que no sabemos leer es inventar, y se hace en silencio.
 *
 * La distinción importa y ya ha hecho falta: `otra` SÍ está aquí porque la propia fuente publica ese valor
 * con un significado claro —una tarjeta cuyo color no publica—, y entonces `otro` no es un cajón de sastre
 * sino la respuesta correcta. Lo que sigue en pie es lo otro: un valor que no esté medido y escrito aquí
 * detiene el lote entero.
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
  /*
   * ── «otra»: una tarjeta que la fuente publica SIN decir de qué color es ──────────────────────────────
   *
   * Medido el 24/09/2026 sobre la cola de Valencia: **34 eventos en 34 actas**, todos de la temporada 21
   * (2025-26), frente a 131.714 amarillas, 6.024 rojas y 5.213 dobles amarillas. Son la colección
   * `otras_tarjetas` de la API de iSquad, que el recolector traduce a `tipo: 'otra'` y acompaña de la
   * incidencia `otras_tarjetas_presentes` en el acta (`scripts/recolector-valencia.mjs`).
   *
   * No es un valor inventado ni un cajón de sastre: la fuente dice que hubo una tarjeta y NO dice cuál. El
   * destino honesto es `otro`, que el modelo canónico ya contempla y que la base acepta
   * (`core.match_event.event_type` incluye `otro` desde la migración 0004). Lo que NO se hace es forzarla a
   * amarilla o a roja: eso sería inventar el color. La falta queda registrada dos veces —el tipo `otro` y la
   * incidencia del acta—, que es como se trata aquí todo lo que la fuente no publica.
   *
   * Coste de no tenerlo: esos 34 eventos tumbaban el lote entero y dejaban **29 grupos sin importar**, con
   * sus jugadores, minutos y goles. Un dato auxiliar de 34 filas bloqueaba el resto del grupo.
   */
  otra: { event_type: 'otro', admiteSubtipoDeGol: false },
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
 * Estados de `actas.estado` que producen fila en `core.match_report`.
 *
 * `pendiente` NO la produce —es cobertura pendiente, no un acta— y todo lo demás sí: `hecha` con su calidad,
 * `sin_datos` como `partial` y `ausente_web` como `unavailable` (la fila se escribe aunque después no se
 * escriban sus alineaciones).
 *
 * Esto está aquí, y no dentro de cada sitio, por un fallo medido el 24/09/2026: `codigosDeActasEnlazadas`
 * contaba sólo las `hecha`, así que un grupo con 270 actas buenas y **una `sin_datos`** daba 270 en el origen
 * y 271 informes en el destino, y el lote se caía con «actas analizadas 270≠271». Le pasaba a **Baleares,
 * Asturias, Navarra, Extremadura, Castilla-La Mancha, Aragón y Rioja**, siempre con exactamente una de más:
 * una `sin_datos` por grupo. Los dos lados tienen que leer la misma lista, o vuelven a separarse.
 */
export const ESTADOS_CON_INFORME = ['hecha', 'sin_datos', 'ausente_web'] as const;

/** ¿Esta acta deja fila en `core.match_report`? Es la pregunta que comparten el origen y el importador. */
export function produceInforme(estado: unknown): boolean {
  return (ESTADOS_CON_INFORME as readonly string[]).includes(String(estado ?? '').trim());
}

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
 * Regla 7: el club se deriva SÓLO quitando la letra de equipo (filial) del final. `S.D. SAN JOSE "A"` →
 * `S.D. SAN JOSE`. Ninguna otra transformación: formas jurídicas, artículos y orden se quedan como están.
 *
 * La letra es el filial: un club no puede tener dos equipos iguales en la misma categoría, así que el B va
 * por debajo del A, el C por debajo del B… (confirmado por David, 21/10/2026). Cómo la escribe cada fuente:
 *  - entre comillas dobles o simples, en todas: `"A"`, `'B'` (Madrid y Valencia usan simples; con sólo las
 *    dobles cada equipo era un club: Madrid 3.404 «clubes» donde hay ~1.360);
 *  - suelta, sin comillas: la FCF (Cataluña) la pone SIEMPRE (`ESPOLLA, C.E. A`, 1.317 A, 305 B… hasta F);
 *    en las demás aparece a veces (`CD SAFA B`, `AXULAR LIZEOA E`).
 * Medido sobre los nombres de equipo de nueve colas: fuera de Cataluña una «F» final suele ser «Femenino» o
 * parte de la forma jurídica (`E.M.F. ADEJE F`, `GUARROMÁN F. F`), y hay nombres que acaban en otra letra
 * legítima (`RIVER X`, `... LIGA L`). Por eso: FCF, letra A-H; resto, A-E y nunca detrás de una inicial suelta
 * con punto (`XEREZ C. F`); detrás de una forma jurídica sí (`ESPOLLA, C.E. B`). Lo ya importado se une con `scripts/consolida-clubes-comillas.mjs`.
 */
export function clubDesdeNombreEquipo(nombre: string, opciones: { letraSueltaSiempre?: boolean } = {}): string {
  const limpio = String(nombre ?? '').trim();
  let base = limpio.replace(/\s*(["'])[^"']{1,3}\1\s*$/, '').trim();
  if (base === limpio) {
    base = opciones.letraSueltaSiempre
      ? limpio.replace(/\s+[A-H]$/, '').trim()
      : limpio.replace(/(?<!\s[A-Z]\.)\s+[A-E]$/, '').trim();
  }
  return base === '' ? limpio : base;
}

/**
 * Categoría a partir del nombre publicado (se guarda con su confianza, nunca se inventa).
 *
 * Las 19 federaciones publican en cuatro lenguas y con convenciones distintas. Medido el 21/10/2026 sobre
 * los nombres de competición de las colas: la versión que sólo entendía castellano dejaba en
 * `desconocida` el 23 % de Cataluña (`CADET`, `ALEVÍ`, `BENJAMÍ`), el 38 % de Bizkaia y el 17 % de Araba
 * (`KADETEEN`, `GAZTEEN`), y las selecciones por edad (`SUB-16`, `S15`). Reglas:
 *  - lo específico antes que lo general: `prebenjamín` antes que `benjamín`;
 *  - castellano, catalán/valenciano (`cadet`, `aleví`, `benjamí`) y euskera (`kadete`, `alebin`, `gazte`);
 *  - la edad `SUB-NN` / `SNN` se traduce a su categoría con MENOS confianza que la palabra explícita;
 *  - categorías más jóvenes que prebenjamín (`bebé`, `debutantes`, `minipre…`) NO se fuerzan a ninguna:
 *    el vocabulario cerrado no las tiene y meterlas en `prebenjamin` sería inventar.
 */
export function categoriaDesdeNombre(publicado: string): { categoria: string; confianza: number } {
  const t = String(publicado ?? '').toLowerCase();
  if (/\bminipre|(?<![\p{L}])beb[eé]s?(?![\p{L}\p{N}])|debutant/u.test(t)) return { categoria: 'desconocida', confianza: 0 };
  const tabla: Array<[RegExp, string, number]> = [
    [/pre-?benjam|pre-?benxam/, 'prebenjamin', 0.8],
    [/benjam|benxam/, 'benjamin', 0.8],
    [/alev|alebin/, 'alevin', 0.8],
    [/infantil/, 'infantil', 0.8],
    [/cadet|kadet/, 'cadete', 0.8],
    [/juvenil|jubenil|\bgazte(en|ak|ena)?\b/, 'juvenil', 0.8],
    [/veteran|beteran/, 'veteranos', 0.8],
    // «Sénior», «aficionados» y los nombres de división describen el fútbol adulto: la categoría es
    // aficionados, pero con menos confianza porque el nombre no lo dice literalmente.
    [/s[eé]niors?|aficionad|amateur|absolut/, 'aficionados', 0.8],
  ];
  for (const [patron, valor, confianza] of tabla) {
    if (patron.test(t)) return { categoria: valor, confianza };
  }
  const edad = /\b(?:sub|s|u)[\s.-]?(\d{1,2})\b/.exec(t);
  if (edad) {
    const n = Number(edad[1]);
    const porEdad: Array<[number, number, string]> = [
      [7, 8, 'prebenjamin'], [9, 10, 'benjamin'], [11, 12, 'alevin'], [13, 14, 'infantil'],
      [15, 16, 'cadete'], [17, 19, 'juvenil'],
    ];
    for (const [desde, hasta, valor] of porEdad) {
      if (n >= desde && n <= hasta) return { categoria: valor, confianza: 0.6 };
    }
  }
  if (/primera|segunda|tercera|segona|quarta|preferente?|honor|nacional|federaci[oó]|divisi[oó]|auton[oó]mic|regional|provincial|territorial|\blehen|bigarren|hirugarren|ohorezko|erregional|\brey\b|reina\b|erregearen|erreginaren/.test(t)) {
    return { categoria: 'aficionados', confianza: 0.5 };
  }
  return { categoria: 'desconocida', confianza: 0 };
}

/** Modalidad a partir del nombre publicado: sólo las marcas explícitas (la ambigüedad se deja nula). */
export function modalidadDesdeNombre(publicado: string): { modalidad: string; confianza: number } {
  const t = String(publicado ?? '').toLowerCase();
  // «sala» tiene que ser PALABRA ENTERA. Con la subcadena, «1ª División Provincial de Juveniles, Primera -
  // Salamanca» salía como fútbol sala (visto el 30/09/2026): 5 jugadores y minutos no calculables en los
  // informes de toda la provincia. La palabra suelta sigue haciendo falta por el catalán («ALEVÍ SALA»).
  if (/f[uú]tbol\s*sala|futsal|aret?o\s*futbol|(^|[^a-z0-9áéíóúàèòïüñç])sala($|[^a-z0-9áéíóúàèòïüñç])/.test(t)) {
    return { modalidad: 'sala', confianza: 0.8 };
  }
  if (/playa/.test(t)) return { modalidad: 'playa', confianza: 0.8 };
  if (/f[uú]tbol\s*8|f-?8/.test(t)) return { modalidad: 'futbol8', confianza: 0.8 };
  if (/f[uú]tbol\s*7|f-?7/.test(t)) return { modalidad: 'futbol7', confianza: 0.8 };
  return { modalidad: 'desconocida', confianza: 0 };
}

/**
 * Género: sólo cuando el nombre lo dice; nunca se deduce por la categoría. Castellano, catalán/valenciano
 * (`femení`, `masculí`) y euskera (`emakume`, `neska`, `gizon`, `mutil`).
 */
export function generoDesdeNombre(publicado: string): { genero: string; confianza: number } {
  const t = String(publicado ?? '').toLowerCase();
  if (/mixto|mixta|\bmixt\b|mistoa/.test(t)) return { genero: 'mixta', confianza: 0.8 };
  if (/femen[ií]|fem\.|futfem|mujer|emakume|\bneska/.test(t)) return { genero: 'femenina', confianza: 0.8 };
  if (/masculin|mascul[ií]|\bgizon|\bmutil/.test(t)) return { genero: 'masculina', confianza: 0.8 };
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

/* ---------- división, nivel y provincia (21/10/2026) ---------- */

/**
 * División (escalón) a partir del nombre publicado, en castellano, catalán/valenciano y euskera.
 * Devuelve una etiqueta comparable entre federaciones y un nivel ORIENTATIVO (1 = el más alto dentro de su
 * categoría) que sólo sirve para ordenar desplegables y tablas; no es una equivalencia oficial.
 */
export type Division = { division: string; nivel: number | null; confianza: number };

// Límites de palabra que entienden tildes y «ª»: `\b` de JavaScript sólo conoce ASCII y fallaba en
// «2ª ANDALUZA» o «Castelló». Un ordinal seguido de fase/ronda/año NO es una división («1ª FASE», «1r. any»).
const A = String.raw`(?<![\p{L}\p{N}])`;
const Z = String.raw`(?![\p{L}\p{N}])`;
const NO_FASE = String.raw`(?!\s*\.?\s*(fase|eliminat|ronda|vuelta|volta|jornada|any|a[ñn]o|kanpor|itzuli|grupo|grup|taldea|clasificad|sailkat|puesto|lloc))`;
const ord = (formas: string) => new RegExp(`${A}(?:${formas})${Z}${NO_FASE}`, 'u');
const ORDINAL: Array<[RegExp, string]> = [
  [ord(String.raw`1\s*[ªºa]|1r|primera|primer|lehen(?:engo)?`), 'primera'],
  [ord(String.raw`2\s*[ªºa]|2n|segunda|segona|bigarren`), 'segunda'],
  [ord(String.raw`3\s*[ªºa]|3r|tercera|hirugarren`), 'tercera'],
  [ord(String.raw`4\s*[ªºa]|4t|cuarta|quarta|laugarren`), 'cuarta'],
  [ord(String.raw`5\s*[ªºa]|5[eè]|quinta|cinquena|bosgarren`), 'quinta'],
];
const NIVEL: Record<string, number> = {
  'primera-federacion': 1, 'segunda-federacion': 2, 'tercera-federacion': 3,
  'division-honor': 1, 'liga-nacional': 2, 'superliga': 1,
  'division-honor-regional': 3, 'preferente': 4, 'autonomica': 4,
  'primera': 5, 'segunda': 6, 'tercera': 7, 'cuarta': 8, 'quinta': 9,
};

export function divisionDesdeNombre(publicado: string): Division {
  const t = String(publicado ?? '').toLowerCase().normalize('NFC');
  const r = (division: string, confianza: number): Division => ({ division, nivel: NIVEL[division] ?? null, confianza });
  // Categorías nacionales de la RFEF (sénior y fútbol sala): «Tercera Federación», «3ª RFEF», «Segunda B».
  if (/(primera|1\s*[ªºa]|lehen)\s*(federaci|rfef|federazio)|rfef\s*lehen/.test(t)) return r('primera-federacion', 0.9);
  if (/(segunda|2\s*[ªºa]|segona|bigarren)\s*(federaci|rfef|b\b|divisi[oó]n\s*b)|rfef\s*bigarren/.test(t)) return r('segunda-federacion', 0.9);
  if (/(tercera|3\s*[ªºa]|hirugarren)\s*(federaci|rfef|divisi[oó]n\b(?!.*(provincial|regional|auton)))|rfef\s*hirugarren/.test(t)) return r('tercera-federacion', 0.8);
  if (/superliga/.test(t)) return r('superliga', 0.8);
  if (/liga\s*nacional|nacional\s*juvenil|nazional\s*liga/.test(t)) return r('liga-nacional', 0.9);
  if (/divisi[oó]n?\s*(de\s*)?honor|divisi[oó]\s*(d['’]\s*)?honor|ohorezko/.test(t)) {
    return /regional|auton|provincial|andaluza|catalana|valenciana|madrid|vasca|gallega|canaria/.test(t)
      ? r('division-honor-regional', 0.8) : r('division-honor', 0.8);
  }
  if (/preferente?(?![\p{L}])|lehentasunezko|gorengo/u.test(t)) return r('preferente', 0.9);
  if (/(?<![\p{L}])pref\./u.test(t)) return r('preferente', 0.7);
  if (/(?<![\p{L}])honor(?![\p{L}])/u.test(t)) return r('division-honor', 0.6);
  if (/liga\s*vasca|euskal\s*liga/.test(t)) return r('division-honor-regional', 0.7);
  for (const [patron, valor] of ORDINAL) if (patron.test(t)) return r(valor, 0.7);
  if (/auton[oó]mic|lurralde/.test(t)) return r('autonomica', 0.5);
  return { division: 'desconocida', nivel: null, confianza: 0 };
}

const PROVINCIAS: Array<[RegExp, string]> = [
  [/\b(a\s*)?coru[ñn]a\b/, 'A Coruña'], [/\b[aá]lava\b|\baraba\b/, 'Álava'], [/\balbacete\b/, 'Albacete'],
  [/\balicante\b|\balacant\b/, 'Alicante'], [/\balmer[ií]a\b/, 'Almería'], [/\basturias\b/, 'Asturias'],
  [/\b[aá]vila\b/, 'Ávila'], [/\bbadajoz\b/, 'Badajoz'], [/\bbaleares\b|\bmallorca\b|\bmenorca\b|\beivissa\b|\bibiza\b/, 'Illes Balears'],
  [/\bbarcelona\b/, 'Barcelona'], [/\bbizkaia\b|\bvizcaya\b/, 'Bizkaia'], [/\bburgos\b/, 'Burgos'],
  [/\bc[aá]ceres\b/, 'Cáceres'], [/\bc[aá]diz\b/, 'Cádiz'], [/\bcantabria\b/, 'Cantabria'],
  [/\bcastell[oó]n?\b/, 'Castellón'], [/\bceuta\b/, 'Ceuta'], [/\bciudad\s*real\b/, 'Ciudad Real'],
  [/\bc[oó]rdoba\b/, 'Córdoba'], [/\bcuenca\b/, 'Cuenca'], [/\bgipuzkoa\b|\bguip[uú]zcoa\b/, 'Gipuzkoa'],
  [/\bgi+rona\b|\bgerona\b/, 'Girona'], [/\bgranada\b/, 'Granada'], [/\bguadalajara\b/, 'Guadalajara'],
  [/\bhuelva\b/, 'Huelva'], [/\bhuesca\b/, 'Huesca'], [/\bja[eé]n\b/, 'Jaén'], [/\ble[oó]n\b/, 'León'],
  [/\blleida\b|\bl[eé]rida\b/, 'Lleida'], [/\blugo\b/, 'Lugo'], [/\bmadrid\b/, 'Madrid'], [/\bm[aá]laga\b/, 'Málaga'],
  [/\bmelilla\b/, 'Melilla'], [/\bmurcia\b/, 'Murcia'], [/\bnavarra\b/, 'Navarra'], [/\bourense\b|\borense\b/, 'Ourense'],
  [/\bpalencia\b/, 'Palencia'], [/\blas\s*palmas\b|\bgran\s*canaria\b|\blanzarote\b|\bfuerteventura\b/, 'Las Palmas'],
  [/\bpontevedra\b|\bvigo\b/, 'Pontevedra'], [/\brioja\b/, 'La Rioja'], [/\bsalamanca\b/, 'Salamanca'],
  [/\btenerife\b|\bla\s*palma\b|\bla\s*gomera\b|\bel\s*hierro\b/, 'Santa Cruz de Tenerife'], [/\bsegovia\b/, 'Segovia'],
  [/\bsevilla\b/, 'Sevilla'], [/\bsoria\b/, 'Soria'], [/\btarragona\b|\bterres\s*(de\s*l['’]\s*)?ebre\b/, 'Tarragona'],
  [/\bteruel\b/, 'Teruel'], [/\btoledo\b/, 'Toledo'], [/\bval[eè]ncia\b/, 'Valencia'], [/\bvalladolid\b/, 'Valladolid'],
  [/\bzamora\b/, 'Zamora'], [/\bzaragoza\b/, 'Zaragoza'],
];

const PROVINCIAS_U = PROVINCIAS.map(([p, v]) => [new RegExp(p.source.replaceAll('\\b', ''), 'u'), v] as [RegExp, string])
  .map(([p, v]) => [new RegExp(`(?<![\\p{L}\\p{N}])(?:${p.source})(?![\\p{L}\\p{N}])`, 'u'), v] as [RegExp, string]);

/** Provincia (o isla agrupada en su provincia) cuando el nombre la cita. Sin cita, null: no se deduce. */
export function provinciaDesdeNombre(publicado: string): string | null {
  const t = String(publicado ?? '').toLowerCase();
  for (const [patron, valor] of PROVINCIAS_U) if (patron.test(t)) return valor;
  return null;
}
