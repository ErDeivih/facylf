import type { Metadata } from 'next';
import { Migas } from '@/componentes/fichas/piezas';
import {
  CabeceraPublicidad, DondeVanLosHuecos, PatrociniosDirectos, ReglasDePublicidad, Requisitos,
  TablaDeEspacios, VolverALaWeb,
} from '@/componentes/publicidad/Publicidad';

/**
 * Página pública de publicidad: `/explorar/publicidad`.
 *
 * Informa de dónde irían los huecos, cuál es su estado y qué reglas se aplican. No enseña campañas
 * porque hoy no hay ninguna y porque los datos de campañas no son públicos (viven en `app.*`, que se
 * lee con el rol de la pantalla de administración). Está enlazada desde el pie del sitio, no desde la
 * cabecera principal.
 */
export const metadata: Metadata = {
  title: 'Publicidad — Fondo Popular',
  description: 'Qué publicidad hay, dónde irían los huecos y qué reglas se aplican.',
};

export default function PaginaPublicidad() {
  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[{ texto: 'Inicio', href: '/' }, { texto: 'Publicidad' }]} />
      <CabeceraPublicidad />
      <DondeVanLosHuecos />
      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <TablaDeEspacios />
        <ReglasDePublicidad />
      </div>
      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <PatrociniosDirectos />
        <Requisitos />
      </div>
      <VolverALaWeb />
    </div>
  );
}
