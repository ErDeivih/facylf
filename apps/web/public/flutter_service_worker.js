// Limpia el antiguo service worker de la versión Flutter que compartía este
// origen local. Next.js no necesita uno y, sin este archivo, el navegador
// solicitaba una ruta inexistente en cada navegación.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister());
});
