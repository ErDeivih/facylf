import { redirect } from 'next/navigation';
import type { Metadata, Route } from 'next';
import { FEDERACION_DE_LA_FICHA_POR_DEFECTO, tituloDeFederacion } from '@/lib/federacion-ficha';

/** `/explorar/federacion` sin código abre Castilla y León, que es la federación de referencia. */
export const metadata: Metadata = { title: tituloDeFederacion('Castilla y León') };

export default function PaginaFederacionPorDefecto() {
  redirect(`/explorar/federacion/${FEDERACION_DE_LA_FICHA_POR_DEFECTO}` as Route);
}
