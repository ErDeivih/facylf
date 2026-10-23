// Voleibol en iSquad: con datos reales, Cataluña (17), Galicia (20) y Aragón (27), más la 1.ª Nacional que
// cuelga de ellas. El resto de territoriales sale vacío en 2026-27 (sondeo del 30/09/2026).
import { creaAdaptadorIsquad } from './_isquad-resultados.mjs';
export default creaAdaptadorIsquad({ deporte: 'voleibol', territoriales: ['17', '20', '27', '9999'] });
