import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { formatarBRL } from "../../shared/format";
import { Pagina, Carregando, Aviso } from "../components/ui";
import { FotoProduto } from "../components/FotoProduto";
import type { ProdutoPublico } from "../../shared/types";

export function Catalogo() {
  const [produtos, setProdutos] = useState<ProdutoPublico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .catalogo()
      .then((r) => setProdutos(r.produtos))
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <Pagina>
      <section className="hero-loja overflow-hidden rounded-[1.75rem] border border-white/20 px-6 pb-24 pt-10 shadow-[0_28px_80px_rgba(7,31,61,0.22)] sm:px-10 sm:pb-28 sm:pt-14 lg:px-14 lg:pb-32 lg:pt-16">
        <div className="max-w-lg">
          <div className="faixa-arco h-1.5 w-40 rounded-full shadow-sm" aria-hidden="true" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-white/70">Igreja Pentecostal Deus é Amor</p>
          <h1 className="mt-3 text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            Camiseta<br />IMPERFEITOS
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
            Escolha seus tamanhos e retire na igreja.
          </p>
          <a href="#camiseta" className="btn-destaque mt-6">
            Fazer pedido <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      {erro && (
        <div className="relative z-10 mx-auto -mt-10 max-w-5xl">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      {!produtos && !erro && <div className="relative z-10 mx-auto -mt-10 max-w-5xl rounded-2xl bg-white"><Carregando /></div>}

      {produtos?.length === 0 && (
        <div className="relative z-10 mx-auto -mt-10 max-w-5xl">
          <Aviso>Nenhum produto disponível no momento.</Aviso>
        </div>
      )}

      <div id="camiseta" className="relative z-10 mx-auto -mt-14 grid max-w-5xl scroll-mt-24 gap-5 sm:-mt-20">
        {produtos?.map((produto) => {
          const menor = Math.min(...produto.variacoes.map((v) => v.valor_centavos));
          const total = produto.variacoes.reduce((s, v) => s + v.disponivel, 0);

          return (
            <Link
              key={produto.id}
              to="/produto/$slug"
              params={{ slug: produto.slug }}
              className="cartao group grid overflow-hidden border-white/80 shadow-[0_24px_70px_rgba(7,31,61,0.18)] transition duration-300 hover:-translate-y-1 hover:border-marca-200 hover:shadow-[0_28px_80px_rgba(7,31,61,0.24)] sm:grid-cols-[1.15fr_1fr]"
            >
              <div className="h-72 overflow-hidden bg-gradient-to-br from-[#f7f1e5] to-white sm:h-[27rem]">
                <FotoProduto imagens={produto.imagens} nome={produto.nome} className="transition duration-500 group-hover:scale-[1.03]" />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-9">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-marca-500">Produto da loja</span>
                <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight text-marca-900 sm:text-3xl">{produto.nome}</h2>
                <div className="mt-5 border-y border-linha py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-suave">A partir de</p>
                  <p className="mt-1 text-3xl font-black text-marca-700">{formatarBRL(menor)}</p>
                </div>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-suave">Tamanhos disponíveis</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {produto.variacoes.map((variacao) => (
                    <span key={variacao.id} className={`grid min-h-11 min-w-12 place-items-center rounded-lg border px-3 text-sm font-bold ${variacao.disponivel > 0 ? "border-marca-200 bg-marca-50 text-marca-900" : "border-linha bg-fundo text-suave/50 line-through"}`}>
                      {variacao.nome}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs font-semibold text-suave">
                  {total > 0 ? `${total} peças disponíveis` : "Esgotado"}
                </p>
                <span className="btn-primario mt-5 w-full">
                  Escolher tamanhos <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </Pagina>
  );
}
