import Link from 'next/link';
import type { Route } from 'next';
import { NOTA_DEMO } from '@/lib/nota-demo';

/**
 * Nota discreta del pie: la demo pública es una foto de la 2026-27 y la app completa es esta.
 *
 * El texto y las dos URL están en `lib/nota-demo.ts`; aquí sólo se pintan, para que cambiar la nota sea
 * cambiar un fichero y no tres.
 */
export function NotaDemo() {
  return (
    <p className="m-0 max-w-[720px] text-[var(--texto-suave)]" title={NOTA_DEMO.texto}>
      <a href={NOTA_DEMO.urlDemo} className="font-semibold hover:text-[var(--accion)] hover:underline">
        {NOTA_DEMO.demo}
      </a>
      {`: ${NOTA_DEMO.temporada} · `}
      <Link href={NOTA_DEMO.urlCompleta as Route}
        className="font-semibold hover:text-[var(--accion)] hover:underline">
        {NOTA_DEMO.completa}
      </Link>
      {` ${NOTA_DEMO.servidor}`}
    </p>
  );
}
