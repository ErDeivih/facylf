/*
 * BLOQUEO DE PUBLICIDAD Y RASTREADORES EN EL NAVEGADOR DE LOS RECOLECTORES.
 *
 * ── POR QUÉ (medido el 20/09/2026) ───────────────────────────────────────────────────────────────────────────
 *
 * Los portales de las federaciones cargan publicidad y medidores de terceros. No hacen falta para nada: lo que se
 * lee y se guarda es el HTML del acta o de la jornada, y esos scripts sólo gastan procesador, memoria y ancho de
 * banda. Medido con la flota entera en el PC: los navegadores se llevaban **859 % de 1.114 % de CPU** sobre 12
 * núcleos, y el servidor previsto tiene un procesador peor. Es la palanca más directa que hay para que esto quepa
 * en una máquina modesta sin bajar el trabajo útil.
 *
 * Se bloquean por lista de dominios con el protocolo de depuración de Chrome (`Network.setBlockedURLs`), así que
 * la petición ni sale. La lista son dominios de publicidad y analítica conocidos; **las páginas de las
 * federaciones y sus recursos propios no se tocan**.
 *
 * Si el navegador no admite la orden, se sigue sin bloquear: leer la página va primero. Es una mejora de consumo,
 * no un requisito.
 */

/** Dominios de publicidad, analítica y vídeo incrustado que no aportan nada a lo que se guarda. */
export const DOMINIOS_DE_TERCEROS = [
  '*doubleclick.net*', '*googlesyndication.com*', '*google-analytics.com*', '*googletagmanager.com*',
  '*googletagservices.com*', '*adservice.google.com*', '*googleadservices.com*', '*adsystem.com*',
  '*amazon-adsystem.com*', '*facebook.net*', '*connect.facebook.net*', '*hotjar.com*', '*criteo.com*',
  '*taboola.com*', '*outbrain.com*', '*scorecardresearch.com*', '*adform.net*', '*pubmatic.com*',
  '*rubiconproject.com*', '*casalemedia.com*', '*smartadserver.com*', '*sharethrough.com*', '*teads.tv*',
  '*yieldmo.com*', '*adnxs.com*', '*openx.net*', '*sitescout.com*', '*3lift.com*', '*bidswitch.net*',
  '*googlevideo.com*', '*youtube.com/embed*', '*imasdk.googleapis.com*', '*moatads.com*', '*adsafeprotected.com*',
];

/**
 * Activa el bloqueo en una sesión de Chrome ya abierta. Devuelve `true` si el navegador lo aceptó y `false` si no
 * (nunca lanza: no poder bloquear no puede impedir recolectar).
 */
export async function bloqueaTerceros(driver) {
  try {
    await driver.sendAndGetDevToolsCommand('Network.enable');
    await driver.sendAndGetDevToolsCommand('Network.setBlockedURLs', { urls: DOMINIOS_DE_TERCEROS });
    return true;
  } catch {
    return false;
  }
}
