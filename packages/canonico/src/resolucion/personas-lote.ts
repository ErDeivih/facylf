/**
 * Personas de un lote: caché en memoria y actualizaciones diferidas.
 *
 * Dos problemas reales, medidos sobre las colas de verdad:
 *
 * 1. **Identidad falsa.** El importador resolvía al jugador sin código federativo con un código
 *    inventado (`nominal:<NOMBRE>`) y `context_key` vacío. Eso no es un código: es un nombre, y une a
 *    todas las personas que se llaman igual en toda la federación y en todas las temporadas. Medido:
 *    Cataluña trae **255.701 de 255.701** participaciones sin `jugador_codigo`; Navarra, 286.064 de
 *    422.475; Castilla y León, 17.596 de 644.336. Con la regla anterior, la mitad del país acababa en
 *    perfiles fusionados y además marcados como identidad confirmada. Aquí, sin código, la identidad
 *    es **nominal** (`identidad_nominal = true`) y su ámbito es el equipo de esa temporada, que es la
 *    granularidad que fija ADR-0011 para quien sólo se conoce por su nombre.
 *
 * 2. **Coste.** Resolver una persona costaba dos o tres viajes a PostgreSQL por aparición: 12.177
 *    apariciones de un grupo = decenas de miles de consultas. La identidad de una persona dentro de un
 *    lote no cambia, así que se resuelve una vez y las columnas de seguimiento (`primera_acta`,
 *    `ultima_acta`, `es_menor`) se aplican al final, en una sola sentencia para todas.
 *
 * Lo que **no** hace: fusionar. Un nombre igual sigue sin unir a dos personas (regla 6).
 */
import type { ClienteCanonico } from '../destino/pool.js';
import type { Repositorio } from '../destino/repositorio.js';
import type { Normalizador } from './contexto.js';
import { resuelvePersonaConCodigo, resuelvePersonaNominal, type PersonaResuelta } from './persona.js';

export type DatosConCodigo = {
  federacionId: number;
  codigo: string;
  nombre: string;
  esMenor: boolean;
  primeraActa: string | null;
  ultimaActa: string | null;
};

export type DatosNominales = {
  federacionId: number;
  etiquetaTemporada: string;
  nombre: string;
  rol: string;
  ambito: 'edicion' | 'equipo';
  ambitoId: number;
  esMenor: boolean;
};

export class PersonasEnLote {
  private readonly resueltas = new Map<string, PersonaResuelta>();
  /** Seguimiento por persona: el `codigo_externo` con el que actualizar y sus actas vistas. */
  private readonly seguimiento = new Map<number, { codigo: string; primera: string | null; ultima: string | null }>();
  private readonly menores = new Set<number>();

  constructor(
    private readonly cliente: ClienteCanonico,
    private readonly repo: Repositorio,
    private readonly normalizador: Normalizador,
    private readonly federacionId: number,
  ) {}

  /** Persona con código federativo de verdad (nunca un nombre disfrazado de código). */
  async conCodigo(datos: DatosConCodigo): Promise<PersonaResuelta> {
    const codigo = datos.codigo.trim();
    if (codigo === '') throw new Error('conCodigo sin código: una persona sin código federativo es una identidad nominal.');
    const clave = `c:${this.federacionId}:${codigo}`;
    let resuelta = this.resueltas.get(clave);
    if (!resuelta) {
      resuelta = await resuelvePersonaConCodigo(this.cliente, this.repo, { ...datos, codigo });
      this.resueltas.set(clave, resuelta);
    }
    this.sigue(resuelta.personId, codigo, datos.primeraActa, datos.ultimaActa);
    if (datos.esMenor) this.menores.add(resuelta.personId);
    return resuelta;
  }

  /**
   * Persona sin código: identidad nominal con el ámbito que fija ADR-0011 —equipo de la temporada
   * para jugadores y cuerpo técnico, edición para árbitros—. Nunca por partido, nunca por nombre a
   * secas.
   */
  async nominal(datos: DatosNominales): Promise<PersonaResuelta> {
    const resuelta = await resuelvePersonaNominal(this.cliente, this.repo, this.normalizador, {
      federacionId: datos.federacionId,
      etiquetaTemporada: datos.etiquetaTemporada,
      nombre: datos.nombre,
      rol: datos.rol,
      ambito: datos.ambito,
      ambitoId: datos.ambitoId,
      esMenor: datos.esMenor,
    });
    if (datos.esMenor) this.menores.add(resuelta.personId);
    return resuelta;
  }

  /** Jugador sin código en la fuente: se le identifica por nombre dentro de su equipo esa temporada. */
  async jugadorSinCodigo(datos: Omit<DatosNominales, 'rol' | 'ambito' | 'ambitoId'> & { teamEntryId: number }): Promise<PersonaResuelta> {
    return this.nominal({ ...datos, rol: 'jugador', ambito: 'equipo', ambitoId: datos.teamEntryId });
  }

  private sigue(personId: number, codigo: string, primeraActa: string | null, ultimaActa: string | null): void {
    const registro = this.seguimiento.get(personId);
    if (!registro) {
      this.seguimiento.set(personId, { codigo, primera: primeraActa, ultima: ultimaActa });
      return;
    }
    // Mismas reglas que las sentencias fila a fila de antes: `ultima_acta` se queda con el último
    // valor no nulo y `primera_acta` con el primero, sin borrar nunca lo que ya había.
    if (ultimaActa !== null) registro.ultima = ultimaActa;
    if (registro.primera === null) registro.primera = primeraActa;
  }

  /** Aplica de una vez el seguimiento de actas y la marca de menor. Se llama al cerrar el lote. */
  async vuelca(): Promise<void> {
    if (this.seguimiento.size > 0) {
      const filas = [...this.seguimiento.entries()];
      await this.cliente.query(
        `update core.person_source_identity as psi
            set ultima_acta = coalesce(v.ultima, psi.ultima_acta),
                primera_acta = coalesce(psi.primera_acta, v.primera)
           from (select unnest($1::bigint[]) as person_id,
                        unnest($2::text[])   as codigo,
                        unnest($3::text[])   as primera,
                        unnest($4::text[])   as ultima) v
          where psi.person_id = v.person_id and psi.codigo_externo = v.codigo`,
        [filas.map(([id]) => id), filas.map(([, r]) => r.codigo), filas.map(([, r]) => r.primera), filas.map(([, r]) => r.ultima)],
      );
    }
    if (this.menores.size > 0) {
      await this.cliente.query(
        'update core.person set es_menor = true where id = any($1::bigint[]) and es_menor = false',
        [[...this.menores]],
      );
    }
  }
}
