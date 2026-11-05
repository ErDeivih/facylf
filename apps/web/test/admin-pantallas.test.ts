import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { cierraCanonico, ejecutaConsulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  AUDITORIA_ADMIN, CUENTAS_RESUMEN, PANEL_RESUMEN, PROCESOS, USUARIOS_ADMIN,
} from '../src/consultas/admin';
import type {
  FilaAccesoSensible, FilaAuditoria, FilaCuentasResumen, FilaInvitacion, FilaPanelResumen,
  FilaProcesos, FilaUsuarioAdmin,
} from '../src/consultas/admin';
import { decisionAccesoAdmin, etiquetaModoRegistro, etiquetaProceso, etiquetaTabla } from '../src/lib/admin';
import { PanelAdmin } from '../src/componentes/admin/PanelAdmin';
import { UsuariosAdmin } from '../src/componentes/admin/UsuariosAdmin';

/**
 * Panel de administración: guardia (sin sesión, sin rol, sin capacidad), render del resumen y de la
 * lista de usuarios con fixtures, y contrato de las consultas reales si hay base.
 *
 * Las fixtures imitan las filas de `consultas/admin.ts`. No se prueba la estructura del DOM: se
 * comprueba lo que ve un administrador y lo que NO se le ofrece (acciones que aún no existen).
 */

vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

/*
 * La guardia de servidor se prueba con la sesión simulada. `consulta` NO se simula: el caso de un
 * administrador sin la capacidad se resuelve contra la base real (un id que no existe nunca tiene el
 * permiso) y, si no hay base, la función falla cerrada igual.
 */
const guardia = vi.hoisted(() => ({
  sesion: null as null | { userId: string; nombre: string | null; rol: string; paquete: string | null },
}));

vi.mock('../src/lib/sesion', () => ({
  sesionActual: async () => guardia.sesion,
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-pathname': '/admin/usuarios' }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));

afterAll(async () => {
  await cierraCanonico();
});

const PANEL: FilaPanelResumen = {
  alertas_fallo: 1, alertas_aviso: 9, usuarios_pendientes: 2, usuarios_activos: 4, activos_7d: 3,
  casos_graves: 7, casos_abiertos: 12, avisos_24h: 5, avisos_ultima_pasada: '2026-11-05T21:02:00Z',
  ultima_copia: '2026-11-05T09:19:00Z', grupos_pendientes: 41, huecos_anuncio_activos: 0,
};

const CUENTAS: FilaCuentasResumen = {
  pendientes: 2, esperando_mas_de_3_dias: 1, admins_sin_2fa: 0, cuentas_frenadas: 1,
  invitaciones_vigentes: 2, caducan_en_30_dias: 3, bloqueados: 0, altas_7_dias: 4,
};

const USUARIO: FilaUsuarioAdmin = {
  user_id: 'u-1', nombre: 'Ana de prueba', rol: 'usuario', estado: 'pendiente', paquete: 'esencial',
  valido_hasta: null, creado_en: '2026-11-01T10:00:00Z', ultimo_acceso: null, invitacion: null,
  capacidades: ['ver_menores_nombres', 'exportar_datos', 'ver_fichas', 'confirmar_identidades'],
  favoritos: 3, avisos_sin_leer: 0, push: false, motivo_estado: null, dias_esperando: 4,
};

const INVITACION: FilaInvitacion = {
  codigo: 'K7QFM-2XRTA', paquete: 'esencial', usos: 0, usos_max: 1, caduca_en: '2026-12-01T00:00:00Z',
  creada_por: 'admin', creada_en: '2026-11-01T10:00:00Z', nota: null, estado: 'vigente', personal: true,
};

const ACCESO: FilaAccesoSensible = {
  user_id: 'u-1', nombre: 'Ana de prueba', capacidad: 'ver_menores_nombres', accesos: 12,
  entidades: 9, primero: '2026-11-01T10:00:00Z', ultimo: '2026-11-05T10:00:00Z',
};

const PROCESO: FilaProcesos = {
  proceso: 'proyector', ultima: '2026-11-05T20:00:00Z', detalle: '4102 grupos pendientes',
};

const AUDITORIA: FilaAuditoria = {
  id: 1, en: '2026-11-05T09:55:00Z', usuario: 'facylf_admin', tabla: 'app.usuario', accion: 'update',
  clave: 'u-1', cambios: { estado: { antes: 'pendiente', despues: 'activo' }, paquete: { antes: null, despues: 'ojeador' } },
  antes: null, despues: null,
};

function pintaPanel(): string {
  return renderToStaticMarkup(createElement(PanelAdmin, {
    panel: PANEL, cuentas: CUENTAS, pendientes: [USUARIO], invitaciones: [INVITACION],
    accesos: [ACCESO], procesos: [PROCESO], auditoria: [AUDITORIA], modoRegistro: 'abierto',
  }));
}

function pintaUsuarios(
  usuarios: readonly FilaUsuarioAdmin[] = [USUARIO],
  pendientes: readonly FilaUsuarioAdmin[] = [USUARIO],
  extra: { pagina?: number; haySiguiente?: boolean } = {},
): string {
  return renderToStaticMarkup(createElement(UsuariosAdmin, {
    usuarios, pendientes, auditoria: [AUDITORIA], filtros: { estado: null, texto: null },
    pagina: extra.pagina ?? 1, haySiguiente: extra.haySiguiente ?? false,
  }));
}

describe('guardia del panel · decisión pura', () => {
  it('sin sesión se va a entrar', () => {
    expect(decisionAccesoAdmin(null, false)).toBe('entrar');
    expect(decisionAccesoAdmin(undefined, true)).toBe('entrar');
  });

  it('con sesión pero sin rol de administración no se entra', () => {
    expect(decisionAccesoAdmin({ rol: 'usuario' }, true)).toBe('sin-permiso');
    expect(decisionAccesoAdmin({ rol: 'usuario' }, false)).toBe('sin-permiso');
  });

  it('con rol pero sin la capacidad tampoco', () => {
    expect(decisionAccesoAdmin({ rol: 'administrador' }, false)).toBe('sin-permiso');
  });

  it('sólo administrador con la capacidad entra', () => {
    expect(decisionAccesoAdmin({ rol: 'administrador' }, true)).toBe('ok');
  });
});

describe('guardia del panel · servidor', () => {
  beforeEach(() => {
    guardia.sesion = null;
  });

  it('sin sesión redirige a entrar conservando la ruta', async () => {
    const { exigeAdministrador } = await import('../src/lib/admin-servidor');
    await expect(exigeAdministrador()).rejects.toThrow('REDIRECT:/entrar?volver=%2Fadmin%2Fusuarios');
  });

  it('una cuenta normal recibe 404, no el panel', async () => {
    guardia.sesion = { userId: 'u-normal', nombre: 'Ana', rol: 'usuario', paquete: 'esencial' };
    const { exigeAdministrador } = await import('../src/lib/admin-servidor');
    await expect(exigeAdministrador()).rejects.toThrow('NOT_FOUND');
  });

  it('un administrador sin la capacidad también recibe 404', async () => {
    guardia.sesion = { userId: 'u-sin-permiso', nombre: 'Admin', rol: 'administrador', paquete: 'esencial' };
    const { exigeAdministrador } = await import('../src/lib/admin-servidor');
    // `u-sin-permiso` no existe: `app.puede` devuelve false y la guardia falla cerrada.
    await expect(exigeAdministrador()).rejects.toThrow('NOT_FOUND');
  });
});

describe('/admin · portada', () => {
  it('enseña el resumen real y las secciones pedidas', () => {
    const html = pintaPanel();
    expect(html).toContain('Administración');
    expect(html).toContain('Lo que necesita atención');
    expect(html).toContain('Cuentas');
    expect(html).toContain('Invitaciones');
    expect(html).toContain('Accesos sensibles');
    expect(html).toContain('Procesos automáticos');
    expect(html).toContain('Auditoría reciente');
    expect(html).toContain('Registro:');
    expect(html).toContain('Abierto');
  });

  it('lo que necesita atención enlaza a usuarios y no a pantallas que no existen', () => {
    const html = pintaPanel();
    expect(html).toContain('/admin/usuarios?estado=pendiente');
    expect(html).toContain('cuentas esperan aprobación');
    expect(html).toContain('alerta en fallo');
    expect(html).toContain('casos de datos graves');
    expect(html).not.toMatch(/href="\/admin\/salud|href="\/admin\/datos|href="\/admin\/publicidad/);
    expect(html).not.toMatch(/href="\/admin\/usuarios\/[^"?#]+/);
  });

  it('es de consulta: no tiene botones de acción', () => {
    const html = pintaPanel();
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/<button[^>]*>[\s\S]*?(Aprobar|Bloquear|Rechazar)/);
  });

  it('las invitaciones se listan sin códigos internos de tabla ni jerga', () => {
    const html = pintaPanel();
    expect(html).toContain('K7QFM-2XRTA');
    expect(html).toContain('para un correo concreto');
    expect(html).not.toContain('app.invitacion');
    expect(html).not.toContain('correo_sha');
  });
});

describe('/admin/usuarios · lista de sólo lectura', () => {
  it('avisa de que las acciones todavía no están implementadas', () => {
    const html = pintaUsuarios();
    expect(html).toContain('Solo lectura');
    expect(html).toContain('todavía no está implementado');
    expect(html).toMatch(/Aprobar, rechazar, bloquear o cambiar paquetes/);
  });

  it('no pinta botones de aprobar, rechazar o bloquear', () => {
    const html = pintaUsuarios();
    expect(html).not.toMatch(/<button[^>]*>[\s\S]*?(Aprobar|Rechazar|Bloquear|Cambiar paquete)/);
  });

  it('la tabla enseña cuenta, rol, permisos, estado, último acceso y favoritos', () => {
    const html = pintaUsuarios();
    expect(html).toContain('Ana de prueba');
    expect(html).toContain('Usuario');
    expect(html).toContain('Esencial');
    expect(html).toContain('Nombres de menores');
    expect(html).toContain('Exportar datos');
    expect(html).toContain('Fichas');
    expect(html).toContain('y 1 más');
    expect(html).toContain('Pendiente');
    expect(html).toContain('4 días esperando');
    expect(html).toContain('Nunca');
    expect(html).toContain('>3<');
  });

  it('los filtros son un formulario GET por estado y nombre, sin ids en la URL', () => {
    const html = pintaUsuarios();
    expect(html).toContain('action="/admin/usuarios"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="estado"');
    expect(html).toContain('name="q"');
    expect(html).not.toContain('name="user_id"');
    expect(html).not.toContain('name="id"');
  });

  it('sin resultados no deja una tabla vacía: dice qué hacer', () => {
    const html = pintaUsuarios([], []);
    expect(html).toContain('No hay cuentas con estos filtros');
    expect(html).not.toContain('Ana de prueba');
  });

  it('la paginación básica lleva a la página anterior y a la siguiente conservando filtros', () => {
    const html = pintaUsuarios([USUARIO], [USUARIO], { pagina: 2, haySiguiente: true });
    expect(html).toContain('Página 2');
    expect(html).toContain('Anterior');
    expect(html).toContain('Siguiente');
    expect(html).toContain('href="/admin/usuarios"');
    const conFiltro = renderToStaticMarkup(createElement(UsuariosAdmin, {
      usuarios: [USUARIO], pendientes: [], auditoria: [], filtros: { estado: 'activo', texto: 'ana' },
      pagina: 1, haySiguiente: true,
    }));
    expect(conFiltro).toContain('href="/admin/usuarios?estado=activo&amp;q=ana&amp;pagina=2"');
  });

  it('la auditoría reciente se enseña en lenguaje humano', () => {
    const html = pintaUsuarios();
    expect(html).toContain('Auditoría · últimos cambios');
    expect(html).toContain('Sistema');
    expect(html).toContain('cambio en Cuenta');
    expect(html).not.toContain('app.usuario');
    expect(html).not.toContain('facylf_admin');
  });
});

describe('vocabulario del panel', () => {
  it('traduce procesos, tablas y modo de registro sin enseñar códigos internos', () => {
    expect(etiquetaProceso('proyector')).toBe('Proyector');
    expect(etiquetaProceso('otra_cosa')).toBe('Proceso automático');
    expect(etiquetaTabla('app.usuario')).toBe('Cuenta');
    expect(etiquetaTabla('tabla.desconocida')).toBe('Datos');
    expect(etiquetaModoRegistro('abierto')).toBe('Abierto');
    expect(etiquetaModoRegistro(null)).toBe('Sin determinar');
  });
});

const hayBaseApp = motivoSinCanonico('app') === null;

describe.skipIf(!hayBaseApp)('contrato de las consultas reales del panel', () => {
  it('el resumen del panel devuelve sus columnas prometidas', async () => {
    const filas = await ejecutaConsulta<FilaPanelResumen>(PANEL_RESUMEN);
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0]!).sort()).toEqual([...PANEL_RESUMEN.columnas].sort());
    for (const clave of ['alertas_fallo', 'usuarios_pendientes', 'casos_graves', 'avisos_24h']) {
      expect(Number(filas[0]![clave as keyof FilaPanelResumen])).toBeGreaterThanOrEqual(0);
    }
  });

  it('el resumen de cuentas y los procesos devuelven sus columnas', async () => {
    const cuentas = await ejecutaConsulta<FilaCuentasResumen>(CUENTAS_RESUMEN);
    expect(cuentas).toHaveLength(1);
    expect(Object.keys(cuentas[0]!).sort()).toEqual([...CUENTAS_RESUMEN.columnas].sort());

    const procesos = await ejecutaConsulta<FilaProcesos>(PROCESOS);
    expect(procesos.length).toBeGreaterThan(0);
    expect(Object.keys(procesos[0]!).sort()).toEqual([...PROCESOS.columnas].sort());
  });

  it('la auditoría y los usuarios traen las columnas prometidas', async () => {
    const auditoria = await ejecutaConsulta<FilaAuditoria>(AUDITORIA_ADMIN, [null, null, null, 5]);
    expect(auditoria.length).toBeGreaterThan(0);
    expect(Object.keys(auditoria[0]!).sort()).toEqual([...AUDITORIA_ADMIN.columnas].sort());

    const usuarios = await ejecutaConsulta<FilaUsuarioAdmin>(USUARIOS_ADMIN, [null, null, 5, 0]);
    for (const u of usuarios) {
      expect(Object.keys(u).sort()).toEqual([...USUARIOS_ADMIN.columnas].sort());
    }
  });
});
