import type { Metadata } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { EJEMPLOS_DE_ESTADOS, type FilaEstados } from '@/consultas/observabilidad';
import { NOMBRE_PRODUCTO } from '@/componentes/marca/marca';
import { CabeceraPantalla } from '@/componentes/observabilidad/piezas';
import { EstadosDeCargaYError, EstadosDelBuscador, MotivosDeCompeticion } from '@/componentes/observabilidad/Estados';

/**
 * Estados vacíos: `/explorar/estados`.
 *
 * Enseña cómo se ve una pantalla cuando no hay datos, con ejemplos REALES del canónico y enlaces a las
 * pantallas donde se ven. No es una maqueta: los componentes son los que usa la aplicación y los grupos
 * son grupos reales de Castilla y León. Si un ejemplo no existe, no se inventa: se dice.
 *
 * Los estados de cuenta (solicitud pendiente, acceso suspendido, paquete caducado) no se enseñan aquí:
 * son de la pantalla de cuenta.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `Estados vacíos — ${NOMBRE_PRODUCTO}` };

const SIN_EJEMPLOS: FilaEstados = {
  datos: { sin_resultado: null, sin_calendario: null, sin_actas: null, sin_cambios: null },
};

export default async function PaginaEstados() {
  let ejemplos: FilaEstados = SIN_EJEMPLOS;
  let noDisponible = false;
  try {
    const [fila] = await consulta<FilaEstados>(EJEMPLOS_DE_ESTADOS.sql, []);
    if (fila?.datos) ejemplos = fila;
  } catch (error) {
    // Los ejemplos son enlaces reales; si no se pueden leer, la pantalla sigue explicando los estados.
    if (!(error instanceof CanonicoNoDisponible)) throw error;
    noDisponible = true;
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <CabeceraPantalla
        titulo="Ninguna sección vacía y muda"
        entradilla={noDisponible ? 'No se han podido cargar los ejemplos reales ahora mismo. La página sigue explicando cómo se comporta la aplicación.' : 'Cuando una sección no tiene datos, en su sitio va una tarjeta que dice qué pasa y qué hacer. Los ejemplos son grupos reales.'}
      />
      <MotivosDeCompeticion ejemplos={ejemplos} />
      <EstadosDelBuscador />
      <EstadosDeCargaYError />
    </div>
  );
}
