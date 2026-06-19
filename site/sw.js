/*---------------------------------------------------------------------------*\
  Offline support was ROLLED BACK (it caused a Chrome rendering glitch we could
  not verify headless).  This worker SELF-DESTRUCTS: it has no fetch handler (so
  it intercepts nothing), and on activation it clears all caches, unregisters
  itself, and reloads open pages.  Any browser that had cached the previous
  service worker thus returns cleanly to the plain, no-SW site.
\*---------------------------------------------------------------------------*/

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.navigate(c.url));   // reload, now without a SW
    } catch (_) { /* best effort */ }
  })());
});
