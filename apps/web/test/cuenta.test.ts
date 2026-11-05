import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, ejecutaConsulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { PERFIL_DE_LA_CUENTA, type FilaPerfilCuenta } from '../src/consultas/mi-cuenta';
import { MiCuenta, MiCuentaError, MiCuentaSinSesion } from '../src/componentes/cuenta/MiCuenta';
import {
  canalesDeAviso, enmascaraCorreo, estadoDeCuenta, eventosActivos, fechaDia, fechaIso, horaCorta,
  normalizaPerfil, textoDeSilencio, textoDelPaquete, type PerfilCuenta,
} from '../src/lib/cuenta-pantalla';

/**
 * Contrato de «Mi cuenta» (Cuenta.dc.html).
 *
 * Lo que se defiende:
 *  · la cuenta sale de la sesión, no de la URL (la página pasa el user_id de la cookie);
 *  · sin sesión no se inventa una cuenta: se invita a entrar;
 *  · lo que no está implementado (correo accesible, verificación, 2FA, cambio de contraseña, descarga
 *    y baja) se dice; no se pinta un botón que no hace nada;
 *  · el cierre de sesión sí existe y va por POST a la ruta que ya lo implementa;
 *  · la interfaz no habla de cómo está hecha (§8).
 */

const TEXTO_PROHIBIDO: readonly RegExp[] = [
  /canónico/i, /según la base/i, /prototipo/i, /se calcula/i, /calculad[oa]/i, /cálculo/i, /SQL/i,
  /backend/i, /endpoint/i, /consulta sql/i, /<code/i,
];

function sinTextoProhibido(html: string) {
  for (const prohibido of TEXTO_PROHIBIDO) {
    expect(html, `la interfaz no debe contener «${prohibido}»`).not.toMatch(prohibido);
  }
}

const hayApp = motivoSinCanonico('app') === null;

afterAll(async () => {
  await cierraCanonico();
});

function perfil(extra: Partial<PerfilCuenta> = {}): PerfilCuenta {
  return {
    userId: '83c1e320-307e-4618-ad68-b34ed60d8c0c',
    nombre: 'Cuenta de prueba',
    rol: 'usuario',
    estado: 'activo',
    paquete: 'esencial',
    paqueteNombre: 'Esencial',
    validoHasta: '2027-06-30',
    zonaHoraria: 'Europe/Madrid',
    creadoEn: '2026-11-05',
    capacidades: ['buscar'],
    favoritos: 3,
    avisosSinLeer: 1,
    dispositivosPush: 2,
    preferencias: {
      en_app: true,
      push: false,
      correo: 'resumen',
      hora_resumen: '08:00:00',
      silencio_desde: '23:00:00',
      silencio_hasta: '08:00:00',
      eventos: ['programado', 'resultado', 'acta'],
    },
    ...extra,
  };
}

/* ── Reglas puras ───────────────────────────────────────────────────────────────────────────────── */

describe('las fechas y el estado de la cuenta', () => {
  it('normaliza fechas del driver sin depender de su tipo', () => {
    expect(fechaIso('2026-11-05T10:00:00Z')).toBe('2026-11-05');
    expect(fechaIso(new Date('2026-11-05T10:00:00Z'))).toBe('2026-11-05');
    expect(fechaIso(null)).toBeNull();
    expect(fechaDia('2027-06-30')).toBe('30/06/2027');
    expect(fechaDia(null)).toBe('—');
  });

  it('la fecha de validez manda sobre el estado activo', () => {
    expect(estadoDeCuenta(perfil({ validoHasta: '2027-06-30' }), '2026-11-05').clave).toBe('activa');
    expect(estadoDeCuenta(perfil({ validoHasta: '2026-01-01' }), '2026-11-05')).toMatchObject({
      clave: 'caducada', etiqueta: 'Caducada',
    });
    expect(estadoDeCuenta(perfil({ estado: 'pendiente' }), '2026-11-05').clave).toBe('pendiente');
    expect(estadoDeCuenta(perfil({ estado: 'bloqueado' }), '2026-11-05').clave).toBe('bloqueada');
    expect(estadoDeCuenta(perfil({ estado: 'baja' }), '2026-11-05').clave).toBe('baja');
    // Una cuenta activa sin fecha de fin no caduca.
    expect(estadoDeCuenta(perfil({ validoHasta: null }), '2099-01-01').clave).toBe('activa');
  });

  it('el paquete dice su nombre y su fin, o que no tiene', () => {
    expect(textoDelPaquete(perfil())).toBe('Esencial · hasta el 30/06/2027.');
    expect(textoDelPaquete(perfil({ validoHasta: null }))).toBe('Esencial · sin fecha de fin.');
    expect(textoDelPaquete(perfil({ paquete: null, paqueteNombre: null }))).toBe('Sin paquete contratado.');
  });

  it('normaliza la fila de app.perfil y completa las preferencias', () => {
    const fila: FilaPerfilCuenta = {
      user_id: 'u-1', nombre: '  Ana  ', rol: 'usuario', estado: 'activo', paquete: null, paquete_nombre: null,
      valido_hasta: new Date('2027-06-30T00:00:00Z'), zona_horaria: '', creado_en: '2026-11-05T10:00:00Z',
      capacidades: [], favoritos: 2, avisos_sin_leer: 0, dispositivos_push: 0, preferencias: null,
    };
    const normalizado = normalizaPerfil(fila);
    expect(normalizado.nombre).toBe('Ana');
    expect(normalizado.validoHasta).toBe('2027-06-30');
    expect(normalizado.zonaHoraria).toBe('Europe/Madrid');
    expect(normalizado.creadoEn).toBe('2026-11-05');
    expect(normalizado.preferencias.correo).toBe('resumen');
    expect(normalizado.preferencias.eventos.length).toBe(6);
  });
});

describe('correo enmascarado y avisos', () => {
  it('no enseña la dirección completa', () => {
    expect(enmascaraCorreo('ana@ejemplo.es')).toBe('a•••@ejemplo.es');
    expect(enmascaraCorreo('ab@x.es')).toBe('a•@x.es');
    expect(enmascaraCorreo('sin-arroba')).toBeNull();
    expect(enmascaraCorreo(null)).toBeNull();
  });

  it('los canales de aviso se leen en castellano', () => {
    const canales = canalesDeAviso(perfil().preferencias);
    expect(canales).toContainEqual({ etiqueta: 'En la aplicación', valor: 'Sí' });
    expect(canales).toContainEqual({ etiqueta: 'Push', valor: 'No' });
    expect(canales).toContainEqual({ etiqueta: 'Correo', valor: 'Un resumen al día · 08:00' });
    expect(textoDeSilencio(perfil().preferencias)).toBe('Sin avisos de 23:00 a 08:00.');
    expect(textoDeSilencio({ ...perfil().preferencias, silencio_desde: null })).toBeNull();
    expect(horaCorta('08:00:00')).toBe('08:00');
    expect(eventosActivos(['acta', 'programado'])).toEqual(['Próximo partido', 'Acta publicada']);
    expect(eventosActivos([])).toEqual([]);
  });
});

/* ── Render ────────────────────────────────────────────────────────────────────────────────────── */

describe('la pantalla de Mi cuenta', () => {
  const render = (props: Partial<Parameters<typeof MiCuenta>[0]> = {}) => renderToStaticMarkup(
    createElement(MiCuenta, { perfil: perfil(), ...props }),
  );

  it('enseña los datos reales de la cuenta, el paquete y el estado', () => {
    const html = render({ correo: 'ana@ejemplo.es' });
    expect(html).toContain('Mi cuenta');
    expect(html).toContain('Sesión de Cuenta de prueba.');
    expect(html).toContain('a•••@ejemplo.es');
    expect(html).toContain('Activa');
    expect(html).toContain('Esencial · hasta el 30/06/2027.');
    expect(html).toContain('Europe/Madrid');
    expect(html).toContain('30/06/2027');
    expect(html).toContain('Favoritos');
    expect(html).toContain('>3<');
    sinTextoProhibido(html);
  });

  it('si el correo no está disponible lo dice; no inventa una dirección', () => {
    const html = render({ correo: null });
    expect(html).toContain('No se muestra en esta pantalla');
    expect(html).not.toContain('@ejemplo.es');
    expect(html).not.toContain('@');
  });

  it('las preferencias se enseñan guardadas y se dice que los avisos aún no se envían', () => {
    const html = render();
    expect(html).toContain('Los avisos automáticos todavía no se envían.');
    expect(html).toContain('Próximo partido');
    expect(html).toContain('Un resumen al día · 08:00');
    expect(html).toContain('Sin avisos de 23:00 a 08:00.');
    expect(html).toContain('2 dispositivos');
    expect(html).toContain('action="/api/cuentas/preferencias"');
    expect(html).toContain('Guardar preferencias');
  });

  it('la seguridad dice lo que no existe y deja cerrar la sesión de verdad', () => {
    const html = render();
    expect(html).toContain('Verificación en dos pasos');
    expect(html).toContain('No disponible');
    expect(html).toContain('Verificación del correo');
    expect(html).toContain('No implementada');
    expect(html).toContain('Cambio de contraseña');
    expect(html).toContain('action="/api/cuentas/salir"');
    expect(html).toContain('method="post"');
    expect(html).toContain('Cerrar sesión');
    expect(html).toContain('Descargar mis datos');
    expect(html).toContain('href="/api/cuentas/exportar"');
    // No hay botones que finjan cambiar contraseña, 2FA ni darse de baja.
    expect(html).not.toContain('Cambiar contraseña');
    expect(html).not.toContain('Activar verificación');
    expect(html).not.toContain('Darme de baja');
  });
});

describe('los estados sin sesión y de error', () => {
  it('sin sesión invita a entrar, sin pintar una cuenta vacía', () => {
    const html = renderToStaticMarkup(createElement(MiCuentaSinSesion));
    expect(html).toContain('Entra para ver tu cuenta');
    expect(html).toContain('href="/entrar?volver=/mi-cuenta"');
    expect(html).toContain('href="/crear-cuenta?volver=/mi-cuenta"');
    expect(html).not.toContain('Paquete');
    sinTextoProhibido(html);
  });

  it('si la cuenta no se puede leer, lo dice y deja reintentar', () => {
    const html = renderToStaticMarkup(createElement(MiCuentaError));
    expect(html).toContain('No se ha podido cargar tu cuenta');
    expect(html).toContain('Reintentar');
    sinTextoProhibido(html);
  });
});

/* ── Contrato real ─────────────────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayApp)('la cuenta contra la base', () => {
  it('la consulta declara el rol app, su presupuesto y sus columnas', () => {
    expect(PERFIL_DE_LA_CUENTA.rol).toBe('app');
    expect(PERFIL_DE_LA_CUENTA.presupuestoMs).toBeLessThanOrEqual(500);
    expect(PERFIL_DE_LA_CUENTA.columnas).toContain('preferencias');
    expect(PERFIL_DE_LA_CUENTA.columnas).toContain('favoritos');
    expect(PERFIL_DE_LA_CUENTA.sql.toLowerCase()).toContain('limit');
    expect(PERFIL_DE_LA_CUENTA.sql).not.toContain('${');
  });

  it('un usuario que no existe no devuelve una cuenta inventada', async () => {
    const filas = await ejecutaConsulta(PERFIL_DE_LA_CUENTA, ['usuario-inexistente-de-prueba']);
    expect(filas).toEqual([]);
  });
});
