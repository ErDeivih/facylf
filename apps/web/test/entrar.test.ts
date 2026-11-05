import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import PaginaEntrar from '../src/app/entrar/page';
import { AvisoEstado } from '../src/componentes/entrar/AvisoEstado';
import { FormularioCrearCuenta } from '../src/componentes/entrar/FormularioCrearCuenta';
import { FormularioEntrar } from '../src/componentes/entrar/FormularioEntrar';
import { MENSAJE_CUENTAS_CERRADAS, MINIMO_CONTRASENA } from '../src/lib/acceso';

/**
 * Contrato de `/entrar`, la pantalla 13 del prototipo.
 *
 * El registro real no existe todavía, así que lo que se prueba es lo que el usuario ve y puede
 * hacer: dos bloques con etiquetas visibles, los tipos y `autocomplete` correctos, la validación
 * HTML preparada para cuando el servidor esté, el texto de consentimiento vigente (los nombres de
 * los menores se publican; las fotos no) y un estado honesto que no finge que la cuenta ya funciona.
 *
 * No se prueba la estructura del DOM ni nombres de funciones internas: cada aserción es algo que
 * una persona puede comprobar en la pantalla o en el lector de pantalla.
 */

/**
 * El `<input>` de un id, para mirar sus atributos sin depender del orden en que se escriban.
 *
 * Se pasa a minúsculas porque los nombres de atributo HTML no distinguen mayúsculas: React 19 los
 * serializa con su nombre de prop (`autoComplete`) y el navegador los lee igual. Lo que importa es
 * que el atributo esté, no cómo lo escriba el serializador.
 */
function etiquetaDe(html: string, id: string): string {
  const encontrado = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  expect(encontrado, `no hay un input con id "${id}"`).not.toBeNull();
  return encontrado![0].toLowerCase();
}

function htmlDeLaPagina(): string {
  return renderToStaticMarkup(createElement(PaginaEntrar));
}

describe('/entrar · dos bloques con su título', () => {
  it('la página tiene un título de documento y los dos bloques del prototipo', () => {
    const html = htmlDeLaPagina();
    expect(html).toMatch(/<h1[^>]*class="[^"]*sr-only[^"]*"[^>]*>Entrar o crear cuenta<\/h1>/);
    expect(html).toContain('aria-labelledby="entrar-titulo"');
    expect(html).toContain('aria-labelledby="crear-cuenta-titulo"');
    expect(html).toMatch(/<h2[^>]*id="entrar-titulo"[^>]*>Entrar<\/h2>/);
    expect(html).toMatch(/<h2[^>]*id="crear-cuenta-titulo"[^>]*>Crear cuenta<\/h2>/);
  });

  it('el contexto de utilidad cabe en una línea y dice para qué sirve la cuenta', () => {
    const html = htmlDeLaPagina();
    expect(html).toContain('clubes, equipos y jugadores');
    expect(html).toContain('horarios, resultados y avisos');
    expect(html).toContain('invitación');
  });

  it('no promete una pantalla que no existe: ni /registro ni /recuperar están enlazados', () => {
    const html = htmlDeLaPagina();
    expect(html).not.toContain('href="/registro"');
    expect(html).not.toContain('href="/recuperar"');
  });
});

describe('/entrar · bloque Entrar', () => {
  it('los campos tienen etiqueta visible y el tipo y autocomplete que espera el navegador', () => {
    const html = htmlDeLaPagina();
    expect(html).toMatch(/<label[^>]*for="entrar-correo"[^>]*>Correo/);
    expect(html).toMatch(/<label[^>]*for="entrar-contrasena"[^>]*>Contraseña/);

    const correo = etiquetaDe(html, 'entrar-correo');
    expect(correo).toContain('type="email"');
    expect(correo).toContain('autocomplete="email"');
    expect(correo).toContain('required');

    const contrasena = etiquetaDe(html, 'entrar-contrasena');
    expect(contrasena).toContain('type="password"');
    expect(contrasena).toContain('autocomplete="current-password"');
    expect(contrasena).toContain('required');
  });

  it('ofrece entrar, el enlace sin contraseña y recuperar la contraseña, sin inventar estado', () => {
    const html = htmlDeLaPagina();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*?Entrar[\s\S]*?<\/button>/);
    expect(html).toContain('Recibir un enlace para entrar sin contraseña');
    expect(html).toContain('He olvidado la contraseña');
  });

  it('el estado de cuenta cerrada no se enseña hasta que se pulsa', () => {
    const html = htmlDeLaPagina();
    expect(html).not.toContain(MENSAJE_CUENTAS_CERRADAS);
    expect((html.match(/role="status"/g) ?? []).length).toBe(2);
  });
});

describe('/entrar · bloque Crear cuenta', () => {
  it('pide nombre, correo, contraseña, invitación y aceptación, con sus atributos correctos', () => {
    const html = htmlDeLaPagina();

    expect(html).toMatch(/<label[^>]*for="alta-nombre"[^>]*>Nombre/);
    expect(html).toMatch(/<label[^>]*for="alta-correo"[^>]*>Correo/);
    expect(html).toMatch(/<label[^>]*for="alta-contrasena"[^>]*>Contraseña/);
    expect(html).toMatch(/<label[^>]*for="alta-invitacion"[^>]*>Código de invitación/);

    const nombre = etiquetaDe(html, 'alta-nombre');
    expect(nombre).toContain('autocomplete="name"');
    expect(nombre).toContain('required');

    const correo = etiquetaDe(html, 'alta-correo');
    expect(correo).toContain('type="email"');
    expect(correo).toContain('autocomplete="email"');
    expect(correo).toContain('required');

    const contrasena = etiquetaDe(html, 'alta-contrasena');
    expect(contrasena).toContain('type="password"');
    expect(contrasena).toContain('autocomplete="new-password"');
    expect(contrasena).toContain(`minlength="${MINIMO_CONTRASENA}"`);
    expect(contrasena).toContain('required');

    const invitacion = etiquetaDe(html, 'alta-invitacion');
    expect(invitacion).toContain('autocomplete="off"');
    expect(invitacion).toContain('required');

    const acepto = etiquetaDe(html, 'alta-acepto');
    expect(acepto).toContain('type="checkbox"');
    expect(acepto).toContain('required');
  });

  it('el consentimiento dice la decisión vigente: los nombres de menores se publican y las fotos no', () => {
    const html = htmlDeLaPagina();
    expect(html).toContain('La federación tiene consentimiento para publicar los nombres de los menores');
    expect(html).toContain('las fotos no se publican');
    // La frase vieja del prototipo decía justo lo contrario y no puede volver.
    expect(html.toLowerCase()).not.toContain('no se muestran sin permiso');
  });

  it('el botón de crear cuenta existe y la pantalla no finge un correo de confirmación', () => {
    const html = htmlDeLaPagina();
    expect(html).toMatch(/<button[^>]*>[\s\S]*?Crear cuenta[\s\S]*?<\/button>/);
    expect(html).not.toContain('Te llegará un correo');
    expect(html).not.toContain('paquete Ojeador');
  });
});

describe('/entrar · copy y accesibilidad', () => {
  it('no hay texto técnico, ni bienvenida, ni promesas de sesión o tokens', () => {
    const texto = htmlDeLaPagina().replace(/<[^>]*>/g, ' ').toLowerCase();
    for (const prohibido of ['token', 'endpoint', 'api', 'servidor', 'sesión', 'bienvenid', 'contraseña olvidada']) {
      expect(texto, `no debería decir «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('no inventa un nombre de usuario ni un avatar', () => {
    const texto = htmlDeLaPagina();
    expect(texto).not.toContain('David');
    expect(texto).not.toContain('DP');
    expect(texto).not.toContain('Cerrar sesión');
  });

  it('las acciones no se presentan como enlaces muertos', () => {
    const html = htmlDeLaPagina();
    // Las tres acciones del bloque de entrada son botones (aún no hay ruta de recuperación ni de
    // enlace mágico). Un `<a>` sin destino sería una promesa que no se cumple.
    expect(html).not.toContain('href="#"');
  });
});

describe('el estado honesto de los formularios', () => {
  it('la región de estado existe desde el primer render y anuncia el mensaje cuando llega', () => {
    const vacio = renderToStaticMarkup(createElement(AvisoEstado, { texto: null }));
    expect(vacio).toContain('role="status"');
    expect(vacio).not.toContain('Las cuentas');

    const conMensaje = renderToStaticMarkup(
      createElement(AvisoEstado, { texto: MENSAJE_CUENTAS_CERRADAS }),
    );
    expect(conMensaje).toContain('role="status"');
    expect(conMensaje).toContain(MENSAJE_CUENTAS_CERRADAS);
  });

  it('el mensaje es exactamente el que se quiere, sin textos de relleno', () => {
    expect(MENSAJE_CUENTAS_CERRADAS).toBe('Las cuentas todavía no están abiertas.');
    expect(MINIMO_CONTRASENA).toBe(10);
  });

  it('los formularios se pueden renderizar por separado para probarlos sin la página', () => {
    expect(renderToStaticMarkup(createElement(FormularioEntrar))).toContain('type="password"');
    expect(renderToStaticMarkup(createElement(FormularioCrearCuenta))).toContain('Código de invitación');
  });
});
