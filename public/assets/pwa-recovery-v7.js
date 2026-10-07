// Recupera uma casca antiga da PWA somente se a aplicação não montar.
window.addEventListener("load", () => {
  window.setTimeout(async () => {
    if (document.getElementById("root")?.childElementCount) return;

    const chave = "igreja-loja-recuperacao-v7";
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, "1");

    if ("serviceWorker" in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((registro) => registro.unregister()));
    }

    if ("caches" in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((nome) => nome.startsWith("igreja-loja-")).map((nome) => caches.delete(nome)));
    }

    window.location.reload();
  }, 3000);
});
