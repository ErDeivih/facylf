#!/usr/bin/env tsx
/**
 * Rehace el catálogo de competiciones recorriendo los desplegables de la federación.
 * Los códigos cambian cada temporada, así que esto se ejecuta en agosto.
 *
 * PENDIENTE: necesita la URL de la página de competiciones y el
 * `Sch_Codigo_Delegacion` de Salamanca. Los dos están en PROYECTO.md §11 como cosas
 * que hay que pedir. No se inventan (CLAUDE.md).
 */
console.error(
  'Faltan dos datos para poder descubrir competiciones:\n' +
  '  1. el Sch_Codigo_Delegacion de Salamanca\n' +
  '  2. la URL de la página que lista las competiciones de una delegación\n' +
  'Consíguelos y vuelve. No se rellenan con un valor plausible.',
);
process.exit(1);
