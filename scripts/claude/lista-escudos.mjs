#!/usr/bin/env node
/*
 * Lista de escudos de club que faltan — SOLO LECTURA sobre el canónico.
 *
 * Responde tres preguntas con números, no con impresiones:
 *   1. ¿Cuántos clubes y equipos tiene la federación y cuántos tienen escudo guardado?
 *   2. De los escudos que hay, ¿cuáles se sirven bien? (binario no vacío, firma de imagen coherente
 *      con el `mime_type` declarado y huella `sha256` que cuadra con el binario guardado)
 *   3. De los clubes sin escudo, ¿por qué no lo tienen? La causa principal es siempre de la base
 *      (`core.club_asset`); y para los que no tienen ni fila se separa «el escudo ya está en la base,
 *      en otra fila del mismo club» de «aquí falta de verdad».
 *
 * No escribe en PostgreSQL ni en la web: abre una sesión `default_transaction_read_only = on` y sólo
 * lanza SELECT. El CSV que genera va a `tmp/` (o a la ruta que se le pase).
 *
 * Uso:
 *   node scripts/claude/lista-escudos.mjs
 *   node scripts/claude/lista-escudos.mjs --csv tmp/escudos-faltan.csv
 *   node scripts/claude/lista-escudos.mjs --json
 *   node scripts/claude/lista-escudos.mjs --exigir     # devuelve 1 si los recuentos no cuadran
 *
 * Pruebas de las piezas puras: `node --test scripts/claude/lista-escudos.test.mjs`
 *
 * ── POR QUÉ MIRA LA FIRMA Y NO SÓLO `length(contenido)` ────────────────────────────────────────────
 *
 * `core.club_asset` no admite binario nulo (NOT NULL) ni un `mime_type` fuera de los cuatro formatos
 * (check de la 0017), así que «fila con contenido vacío» no puede existir por esquema. Pero el binario
 * puede estar guardado con un `mime_type` que no le corresponde (un PNG declarado JPEG se sirve con el
 * `Content-Type` equivocado y el navegador lo pinta roto). Los primeros bytes lo dicen sin dudas, y la
 * huella se recalcula para detectar un binario cambiado a mano.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Contenedor y credenciales del canónico del PC (los mismos que usa el resto de `scripts/claude/`). */
export const CONTENEDOR = 'facylf-postgres';
export const USUARIO = 'facylf_admin';
export const BASE = 'facylf';
export const FEDERACION_POR_DEFECTO = 'castilla-leon';

/**
 * Tipos de club que no distinguen un club de otro. Se quitan para comparar nombres: «C.D. Peñaranda
 * Bracamonte» y «C.D. Peñaranda de Bracamonte» son el mismo club; «Real Burgos» y «Burgos» no.
 */
const TIPOS_DE_CLUB = new Set([
  'cd', 'cf', 'cdf', 'cdi', 'cdp', 'cbd', 'cdb', 'ccdd', 'cfs', 'fs', 'fc', 'ud', 'uds', 'sd', 'sad',
  'ad', 'acd', 'ca', 'cp', 'csd', 'ds', 'cdc', 's', 'a', 'l', 'c', 'y', 'd', 'f', 'u',
]);
/** Palabras que no distinguen: artículos y preposiciones del nombre. */
const SIN_VALOR = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en']);

/** Minúsculas, sin acentos, sólo letras y dígitos separados por un espacio. */
function normaliza(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Palabras que de verdad identifican al club, en orden alfabético.
 *
 * Se calcula un multiconjunto (matriz y ordenadas) para que «Salamanca C.F. UDS» y «C.F. Salamanca UDS»
 * salgan iguales: el orden y las siglas del tipo de club no cambian de quién se habla.
 */
export function tokensSignificativos(nombre) {
  return normaliza(nombre)
    .split(' ')
    .filter((t) => t !== '' && !TIPOS_DE_CLUB.has(t) && !SIN_VALOR.has(t))
    .sort();
}

/**
 * Siglas del tipo de club de un nombre, en dos formas:
 *   · `letras`: el conjunto de siglas presentes (`C.D.` → `['c','d']`), sin forma jurídica;
 *   · `prefijo`: las siglas que van DELANTE del nombre (`C.D.` → `'cd'`; `Burgos U.D.` → `''`).
 *
 * El conjunto sirve para comparar nombres largos; el prefijo es lo único que queda cuando el nombre
 * tiene una sola palabra («Burgos», «Ponferradina») y ahí sí distingue dos clubes de la misma ciudad.
 */
function siglasDeTipo(nombre) {
  const letras = new Set();
  let prefijo = '';
  let enPrefijo = true;
  for (const palabra of normaliza(nombre).split(' ')) {
    if (palabra === '') continue;
    if (TIPOS_DE_CLUB.has(palabra)) {
      letras.add(palabra);
      if (enPrefijo) prefijo += palabra;
    } else {
      enPrefijo = false;
    }
  }
  return { letras: [...letras].sort(), prefijo };
}

/**
 * Qué relación hay entre dos nombres de club: `firme`, `dudosa` o ninguna (`null`).
 *
 * `firme`: las palabras que identifican al club coinciden y las siglas tampoco se contradicen
 * (`S.D. Ponferradina` y `S.D. Ponferradina S.A.D.`; `C.D. Peñaranda de Bracamonte` y
 * `Peñaranda Bracamonte`; `C.D. Isoba` y `Isoba`).
 *
 * `dudosa`: coinciden las palabras, comparten alguna sigla, pero cada nombre lleva una que el otro no
 * (`C.D. Isoba Real` y `C.F. Isoba Real`). Son candidatos, no una prueba: el informe los cuenta aparte
 * para que se revisen a mano.
 *
 * `null`: no se parecen lo suficiente. Con una sola palabra que identifique al club manda el prefijo,
 * así que `Burgos U.D.` y `Burgos C.F. S.A.D.` no se confunden aunque las dos sean «Burgos».
 */
export function relacionDeNombre(a, b) {
  const ta = tokensSignificativos(a);
  const tb = tokensSignificativos(b);
  if (ta.length === 0 || ta.length !== tb.length) return null;
  if (!ta.every((t, i) => t === tb[i])) return null;
  const siglasA = siglasDeTipo(a);
  const siglasB = siglasDeTipo(b);
  if (siglasA.letras.length === 0 || siglasB.letras.length === 0) return 'firme';
  if (siglasA.letras.length === siglasB.letras.length
    && siglasA.letras.every((t, i) => t === siglasB.letras[i])) return 'firme';
  if (ta.length === 1) {
    return siglasA.prefijo !== '' && siglasA.prefijo === siglasB.prefijo ? 'firme' : null;
  }
  const soloEnA = siglasA.letras.filter((t) => !siglasB.letras.includes(t));
  const soloEnB = siglasB.letras.filter((t) => !siglasA.letras.includes(t));
  if (soloEnA.length === 0 || soloEnB.length === 0) return 'firme';
  const comparten = siglasA.letras.filter((t) => siglasB.letras.includes(t));
  if (comparten.length > 0) return 'dudosa';
  return null;
}

/** ¿Las dos filas hablan del mismo club con evidencia de nombre suficiente para afirmarlo? */
export function mismoNombreReal(a, b) {
  return relacionDeNombre(a, b) === 'firme';
}

/** Firma real de la imagen por sus primeros bytes. `null` si no es uno de los cuatro formatos. */
export function detectaMimeImagen(entrada) {
  const bytes = entrada instanceof Uint8Array ? entrada : null;
  if (bytes === null) return null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12) {
    const cabecera = Buffer.from(bytes.subarray(0, 12)).toString('latin1');
    if (cabecera.slice(0, 4) === 'RIFF' && cabecera.slice(8, 12) === 'WEBP') return 'image/webp';
  }
  const texto = Buffer.from(bytes.subarray(0, 2048)).toString('utf8');
  if (/^\ufeff?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype[\s\S]*?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(texto)) {
    return 'image/svg+xml';
  }
  return null;
}

/**
 * Veredicto de un escudo guardado.
 *
 * Devuelve `{ problema, mime_real, sha_recalculado }`, con `problema` a `null` cuando el escudo se sirve
 * bien. Los problemas posibles son los del esquema (`binario-vacio`) y los del fichero (`mime-no-coincide`,
 * `sha-no-coincide`).
 */
export function validaEscudo(fila) {
  const bytes = fila.contenido instanceof Uint8Array ? fila.contenido : null;
  const tamano = bytes === null ? Number(fila.bytes ?? 0) : bytes.length;
  if (tamano === 0 || bytes === null) {
    return { problema: 'binario-vacio', mime_real: null, sha_recalculado: null, bytes: 0 };
  }
  const mimeReal = detectaMimeImagen(bytes);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (mimeReal === null || mimeReal !== fila.mime_type) {
    return { problema: 'mime-no-coincide', mime_real: mimeReal, sha_recalculado: sha, bytes: tamano };
  }
  if (String(fila.sha256 ?? '').toLowerCase() !== sha) {
    return { problema: 'sha-no-coincide', mime_real: mimeReal, sha_recalculado: sha, bytes: tamano };
  }
  return { problema: null, mime_real: mimeReal, sha_recalculado: sha, bytes: tamano };
}

/**
 * Causa principal de que un club no tenga escudo VIGENTE CON BINARIO.
 *
 * Se prueba de la causa más rara a la más común: primero las filas que existen pero no sirven, y al
 * final el caso normal, que no hay ninguna fila. El orden importa: un club con fila no vigente y otra
 * vigente está bien («con escudo») y no llega aquí.
 */
export function causaDeClubSinEscudo(club) {
  if (Number(club.filas_asset ?? 0) === 0) return { causa: 'sin-fila-en-club_asset' };
  if (Number(club.filas_otro_tipo ?? 0) > 0) return { causa: 'otro-tipo' };
  if (Number(club.filas_vigentes_sin_binario ?? 0) > 0) return { causa: 'fila-sin-binario' };
  if (Number(club.filas_no_vigentes ?? 0) > 0) return { causa: 'fila-no-vigente' };
  return { causa: 'sin-fila-en-club_asset' };
}

/**
 * Clasifica el censo de clubes de una federación.
 *
 * Recibe las filas que devuelve `censoDeClubes()`: `{ id, nombre, tiene_escudo, filas_asset,
 * filas_no_vigentes, filas_vigentes_sin_binario, filas_otro_tipo, codigos: string[] }`.
 *
 * Devuelve los recuentos y, por club sin escudo, un motivo:
 *   · `sin-fila-en-club_asset` (y sus hermanos) — la base no tiene ninguna fila para ese club;
 *   · `fila-no-vigente`, `fila-sin-binario`, `otro-tipo` — la fila existe y no sirve;
 *   · `hermano-con-escudo-por-codigo` — OTRA fila de `core.club` del mismo club real (comparten código
 *     de equipo en `core.team_entry`, que es evidencia dura: lo dice la federación) ya tiene escudo;
 *   · `hermano-con-escudo-por-nombre` — sólo el nombre coincide con un club que sí lo tiene (evidencia
 *     más débil, hay que revisarla a mano); `hermano-con-escudo-por-nombre-dudoso` es el mismo caso con
 *     siglas que no encajan del todo;
 *   · `duplicado-sin-escudo` — el club está partido en varias filas y ninguna tiene escudo;
 *   · `falta-de-verdad` — fila única, sin hermano conocido: este es el hueco real.
 */
export function clasifica(clubes) {
  const con = clubes.filter((c) => c.tiene_escudo === true);
  const sin = clubes.filter((c) => c.tiene_escudo !== true);

  // Índice de códigos de equipo: quién más comparte el mismo código (evidencia dura de club partido).
  const porCodigo = new Map();
  for (const club of clubes) {
    for (const codigo of club.codigos ?? []) {
      if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
      porCodigo.get(codigo).push(club);
    }
  }
  const hermanosDe = (club) => {
    const vistos = new Map();
    for (const codigo of club.codigos ?? []) {
      for (const otro of porCodigo.get(codigo) ?? []) {
        if (otro.id !== club.id) vistos.set(otro.id, otro);
      }
    }
    return [...vistos.values()];
  };

  const motivoPorClub = new Map();
  const detallePorClub = new Map();
  const porCausa = new Map();
  const porMotivo = new Map();

  for (const club of sin) {
    const { causa } = causaDeClubSinEscudo(club);
    porCausa.set(causa, (porCausa.get(causa) ?? 0) + 1);

    let motivo = causa;
    let hermanosConEscudo = [];
    let hermanosSinEscudo = [];
    if (causa === 'sin-fila-en-club_asset') {
      const hermanos = hermanosDe(club);
      hermanosConEscudo = hermanos.filter((h) => h.tiene_escudo === true);
      hermanosSinEscudo = hermanos.filter((h) => h.tiene_escudo !== true);
      if (hermanosConEscudo.length > 0) {
        motivo = 'hermano-con-escudo-por-codigo';
      } else {
        const firmes = con.filter((c) => mismoNombreReal(c.nombre, club.nombre));
        const dudosos = con.filter((c) => relacionDeNombre(c.nombre, club.nombre) === 'dudosa');
        if (firmes.length > 0) {
          motivo = 'hermano-con-escudo-por-nombre';
          hermanosConEscudo = firmes;
        } else if (dudosos.length > 0) {
          motivo = 'hermano-con-escudo-por-nombre-dudoso';
          hermanosConEscudo = dudosos;
        } else {
          const hermanosPorNombre = clubes.filter((c) => c.id !== club.id && relacionDeNombre(c.nombre, club.nombre) !== null);
          if (hermanosSinEscudo.length > 0 || hermanosPorNombre.length > 0) {
            motivo = 'duplicado-sin-escudo';
            hermanosSinEscudo = hermanosSinEscudo.concat(hermanosPorNombre);
          } else {
            motivo = 'falta-de-verdad';
          }
        }
      }
    }

    motivoPorClub.set(club.id, motivo);
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);

    detallePorClub.set(club.id, {
      causa,
      motivo,
      hermanos_con_escudo: hermanosConEscudo.map((h) => h.id),
      hermanos_sin_escudo: [...new Set(hermanosSinEscudo.map((h) => h.id))],
    });
  }

  return {
    total: clubes.length,
    con_escudo: con.length,
    sin_escudo: sin.length,
    motivoPorClub,
    detallePorClub,
    porCausa: Object.fromEntries([...porCausa].sort()),
    porMotivo: Object.fromEntries([...porMotivo].sort()),
    clubesSinEquipo: sin.filter((c) => Number(c.equipos ?? 0) === 0).length,
  };
}

/** Lanza un SELECT por `psql` dentro del contenedor, en una sesión declarada de sólo lectura. */
export function consulta(sql) {
  const resultado = spawnSync(
    'docker',
    ['exec', '-i', CONTENEDOR, 'psql', '-U', USUARIO, '-d', BASE, '-At', '-q', '-F', '\t', '-f', '-'],
    {
      input: `set default_transaction_read_only = on;\n${sql}\n`,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) {
    throw new Error(`psql falló (${resultado.status}): ${String(resultado.stderr ?? '').trim()}`);
  }
  return String(resultado.stdout ?? '')
    .split('\n')
    .filter((linea) => linea !== '')
    .map((linea) => linea.split('\t'));
}

/** Censo de clubes de la federación con su estado de escudo y sus códigos de equipo. */
export function censoDeClubes(federacion) {
  const filas = consulta(`
    select c.id, c.nombre_canonico,
           (select count(*) from core.team_season ts where ts.club_id = c.id) as equipos,
           (select count(*) from core.team_entry te
              join core.team_season ts on ts.id = te.team_season_id
             where ts.club_id = c.id) as inscripciones,
           count(ca.id) as filas_asset,
           count(ca.id) filter (where not ca.vigente) as filas_no_vigentes,
           count(ca.id) filter (where ca.tipo <> 'escudo') as filas_otro_tipo,
           count(ca.id) filter (where ca.tipo = 'escudo' and ca.vigente and length(ca.contenido) = 0) as filas_vigentes_sin_binario,
           bool_or(ca.tipo = 'escudo' and ca.vigente and length(ca.contenido) > 0) as tiene_escudo
      from core.club c
      join core.federation f on f.id = c.federation_id
      left join core.club_asset ca on ca.club_id = c.id
     where f.codigo = '${federacion}'
     group by c.id, c.nombre_canonico
     order by c.id`);
  const porId = new Map();
  for (const [id, nombre, equipos, inscripciones, filasAsset, noVigentes, otroTipo, vigentesSinBinario, tiene] of filas) {
    porId.set(Number(id), {
      id: Number(id),
      nombre: nombre ?? '',
      equipos: Number(equipos ?? 0),
      inscripciones: Number(inscripciones ?? 0),
      filas_asset: Number(filasAsset ?? 0),
      filas_no_vigentes: Number(noVigentes ?? 0),
      filas_otro_tipo: Number(otroTipo ?? 0),
      filas_vigentes_sin_binario: Number(vigentesSinBinario ?? 0),
      tiene_escudo: tiene === 't',
      codigos: [],
    });
  }

  for (const [clubId, codigo] of consulta(`
    select distinct ts.club_id, te.codigo_externo
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.club c on c.id = ts.club_id
      join core.federation f on f.id = c.federation_id
     where f.codigo = '${federacion}' and te.codigo_externo is not null
     order by 1, 2`)) {
    const club = porId.get(Number(clubId));
    if (club) club.codigos.push(codigo);
  }
  return [...porId.values()];
}

/** Escudos vigentes con su binario en hexadecimal, para validar firma y huella. */
export function escudosVigentes(federacion) {
  return consulta(`
    select ca.id, ca.club_id, c.nombre_canonico, ca.mime_type, length(ca.contenido), ca.sha256,
           encode(ca.contenido, 'hex'), coalesce(ca.fuente_url, ''), ca.observado_en::date
      from core.club_asset ca
      join core.club c on c.id = ca.club_id
      join core.federation f on f.id = c.federation_id
     where ca.tipo = 'escudo' and ca.vigente and f.codigo = '${federacion}'
     order by ca.club_id`).map(([id, clubId, nombre, mime, bytes, sha, hex, fuenteUrl, fecha]) => ({
    id: Number(id),
    club_id: Number(clubId),
    nombre,
    mime_type: mime ?? '',
    bytes: Number(bytes ?? 0),
    sha256: sha ?? '',
    contenido: Buffer.from(hex ?? '', 'hex'),
    fuente_url: fuenteUrl ?? '',
    observado_en: fecha ?? '',
  }));
}

/** Recuento de inscripciones (team_entry) con y sin escudo en el club, y total de la federación. */
export function equiposConEscudo(federacion) {
  const [fila] = consulta(`
    with base as (
      select te.id,
             exists (select 1 from core.club_asset ca
                      where ca.club_id = ts.club_id and ca.tipo = 'escudo' and ca.vigente
                        and length(ca.contenido) > 0) as tiene
        from core.team_entry te
        join core.team_season ts on ts.id = te.team_season_id
        join core.club c on c.id = ts.club_id
        join core.federation f on f.id = c.federation_id
       where f.codigo = '${federacion}')
    select count(*) filter (where tiene), count(*) filter (where not tiene), count(*) from base`);
  return { con: Number(fila?.[0] ?? 0), sin: Number(fila?.[1] ?? 0), total: Number(fila?.[2] ?? 0) };
}

/** Comprueba que los recuentos cuadran entre sí. Devuelve la lista de incoherencias (vacía = bien). */
export function reconcilia({ clasificacion, validados, equipos }) {
  const fallos = [];
  if (clasificacion.con_escudo + clasificacion.sin_escudo !== clasificacion.total) {
    fallos.push('clubes: con + sin ≠ total');
  }
  if (equipos.con + equipos.sin !== equipos.total) fallos.push('equipos: con + sin ≠ total');
  if (validados.length !== clasificacion.con_escudo) {
    fallos.push(`escudos vigentes (${validados.length}) ≠ clubes con escudo (${clasificacion.con_escudo})`);
  }
  if (equipos.con === 0) fallos.push('hay clubes con escudo pero ningún equipo con escudo');
  return fallos;
}

/** Línea de CSV, con comillas dobles sólo cuando hacen falta. */
function csv(campos) {
  return campos
    .map((c) => {
      const texto = String(c ?? '');
      return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    })
    .join(';');
}

/** Ejecuta el informe completo y devuelve el objeto que se imprime y se escribe en CSV. */
export function informa(federacion = FEDERACION_POR_DEFECTO) {
  const clubes = censoDeClubes(federacion);
  const clasificacion = clasifica(clubes);
  const escudos = escudosVigentes(federacion);
  const validados = escudos.map((escudo) => {
    const veredicto = validaEscudo(escudo);
    return { ...escudo, contenido: undefined, ...veredicto };
  });
  const equipos = equiposConEscudo(federacion);
  const fallos = reconcilia({ clasificacion, validados, equipos });
  const porId = new Map(clubes.map((c) => [c.id, c]));

  const filas = clasificacion.sin_escudo === 0 ? [] : clubes
    .filter((c) => c.tiene_escudo !== true)
    .map((club) => {
      const detalle = clasificacion.detallePorClub.get(club.id) ?? { causa: '', motivo: '', hermanos_con_escudo: [], hermanos_sin_escudo: [] };
      return {
        club_id: club.id,
        nombre: club.nombre,
        equipos: club.equipos,
        inscripciones: club.inscripciones,
        causa: detalle.causa,
        motivo: detalle.motivo,
        hermanos_con_escudo: detalle.hermanos_con_escudo,
        hermanos_sin_escudo: detalle.hermanos_sin_escudo,
        codigos: club.codigos,
      };
    })
    .sort((a, b) => a.motivo.localeCompare(b.motivo) || b.equipos - a.equipos || a.club_id - b.club_id);

  // Clubes reales con escudo: filas de `core.club` que comparten binario son el mismo club.
  const porHuella = new Map();
  for (const escudo of validados) porHuella.set(escudo.sha256, (porHuella.get(escudo.sha256) ?? 0) + 1);

  return {
    federacion,
    clubes: {
      total: clubes.length,
      con_escudo: clasificacion.con_escudo,
      sin_escudo: clasificacion.sin_escudo,
      sin_equipos: clasificacion.clubesSinEquipo,
      sin_equipo_ids: clubes.filter((c) => c.equipos === 0).map((c) => c.id),
    },
    escudos: {
      vigentes: validados.length,
      validos: validados.filter((e) => e.problema === null).length,
      con_problema: validados.filter((e) => e.problema !== null).map((e) => ({ club_id: e.club_id, nombre: e.nombre, problema: e.problema })),
      clubes_reales_distintos: porHuella.size,
      huellas_repetidas: [...porHuella].filter(([, n]) => n > 1).length,
      bytes_min: validados.length ? Math.min(...validados.map((e) => e.bytes)) : 0,
      bytes_max: validados.length ? Math.max(...validados.map((e) => e.bytes)) : 0,
    },
    equipos,
    causas: clasificacion.porCausa,
    motivos: clasificacion.porMotivo,
    fallos,
    filas,
    clubesPorNombre: porId,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (nombre) => {
    const i = argv.indexOf(`--${nombre}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  const federacion = arg('federacion') ?? process.env.FEDERACION ?? FEDERACION_POR_DEFECTO;
  if (!/^[a-z][a-z-]*$/.test(federacion)) {
    console.error(`federación no válida: ${federacion}`);
    process.exit(2);
  }

  const resultado = informa(federacion);
  const quiereJson = argv.includes('--json');
  const destinoCsv = argv.includes('--sin-csv') ? null : arg('csv') ?? 'tmp/escudos-faltan.csv';

  if (destinoCsv !== null) {
    const ruta = resolve(RAIZ, destinoCsv);
    mkdirSync(dirname(ruta), { recursive: true });
    const cabecera = ['club_id', 'nombre', 'equipos', 'inscripciones', 'causa', 'motivo',
      'hermanos_con_escudo', 'hermanos_sin_escudo', 'codigos_equipo'];
    const lineas = [csv(cabecera)];
    for (const fila of resultado.filas) {
      lineas.push(csv([fila.club_id, fila.nombre, fila.equipos, fila.inscripciones, fila.causa, fila.motivo,
        fila.hermanos_con_escudo.join('|'), fila.hermanos_sin_escudo.join('|'), fila.codigos.join('|')]));
    }
    writeFileSync(ruta, `${lineas.join('\n')}\n`, 'utf8');
    console.error(`CSV: ${ruta} (${resultado.filas.length} clubes sin escudo)`);
  }

  if (quiereJson) {
    const { clubesPorNombre, ...resto } = resultado;
    void clubesPorNombre;
    console.log(JSON.stringify(resto, null, 2));
  } else {
    const { clubes, escudos, equipos, causas, motivos, fallos } = resultado;
    console.log(`Federación: ${resultado.federacion}`);
    console.log(`Clubes: ${clubes.total} (${clubes.con_escudo} con escudo, ${clubes.sin_escudo} sin escudo; `
      + `${clubes.sin_equipos} de ellos sin ningún equipo)`);
    console.log(`Equipos (inscripciones): ${equipos.total} (${equipos.con} con escudo, ${equipos.sin} sin escudo)`);
    console.log(`Escudos vigentes: ${escudos.vigentes} (${escudos.validos} válidos, ${escudos.con_problema.length} con problema)`
      + ` · clubes reales distintos por huella: ${escudos.clubes_reales_distintos}`);
    console.log(`Causas: ${JSON.stringify(causas)}`);
    console.log(`Motivos: ${JSON.stringify(motivos)}`);
    console.log(fallos.length === 0 ? 'Reconciliación: cuadra.' : `Reconciliación: NO cuadra -> ${fallos.join(' · ')}`);
  }

  if (argv.includes('--exigir') && resultado.fallos.length > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
