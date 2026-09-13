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

  useEffect(() => {
    api
      .produto(slug)
      .then((r) => setProduto(r.produto))
      .catch((e) => setErro(e.message));
  }, [slug]);

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
      {produto.imagens.length > 0 && (
        <div className="cartao mb-5 overflow-hidden">
          <div className="aspect-square max-h-[420px] w-full">
            <FotoProduto imagens={produto.imagens} nome={produto.nome} />
          </div>
          {produto.imagens.length > 1 && (
            <div className="flex gap-2 overflow-x-auto p-3">
              {produto.imagens.map((img, n) => (
                <img
                  key={img.url}
                  src={img.url}
                  alt={img.alt ?? `${produto.nome} — foto ${n + 1}`}
                  loading="lazy"
                  className="h-16 w-16 flex-none rounded-lg border border-linha object-cover"
                />
              ))}
            </div>
          )}
        </div>
      )}

      <h1 className="text-2xl font-bold">{produto.nome}</h1>
      {produto.descricao && <p className="mt-2 whitespace-pre-line text-suave">{produto.descricao}</p>}

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
    </Pagina>
  );
}
