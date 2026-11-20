import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible } from '@/consultas/adaptadores/postgres/conexion';
import { type FilaFrescura } from '@/consultas/observabilidad';
import { chequeosEnVivo, frescuraYCobertura } from '@/consultas/observabilidad-cache';
import { NOMBRE_PRODUCTO } from '@/componentes/marca/marca';
import { AvisoSinArchivo } from '@/componentes/fichas/piezas';
import { EsqueletoEstadisticas } from '@/componentes/estadisticas/Estados';
import { CabeceraPantalla } from '@/componentes/observabilidad/piezas';
import {
  AlertasAbiertas, CalidadDeLosDatos, CopiasDeSeguridad, DatosPorFederacion, EstadoDeLasAreas,
  RendimientoDeLaPlataforma,
} from '@/componentes/observabilidad/Salud';
import { AREAS_PUBLICAS } from '@/lib/observabilidad-pantalla';
import { fechaCorta } from '@/lib/presentacion-canonico';

/**
 * Salud de la plataforma: `/explorar/salud`.
 *
 * Enseña el estado de AHORA, no una media: las comprobaciones de salud del proyecto, agrupadas por área,
 * las que están en fallo o aviso, la cobertura guardada de cada federación, las copias y la calidad de
 * los datos. No hay gráficos ni cifras de relleno.
 *
 * Las comprobaciones son caras (ventanas de 60 días sobre tablas de hechos): se cachean cinco minutos y
 * se sirven dentro de un `Suspense` con el esqueleto del sistema, para que la cabecera y la cobertura
 * aparezcan al momento. Los datos de cuentas y de publicidad no se enseñan aquí.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `Salud de la plataforma — ${NOMBRE_PRODUCTO}` };

/** Todo lo que sale de las comprobaciones de salud. */
async function EstadoVivo({ ultimaActa }: { ultimaActa: string | null }) {
  let chequeos;
  try {
    chequeos = await chequeosEnVivo();
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return (
        <p className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
          Ahora mismo no se puede comprobar la plataforma. No se inventa un estado: vuelve a intentarlo en un rato.
        </p>
      );
    }
    throw error;
  }
  return (
    <>
      <EstadoDeLasAreas chequeos={chequeos} areas={AREAS_PUBLICAS} />
      <AlertasAbiertas chequeos={chequeos} areas={AREAS_PUBLICAS} />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <CalidadDeLosDatos chequeos={chequeos} ultimaActa={ultimaActa} />
        <CopiasDeSeguridad chequeos={chequeos} />
      </div>
      <RendimientoDeLaPlataforma chequeos={chequeos} areas={AREAS_PUBLICAS} />
    </>
  );
}

export default async function PaginaSalud() {
  // La salud operativa agrega cifras nacionales; no se publica en la web de Castilla y León.
  notFound();
  let cobertura: FilaFrescura['cobertura'] = [];
  let ultimaActa: string | null = null;
  let hayCanonico = true;
  try {
    const fila = await frescuraYCobertura();
    cobertura = fila?.cobertura ?? [];
    ultimaActa = fila?.ultima_acta ?? null;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      hayCanonico = false;
      ultimaActa = null;
    } else {
      throw error;
    }
  }

  if (!hayCanonico) return <AvisoSinArchivo titulo="Salud de la plataforma" />;

  return (
    <div className="flex flex-col gap-[18px]">
      <CabeceraPantalla
        titulo="Salud de la plataforma"
        entradilla="El estado de ahora mismo: comprobaciones, alertas, cobertura y copias."
        meta={ultimaActa ? `Última acta importada: ${fechaCorta(ultimaActa)}` : 'Sin actas importadas'}
      />
      <Suspense fallback={<EsqueletoEstadisticas filas={6} />}>
        <EstadoVivo ultimaActa={ultimaActa} />
      </Suspense>
      <DatosPorFederacion cobertura={cobertura} />
    </div>
  );
}
