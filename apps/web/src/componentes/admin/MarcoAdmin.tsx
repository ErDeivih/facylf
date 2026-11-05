import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

/**
 * Marco del panel: navegación lateral y contenido.
 *
 * Sólo enseña las secciones que existen. Invitaciones y Auditoría viven dentro de estas dos páginas
 * (anclas), así que sus enlaces llevan ahí; no hay enlaces a pantallas que no se hayan construido.
 * En móvil la navegación se apila encima del contenido y nunca hay desplazamiento horizontal del
 * documento.
 */

const ENLACE = 'flex min-h-11 items-center rounded-[var(--radius-lg)] px-3 text-tabla font-semibold';

function clase(activo: boolean): string {
  return `${ENLACE} ${activo
    ? 'bg-[var(--fondo-fuerte)] text-[var(--texto-fuerte)]'
    : 'text-[var(--texto-suave)] hover:bg-[var(--fondo-sutil)] hover:text-[var(--texto)]'}`;
}

export function MarcoAdmin({ activo, children }: {
  activo: 'inicio' | 'usuarios';
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-[18px]">
      <aside className="w-full lg:w-auto lg:flex-[0_0_220px]">
        <nav aria-label="Administración"
          className="flex flex-col gap-1 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-2">
          <Link href={'/admin' as Route} aria-current={activo === 'inicio' ? 'page' : undefined}
            className={clase(activo === 'inicio')}>
            Inicio
          </Link>
          <Link href={'/admin/usuarios' as Route} aria-current={activo === 'usuarios' ? 'page' : undefined}
            className={clase(activo === 'usuarios')}>
            Usuarios
          </Link>
          <Link href={'/admin#invitaciones' as Route} className={`${ENLACE} text-[var(--texto-suave)] hover:bg-[var(--fondo-sutil)]`}>
            Invitaciones
          </Link>
          <Link href={'/admin/usuarios#auditoria' as Route} className={`${ENLACE} text-[var(--texto-suave)] hover:bg-[var(--fondo-sutil)]`}>
            Auditoría
          </Link>
          <Link href={'/' as Route} className={`${ENLACE} text-[var(--texto-suave)] hover:bg-[var(--fondo-sutil)]`}>
            Volver al sitio
          </Link>
        </nav>
        <p className="m-0 mt-2 px-2 text-nota text-[var(--texto-suave)]">
          Solo lectura. Las acciones de administración llegarán más adelante.
        </p>
      </aside>

      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-[18px]">
        {children}
      </div>
    </div>
  );
}
