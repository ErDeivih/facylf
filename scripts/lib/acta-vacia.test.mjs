import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actaSinContenidoDeportivo } from './acta-vacia.mjs';

const vacia = () => ({ goles: [], tarjetas: [], cambios: [], tecnicos: [], arbitro: null,
  lineups: { local: { titulares: [], suplentes: [] }, visitante: { titulares: [], suplentes: [] } } });

test('reconoce los arrays vacíos reales del parser', () => assert.equal(actaSinContenidoDeportivo(vacia()), true));

test('una ficha con árbitro pero sin nada más SÍ está vacía (el árbitro se designa antes del partido)', () => {
  // Medido el 19/09/2026 sobre las tres fichas de Navarra que la fuente no publica: el parser devuelve
  // `{"goles":0,"tarjetas":0,"cambios":0,"tecnicos":0,"locales":0,"arbitro":"sí"}`. Exigir que no hubiera árbitro
  // —como hacía la primera versión— dejaba el atajo sin aplicar nunca, y esos partidos seguían gastando tres
  // peticiones cada uno antes de descartarse.
  assert.equal(actaSinContenidoDeportivo({ ...vacia(), arbitro: 'Iker López' }), true);
  assert.equal(actaSinContenidoDeportivo({ ...vacia(), arbitro: 'Iker López', estadio: 'El Sadar' }), true);
});

test('no confunde una tarjeta, cambio, técnico o alineación con ausencia', () => {
  for (const campo of ['goles', 'tarjetas', 'cambios', 'tecnicos']) {
    assert.equal(actaSinContenidoDeportivo({ ...vacia(), [campo]: [{}] }), false);
  }
  for (const lado of ['local', 'visitante']) {
    for (const grupo of ['titulares', 'suplentes']) {
      const acta = vacia();
      acta.lineups[lado][grupo].push({ nombre: 'Jugador' });
      assert.equal(actaSinContenidoDeportivo(acta), false);
    }
  }
});

test('salida desconocida no autoriza ausencia definitiva', () => {
  // Una maqueta nueva puede hacer que el parser devuelva otra cosa: eso no es «vacía», es «no lo sé».
  assert.equal(actaSinContenidoDeportivo({}), false);
  assert.equal(actaSinContenidoDeportivo({ goles: [], tarjetas: [], cambios: [] }), false);
  assert.equal(actaSinContenidoDeportivo({ ...vacia(), goles: undefined }), false);
  assert.equal(actaSinContenidoDeportivo({ ...vacia(), lineups: undefined }), false);
});
