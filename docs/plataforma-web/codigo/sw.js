/* Service Worker de facylf (va a apps/web/public/sw.js). Sólo hace dos cosas: enseñar los avisos push y abrir
 * la página al pulsarlos. Nada de caché offline (los datos cambian cada fin de semana y una ficha vieja engaña).
 * El servidor (scripts/notificaciones.mjs) manda {titulo, cuerpo, url}.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let datos = {};
  try { datos = evento.data ? evento.data.json() : {}; } catch { datos = { titulo: evento.data?.text() }; }
  const titulo = datos.titulo || 'facylf';
  evento.waitUntil(self.registration.showNotification(titulo, {
    body: datos.cuerpo || '',
    icon: '/icono-192.png',
    badge: '/insignia-72.png',
    data: { url: datos.url || '/mi' },
    tag: datos.url || undefined,          // dos avisos del mismo partido se sustituyen en vez de amontonarse
    renotify: false,
    lang: 'es',
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/mi', self.location.origin);
  if (destino.origin !== self.location.origin) return;     // nunca abrir enlaces de fuera
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if ('focus' in v) { await v.focus(); if ('navigate' in v) await v.navigate(destino.href); return; }
    }
    await self.clients.openWindow(destino.href);
  })());
});

// Si el navegador renueva la suscripción, se avisa a la web para que la guarde (la vieja dará 410 y se borrará sola).
self.addEventListener('pushsubscriptionchange', (evento) => {
  evento.waitUntil(fetch('/api/push/renovar', { method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(evento.newSubscription || null) }).catch(() => {}));
});
