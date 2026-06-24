/* Service worker mínimo para o PWA do Gerenciador de Financiamento (VIZIO).
   Estratégia: network passthrough (sem cache) — habilita "Instalar app"
   sem risco de servir versão desatualizada de um app que depende de dados na nuvem. */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { /* deixa a rede resolver (sempre atualizado) */ });
