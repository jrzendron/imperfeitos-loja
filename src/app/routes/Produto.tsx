import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { api } from "../lib/api";
import { carrinho } from "../lib/carrinho";
import { formatarBRL } from "../../shared/format";
import { Pagina, Carregando, Aviso } from "../components/ui";
import { FotoProduto } from "../components/FotoProduto";
import type { ProdutoPublico } from "../../shared/types";

export function Produto() {
  const { slug } = useParams({ from: "/produto/$slug" });
  const navegar = useNavigate();
  const [produto, setProduto] = useState<ProdutoPublico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [zoomAberto, setZoomAberto] = useState(false);
  const [nivelZoom, setNivelZoom] = useState(1);

  useEffect(() => {
    api
      .produto(slug)
      .then((r) => setProduto(r.produto))
      .catch((e) => setErro(e.message));
  }, [slug]);

  useEffect(() => {
    if (!zoomAberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fecharComEsc = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setZoomAberto(false);
    };
    window.addEventListener("keydown", fecharComEsc);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEsc);
    };
  }, [zoomAberto]);

  if (erro) return <Pagina><Aviso tipo="erro">{erro}</Aviso></Pagina>;
  if (!produto) return <Pagina><Carregando /></Pagina>;

  const selecionadas = produto.variacoes.filter((v) => (quantidades[v.id] ?? 0) > 0);
  const totalPecas = selecionadas.reduce((s, v) => s + (quantidades[v.id] ?? 0), 0);
  const total = selecionadas.reduce(
    (s, v) => s + v.valor_centavos * (quantidades[v.id] ?? 0),
    0,
  );

  function alterarQuantidade(id: string, valor: number, disponivel: number) {
    const maximo = Math.min(disponivel, 10);
    setQuantidades((atuais) => ({
      ...atuais,
      [id]: Math.max(0, Math.min(maximo, valor)),
    }));
  }

  function adicionar() {
    if (!produto || selecionadas.length === 0) return;
    carrinho.adicionarVarios(
      selecionadas.map((v) => ({
        produto_variacao_id: v.id,
        produto_nome: produto.nome,
        variacao_nome: v.nome,
        valor_centavos: v.valor_centavos,
        quantidade: quantidades[v.id] ?? 0,
      })),
    );
    navegar({ to: "/carrinho" });
  }

  return (
    <Pagina>
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-start">
        <section aria-label="Galeria de fotos" className="lg:sticky lg:top-24">
          <div className="cartao overflow-hidden bg-white shadow-[0_18px_55px_rgba(8,87,75,0.10)]">
            <div className="aspect-[4/3] w-full bg-marca-50/50">
              {produto.imagens[fotoAtiva] ? (
                <button
                  type="button"
                  className="group relative h-full w-full cursor-zoom-in"
                  onClick={() => {
                    setNivelZoom(1);
                    setZoomAberto(true);
                  }}
                  aria-label={`Ampliar foto ${fotoAtiva + 1} de ${produto.imagens.length}`}
                >
                  <img
                    src={produto.imagens[fotoAtiva].url}
                    alt={produto.imagens[fotoAtiva].alt ?? `${produto.nome} — foto ${fotoAtiva + 1}`}
                    className="h-full w-full object-contain"
                  />
                  <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-tinta/80 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur transition group-hover:bg-marca-700">
                    <span aria-hidden="true" className="text-base leading-none">⌕</span>
                    Ampliar
                  </span>
                </button>
              ) : (
                <FotoProduto imagens={[]} nome={produto.nome} />
              )}
            </div>
          </div>

          {produto.imagens.length > 0 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2" aria-label="Escolha uma foto">
              {produto.imagens.map((img, n) => (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => {
                    setFotoAtiva(n);
                    setNivelZoom(1);
                  }}
                  aria-label={`Ver foto ${n + 1} de ${produto.imagens.length}`}
                  aria-pressed={fotoAtiva === n}
                  className={`h-20 w-20 flex-none overflow-hidden rounded-xl border-2 bg-white p-1 transition ${
                    fotoAtiva === n ? "border-marca-600 shadow-md" : "border-linha hover:border-marca-200"
                  }`}
                >
                  <img
                    src={img.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full rounded-lg object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          <p className="mt-1 text-center text-xs text-suave">
            {produto.imagens.length > 1
              ? `Foto ${fotoAtiva + 1} de ${produto.imagens.length} · toque nas miniaturas para navegar`
              : "Foto do produto"}
          </p>
        </section>

        <section>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-marca-600">Coleção especial</p>
          <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight">{produto.nome}</h1>
          {produto.descricao && <p className="mt-3 whitespace-pre-line text-suave">{produto.descricao}</p>}

      <div className="mt-7 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-suave">Tamanhos e quantidades</h2>
          <p className="mt-1 text-sm text-suave">Use os botões para escolher uma ou mais peças.</p>
        </div>
        {totalPecas > 0 && (
          <span className="rounded-full bg-marca-100 px-3 py-1 text-sm font-bold text-marca-700">
            {totalPecas} {totalPecas === 1 ? "peça" : "peças"}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {produto.variacoes.map((v) => {
          const esgotado = v.disponivel <= 0;
          const quantidade = quantidades[v.id] ?? 0;
          const selecionado = quantidade > 0;
          const maximo = Math.min(v.disponivel, 10);
          return (
            <div
              key={v.id}
              className={`flex items-center gap-4 rounded-xl border p-4 transition
                ${selecionado ? "border-marca-500 bg-marca-50 shadow-sm" : "border-linha bg-white"}
                ${esgotado ? "opacity-50" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <span className={`block text-xl font-black ${esgotado ? "line-through" : ""}`}>{v.nome}</span>
                <span className="mt-0.5 block text-sm text-suave">
                  {esgotado ? "Esgotado" : `${formatarBRL(v.valor_centavos)} · ${v.disponivel} disponíveis`}
                </span>
              </div>

              {!esgotado && (
                <div className="flex items-center gap-1.5" aria-label={`Quantidade do tamanho ${v.nome}`}>
                  <button
                    type="button"
                    className="btn-secundario h-11 w-11 !px-0 text-xl"
                    disabled={quantidade === 0}
                    onClick={() => alterarQuantidade(v.id, quantidade - 1, v.disponivel)}
                    aria-label={`Diminuir tamanho ${v.nome}`}
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-lg font-bold tabular-nums">{quantidade}</span>
                  <button
                    type="button"
                    className="btn-secundario h-11 w-11 !px-0 text-xl"
                    disabled={quantidade >= maximo}
                    onClick={() => alterarQuantidade(v.id, quantidade + 1, v.disponivel)}
                    aria-label={`Aumentar tamanho ${v.nome}`}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-linha bg-white p-4 sm:p-5">
        <div className="min-w-36 flex-1">
          <p className="text-sm text-suave">Total selecionado</p>
          <p className="text-2xl font-black text-marca-700">{formatarBRL(total)}</p>
        </div>
        <button className="btn-primario" disabled={totalPecas === 0} onClick={adicionar}>
          Adicionar {totalPecas > 0 ? `${totalPecas} ${totalPecas === 1 ? "peça" : "peças"}` : "ao carrinho"}
        </button>
      </div>
        </section>
      </div>

      {zoomAberto && produto.imagens[fotoAtiva] && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-tinta/95 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setZoomAberto(false)}
          role="presentation"
        >
          <div
            className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={`Foto ampliada de ${produto.nome}`}
            onClick={(evento) => evento.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <p className="min-w-0 truncate text-sm font-semibold">
                Foto {fotoAtiva + 1} de {produto.imagens.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl font-bold transition hover:bg-white/25 disabled:opacity-40"
                  onClick={() => setNivelZoom((atual) => Math.max(1, atual - 0.5))}
                  disabled={nivelZoom <= 1}
                  aria-label="Diminuir zoom"
                >
                  −
                </button>
                <button
                  type="button"
                  className="h-11 min-w-16 rounded-full bg-white/15 px-3 text-sm font-bold transition hover:bg-white/25"
                  onClick={() => setNivelZoom(1)}
                  aria-label="Restaurar zoom"
                >
                  {Math.round(nivelZoom * 100)}%
                </button>
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl font-bold transition hover:bg-white/25 disabled:opacity-40"
                  onClick={() => setNivelZoom((atual) => Math.min(3, atual + 0.5))}
                  disabled={nivelZoom >= 3}
                  aria-label="Aumentar zoom"
                >
                  +
                </button>
                <button
                  type="button"
                  className="ml-1 grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-bold text-tinta transition hover:bg-marca-50"
                  onClick={() => setZoomAberto(false)}
                  aria-label="Fechar foto ampliada"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-white/5">
              <div
                className="flex min-h-full min-w-full items-center justify-center p-3 transition-[width,height] duration-200 sm:p-6"
                style={{ width: `${nivelZoom * 100}%`, height: `${nivelZoom * 100}%` }}
              >
                <img
                  src={produto.imagens[fotoAtiva].url}
                  alt={produto.imagens[fotoAtiva].alt ?? `${produto.nome} — foto ${fotoAtiva + 1}`}
                  className="max-h-full max-w-full select-none object-contain"
                  draggable={false}
                />
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-white/70">
              Use os controles para ampliar até 300%. Pressione Esc para fechar.
            </p>
          </div>
        </div>
      )}
    </Pagina>
  );
}
