import { describe, expect, it } from 'vitest';
import { preferenciasDelFormulario, type PreferenciasDelFormulario } from '../src/lib/preferencias-cuenta';

/**
 * Reglas de las preferencias de aviso: el formulario no puede inventar horas, correos ni eventos, y
 * `push` se conserva porque todavía no tiene control en la pantalla.
 */

const actuales: PreferenciasDelFormulario = {
  en_app: true,
  push: false,
  correo: 'resumen',
  hora_resumen: '08:00:00',
  silencio_desde: null,
  silencio_hasta: null,
  eventos: ['resultado'],
};

function formulario(campos: Record<string, string | string[]>): FormData {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) datos.append(clave, v);
  }
  return datos;
}

describe('preferencias de aviso desde el formulario', () => {
  it('normaliza horas y conserva push', () => {
    const salida = preferenciasDelFormulario(formulario({
      en_app: 'on', correo: 'al_momento', hora_resumen: '09:30',
      silencio_desde: '23:00', silencio_hasta: '08:00',
      eventos: ['programado', 'resultado', 'resultado'],
    }), actuales);
    expect(salida).toEqual({
      en_app: true,
      push: false,
      correo: 'al_momento',
      hora_resumen: '09:30:00',
      silencio_desde: '23:00:00',
      silencio_hasta: '08:00:00',
      eventos: ['programado', 'resultado'],
    });
  });

  it('un silencio vacío es «sin silencio», no una hora cero', () => {
    const salida = preferenciasDelFormulario(formulario({
      correo: 'nunca', hora_resumen: '08:00', silencio_desde: '', silencio_hasta: '',
      eventos: [],
    }), actuales);
    expect(salida?.silencio_desde).toBeNull();
    expect(salida?.silencio_hasta).toBeNull();
    expect(salida?.en_app).toBe(false);
    expect(salida?.eventos).toEqual([]);
  });

  it('rechaza horas, correos y eventos que no existen', () => {
    expect(preferenciasDelFormulario(formulario({
      correo: 'resumen', hora_resumen: '25:00', eventos: [],
    }), actuales)).toBeNull();
    expect(preferenciasDelFormulario(formulario({
      correo: 'telepatia', hora_resumen: '08:00', eventos: [],
    }), actuales)).toBeNull();
    expect(preferenciasDelFormulario(formulario({
      correo: 'resumen', hora_resumen: '08:00', eventos: ['inventado'],
    }), actuales)).toBeNull();
    expect(preferenciasDelFormulario(formulario({
      correo: 'resumen', hora_resumen: '08:00', silencio_desde: 'ayer', eventos: [],
    }), actuales)).toBeNull();
  });
});
