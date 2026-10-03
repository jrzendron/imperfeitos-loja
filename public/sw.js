const VERSAO = "v6";
const CACHE_CASCA = `igreja-loja-casca-${VERSAO}`;
const CACHE_PUBLICO = `igreja-loja-publico-${VERSAO}`;
const ARQUIVOS_INICIAIS = [
  "/",
  "/offline.html",
  "/offline.css",
  "/manifest.webmanifest",
  "/assets/marca-expansao.png",
  "/assets/logo-expansao.png",
  "/assets/camiseta-flow.webp",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_CASCA).then((cache) =>
      Promise.all(
        ARQUIVOS_INICIAIS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith("igreja-loja-") && ![CACHE_CASCA, CACHE_PUBLICO].includes(nome))
            .map((nome) => caches.delete(nome)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function buscarEGuardar(requisicao, cacheNome) {
  const resposta = await fetch(requisicao);
  if (resposta.ok) {
    const cache = await caches.open(cacheNome);
    await cache.put(requisicao, resposta.clone());
  }
  return resposta;
}

async function cachePrimeiro(requisicao) {
  return (await caches.match(requisicao)) ?? buscarEGuardar(requisicao, CACHE_PUBLICO);
}

async function navegacaoPublica(requisicao) {
  try {
    return await buscarEGuardar(requisicao, CACHE_CASCA);
  } catch {
    return (await caches.match(requisicao)) ?? (await caches.match("/"));
  }
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  const url = new URL(requisicao.url);

  if (requisicao.method !== "GET" || url.origin !== self.location.origin) return;

  // Fotos de produtos são públicas e imutáveis. Nenhuma outra resposta da API
  // entra no cache: pedidos, pagamentos, sessão, QR e admin sempre vão à rede.
  if (url.pathname.startsWith("/api/midia/")) {
    evento.respondWith(cachePrimeiro(requisicao));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (requisicao.mode === "navigate") {
    const publica =
      url.pathname === "/" ||
      url.pathname === "/carrinho" ||
      url.pathname.startsWith("/produto/");
    evento.respondWith(
      publica
        ? navegacaoPublica(requisicao)
        : fetch(requisicao).catch(async () =>
            (await caches.match("/offline.html")) ?? Response.error(),
          ),
    );
    return;
  }

  if (["script", "style", "font", "image"].includes(requisicao.destination)) {
    evento.respondWith(cachePrimeiro(requisicao));
  }
});
