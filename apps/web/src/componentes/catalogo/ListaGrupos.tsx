import Link from 'next/link';
import type { Route } from 'next';
import type { FilaGrupoSelector } from '@/consultas/catalogo-selector';
import { Badge, Card, Progress } from '@/componentes/ui';
import { numero } from '@/lib/presentacion-canonico';
import {
  etiquetaAmbito, etiquetaCategoria, etiquetaGenero, etiquetaModalidad,
} from '@/lib/vocabulario-pantalla';

/**
 * Cobertura de un grupo en palabras.
 *
 * Un grupo sin punto de control no tiene partidos medidos: se dice «Cobertura sin medir», nunca «0 de
 * 0». `numero()` deja los ausentes como «—», pero aquí se prefiere una frase: es la portada de la
 * búsqueda y una raya suelta no explica nada.
 */
function cobertura(fila: FilaGrupoSelector): { partidos: string; actas: string | null; porcentaje: number | null } {
  if (fila.partidos_conocidos === null) {
    return { partidos: 'Cobertura sin medir', actas: null, porcentaje: null };
  }
  const porcentaje = Number(fila.partidos_conocidos) > 0
    ? Math.round((Number(fila.partidos_con_resultado) / Number(fila.partidos_conocidos)) * 100)
    : 0;
  const partidos = `${numero(fila.partidos_con_resultado)} de ${numero(fila.partidos_conocidos)} partidos`;
  const actas = fila.actas_disponibles === null
    ? null
    : `Actas ${numero(fila.actas_parseadas)} de ${numero(fila.actas_disponibles)}`;
  return { partidos, actas, porcentaje };
}

/**
 * Resultados del selector: una fila por grupo, con su federación, temporada, competición, grupo y
 * cobertura, y el enlace a la ficha (`/explorar/competicion/<grupo_id>`).
 *
 * La fila entera es el enlace: en móvil no hay que apuntar a un texto pequeño. La cobertura se enseña
 * con cifras, con palabras y con una barra; lo que no está medido no se convierte en cero.
 */
export function ListaGrupos({ filas }: { filas: readonly FilaGrupoSelector[] }) {
  return (
    <Card className="overflow-hidden">
      <ul className="m-0 list-none divide-y divide-[var(--fondo-sutil)] p-0">
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
            <li key={fila.grupo_id}>
              <Link href={`/explorar/competicion/${fila.grupo_id}` as Route}
                className="grid min-h-11 gap-2 px-4 py-3.5 transition-colors duration-150 hover:bg-[var(--fondo-sutil)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge>{fila.temporada}</Badge>
                  </div>
                  <p className="m-0 text-cuerpo font-semibold text-[var(--texto)]">
                    {fila.edicion} · {fila.grupo}
                  </p>
                  {contexto.length > 0 && (
                    <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{contexto.join(' · ')}</p>
                  )}
                </div>
                <div className="text-nota text-[var(--texto-suave)] sm:min-w-[13rem] sm:text-right">
                  <p className="m-0">{medida.partidos}</p>
                  {medida.actas && <p className="m-0">{medida.actas}</p>}
                  {medida.porcentaje !== null && (
                    <Progress valor={medida.porcentaje} etiqueta={`Cobertura de ${fila.edicion} · ${fila.grupo}`} className="mt-1.5 sm:ml-auto sm:w-32" />
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
