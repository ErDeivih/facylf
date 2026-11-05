import type { PreferenciasAviso } from '@/consultas/mi-cuenta';

/**
 * Reglas de las preferencias de aviso de «Mi cuenta», sin Next ni base de datos.
 *
 * La función SQL `app.guarda_preferencias` vuelve a validar el correo y los eventos; aquí se filtra
 * antes para no llevar a la base un formulario manipulado y para poder responder con un aviso claro.
 * `push` no tiene control todavía: se conserva el valor guardado.
 */

export const CORREOS_DE_AVISO = ['nunca', 'al_momento', 'resumen'] as const;
export type CorreoDeAviso = (typeof CORREOS_DE_AVISO)[number];

export const EVENTOS_DE_AVISO = [
  'programado', 'cambio_horario', 'resultado', 'acta', 'jornada_completa', 'jugador',
] as const;

const HORA = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function hora(valor: FormDataEntryValue | null): string | null {
  if (typeof valor !== 'string') return null;
  const limpia = valor.trim();
  if (!HORA.test(limpia)) return null;
  return limpia.length === 5 ? `${limpia}:00` : limpia;
}

function esCorreo(valor: unknown): valor is CorreoDeAviso {
  return typeof valor === 'string' && (CORREOS_DE_AVISO as readonly string[]).includes(valor);
}

export type PreferenciasDelFormulario = Pick<
  PreferenciasAviso, 'en_app' | 'push' | 'correo' | 'hora_resumen' | 'silencio_desde' | 'silencio_hasta' | 'eventos'
>;

/**
 * Convierte el formulario en preferencias completas. Devuelve `null` si un valor no es válido; la
 * ruta lo trata como error y no guarda nada. Un silencio vacío significa «sin silencio» (`null`), no
 * una hora inventada.
 */
export function preferenciasDelFormulario(
  formulario: FormData,
  actuales: PreferenciasDelFormulario,
): PreferenciasDelFormulario | null {
  const correo = formulario.get('correo');
  if (!esCorreo(correo)) return null;

  const horaResumen = hora(formulario.get('hora_resumen'));
  if (horaResumen === null) return null;

  const desdeCrudo = formulario.get('silencio_desde');
  const hastaCrudo = formulario.get('silencio_hasta');
  const desde = typeof desdeCrudo === 'string' && desdeCrudo.trim() === '' ? null : hora(desdeCrudo);
  const hasta = typeof hastaCrudo === 'string' && hastaCrudo.trim() === '' ? null : hora(hastaCrudo);
  if (desde === null && typeof desdeCrudo === 'string' && desdeCrudo.trim() !== '') return null;
  if (hasta === null && typeof hastaCrudo === 'string' && hastaCrudo.trim() !== '') return null;
  if (desde === null && desdeCrudo !== null && typeof desdeCrudo !== 'string') return null;
  if (hasta === null && hastaCrudo !== null && typeof hastaCrudo !== 'string') return null;

  const eventosCrudos = formulario.getAll('eventos');
  const eventos = [...new Set(eventosCrudos.filter((e): e is string => typeof e === 'string'))];
  if (eventos.some((e) => !(EVENTOS_DE_AVISO as readonly string[]).includes(e))) return null;

  return {
    en_app: formulario.get('en_app') === 'on',
    push: actuales.push,
    correo,
    hora_resumen: horaResumen,
    silencio_desde: desde,
    silencio_hasta: hasta,
    eventos,
  };
}
