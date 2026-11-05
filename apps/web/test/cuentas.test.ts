import { describe, expect, it, beforeEach } from 'vitest';
import {
  avisoDeErrorRegistro, contrasenaValida, correoValido, estadoDeCredencial, normalizaCorreo,
  normalizaInvitacion, nombreValido, rutaDeAcceso, textoAviso, urlVolverSegura,
} from '../src/lib/cuentas';
import {
  MAXIMO_CONTRASENA, hashContrasena, sha256Hex, tokenDeSesion, verificaContrasena,
} from '../src/lib/contrasenas';
import { permite, reiniciaLimites } from '../src/lib/limites';
import { mismoOrigen, rutaDeVuelta } from '../src/lib/seguridad';

/**
 * Reglas de cuenta que no necesitan base de datos: normalización, validación, mensajes sin filtrar,
 * hash de contraseña, token de sesión, límites en memoria y comprobación de origen.
 */

describe('normalización y validación', () => {
  it('el correo se compara normalizado: sin espacios y en minúsculas', () => {
    expect(normalizaCorreo('  Ana@Ejemplo.ES ')).toBe('ana@ejemplo.es');
    expect(normalizaCorreo(null)).toBe('');
    expect(normalizaCorreo(123)).toBe('');
  });

  it('acepta correos razonables y rechaza los que no lo son', () => {
    for (const bueno of ['ana@ejemplo.es', 'a.b+c@sub.dominio.es']) expect(correoValido(bueno), bueno).toBe(true);
    for (const malo of ['', 'ana', 'ana@', '@ejemplo.es', 'ana@ejemplo', 'ana ejemplo@x.es', 'a@b.c '.repeat(40)]) {
      expect(correoValido(malo), malo).toBe(false);
    }
  });

  it('el nombre visible va de 1 a 60 caracteres y la contraseña de 10 a 200', () => {
    expect(nombreValido('Ana')).toBe(true);
    expect(nombreValido('   ')).toBe(false);
    expect(nombreValido('x'.repeat(61))).toBe(false);
    expect(contrasenaValida('1234567890')).toBe(true);
    expect(contrasenaValida('123456789')).toBe(false);
    expect(contrasenaValida('x'.repeat(MAXIMO_CONTRASENA + 1))).toBe(false);
  });

  it('el código de invitación se normaliza a mayúsculas', () => {
    expect(normalizaInvitacion(' facylf-prueba-2026 ')).toBe('FACYLF-PRUEBA-2026');
    expect(normalizaInvitacion(undefined)).toBe('');
  });
});

describe('volver a una ruta interna', () => {
  it('acepta rutas de este sitio', () => {
    expect(urlVolverSegura('/mi-panel')).toBe('/mi-panel');
    expect(urlVolverSegura('/explorar/equipo/8873?x=1')).toBe('/explorar/equipo/8873?x=1');
  });

  it('rechaza otro host, esquemas y valores raros', () => {
    for (const malo of ['https://mal.example', '//mal.example', '/\\mal.example', 'javascript:alert(1)', 'mi-panel', '', '/x\nY']) {
      expect(urlVolverSegura(malo), String(malo)).toBeNull();
    }
    expect(urlVolverSegura(undefined)).toBeNull();
    // Los espacios de los extremos no convierten una ruta interna en externa: se recorta.
    expect(urlVolverSegura(' /x ')).toBe('/x');
  });
});

describe('enlaces de los favoritos', () => {
  it('traduce las rutas de la web vieja a las fichas nuevas', () => {
    expect(rutaDeAcceso('/equipo/8873')).toBe('/explorar/equipo/8873');
    expect(rutaDeAcceso('/club/16')).toBe('/explorar/club/16');
    expect(rutaDeAcceso('/jugador/19057')).toBe('/explorar/jugador/19057');
    expect(rutaDeAcceso('/competicion/3769')).toBe('/explorar/competicion/3769');
  });

  it('lo que no reconoce se queda sin enlace, no se inventa una ruta', () => {
    expect(rutaDeAcceso('/partido/123')).toBeNull();
    expect(rutaDeAcceso('https://mal.example')).toBeNull();
    expect(rutaDeAcceso(null)).toBeNull();
  });
});

describe('estado de la cuenta', () => {
  const base = { estado: 'activo', activo: true, valido_hasta: null };
  it('sólo una cuenta activa y vigente puede entrar', () => {
    expect(estadoDeCredencial(base)).toBe('ok');
    expect(estadoDeCredencial({ ...base, estado: 'pendiente' })).toBe('pendiente');
    expect(estadoDeCredencial({ ...base, activo: false })).toBe('bloqueada');
    for (const estado of ['rechazado', 'bloqueado', 'baja']) {
      expect(estadoDeCredencial({ ...base, estado }), estado).toBe('bloqueada');
    }
    expect(estadoDeCredencial({ ...base, valido_hasta: '2000-01-01' })).toBe('caducada');
  });
});

describe('mensajes de aviso', () => {
  it('correo inexistente y contraseña incorrecta dicen exactamente lo mismo', () => {
    expect(textoAviso('credenciales')).toBe('Correo o contraseña incorrectos.');
    expect(textoAviso('credenciales')).toBe(textoAviso('credenciales'));
  });

  it('sólo se enseñan códigos conocidos; lo demás no se refleja', () => {
    expect(textoAviso('no-existe')).toBeNull();
    expect(textoAviso('<script>')).toBeNull();
    expect(textoAviso(null)).toBeNull();
  });

  it('los errores de la base se traducen a códigos de aviso, nunca se muestran crudos', () => {
    expect(avisoDeErrorRegistro(new Error('INVITACION_CADUCADA'))).toBe('invitacion-caducada');
    expect(avisoDeErrorRegistro(new Error('INVITACION_AGOTADA'))).toBe('invitacion-agotada');
    expect(avisoDeErrorRegistro(new Error('INVITACION_DE_OTRO_CORREO'))).toBe('invitacion-otro-correo');
    expect(avisoDeErrorRegistro(new Error('REGISTRO_SOLO_CON_INVITACION'))).toBe('invitacion-requerida');
    expect(avisoDeErrorRegistro(new Error('CORREO_YA_REGISTRADO'))).toBe('registro');
    expect(avisoDeErrorRegistro(new Error('ERROR_RARO_DE_POSTGRES'))).toBe('no-disponible');
  });
});

describe('contraseñas con scrypt', () => {
  it('el hash no contiene la contraseña y tiene el formato versionado', async () => {
    const hash = await hashContrasena('clave-de-prueba-123');
    expect(hash).not.toContain('clave-de-prueba-123');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it('la misma contraseña verifica, y otra no', async () => {
    const hash = await hashContrasena('clave-de-prueba-123');
    expect(await verificaContrasena('clave-de-prueba-123', hash)).toBe(true);
    expect(await verificaContrasena('clave-de-prueba-124', hash)).toBe(false);
    expect(await verificaContrasena('', hash)).toBe(false);
  });

  it('cada hash lleva sal nueva', async () => {
    expect(await hashContrasena('clave-de-prueba-123')).not.toBe(await hashContrasena('clave-de-prueba-123'));
  });

  it('un hash manipulado o de otro formato no revienta: simplemente no vale', async () => {
    const hash = await hashContrasena('clave-de-prueba-123');
    const partes = hash.split('$');
    const roto = [...partes.slice(0, 5), partes[5]!.slice(0, -4) + 'AAAA'].join('$');
    expect(await verificaContrasena('clave-de-prueba-123', roto)).toBe(false);
    expect(await verificaContrasena('clave-de-prueba-123', 'no-es-un-hash')).toBe(false);
    expect(await verificaContrasena('clave-de-prueba-123', 'scrypt$999$8$1$a$b')).toBe(false);
  });
});

describe('token de sesión', () => {
  it('es aleatorio, largo y no se repite', () => {
    const a = tokenDeSesion();
    const b = tokenDeSesion();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('en la base sólo queda su SHA-256, que es determinista y no se puede invertir', () => {
    const token = tokenDeSesion();
    const huella = sha256Hex(token);
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(token)).toBe(huella);
    expect(huella).not.toContain(token);
  });
});

describe('límites en memoria', () => {
  beforeEach(() => reiniciaLimites());

  it('permite hasta el máximo y después frena', () => {
    for (let i = 0; i < 3; i += 1) expect(permite('clave', 3, 1000, 1000 + i)).toBe(true);
    expect(permite('clave', 3, 1000, 1003)).toBe(false);
  });

  it('la ventana caduca y el contador se reinicia solo', () => {
    expect(permite('clave', 1, 1000, 1000)).toBe(true);
    expect(permite('clave', 1, 1000, 1500)).toBe(false);
    expect(permite('clave', 1, 1000, 2500)).toBe(true);
  });
});

describe('mismo origen (CSRF)', () => {
  function peticion(headers: Record<string, string>): Request {
    return new Request('http://localhost:3000/api/favoritos', { method: 'POST', headers });
  }

  it('acepta origen y host coincidentes', () => {
    expect(mismoOrigen(peticion({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(true);
    expect(mismoOrigen(peticion({ origin: 'http://localhost:3000', host: 'localhost:3000', 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('rechaza otro host, otro sitio, y la petición sin Origin', () => {
    expect(mismoOrigen(peticion({ origin: 'https://mal.example', host: 'localhost:3000' }))).toBe(false);
    expect(mismoOrigen(peticion({ origin: 'http://localhost:3000', host: 'localhost:3000', 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(mismoOrigen(peticion({ host: 'localhost:3000' }))).toBe(false);
  });

  it('la vuelta por Referer sólo acepta el mismo host y una ruta interna', () => {
    const base = { origin: 'http://localhost:3000', host: 'localhost:3000' };
    expect(rutaDeVuelta(peticion({ ...base, referer: 'http://localhost:3000/explorar/equipo/8873' }))).toBe('/explorar/equipo/8873');
    expect(rutaDeVuelta(peticion({ ...base, referer: 'https://mal.example/x' }))).toBeNull();
    expect(rutaDeVuelta(peticion(base))).toBeNull();
  });
});
