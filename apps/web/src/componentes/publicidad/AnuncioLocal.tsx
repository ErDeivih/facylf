import { consulta } from '@/consultas/adaptadores/postgres/conexion';

type Fila = {
  espacio: string; campana_id: number; patrocinador: string; titulo: string;
  imagen_url: string; destino_url: string;
};

/**
 * Anuncio directo local. Sólo pinta si hay una campaña activa y el hueco está encendido.
 * No se usa en páginas de menores, cuenta, acceso ni administración.
 */
export async function AnuncioLocal({ espacio }: { espacio: string }) {
  let fila: Fila | undefined;
  try {
    const filas = await consulta<Fila>(
      'select espacio, campana_id, patrocinador, titulo, imagen_url, destino_url from analytics.anuncio_publico where espacio = $1 order by prioridad desc, campana_id desc limit 1',
      [espacio], { presupuestoMs: 250 },
    );
    fila = filas[0];
  } catch {
    return null;
  }
  if (!fila) return null;
  return (
    <aside aria-label="Publicidad" className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-3">
      <p className="m-0 text-etiqueta font-semibold uppercase tracking-wide text-[var(--texto-suave)]">Publicidad · {fila.patrocinador}</p>
      <a href={fila.destino_url} target="_blank" rel="sponsored noopener noreferrer" className="mt-1 flex items-center gap-3 rounded-[var(--radius-control)] hover:bg-[var(--fondo-sutil)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fila.imagen_url} alt={fila.titulo} width={240} height={80} loading="lazy" referrerPolicy="no-referrer" className="h-16 w-auto max-w-[160px] object-contain" />
        <span className="text-tabla font-semibold text-[var(--texto)]">{fila.titulo}</span>
      </a>
    </aside>
  );
}
