/**
 * Roles del cuerpo técnico: vocabulario MEDIDO, no inventado.
 *
 * La fuente publica el rol como texto libre. Medido sobre las 18 colas: **130 literales distintos**
 * en cinco lenguas (`Entrenador`, `2ºEntrenador`, `DEL. Equipo`, `DELEGAT CAMP`, `Taldeko Delegatua`,
 * `Prestatzaile Fisikoa`, `ENCGDO. MATERIAL`, `ATS o FTP`…). No son 17 variantes: son 130.
 *
 * Consecuencia de no normalizar, medida en el canónico: `2ºEntrenador` (76.509 filas) acababa como
 * `entrenador`, y `DEL. Equipo` (282.265) y `A.T.S.` (7.781) pasaban tal cual, partiendo a la misma
 * persona en dos identidades según cómo hubiera escrito el rol la fuente.
 *
 * Regla: se normaliza a una lista cerrada y **el literal se conserva** en `core.match_staff.rol` y en
 * `core.person_name`. Un literal que no encaja en ninguna regla NO se inventa: se deja pasar
 * normalizado (minúsculas, sin tildes, sin signos) y el importador lo registra en
 * `ops.normalizacion_error` para poder medirlo y añadirlo con conocimiento. Lo que no se hace nunca
 * es convertirlo en `otro` ni descartarlo en silencio.
 */

/** Roles canónicos. Lista cerrada: cualquier otro valor es un literal pendiente de medir. */
export const ROLES_CANONICOS = [
  'entrenador',
  'segundo entrenador',
  'entrenador auxiliar',
  'entrenador en practicas',
  'entrenador de porteros',
  'preparador fisico',
  'fisioterapeuta',
  'ayudante sanitario',
  'medico',
  'enfermero',
  'delegado',
  'delegado de campo',
  'encargado de material',
  'monitor',
  'coordinador',
  'auxiliar',
  'oficial directivo',
] as const;

export type RolCanonico = (typeof ROLES_CANONICOS)[number];

/** Minúsculas, sin tildes, sin signos: `2ºEntrenador` → `2 entrenador`, `A.T.S.` → `a t s`. */
export function normalizaLiteralRol(literal: string): string {
  return String(literal ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

type Regla = { rol: RolCanonico; prueba: RegExp };

/**
 * El orden importa y es parte de la regla: lo específico antes que lo general. `ENTRENADOR PORTEROS`
 * es de porteros, no `entrenador`; `ENTRENADOR AUXILIAR` es auxiliar; `AYUDANTE TECNICO SANITARIO` es
 * ayudante sanitario y no cae en el cajón de `ats`.
 */
const REGLAS: readonly Regla[] = [
  { rol: 'entrenador de porteros', prueba: /\bporter|atezain/ },
  { rol: 'segundo entrenador', prueba: /^2\b|\bsegon\b|\bsegundo\b/ },
  { rol: 'ayudante sanitario', prueba: /ayudante (tecnico )?sanitari/ },
  { rol: 'entrenador en practicas', prueba: /practic|praktika/ },
  { rol: 'entrenador auxiliar', prueba: /entrenador auxiliar|entrenador ayudante/ },
  { rol: 'preparador fisico', prueba: /preparad|prestatzaile|fitness/ },
  { rol: 'enfermero', prueba: /enfermer|infermer/ },
  { rol: 'medico', prueba: /\bmedic|metge|medikua/ },
  { rol: 'fisioterapeuta', prueba: /fisio|\bats\b|a t s|\bftp\b|\bsut\b/ },
  { rol: 'delegado de campo', prueba: /delegat|delegad|\bdel\b/ },
  { rol: 'encargado de material', prueba: /material|encargad|encarregat|encgdo/ },
  { rol: 'monitor', prueba: /monitor/ },
  { rol: 'coordinador', prueba: /coordinador/ },
  { rol: 'oficial directivo', prueba: /oficial|directiu|directivo/ },
  { rol: 'auxiliar', prueba: /\bauxiliar\b|\bau\b|laguntzaile/ },
  { rol: 'entrenador', prueba: /entrenador|entrenatzaile|mister|coach|tecnic/ },
];

/**
 * `delegado de campo` sale de la regla del delegado: dentro de la misma regla hay que mirar si el
 * literal habla de campo (`Zelaiko Delegatua`, `DELEGADO CAMPO`).
 */
const ES_DE_CAMPO = /campo|\bcamp\b|zelai/;

export type RolResuelto = {
  /** Rol canónico, o el literal normalizado si no se ha reconocido ninguno. */
  rol: string;
  reconocido: boolean;
};

export function resuelveRolTecnico(literal: string): RolResuelto {
  const texto = normalizaLiteralRol(literal);
  if (texto === '') return { rol: '', reconocido: false };
  // `2º` a secas es la forma corta catalana de «segundo entrenador».
  if (/^2$/.test(texto)) return { rol: 'segundo entrenador', reconocido: true };
  for (const regla of REGLAS) {
    if (!regla.prueba.test(texto)) continue;
    if (regla.rol === 'delegado de campo' && !ES_DE_CAMPO.test(texto)) {
      return { rol: 'delegado', reconocido: true };
    }
    return { rol: regla.rol, reconocido: true };
  }
  return { rol: texto, reconocido: false };
}

/** Atajo para quien sólo quiere el rol: quien necesite saber si se reconoció usa `resuelveRolTecnico`. */
export function rolTecnicoNormalizado(literal: string): string {
  return resuelveRolTecnico(literal).rol;
}
