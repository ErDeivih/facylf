import { consulta } from '@/consultas/adaptadores/postgres/conexion';

/** Límite compartido entre instancias; si la base no responde, no bloquea la operación. */
export async function limiteCompartido(clave: string, maximo: number, segundos: number): Promise<boolean> {
  try {
    const [fila] = await consulta<{ ok: boolean }>(
      'select app.consume_limite($1, $2, make_interval(secs => $3)) as ok',
      [clave, maximo, segundos], { rol: 'app' },
    );
    return fila?.ok !== false;
  } catch {
    return true;
  }
}
