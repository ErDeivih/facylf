import { FEDERACIONES_LOCALES, type FederacionCodigo } from '@/lib/repositorio-local';
import { BOTON_PRIMARIO, CONTROL_FILTRO, ETIQUETA_FILTRO } from '@/componentes/ui/legado';

export function SelectorFederacion({ federacion, action, compacto = false }: {
  federacion: FederacionCodigo; action: string; compacto?: boolean;
}) {
  return <form action={action} className={compacto ? 'flex items-end gap-2' : 'mb-6 flex flex-wrap items-end gap-3 border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4'}>
    <label className="min-w-52"><span className={`${ETIQUETA_FILTRO}`}>Federación</span>
      <select name="federacion" defaultValue={federacion} className={`${CONTROL_FILTRO}`}>
        {FEDERACIONES_LOCALES.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
      </select>
    </label>
    <button className={`${BOTON_PRIMARIO}`}>Consultar</button>
  </form>;
}
