// SÓLO PARA PROBAR el cambio de temporada por «postback» en una cola aparte (no está en adaptadores-activos.json).
import { creaAdaptadorServerSports } from './serversports.mjs';
const ad = creaAdaptadorServerSports({ ligas: [['futormes', 'Salamanca', 'https://www.futormes.com']] });
export default { ...ad, nombre: 'prueba-serversports-historico' };
