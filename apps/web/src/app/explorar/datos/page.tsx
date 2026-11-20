import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CanonicoNoDisponible, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  CAPACIDAD_DE_FEDERACIONES, COBERTURA_POR_TEMPORADA, PARAMETROS_DE_CAPACIDAD,
  PARAMETROS_OBSERVABILIDAD, type FilaCapacidad, type FilaCoberturaTemporada,
  type FilaParametroCapacidad,
} from '@/consultas/observabilidad';
import { chequeosEnVivo, frescuraYCobertura } from '@/consultas/observabilidad-cache';
import { NOMBRE_PRODUCTO } from '@/componentes/marca/marca';
import { AvisoSinArchivo } from '@/componentes/fichas/piezas';
import { EsqueletoEstadisticas } from '@/componentes/estadisticas/Estados';
import { CabeceraPantalla } from '@/componentes/observabilidad/piezas';
import {
  AvisosDeDatos, CapacidadDeFederaciones, CasosDeDatos, CoberturaDeCastillaYLeon, ResumenDeDatos,
} from '@/componentes/observabilidad/Datos';
import { AREAS_PUBLICAS, resumenDeComprobaciones, temporadaDeReferencia } from '@/lib/observabilidad-pantalla';

/**
 * Calidad y cobertura de los datos: `/explorar/datos`.
 *
 * La página tiene una parte rápida (cobertura de CyL y capacidad de cada federación, de datos ya
 * calculados) y una parte lenta (las comprobaciones de datos, que recorren ventanas de 60 días). La
 * lenta va dentro de `Suspense` con el esqueleto del sistema: la pantalla aparece al momento y las
 * comprobaciones llegan cuando están, sin bloquear la lectura de lo demás.
 *
 * Todo sale de la observabilidad real; no hay cifras de ejemplo. Si el canónico no responde, se dice.
 */
export const revalidate = 300;
export const metadata: Metadata = { title: `Calidad de datos — ${NOMBRE_PRODUCTO}` };

/** Las comprobaciones de datos y sus cifras, con el esqueleto mientras llegan. */
async function ComprobacionesDeDatos({ ultimaActa }: { ultimaActa: string | null }) {
  let chequeos;
  try {
    chequeos = await chequeosEnVivo();
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return (
        <p className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
          Ahora mismo no se pueden comprobar los datos. No se enseñan cifras a medias: vuelve a intentarlo en un rato.
        </p>
      );
    }
    throw error;
  }

  const valorDe = (nombre: string): number | null =>
    chequeos.find((c) => c.nombre === nombre)?.valor ?? null;

  return (
    <>
      <ResumenDeDatos
        resumen={resumenDeComprobaciones(chequeos, AREAS_PUBLICAS)}
        casosGraves={valorDe('casos_graves_abiertos')}
        actasARevisar={valorDe('actas_a_revisar_7d')}
        ultimaActa={ultimaActa}
      />
      <CasosDeDatos chequeos={chequeos} areas={AREAS_PUBLICAS} />
      <AvisosDeDatos chequeos={chequeos} areas={AREAS_PUBLICAS} />
    </>
  );
}

export default async function PaginaDatos() {
  let cobertura: FilaCoberturaTemporada[] = [];
  let capacidad: FilaCapacidad[] = [];
  let parametros: FilaParametroCapacidad[] = [];
  let ultimaActa: string | null = null;
  try {
    const [cap, par, cob] = await consultaEnUnaFoto([
      { sql: CAPACIDAD_DE_FEDERACIONES.sql },
      { sql: PARAMETROS_DE_CAPACIDAD.sql },
      { sql: COBERTURA_POR_TEMPORADA.sql, parametros: PARAMETROS_OBSERVABILIDAD[COBERTURA_POR_TEMPORADA.nombre] },
    ]);
    capacidad = cap as unknown as FilaCapacidad[];
    parametros = par as unknown as FilaParametroCapacidad[];
    cobertura = cob as unknown as FilaCoberturaTemporada[];
    ultimaActa = (await frescuraYCobertura())?.ultima_acta ?? null;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Calidad de datos" />;
    throw error;
  }

  const temporada = temporadaDeReferencia(capacidad);

  return (
    <div className="flex flex-col gap-[18px]">
      <CabeceraPantalla
        titulo="Calidad de datos"
        entradilla="Qué datos hay, cuáles faltan y qué hace la plataforma con cada hueco."
        meta={temporada ? `Temporada de referencia ${temporada}` : 'Sin temporada de referencia medida'}
      />
      <CoberturaDeCastillaYLeon filas={cobertura} />
      <CapacidadDeFederaciones filas={capacidad} parametros={parametros} temporada={temporada} />
    </div>
  );
}

