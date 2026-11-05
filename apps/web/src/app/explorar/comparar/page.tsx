import type { Metadata } from 'next';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import { BUSQUEDA_POR_NOMBRE, type FilaBusqueda } from '@/consultas/entidades';
import {
  PERSONAS_POR_IDS, TRAYECTORIAS_DE_PERSONAS, type FilaPersonaComparada, type FilaTrayectoriaComparada,
} from '@/consultas/comparar';
import {
  EstadoDelComparador, FichasDeJugadores, FormularioComparar, ListaDeCandidatos, MetricasComparadas,
  TrayectoriasComparadas,
} from '@/componentes/comparar/Comparar';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import {
  construyeLado, metricasComparadas, temporadasComparadas, textoDeSeleccion,
} from '@/lib/comparar';
import { idDeFicha } from '@/lib/fichas';
import { tituloDelComparador } from '@/lib/federacion-ficha';

/**
 * Comparador de jugadores: `/explorar/comparar?a=<id o nombre>&b=<id o nombre>`.
 *
 * La selección se hace por nombre o por identificador de ficha. Un nombre puede coincidir con varias
 * personas y **no se elige sola**: cuando hay más de un candidato se enseñan y el usuario decide, porque
 * un nombre igual no une a dos personas. Si el valor es un id, se usa directamente.
 *
 * Dos consultas en una sola foto para la comparación (las dos personas y sus trayectorias); la búsqueda
 * por nombre sólo se ejecuta cuando hace falta. Ninguna cifra ausente se convierte en cero: cada lado
 * dice «sin datos» y se compara contra el otro, no contra un 0.
 */
export const revalidate = 60;

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { a, b } = await searchParams;
  return { title: tituloDelComparador(textoDeSeleccion(a), textoDeSeleccion(b)) };
}

const buscaJugadores = async (texto: string): Promise<FilaBusqueda[]> => {
  const filas = await consulta<FilaBusqueda>(BUSQUEDA_POR_NOMBRE.sql, [texto, null, 'jugador', null, 10]);
  return filas.filter((fila) => fila.tipo === 'jugador');
};

/** Resultado de resolver un lado: un id, una lista de candidatos o nada encontrado. */
type Resolucion =
  | { tipo: 'vacio' }
  | { tipo: 'id'; id: number }
  | { tipo: 'candidatos'; texto: string; candidatos: FilaBusqueda[] }
  | { tipo: 'sin-resultados'; texto: string };

async function resuelveLado(crudo: string | null): Promise<Resolucion> {
  if (crudo === null) return { tipo: 'vacio' };
  const id = idDeFicha(crudo);
  if (id !== null) return { tipo: 'id', id };
  const candidatos = await buscaJugadores(crudo);
  if (candidatos.length === 0) return { tipo: 'sin-resultados', texto: crudo };
  if (candidatos.length === 1) return { tipo: 'id', id: Number(candidatos[0]!.entidad_id) };
  return { tipo: 'candidatos', texto: crudo, candidatos };
}

export default async function PaginaComparar({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const crudoA = textoDeSeleccion(parametros.a);
  const crudoB = textoDeSeleccion(parametros.b);

  let resolucionA: Resolucion;
  let resolucionB: Resolucion;
  try {
    [resolucionA, resolucionB] = await Promise.all([resuelveLado(crudoA), resuelveLado(crudoB)]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Comparar jugadores" />;
    throw error;
  }

  const idA = resolucionA.tipo === 'id' ? resolucionA.id : null;
  const idB = resolucionB.tipo === 'id' ? resolucionB.id : null;

  let personas: FilaPersonaComparada[] = [];
  let trayectorias: FilaTrayectoriaComparada[] = [];
  if (idA !== null && idB !== null) {
    try {
      const [filasPersonas, filasTrayectorias] = await consultaEnUnaFoto([
        { sql: PERSONAS_POR_IDS.sql, parametros: [[idA, idB]] },
        { sql: TRAYECTORIAS_DE_PERSONAS.sql, parametros: [[idA, idB], 200] },
      ]);
      personas = filasPersonas as unknown as FilaPersonaComparada[];
      trayectorias = filasTrayectorias as unknown as FilaTrayectoriaComparada[];
    } catch (error) {
      if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Comparar jugadores" />;
      throw error;
    }
  }

  const personaA = personas.find((persona) => Number(persona.persona_id) === idA);
  const personaB = personas.find((persona) => Number(persona.persona_id) === idB);
  const ladoA = personaA
    ? construyeLado(personaA, trayectorias.filter((fila) => Number(fila.persona_id) === Number(personaA.persona_id)))
    : null;
  const ladoB = personaB
    ? construyeLado(personaB, trayectorias.filter((fila) => Number(fila.persona_id) === Number(personaB.persona_id)))
    : null;

  const comparacionPosible = ladoA !== null && ladoB !== null;
  const metricas = ladoA !== null && ladoB !== null ? metricasComparadas(ladoA, ladoB) : [];
  const temporadas = ladoA !== null && ladoB !== null ? temporadasComparadas(ladoA.trayectoria, ladoB.trayectoria, 8) : [];

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[{ texto: 'Inicio', href: '/' }, { texto: 'Comparar jugadores' }]} />
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Comparar jugadores</h1>
      <FormularioComparar a={crudoA ?? ''} b={crudoB ?? ''} />

      {resolucionA.tipo === 'candidatos' && (
        <ListaDeCandidatos lado="a" texto={resolucionA.texto} candidatos={resolucionA.candidatos} otro={crudoB ?? ''} />
      )}
      {resolucionB.tipo === 'candidatos' && (
        <ListaDeCandidatos lado="b" texto={resolucionB.texto} candidatos={resolucionB.candidatos} otro={crudoA ?? ''} />
      )}

      {resolucionA.tipo === 'sin-resultados' && (
        <EstadoDelComparador titulo="Sin resultados para el jugador A">
          No hay ningún jugador que coincida con «{resolucionA.texto}». Prueba con otro apellido o con el
          identificador de su ficha.
        </EstadoDelComparador>
      )}
      {resolucionB.tipo === 'sin-resultados' && (
        <EstadoDelComparador titulo="Sin resultados para el jugador B">
          No hay ningún jugador que coincida con «{resolucionB.texto}». Prueba con otro apellido o con el
          identificador de su ficha.
        </EstadoDelComparador>
      )}

      {idA !== null && idB !== null && !comparacionPosible && (
        <EstadoDelComparador titulo="No se encuentran los dos jugadores">
          {personaA === undefined && personaB === undefined
            ? 'Ninguno de los dos identificadores existe en el archivo.'
            : personaA === undefined
              ? 'El jugador A no existe en el archivo; el B sí.'
              : 'El jugador B no existe en el archivo; el A sí.'}
        </EstadoDelComparador>
      )}

      {ladoA !== null && ladoB !== null
        ? (
          <>
            <FichasDeJugadores a={ladoA} b={ladoB} />
            <MetricasComparadas a={ladoA} b={ladoB} metricas={metricas} />
            <TrayectoriasComparadas temporadas={temporadas} a={ladoA} b={ladoB} />
          </>
        )
        : (
          <EstadoDelComparador titulo="Elige dos jugadores">
            Escribe dos nombres o dos identificadores arriba y pulsa «Comparar». Si un nombre coincide con
            varias personas, la página te las enseña para que elijas tú; no se une a nadie por parecido.
          </EstadoDelComparador>
        )}
    </div>
  );
}
