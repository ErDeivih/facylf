import { NextResponse } from 'next/server';
import {
  estadoFavorito, guardaFavorito, quitaFavorito,
} from '@/lib/cuentas-db';
import { esTipoFavorito, type TipoFavorito } from '@/lib/cuentas';
import { sesionActual } from '@/lib/sesion';
import { mismoOrigen, rutaDeVuelta } from '@/lib/seguridad';

/**
 * Favoritos de la cuenta.
 *
 * `GET  /api/favoritos?tipo=club&id=16`  → estado para la estrella de una ficha.
 * `POST /api/favoritos`                  → alternar / guardar / quitar.
 *
 * El usuario **nunca** viaja en la petición: sale de la cookie de sesión. El `tipo` y el `id` son la
 * entidad de la ficha; la etiqueta es sólo el nombre que el usuario verá en su panel (se valida y se
 * recorta aquí). Para un equipo, el id es el de la inscripción (`team_entry`), que es lo que usa la
 * ficha; la función SQL lo traduce a la línea.
 *
 * Los POST comprueban `Origin` (CSRF) y, si el formulario se envía sin JavaScript, redirigen de
 * vuelta a la ficha en vez de devolver JSON.
 */

type PeticionFavorito = {
  accion: 'alternar' | 'guardar' | 'quitar';
  tipo: TipoFavorito | null;
  entidadId: number | null;
  favoritoId: number | null;
  etiqueta: string;
};

export async function GET(peticion: Request): Promise<NextResponse> {
  const url = new URL(peticion.url);
  const tipo = url.searchParams.get('tipo');
  const id = Number(url.searchParams.get('id'));
  if (!esTipoFavorito(tipo) || !Number.isInteger(id) || id <= 0) {
    return json({ autenticado: false, siguiendo: false }, 400);
  }
  const sesion = await sesionActual();
  if (!sesion) return json({ autenticado: false, siguiendo: false }, 200);
  try {
    const favoritoId = await estadoFavorito(sesion.userId, tipo, id);
    return json({ autenticado: true, siguiendo: favoritoId !== null, favoritoId }, 200);
  } catch {
    return json({ autenticado: true, siguiendo: false, favoritoId: null }, 200);
  }
}

export async function POST(peticion: Request): Promise<NextResponse> {
  const formulario = (peticion.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded')
    || (peticion.headers.get('content-type') ?? '').includes('multipart/form-data');

  if (!mismoOrigen(peticion)) {
    return formulario
      ? NextResponse.redirect(new URL('/entrar?aviso=origen', peticion.url), 303)
      : json({ error: 'origen' }, 403);
  }

  let datos: PeticionFavorito;
  try {
    datos = await leePeticion(peticion, formulario);
  } catch {
    return formulario
      ? NextResponse.redirect(new URL('/mi-panel', peticion.url), 303)
      : json({ error: 'datos' }, 400);
  }

  const sesion = await sesionActual();
  if (!sesion) {
    if (!formulario) return json({ error: 'sesion' }, 401);
    const volver = rutaDeVuelta(peticion) ?? '/mi-panel';
    const url = new URL('/entrar', peticion.url);
    url.searchParams.set('aviso', 'sesion');
    url.searchParams.set('volver', volver);
    return NextResponse.redirect(url, 303);
  }

  const volver = rutaDeVuelta(peticion) ?? '/mi-panel';

  try {
    if (datos.accion === 'quitar') {
      if (datos.favoritoId === null) throw new Error('FALTA_FAVORITO');
      await quitaFavorito(sesion.userId, datos.favoritoId);
      return formulario ? NextResponse.redirect(new URL(volver, peticion.url), 303) : json({ siguiendo: false, favoritoId: null }, 200);
    }

    if (datos.tipo === null || datos.entidadId === null) throw new Error('FALTA_ENTIDAD');
    if (datos.etiqueta.length < 1 || datos.etiqueta.length > 80) throw new Error('ETIQUETA_NO_VALIDA');

    if (datos.accion === 'alternar') {
      const existente = await estadoFavorito(sesion.userId, datos.tipo, datos.entidadId);
      if (existente !== null) {
        await quitaFavorito(sesion.userId, existente);
        return formulario
          ? NextResponse.redirect(new URL(volver, peticion.url), 303)
          : json({ siguiendo: false, favoritoId: null }, 200);
      }
    }

    const favoritoId = await guardaFavorito(sesion.userId, datos.tipo, datos.entidadId, datos.etiqueta);
    return formulario
      ? NextResponse.redirect(new URL(volver, peticion.url), 303)
      : json({ siguiendo: true, favoritoId }, 200);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    if (mensaje.includes('DEMASIADOS_FAVORITOS')) {
      return formulario ? NextResponse.redirect(new URL('/mi-panel?aviso=limite', peticion.url), 303) : json({ error: 'limite' }, 409);
    }
    console.error('favoritos: no se pudo guardar', mensaje);
    return formulario ? NextResponse.redirect(new URL('/mi-panel?aviso=no-disponible', peticion.url), 303) : json({ error: 'general' }, 500);
  }
}

async function leePeticion(peticion: Request, formulario: boolean): Promise<PeticionFavorito> {
  if (formulario) {
    const datos = await peticion.formData();
    const accion = String(datos.get('accion') ?? 'alternar');
    return {
      accion: accion === 'quitar' ? 'quitar' : accion === 'guardar' ? 'guardar' : 'alternar',
      tipo: esTipoFavorito(datos.get('tipo')) ? (datos.get('tipo') as TipoFavorito) : null,
      entidadId: enteroPositivo(datos.get('entidad_id')),
      favoritoId: enteroPositivo(datos.get('id')),
      etiqueta: recortaEtiqueta(datos.get('etiqueta')),
    };
  }
  const cuerpo = (await peticion.json()) as Record<string, unknown>;
  const accion = typeof cuerpo.accion === 'string' ? cuerpo.accion : 'alternar';
  return {
    accion: accion === 'quitar' ? 'quitar' : accion === 'guardar' ? 'guardar' : 'alternar',
    tipo: esTipoFavorito(cuerpo.tipo) ? (cuerpo.tipo as TipoFavorito) : null,
    entidadId: enteroPositivo(cuerpo.entidadId),
    favoritoId: enteroPositivo(cuerpo.favoritoId ?? cuerpo.id),
    etiqueta: recortaEtiqueta(cuerpo.etiqueta),
  };
}

function enteroPositivo(valor: unknown): number | null {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function recortaEtiqueta(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  // Se quitan caracteres de control para que la etiqueta no rompa la lista del panel.
  return valor.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
}

function json(cuerpo: unknown, estado: number): NextResponse {
  return NextResponse.json(cuerpo, {
    status: estado,
    headers: { 'cache-control': 'no-store' },
  });
}
