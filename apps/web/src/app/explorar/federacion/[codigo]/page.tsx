import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  EDICIONES_DE_LA_FEDERACION, FEDERACION_POR_CODIGO,
  type FilaEdicionDeFederacion, type FilaFederacionCabecera,
} from '@/consultas/federacion-ficha';
import {
  AVISOS_DE_DATOS, FICHA_FEDERACION, type FilaAvisoDatos, type FilaFichaFederacion,
} from '@/consultas/federaciones';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import {
  AvisosDeLaFederacion, CabeceraFederacion, ComparativaDeFederaciones, CompeticionesDeLaFederacion, QueDatosPublica,
} from '@/componentes/federacion/Federacion';
import {
  avisosDeCobertura, codigoDeFederacion, combinaAvisos, federacionesComparables, medidasDeCobertura,
  tituloDeFederacion,
} from '@/lib/federacion-ficha';

/**
 * Ficha de federación: `/explorar/federacion/[codigo]`.
 *
 * El código es el estable de `core.federation` (`castilla-leon`, `euskadi`…), el mismo que usan las URLs
 * del resto del producto. La ficha enseña la identidad, lo que la federación publica (medido), los avisos
 * con cifras y sus competiciones de la temporada más reciente, con enlace a cada una.
 *
 * Cuatro consultas en la misma foto: identidad, perfil medido, competiciones y avisos del catálogo. Las
 * federaciones de pruebas y las retiradas de la web responden 404, como en el resto del producto.
 */
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const { codigo: crudo } = await params;
  const codigo = codigoDeFederacion(crudo);
  if (codigo === null) return {};
  try {
    const filasCabecera = await consulta<FilaFederacionCabecera>(FEDERACION_POR_CODIGO.sql, [codigo]);
    return filasCabecera[0] ? { title: tituloDeFederacion(filasCabecera[0].nombre) } : {};
  } catch {
    return {};
  }
}

export default async function PaginaFederacion({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: crudo } = await params;
  const codigo = codigoDeFederacion(crudo);
  if (codigo === null) notFound();

  let cabecera: FilaFederacionCabecera | undefined;
  let fichas: FilaFichaFederacion[] = [];
  let ediciones: FilaEdicionDeFederacion[] = [];
  let avisosCatalogo: FilaAvisoDatos[] = [];
  try {
    const [filasCabecera, filasFichas, filasEdiciones, filasAvisos] = await consultaEnUnaFoto([
      { sql: FEDERACION_POR_CODIGO.sql, parametros: [codigo] },
      { sql: FICHA_FEDERACION.sql, parametros: [null] },
      { sql: EDICIONES_DE_LA_FEDERACION.sql, parametros: [codigo, null, 80] },
      { sql: AVISOS_DE_DATOS.sql, parametros: [codigo, null] },
    ]);
    cabecera = (filasCabecera as unknown as FilaFederacionCabecera[])[0];
    fichas = filasFichas as unknown as FilaFichaFederacion[];
    ediciones = filasEdiciones as unknown as FilaEdicionDeFederacion[];
    avisosCatalogo = filasAvisos as unknown as FilaAvisoDatos[];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Federación" />;
    throw error;
  }
  if (!cabecera) notFound();

  const ficha = fichas.find((fila) => fila.codigo === codigo) ?? null;
  const medidas = medidasDeCobertura(ficha);
  const avisos = combinaAvisos(avisosDeCobertura(ficha), avisosCatalogo);
  const comparables = federacionesComparables(fichas, codigo, 12);

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: 'Inicio', href: '/' },
        { texto: 'Federaciones' },
        { texto: ficha?.nombre_corto ?? cabecera.nombre },
      ]} />
      <CabeceraFederacion federacion={cabecera} ficha={ficha} />
      <QueDatosPublica medidas={medidas} />
      <AvisosDeLaFederacion avisos={avisos} />
      <CompeticionesDeLaFederacion ediciones={ediciones} federacion={codigo} />
      <ComparativaDeFederaciones fichas={comparables} actual={codigo} />
    </div>
  );
}
