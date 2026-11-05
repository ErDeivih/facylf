import Link from 'next/link';
import type { Route } from 'next';
import type { FilaGrupoSelector } from '@/consultas/catalogo-selector';
import { numero } from '@/lib/presentacion-canonico';
import {
  etiquetaAmbito, etiquetaCategoria, etiquetaGenero, etiquetaModalidad,
} from '@/lib/vocabulario-pantalla';
import { INSIGNIA, TARJETA } from './controles';

/**
 * Cobertura de un grupo en palabras.
 *
 * Un grupo sin punto de control no tiene partidos medidos: se dice «Cobertura sin medir», nunca «0 de
 * 0». `numero()` deja los ausentes como «—», pero aquí se prefiere una frase: es la portada de la
 * búsqueda y una raya suelta no explica nada.
 */
function cobertura(fila: FilaGrupoSelector): { partidos: string; actas: string | null } {
  if (fila.partidos_conocidos === null) {
    return { partidos: 'Cobertura sin medir', actas: null };
  }
  const partidos = `${numero(fila.partidos_con_resultado)} de ${numero(fila.partidos_conocidos)} partidos`;
  const actas = fila.actas_disponibles === null
    ? null
    : `Actas ${numero(fila.actas_parseadas)} de ${numero(fila.actas_disponibles)}`;
  return { partidos, actas };
}

/**
 * Resultados del selector: una fila por grupo, con su federación, temporada, competición, grupo y
 * cobertura, y el enlace a la ficha (`/explorar/competicion/<grupo_id>`).
 *
 * La fila entera es el enlace: en móvil no hay que apuntar a un texto pequeño. La cobertura se enseña
 * con cifras y con palabras; lo que no está medido no se convierte en cero.
 */
export function ListaGrupos({ filas }: { filas: readonly FilaGrupoSelector[] }) {
  return (
    <ul className={`${TARJETA} m-0 list-none p-0`}>
      {filas.map((fila) => {
        const medida = cobertura(fila);
        // «Sin clasificar» dos veces seguidas no informa de nada: se enseñan los valores que se saben.
        const contexto = [
          etiquetaAmbito(fila.ambito),
          etiquetaCategoria(fila.categoria),
          etiquetaModalidad(fila.modalidad),
          etiquetaGenero(fila.genero),
        ].filter((valor) => valor !== 'Sin clasificar');
        return (
          <li key={fila.grupo_id} className="border-t border-[var(--fondo-sutil)] first:border-t-0">
            <Link href={`/explorar/competicion/${fila.grupo_id}` as Route}
              className="grid gap-2 px-4 py-3.5 hover:bg-[var(--fondo-sutil)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={INSIGNIA}>{fila.temporada}</span>
                  <span className={INSIGNIA}>{fila.federacion_corta ?? fila.federacion_nombre}</span>
                </div>
                <p className="m-0 text-cuerpo font-semibold text-[var(--texto)]">
                  {fila.edicion} · {fila.grupo}
                </p>
                {contexto.length > 0 && (
                  <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{contexto.join(' · ')}</p>
                )}
              </div>
              <div className="text-nota text-[var(--texto-suave)] sm:text-right">
                <p className="m-0">{medida.partidos}</p>
                {medida.actas && <p className="m-0">{medida.actas}</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
