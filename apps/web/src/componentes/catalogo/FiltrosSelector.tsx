import Link from 'next/link';
import type { Route } from 'next';
import type { EstadoSelector, OpcionesSelector, OpcionSelector } from '@/lib/selector-competiciones';
import { RUTA_SELECTOR, tieneFiltrosSelector } from '@/lib/selector-competiciones';
import { Button, Card, CardContent, Checkbox, Input, Label, Select } from '@/componentes/ui';

/**
 * Filtros del selector de temporada y competición.
 *
 * Es un formulario GET normal: no necesita JavaScript y el estado vive en la URL, así que una búsqueda
 * se puede compartir y recargar. Los desplegables ofrecen **sólo los valores que existen hoy** en el
 * catálogo (los trae `OPCIONES_DEL_SELECTOR`); no hay listas escritas a mano. La excepción es la
 * provincia: es la lista canónica de las nueve de Castilla y León (`lib/provincias-cyl.ts`), porque el
 * SQL casa también con el nombre del grupo y porque hay grupos interprovinciales; se marca con casillas
 * y cada provincia elegida se puede quitar por separado con su chip.
 *
 * En móvil los filtros secundarios se pliegan con `<details>` nativo (teclado y lector de pantalla
 * funcionan sin JavaScript y la foto estática publicada los abre igual). En escritorio se ven siempre.
 */
export function FiltrosSelector({ estado, opciones }: {
  estado: EstadoSelector;
  opciones: OpcionesSelector;
}) {
  const { filtros } = estado;
  const activos = [
    filtros.texto, filtros.federacion, filtros.temporada, filtros.categoria,
    filtros.modalidad, filtros.genero, filtros.nivel,
  ].filter((v) => v !== null && v !== '').length + filtros.provincias.length;

  return (
    <Card>
      <CardContent className="py-3.5">
        <form action={RUTA_SELECTOR} method="get" aria-label="Filtros de competiciones" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Label htmlFor="competi-q">Competición, grupo o temporada</Label>
              <Input id="competi-q" type="search" name="q" defaultValue={filtros.texto ?? ''}
                placeholder="Segunda Juvenil 2017, Burgos" />
            </div>
            <Button type="submit" className="sm:w-auto">Buscar</Button>
          </div>

          <details data-filtros open={tieneFiltrosSelector(filtros)} className="rounded-[var(--radius-control)] border border-[var(--borde)] lg:border-0">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-tabla font-semibold text-[var(--texto)] [&::-webkit-details-marker]:hidden">
              <span>Más filtros{activos > 0 ? ` (${activos})` : ''}</span>
              <span aria-hidden="true" className="size-2 rotate-45 border-b border-r border-[var(--texto-suave)]" />
            </summary>

            <div className="datos-filtros mt-2 grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2 lg:mt-0 lg:grid-cols-4 lg:px-0 lg:pb-0">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-nota font-semibold text-[var(--texto-suave)]">Federación</span>
                <Select name="fed" defaultValue={filtros.federacion ?? ''}>
                  <option value="">Todas las federaciones</option>
                  {opciones.federaciones.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </Select>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-nota font-semibold text-[var(--texto-suave)]">Temporada</span>
                <Select name="temp" defaultValue={filtros.temporada ?? ''}>
                  <option value="">Todas las temporadas</option>
                  {opciones.temporadas.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </Select>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-nota font-semibold text-[var(--texto-suave)]">Categoría</span>
                <Select name="cat" defaultValue={filtros.categoria ?? ''}>
                  <option value="">Todas las categorías</option>
                  {opciones.categorias.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </Select>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-nota font-semibold text-[var(--texto-suave)]">Modalidad</span>
                <Select name="mod" defaultValue={filtros.modalidad ?? ''}>
                  <option value="">Todas las modalidades</option>
                  {opciones.modalidades.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </Select>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-nota font-semibold text-[var(--texto-suave)]">Género</span>
                <Select name="gen" defaultValue={filtros.genero ?? ''}>
                  <option value="">Todos los géneros</option>
                  {opciones.generos.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </Select>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-nota font-semibold text-[var(--texto-suave)]">Nivel</span>
                <Select name="nivel" defaultValue={filtros.nivel === null ? '' : String(filtros.nivel)}>
                  <option value="">Todos los niveles</option>
                  {opciones.niveles.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </Select>
              </label>
              <fieldset className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                <legend className="text-nota font-semibold text-[var(--texto-suave)]">Provincias (se pueden marcar varias)</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-[var(--radius-control)] border border-[var(--borde)] px-2.5 py-1">
                  {opciones.provincias.map((o: OpcionSelector) => (
                    <label key={o.valor} className="flex min-h-11 items-center gap-1.5 text-tabla">
                      <Checkbox name="prov" value={o.valor} defaultChecked={filtros.provincias.includes(o.valor)} />
                      {o.etiqueta}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:justify-end">
                <Button type="submit" variant="secondary">Aplicar filtros</Button>
                {tieneFiltrosSelector(filtros) && (
                  <Button asChild variant="enlace"><Link href={RUTA_SELECTOR as Route}>Quitar filtros</Link></Button>
                )}
              </div>
            </div>
          </details>
        </form>
      </CardContent>
    </Card>
  );
}
