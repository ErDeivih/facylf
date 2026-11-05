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
 * Flujo real de cuentas contra PostgreSQL con el registro ABIERTO: alta sin invitación, verificación
 * de contraseña, sesión, favorito de club/equipo/jugador, quitar y cierre de sesión.
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
let admin: pg.Client | null = null;

async function primeraFila<T extends pg.QueryResultRow>(sql: string): Promise<T> {
  const filas = await consulta<T>(sql);
  expect(filas[0], `la consulta no devolvió filas: ${sql}`).toBeDefined();
  return filas[0]!;
}

/** Alta abierta: se llama como la web, SIN código de invitación. */
async function altaAbierta(nombre: string): Promise<{ userId: string; correo: string }> {
  const userId = randomUUID();
  usuarios.push(userId);
  const correo = `abierto-${randomUUID().slice(0, 8)}@facylf.local`;
  await altaCuenta({
    userId,
    correo,
    passwordHash: await hashContrasena('clave-de-prueba-123'),
    codigo: null,
    nombre,
  });
  return { userId, correo };
}

beforeAll(async () => {
  if (!hayBase) return;
  admin = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRACION });
  await admin.connect();
});

afterAll(async () => {
  if (admin) {
    if (usuarios.length > 0) await admin.query('delete from app.usuario where user_id = any($1::text[])', [usuarios]);
    await admin.end();
  }
  await cierraCanonico();
});

describe.skipIf(!hayBase)('flujo real de cuentas con registro abierto', () => {
  it('lee el modo abierto y crea una cuenta activa SIN invitación', async () => {
    expect(await modoRegistro()).toBe('abierto');
    const antes = await admin!.query<{ n: number }>('select coalesce(sum(usos), 0)::int as n from app.invitacion');
    const { userId, correo } = await altaAbierta('Cuenta de prueba');
    const despues = await admin!.query<{ n: number }>('select coalesce(sum(usos), 0)::int as n from app.invitacion');
    // Sin código, el alta abierta no consume ninguna invitación.
    expect(despues.rows[0]?.n).toBe(antes.rows[0]?.n);

    const credencial = await credencialDe(correo);
    expect(credencial?.user_id).toBe(userId);
    expect(estadoDeCredencial(credencial!)).toBe('ok');
    expect(await verificaContrasena('clave-de-prueba-123', credencial!.password_hash)).toBe(true);
    expect(await verificaContrasena('otra-clave-123', credencial!.password_hash)).toBe(false);
  });

  it('un segundo alta con el mismo correo se rechaza y no deja restos', async () => {
    const { correo } = await altaAbierta('Primera');
    const otroId = randomUUID();
    usuarios.push(otroId);
    await expect(
      altaCuenta({
        userId: otroId,
        correo,
        passwordHash: await hashContrasena('clave-de-prueba-123'),
        codigo: null,
        nombre: 'Segunda',
      }),
    ).rejects.toThrow(/CORREO_YA_REGISTRADO/);

    const credencial = await credencialDe(correo);
    expect(credencial?.user_id).not.toBe(otroId);
  });

  it('crea una sesión, la valida y la cierra', async () => {
    const { userId } = await altaAbierta('Sesión');
    const token = await creaSesionPara(userId);
    const sesion = await sesionPorToken(token);
    expect(sesion?.user_id).toBe(userId);
    expect(await sesionPorToken('token-que-no-existe')).toBeNull();

    await cierraSesionPorToken(token);
    expect(await sesionPorToken(token)).toBeNull();
  });

  it('guarda y quita favoritos de club, equipo y jugador con el user_id de la sesión', async () => {
    const { userId } = await altaAbierta('Favoritos');

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
