import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Vacio } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPO_POR_CODIGOS_EXTERNOS } from '@/consultas/entidades';
import type { FilaGrupoResuelto } from '@/consultas/entidades';

export const dynamic = 'force-dynamic';

/**
 * Calendario de un grupo: **redirige al canónico**.
 *
 * Esta ruta leía las colas SQLite (`competicionLocal`) para pintar el calendario del grupo. El
 * calendario ya existe, mejor y verificado, en la ficha canónica del grupo: allí los partidos llevan su
 * jornada, su marcador, la calidad del acta y la cobertura medida, y la página no recorre archivos
 * federativos dentro de una petición de usuario, que es lo que prohíbe ARQUITECTURA.md §7.
 *
 * **No se pierde nada al redirigir, y eso se ha comprobado antes de hacerlo**: esta ruta no usaba
 * `grupoEnCanonico` —el puente que sí tiene `/competicion/[slug]` y que la convierte en un híbrido
 * deliberado—. Era un lector puro de la cola, así que pasar al canónico es una mejora neta y no un
 * intercambio.
 *
 * De dónde sale el grupo: del slug heredado, que tiene la forma `t21-c22911157-g22911162`. La temporada
 * codificada ahí es la de la cola y **no se traduce**; los otros dos códigos sí son los `codigo_externo`
 * del canónico y bastan para resolverlo (ver `GRUPO_POR_CODIGOS_EXTERNOS`).
 */

/** Saca un código de la forma `c<dígitos>` o `g<dígitos>` del slug heredado. */
function codigoDelSlug(slug: string, letra: 'c' | 'g'): string | null {
  const encontrado = new RegExp(`(?:^|-)${letra}(\\d+)(?:-|$)`).exec(slug);
  return encontrado?.[1] ?? null;
}

export default async function Calendario({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const edicion = codigoDelSlug(slug, 'c');
  const grupo = codigoDelSlug(slug, 'g');

  if (!edicion || !grupo) {
    return (
      <Vacio
        titulo="Enlace antiguo no reconocido"
        motivo="Esta dirección venía del formato anterior y no se le pueden sacar los códigos de la competición y del grupo. No se adivinan: un enlace a la competición equivocada es peor que un enlace roto."
        accion={{ texto: 'Ver el catálogo de competiciones', href: '/competiciones' }}
      />
    );
  }

  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Calendario" motivo={motivo} />;

  let fila: FilaGrupoResuelto | null = null;
  try {
    fila = (await consulta<FilaGrupoResuelto>(GRUPO_POR_CODIGOS_EXTERNOS.sql, [edicion, grupo]))[0] ?? null;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Calendario" motivo={error.message} />;
    throw error;
  }

  // El `redirect` va FUERA del `try`: lanza una excepción propia de Next para cortar el render, y un
  // `catch` que la envolviera se la comería y la redirección no ocurriría.
  if (fila) redirect(`/canonico/${fila.federacion}/${fila.grupo_codigo}` as Route);

  return (
    <Vacio
      titulo="Este grupo todavía no está en el canónico"
      motivo={`La competición ${edicion} y su grupo ${grupo} existen en la fuente, pero no hay ninguna edición importada con esos códigos. No es que el grupo no exista: es que no está importado, y esta página ya no enseña los datos de la cola.`}
      accion={{ texto: 'Ver qué hay importado', href: '/canonico' }}
    />
  );
}
