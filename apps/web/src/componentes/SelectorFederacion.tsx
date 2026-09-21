import { FEDERACIONES_LOCALES, type FederacionCodigo } from '@/lib/repositorio-local';

export function SelectorFederacion({ federacion, action, compacto = false }: {
  federacion: FederacionCodigo; action: string; compacto?: boolean;
}) {
  return <form action={action} className={compacto ? 'flex items-end gap-2' : 'mb-6 flex flex-wrap items-end gap-3 border border-[var(--borde)] bg-white p-4'}>
    <label className="min-w-52"><span className="etiqueta-filtro">Federación</span>
      <select name="federacion" defaultValue={federacion} className="control-filtro">
        {FEDERACIONES_LOCALES.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
      </select>
    </label>
    <button className="boton-primario">Consultar</button>
  </form>;
}
