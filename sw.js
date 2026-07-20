/* Service worker do PWA do Gerenciador de Financiamento (VIZIO) — v2.
   Estratégia: network passthrough (NÃO cacheia). É de propósito: este app depende
   de dados na nuvem e muda toda hora, então servir arquivo de cache seria pior que
   não ter SW. §14.2: "SW de app que muda toda hora é network-first, nunca cache-first".

   Assume a versão nova na hora (skipWaiting no install + clients.claim no activate) —
   a alternativa recomendada na §14.2, que resolve na origem sem depender do canal
   de mensagem. Ainda assim ouvimos PULAR_ESPERA, porque o push (§14) manda essa
   mensagem quando encontra um SW em waiting. */

var CACHE = 'vizio-fin-v2';   /* bumpar a cada deploy que mexer neste arquivo */

self.addEventListener('install', function (e) { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; })
                          .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'PULAR_ESPERA') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   /* Supabase/CDN: não tocamos */

  /* A checagem de versão do push usa ?_v=<timestamp> único. Nunca deve entrar em
     cache: criaria uma entrada nova a cada 10 minutos, para sempre. */
  if (url.searchParams.has('_v')) return;

  /* Sem respondWith: a rede resolve e o cliente fica sempre atualizado. */
});
