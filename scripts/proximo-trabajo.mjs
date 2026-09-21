#!/usr/bin/env node
/**
 * Indica cuántos segundos conviene esperar antes de reintentar una federación: 0 si hay trabajo
 * disponible YA, o los segundos hasta el próximo trabajo aplazado (los trabajos de la temporada
 * actual se aplazan hasta la fecha de su jornada). Lo usa el supervisor para no esperar 5 minutos
 * fijos cuando el siguiente trabajo está a 40 segundos.
 *
 * OJO con la pausa global: si la federación está en pausa preventiva, hay trabajos "disponibles"
 * pero el recolector va a salir sin hacer nada. Sin tenerlo en cuenta, el supervisor relanzaba el
 * proceso cada 20 segundos durante las 6 horas de pausa (más de mil arranques para nada). Por eso
 * la pausa se consulta ANTES que los trabajos. Y por lo mismo el presupuesto diario: 24 arranques de
 * navegador en doce minutos para cero peticiones, medido el 18/09/2026.
 *
 * La lectura de la cola y el cálculo viven en `lib/estado-cola.mjs`, compartidos con `ajustar-flota.mjs`:
 * este guion sólo imprime el número que espera el supervisor (Windows y contenedor).
 *
 * Uso: node scripts/proximo-trabajo.mjs <ruta-cola.sqlite>
 */
import { leeEstadoDeCola, segundosDeEspera } from './lib/estado-cola.mjs';

const dbPath = process.argv[2];
// Sin ruta no se inventa nada: cinco minutos, como cuando la cola no se puede leer.
if (!dbPath) {
  console.log('300');
} else {
  console.log(String(segundosDeEspera(leeEstadoDeCola(dbPath))));
}
