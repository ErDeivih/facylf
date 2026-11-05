import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AvisoEstado } from '../src/componentes/entrar/AvisoEstado';
import { FormularioCrearCuenta } from '../src/componentes/entrar/FormularioCrearCuenta';
import { FormularioEntrar } from '../src/componentes/entrar/FormularioEntrar';
import { PaginaAcceso } from '../src/componentes/entrar/PaginaAcceso';

/**
 * La pantalla de entrada y alta, ya con el flujo real.
 *
 * Se prueba la pieza presentacional (`PaginaAcceso`), no la página de servidor: así no hace falta
 * base de datos ni cookie. Lo que se comprueba es lo que ve una persona: dos bloques con su título,
 * formularios HTML que envían a las rutas reales, etiquetas y `autocomplete` correctos, el
 * consentimiento vigente sobre menores, y que no se promete nada que no exista (enlace mágico,
 * recuperación de contraseña o mensajes técnicos).
 */

function html(aviso: string | null = null, modo = 'invitacion', volver: string | null = null): string {
  return renderToStaticMarkup(createElement(PaginaAcceso, { aviso, volver, modo }));
}

/** El `<input>` de un id, para mirar sus atributos sin depender del orden. */
function etiquetaDe(entrada: string, id: string): string {
  const encontrado = entrada.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  expect(encontrado, `no hay un input con id "${id}"`).not.toBeNull();
  return encontrado![0].toLowerCase();
}

describe('/entrar · dos bloques con su título', () => {
  it('la pantalla tiene un título de documento y los dos bloques del prototipo', () => {
    const entrada = html();
    expect(entrada).toMatch(/<h1[^>]*class="[^"]*sr-only[^"]*"[^>]*>Entrar o crear cuenta<\/h1>/);
    expect(entrada).toContain('aria-labelledby="entrar-titulo"');
    expect(entrada).toContain('aria-labelledby="crear-cuenta-titulo"');
    expect(entrada).toMatch(/<h2[^>]*id="entrar-titulo"[^>]*>Entrar<\/h2>/);
    expect(entrada).toMatch(/<h2[^>]*id="crear-cuenta-titulo"[^>]*>Crear cuenta<\/h2>/);
  });

  it('el contexto de utilidad dice para qué sirve la cuenta', () => {
    const entrada = html();
    expect(entrada).toContain('clubes, equipos y jugadores');
    expect(entrada).toContain('horarios, resultados y avisos');
  });

  it('los formularios envían a las rutas reales, no a un aviso de «cerrado»', () => {
    const entrada = html();
    expect(entrada).toContain('action="/api/cuentas/entrar"');
    expect(entrada).toContain('action="/api/cuentas/crear"');
    expect(entrada).toContain('method="post"');
    expect(entrada).not.toContain('Las cuentas todavía no están abiertas');
  });

  it('no hay enlaces muertos a pantallas que no existen', () => {
    const entrada = html();
    expect(entrada).not.toContain('href="/registro"');
    expect(entrada).not.toContain('href="/recuperar"');
    expect(entrada).not.toContain('href="#"');
  });
});

describe('/entrar · bloque Entrar', () => {
  it('los campos tienen etiqueta visible y el tipo y autocomplete que espera el navegador', () => {
    const entrada = html();
    expect(entrada).toMatch(/<label[^>]*for="entrar-correo"[^>]*>Correo/);
    expect(entrada).toMatch(/<label[^>]*for="entrar-contrasena"[^>]*>Contraseña/);

    const correo = etiquetaDe(entrada, 'entrar-correo');
    expect(correo).toContain('type="email"');
    expect(correo).toContain('autocomplete="email"');
    expect(correo).toContain('required');

    const contrasena = etiquetaDe(entrada, 'entrar-contrasena');
    expect(contrasena).toContain('type="password"');
    expect(contrasena).toContain('autocomplete="current-password"');
    expect(contrasena).toContain('required');
  });

  it('tiene un botón de entrada y no promete enlace mágico ni recuperación', () => {
    const entrada = html();
    expect(entrada).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*?Entrar[\s\S]*?<\/button>/);
    expect(entrada).not.toContain('Recibir un enlace');
    expect(entrada).not.toContain('He olvidado la contraseña');
  });
});

describe('/entrar · bloque Crear cuenta', () => {
  it('pide nombre, correo, contraseña, invitación y aceptación, con sus atributos', () => {
    const entrada = html(null, 'invitacion');

    expect(entrada).toMatch(/<label[^>]*for="alta-nombre"[^>]*>Nombre/);
    expect(entrada).toMatch(/<label[^>]*for="alta-invitacion"[^>]*>Código de invitación/);

    expect(etiquetaDe(entrada, 'alta-nombre')).toContain('autocomplete="name"');
    expect(etiquetaDe(entrada, 'alta-correo')).toContain('type="email"');
    expect(etiquetaDe(entrada, 'alta-contrasena')).toContain('autocomplete="new-password"');
    expect(etiquetaDe(entrada, 'alta-contrasena')).toContain('minlength="10"');
    expect(etiquetaDe(entrada, 'alta-invitacion')).toContain('required');
    expect(etiquetaDe(entrada, 'alta-acepto')).toContain('type="checkbox"');
    expect(etiquetaDe(entrada, 'alta-acepto')).toContain('required');
  });

  it('el consentimiento dice la decisión vigente: nombres publicados y fotos no', () => {
    const entrada = html();
    expect(entrada).toContain('La federación tiene consentimiento para publicar los nombres de los menores');
    expect(entrada).toContain('las fotos no se publican');
    expect(entrada.toLowerCase()).not.toContain('no se muestran sin permiso');
  });

  it('en modo aprobación no se pide código y se explica que queda pendiente', () => {
    const entrada = html(null, 'aprobacion');
    expect(entrada).not.toContain('Código de invitación');
    expect(entrada).toContain('queda pendiente de que la aprueben');
  });

  it('la ruta de vuelta viaja como campo oculto en los dos formularios', () => {
    const entrada = html(null, 'invitacion', '/explorar/equipo/8873');
    expect(entrada).toContain('name="volver" value="/explorar/equipo/8873"');
  });
});

describe('/entrar · avisos y copy', () => {
  it('el aviso llega ya traducido y se anuncia en una región de estado', () => {
    const entrada = html('Correo o contraseña incorrectos.');
    expect(entrada).toContain('role="status"');
    expect(entrada).toContain('Correo o contraseña incorrectos.');
    expect(html()).not.toContain('Correo o contraseña incorrectos.');
  });

  it('no hay texto técnico, ni bienvenida, ni promesas de sesión o tokens', () => {
    const texto = html().replace(/<[^>]*>/g, ' ').toLowerCase();
    for (const prohibido of ['token', 'endpoint', 'api', 'servidor', 'sesión', 'bienvenid']) {
      expect(texto, `no debería decir «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('las piezas se pueden renderizar por separado', () => {
    expect(renderToStaticMarkup(createElement(FormularioEntrar, { volver: null }))).toContain('type="password"');
    expect(renderToStaticMarkup(createElement(FormularioCrearCuenta, { modo: 'invitacion', volver: null })))
      .toContain('Código de invitación');
    expect(renderToStaticMarkup(createElement(AvisoEstado, { texto: null }))).toContain('role="status"');
  });
});
