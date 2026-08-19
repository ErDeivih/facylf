/** Festivos de Salamanca capital y Castilla y León, temporada 2026/27.
 *
 *  Sirven para explicar los parones del calendario en la interfaz. NO son un dato
 *  oficial del proyecto: hay que contrastarlos con el calendario laboral de la Junta
 *  y del Ayuntamiento cuando se publique. Los movibles (Semana Santa, Carnaval,
 *  Lunes de Aguas) están calculados a partir de la Pascua de 2027 (28 de marzo). */

export interface Festivo {
  /** ISO yyyy-mm-dd */
  fecha: string;
  nombre: string;
  ambito: 'nacional' | 'castilla-y-leon' | 'salamanca';
}

export const FESTIVOS_2026_27: readonly Festivo[] = [
  { fecha: '2026-09-08', nombre: 'Virgen de la Vega · Ferias y Fiestas de Salamanca', ambito: 'salamanca' },
  { fecha: '2026-10-12', nombre: 'Fiesta Nacional', ambito: 'nacional' },
  { fecha: '2026-11-01', nombre: 'Todos los Santos', ambito: 'nacional' },
  { fecha: '2026-12-06', nombre: 'Día de la Constitución', ambito: 'nacional' },
  { fecha: '2026-12-08', nombre: 'La Inmaculada', ambito: 'nacional' },
  { fecha: '2026-12-25', nombre: 'Navidad', ambito: 'nacional' },
  { fecha: '2027-01-01', nombre: 'Año Nuevo', ambito: 'nacional' },
  { fecha: '2027-01-06', nombre: 'Reyes', ambito: 'nacional' },
  { fecha: '2027-02-09', nombre: 'Martes de Carnaval', ambito: 'castilla-y-leon' },
  { fecha: '2027-03-21', nombre: 'Domingo de Ramos', ambito: 'nacional' },
  { fecha: '2027-03-25', nombre: 'Jueves Santo', ambito: 'nacional' },
  { fecha: '2027-03-26', nombre: 'Viernes Santo', ambito: 'nacional' },
  { fecha: '2027-03-28', nombre: 'Domingo de Resurrección', ambito: 'nacional' },
  { fecha: '2027-04-05', nombre: 'Lunes de Aguas', ambito: 'salamanca' },
  { fecha: '2027-04-23', nombre: 'Villalar · Día de Castilla y León', ambito: 'castilla-y-leon' },
  { fecha: '2027-05-01', nombre: 'Fiesta del Trabajo', ambito: 'nacional' },
  { fecha: '2027-06-12', nombre: 'San Juan de Sahagún · patrón de Salamanca', ambito: 'salamanca' },
];

export function festivoEn(fecha: string, festivos: readonly Festivo[] = FESTIVOS_2026_27) {
  return festivos.find((f) => f.fecha === fecha) ?? null;
}
