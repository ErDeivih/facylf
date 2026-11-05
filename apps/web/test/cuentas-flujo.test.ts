import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  altaCuenta, cierraSesionPorToken, credencialDe, creaSesionPara, estadoFavorito,
  guardaFavorito, misAccesos, modoRegistro, quitaFavorito, sesionPorToken,
} from '../src/lib/cuentas-db';
import { hashContrasena, verificaContrasena } from '../src/lib/contrasenas';
import { estadoDeCredencial } from '../src/lib/cuentas';

/**
 * Flujo real de cuentas contra PostgreSQL: alta con invitación, verificación de contraseña, sesión,
 * favorito de club/equipo/jugador, quitar y cierre de sesión.
 *
 * Usa el rol `facylf_app` para todo lo que hace la web. La limpieza final sí va con el rol de
 * migración, porque `facylf_app` no tiene permiso directo sobre `app.credencial` ni `app.sesion` (a
 * propósito). Si no hay base, las pruebas se saltan: no se inventan resultados.
 */

const hayApp = Boolean(process.env.DATABASE_URL_APP);
const hayAdmin = Boolean(process.env.DATABASE_URL_MIGRACION);
const motivo = motivoSinCanonico();
const hayBase = hayApp && hayAdmin && motivo === null;

const usuarios: string[] = [];
const invitaciones: string[] = [];
let admin: pg.Client | null = null;

async function nuevaInvitacion(usosMax = 1): Promise<string> {
  const codigo = `PRUEBA-${randomUUID().slice(0, 8).toUpperCase()}`;
  await admin!.query(
    `insert into app.invitacion (codigo, creada_por, paquete, usos_max, nota)
     values ($1, 'prueba', 'esencial', $2, 'prueba del flujo de cuentas')`,
    [codigo, usosMax],
  );
  invitaciones.push(codigo);
  return codigo;
}

async function primeraFila<T extends pg.QueryResultRow>(sql: string): Promise<T> {
  const filas = await consulta<T>(sql);
  expect(filas[0], `la consulta no devolvió filas: ${sql}`).toBeDefined();
  return filas[0]!;
}

beforeAll(async () => {
  if (!hayBase) return;
  admin = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRACION });
  await admin.connect();
});

afterAll(async () => {
  if (admin) {
    if (usuarios.length > 0) await admin.query('delete from app.usuario where user_id = any($1::text[])', [usuarios]);
    if (invitaciones.length > 0) await admin.query('delete from app.invitacion where codigo = any($1::text[])', [invitaciones]);
    await admin.end();
  }
  await cierraCanonico();
});

describe.skipIf(!hayBase)('flujo real de cuentas', () => {
  it('lee el modo de registro y crea una cuenta activa con invitación', async () => {
    expect(await modoRegistro()).toBe('invitacion');
    const codigo = await nuevaInvitacion();
    const userId = randomUUID();
    usuarios.push(userId);
    const correo = `flujo-${randomUUID().slice(0, 8)}@facylf.local`;
    const hash = await hashContrasena('clave-de-prueba-123');

    const estado = await altaCuenta({ userId, correo, passwordHash: hash, codigo, nombre: 'Cuenta de prueba' });
    expect(estado).toBe('activo');

    const credencial = await credencialDe(correo);
    expect(credencial?.user_id).toBe(userId);
    expect(credencial?.password_hash).toBe(hash);
    expect(estadoDeCredencial(credencial!)).toBe('ok');
    expect(await verificaContrasena('clave-de-prueba-123', credencial!.password_hash)).toBe(true);
    expect(await verificaContrasena('otra-clave-123', credencial!.password_hash)).toBe(false);
  });

  it('la invitación se consume una sola vez y un segundo alta con el mismo correo no deja restos', async () => {
    const codigo = await nuevaInvitacion();
    const userId = randomUUID();
    usuarios.push(userId);
    const correo = `duplicada-${randomUUID().slice(0, 8)}@facylf.local`;
    const hash = await hashContrasena('clave-de-prueba-123');
    await altaCuenta({ userId, correo, passwordHash: hash, codigo, nombre: 'Primera' });

    const codigo2 = await nuevaInvitacion();
    const otroId = randomUUID();
    usuarios.push(otroId);
    await expect(
      altaCuenta({ userId: otroId, correo, passwordHash: hash, codigo: codigo2, nombre: 'Segunda' }),
    ).rejects.toThrow(/CORREO_YA_REGISTRADO/);

    const usos = await admin!.query<{ usos: number }>('select usos from app.invitacion where codigo = $1', [codigo2]);
    expect(usos.rows[0]?.usos).toBe(0);
    const credencial = await credencialDe(correo);
    expect(credencial?.user_id).toBe(userId);
  });

  it('crea una sesión, la valida y la cierra', async () => {
    const codigo = await nuevaInvitacion();
    const userId = randomUUID();
    usuarios.push(userId);
    const correo = `sesion-${randomUUID().slice(0, 8)}@facylf.local`;
    await altaCuenta({ userId, correo, passwordHash: await hashContrasena('clave-de-prueba-123'), codigo, nombre: 'Sesión' });

    const token = await creaSesionPara(userId);
    const sesion = await sesionPorToken(token);
    expect(sesion?.user_id).toBe(userId);
    expect(await sesionPorToken('token-que-no-existe')).toBeNull();

    await cierraSesionPorToken(token);
    expect(await sesionPorToken(token)).toBeNull();
  });

  it('guarda y quita favoritos de club, equipo y jugador con el user_id de la sesión', async () => {
    const codigo = await nuevaInvitacion();
    const userId = randomUUID();
    usuarios.push(userId);
    const correo = `favoritos-${randomUUID().slice(0, 8)}@facylf.local`;
    await altaCuenta({ userId, correo, passwordHash: await hashContrasena('clave-de-prueba-123'), codigo, nombre: 'Favoritos' });

    const club = await primeraFila<{ id: string }>('select id from core.club order by id limit 1');
    const equipo = await primeraFila<{ id: string }>('select id from core.team_entry order by id limit 1');
    const persona = await primeraFila<{ id: string }>('select id from core.person order by id limit 1');
    const clubId = Number(club.id);
    const equipoId = Number(equipo.id);
    const personaId = Number(persona.id);

    expect(await estadoFavorito(userId, 'club', clubId)).toBeNull();
    const idClub = await guardaFavorito(userId, 'club', clubId, 'Club de prueba');
    expect(await estadoFavorito(userId, 'club', clubId)).toBe(idClub);

    const idEquipo = await guardaFavorito(userId, 'equipo', equipoId, 'Equipo de prueba');
    expect(await estadoFavorito(userId, 'equipo', equipoId)).toBe(idEquipo);

    const idJugador = await guardaFavorito(userId, 'jugador', personaId, 'Jugador de prueba');
    expect(await estadoFavorito(userId, 'jugador', personaId)).toBe(idJugador);

    const accesos = await misAccesos(userId);
    expect(accesos.map((a) => a.tipo).sort()).toEqual(['club', 'equipo', 'jugador']);
    expect(accesos.every((a) => a.etiqueta.length > 0)).toBe(true);

    expect(await quitaFavorito(userId, idClub)).toBe(true);
    expect(await quitaFavorito(userId, idEquipo)).toBe(true);
    expect(await quitaFavorito(userId, idJugador)).toBe(true);
    expect(await misAccesos(userId)).toHaveLength(0);
  });
});
