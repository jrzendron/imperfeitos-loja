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
      <section className="hero-loja overflow-hidden rounded-[1.75rem] border border-white/70 px-6 py-10 shadow-[0_24px_70px_rgba(8,87,75,0.13)] sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        <div className="max-w-lg">
          <span className="inline-flex rounded-full border border-marca-200/70 bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-marca-700 backdrop-blur">
            Igreja Pentecostal Deus é Amor
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-[-0.035em] text-marca-900 sm:text-5xl">
            Camiseta IMPERFEITOS
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-suave sm:text-lg">
            Escolha os tamanhos, faça o pagamento e retire seu pedido no local indicado pela igreja.
          </p>
          <a href="#camiseta" className="btn-primario mt-6 shadow-lg shadow-marca-900/15">
            Fazer pedido
          </a>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-marca-900/70">
            <span>Pagamento online</span><span>Retirada presencial</span>
          </div>
        </div>
      </section>

      <div id="camiseta" className="mb-5 mt-8 scroll-mt-24">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-marca-600">Loja da igreja</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Produto disponível</h2>
      </div>

      {erro && (
        <div className="mt-5">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      {!produtos && !erro && <Carregando />}

      {produtos?.length === 0 && (
        <div className="mt-5">
          <Aviso>Nenhum produto disponível no momento.</Aviso>
        </div>
      )}

      <div className="grid gap-5">
        {produtos?.map((produto) => {
          const menor = Math.min(...produto.variacoes.map((v) => v.valor_centavos));
          const total = produto.variacoes.reduce((s, v) => s + v.disponivel, 0);

          return (
            <Link
              key={produto.id}
              to="/produto/$slug"
              params={{ slug: produto.slug }}
              className="cartao group grid overflow-hidden shadow-[0_12px_40px_rgba(16,32,30,0.07)] transition duration-300 hover:-translate-y-1 hover:border-marca-200 hover:shadow-[0_20px_55px_rgba(8,87,75,0.14)] sm:grid-cols-[1.25fr_1fr]"
            >
              <div className="h-64 overflow-hidden bg-marca-50 sm:h-80">
                <FotoProduto imagens={produto.imagens} nome={produto.nome} className="transition duration-500 group-hover:scale-[1.03]" />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-marca-600">Camiseta</span>
                <h3 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{produto.nome}</h3>
                <p className="mt-3 text-sm text-suave">A partir de</p>
                <p className="mt-0.5 text-3xl font-black text-marca-700">{formatarBRL(menor)}</p>
                <p className="mt-4 text-xs font-semibold text-suave">
                  {total > 0 ? `${total} peças disponíveis` : "Esgotado"}
                </p>
                <span className="mt-5 inline-flex items-center font-bold text-marca-700">
                  Escolher tamanho <span aria-hidden="true" className="ml-2 transition group-hover:translate-x-1">→</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </Pagina>
  );
}
