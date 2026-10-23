import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Vacio } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPO_POR_CODIGOS_EXTERNOS } from '@/consultas/entidades';
import type { FilaGrupoResuelto } from '@/consultas/entidades';

export const dynamic = 'force-dynamic';

/**
 * Jornada de un grupo: **redirige al canónico**.
 *
 * Esta ruta leía las colas SQLite (`competicionLocal`) para pintar los partidos de una jornada y la
 * clasificación tras ella. La ficha canónica del grupo enseña los partidos con su jornada, su marcador,
 * la calidad del acta y la cobertura medida, así que es mejora neta igual que `calendario`: se ha
 * comprobado que esta ruta tampoco usaba `grupoEnCanonico`, el puente que sí tiene `/competicion/[slug]`.
 *
 * **Una pérdida que sí existe, y se dice en vez de disimularla:** la ficha canónica del grupo lista
 * todos los partidos y **no preselecciona la jornada**, así que quien entre por `.../jornada/14` verá
 * el grupo entero y tendrá que buscar la J14 en la lista. La alternativa habría sido mandarlo a
 * `/partidos?j=14`, que sí preselecciona la jornada pero **pierde el grupo**: enseñaría las jornadas 14
 * de todos los grupos de la federación. Entre perder el grupo y perder la jornada se ha elegido
 * conservar el grupo, que es lo que identifica lo que el usuario pulsó.
 */

/** Saca un código de la forma `c<dígitos>` o `g<dígitos>` del slug heredado. */
function codigoDelSlug(slug: string, letra: 'c' | 'g'): string | null {
  const encontrado = new RegExp(`(?:^|-)${letra}(\\d+)(?:-|$)`).exec(slug);
  return encontrado?.[1] ?? null;
}

export default async function Jornada({
  params,
}: {
  params: Promise<{ slug: string; numero: string }>;
}) {
  const { slug, numero } = await params;
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
  if (motivo) return <SinCanonico titulo="Jornada" motivo={motivo} />;

  let fila: FilaGrupoResuelto | null = null;
  try {
    fila = (await consulta<FilaGrupoResuelto>(GRUPO_POR_CODIGOS_EXTERNOS.sql, [edicion, grupo]))[0] ?? null;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Jornada" motivo={error.message} />;
    throw error;
  }

  // El `redirect` va FUERA del `try`: lanza una excepción propia de Next para cortar el render, y un
  // `catch` que la envolviera se la comería sin decir nada.
  if (fila) redirect(`/canonico/${fila.federacion}/${fila.grupo_codigo}` as Route);

  return (
    <Vacio
      titulo="Este grupo todavía no está en el canónico"
      motivo={`La competición ${edicion} y su grupo ${grupo} existen en la fuente, pero no hay ninguna edición importada con esos códigos. La jornada ${numero} no se puede situar sin el grupo, y esta página ya no enseña los datos de la cola.`}
      accion={{ texto: 'Ver qué hay importado', href: '/canonico' }}
    />
  );
}
