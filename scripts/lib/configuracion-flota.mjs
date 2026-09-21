import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Devuelve la misma configuración que cargan las tareas programadas de Windows.
 *
 * Los diagnósticos se ejecutan normalmente desde una consola que NO hereda las variables de
 * `entorno-flota.ps1`. Si se limitan a mirar `process.env`, describen otra flota (10 GB/11 plazas)
 * mientras los workers reales usan 6 GB/7 plazas. En Linux/Docker las variables sí las aporta el
 * compose y tienen prioridad.
 */
export function configuracionFlotaLocal(raiz) {
  let memoriaArchivo = null;
  let reservaArchivo = null;
  let turnoArchivo = null;
  let headlessArchivo = null;
  let topeArchivo = null;
  let excluirArchivo = null;
  const ruta = join(raiz, 'scripts', 'entorno-flota.ps1');
  if (process.platform === 'win32' && existsSync(ruta)) {
    const texto = readFileSync(ruta, 'utf8');
    const valor = (nombre) => new RegExp(`\\$env:${nombre}\\s*=\\s*['\"]([^'\"]*)['\"]`, 'i').exec(texto)?.[1] ?? null;
    memoriaArchivo = valor('FACYLF_MEMORIA_GB');
    reservaArchivo = valor('FACYLF_RESERVA_GB');
    turnoArchivo = valor('FACYLF_TURNO_PLAZA_MIN');
    headlessArchivo = valor('FACYLF_CHROME_HEADLESS');
    topeArchivo = valor('FACYLF_TOPE_NAVEGADOR_MB');
    excluirArchivo = valor('FACYLF_EXCLUIR');
  }
  return {
    memoriaGb: Number(process.env.FACYLF_MEMORIA_GB ?? memoriaArchivo ?? 10),
    reservaGb: Number(process.env.FACYLF_RESERVA_GB ?? reservaArchivo ?? 1.5),
    turnoMin: Number(process.env.FACYLF_TURNO_PLAZA_MIN ?? turnoArchivo ?? 150),
    /*
     * `FACYLF_CHROME_HEADLESS` se lee para que el supervisor único pueda pasárselo a los 19 hijos: si se
     * quedara fuera, los recolectores abrirían ventanas visibles (o no) según lo que hubiera en el entorno
     * del supervisor, no según lo que declara la flota. Se deja tal cual (texto) porque es lo que espera el
     * recolector, y `null` si no está declarado (entonces manda su valor por defecto).
     */
    chromeHeadless: process.env.FACYLF_CHROME_HEADLESS ?? headlessArchivo ?? null,
    /*
     * Y el tope de reciclado del navegador, por el mismo motivo: si el supervisor único no lo pasara, los
     * hijos usarían los 900 MB de siempre aunque la flota del PC diga otra cosa.
     */
    topeNavegadorMb: process.env.FACYLF_TOPE_NAVEGADOR_MB ?? topeArchivo ?? null,
    /*
     * ── `excluidas`: LAS FEDERACIONES QUE YA RECOLECTA EL SERVIDOR ────────────────────────────────────────
     *
     * Durante el traspaso, una federación puede estar ya corriendo en el servidor: el PC **no debe tocarla**,
     * porque dos flotas sobre la misma cola son peticiones duplicadas a la misma federación. `FACYLF_EXCLUIR`
     * es una lista separada por comas («melilla,andalucia»). Sin declarar, no se excluye nada.
     */
    excluidas: String(process.env.FACYLF_EXCLUIR ?? excluirArchivo ?? '')
      .split(',').map((f) => f.trim()).filter(Boolean),
    origen: process.env.FACYLF_MEMORIA_GB ? 'entorno' : (memoriaArchivo ? 'entorno-flota.ps1' : 'predeterminado'),
  };
}
