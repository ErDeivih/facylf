import { consulta } from '@/consultas/adaptadores/postgres/conexion';

/**
 * Qué fotos de persona enseña esta instancia.
 *
 * Regla (16/11/2026): la ficha muestra la foto **sólo si la persona es adulta y la foto existe**. La
 * demo pública (GitHub Pages) no lleva fotos de nadie. Las fotos de menores sólo se ven si la instancia
 * privada lo pide expresamente.
 *
 * Es un interruptor de despliegue, `FACYLF_FOTOS`, y no una constante: lo que no se configura no se
 * enseña.
 *
 *   · sin variable (la demo sin exportación, un despliegue nuevo, una prueba) → ninguna foto;
 *   · `FACYLF_FOTOS=adultos` (o `1`)                          → sólo personas que no son menores;
 *   · `FACYLF_FOTOS=todas`                                    → también menores. La demo pública las exporta como ficheros estáticos por decisión expresa de David
 *     (17/11/2026).
 *
 * «No se sabe si es menor» cuenta como menor: `core.person.es_menor` nulo no desbloquea una foto.
 */
export type ModoDeFotos = 'ninguna' | 'adultos' | 'todas';

export function modoDeFotos(valor: string | undefined = process.env.FACYLF_FOTOS): ModoDeFotos {
  const v = (valor ?? '').trim().toLowerCase();
  if (v === 'todas') return 'todas';
  if (v === 'adultos' || v === '1') return 'adultos';
  return 'ninguna';
}

/** ¿Se puede enseñar la foto de esta persona, si la tiene? */
export function fotoPermitida(esMenor: boolean | null | undefined, modo: ModoDeFotos = modoDeFotos()): boolean {
  if (modo === 'todas') return true;
  if (modo === 'adultos') return esMenor === false;
  return false;
}

/**
 * ¿Hay foto que enseñar de esta persona? `false` si no se permite, si no la tiene o si la tabla aún no
 * existe (migración 0066 sin aplicar): en los tres casos la ficha pinta iniciales.
 */
export async function tieneFoto(personId: number, esMenor: boolean | null | undefined): Promise<boolean> {
  if (!fotoPermitida(esMenor)) return false;
  try {
    const [fila] = await consulta<{ hay: boolean }>(
      `select exists(select 1 from core.person_asset where person_id = $1 and tipo = 'foto' and vigente) as hay limit 1`,
      [personId]);
    return fila?.hay === true;
  } catch {
    return false;
  }
}
