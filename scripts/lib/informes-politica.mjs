// La excepción de temporada abierta depende del calendario, nunca del equipo solicitado.
export function temporadaActual(fecha = new Date()) {
  const year = fecha.getFullYear() - (fecha.getMonth() < 6 ? 1 : 0);
  return `${year}-${String(year + 1).slice(-2)}`;
}
export function elegible(temporada, estado, fecha = new Date()) {
  return temporada >= '2021-22' && temporada <= temporadaActual(fecha)
    && (estado === 'completa' || temporada === temporadaActual(fecha));
}
export function coberturaSql(alias, fecha = new Date(), grupo = 'pg') {
  return `(exists (select 1 from ops.coverage_checkpoint cobertura_informe where cobertura_informe.phase_group_id=${grupo}.id and cobertura_informe.visibility_state='completa' and cobertura_informe.completitud_historica) or ${alias}.season_id in (select id from core.season where etiqueta = '${temporadaActual(fecha)}'))`;
}
export function slugInforme(equipo, categoria, temporada, id) {
  return `${equipo}-${categoria}-${temporada}-${id}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
}
