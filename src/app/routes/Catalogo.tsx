import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { formatarBRL } from "../../shared/format";
import { Pagina, Carregando, Aviso } from "../components/ui";
import { FotoProduto } from "../components/FotoProduto";
import { TabelaMedidas } from "../components/TabelaMedidas";
import type { ProdutoPublico } from "../../shared/types";

const INSTAGRAM = "https://www.instagram.com/expansaoblumenau/";
const PUBLICACAO = "https://www.instagram.com/p/DcPe3d2NAvv/";
const MAPA = "https://www.google.com/maps/search/?api=1&query=R.%20Eugen%20Fouquet%2C%2066%20-%20Victor%20Konder%2C%20Blumenau%20-%20SC%2C%2089012-140";

export function Catalogo() {
  const [produtos, setProdutos] = useState<ProdutoPublico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.catalogo().then((r) => setProdutos(r.produtos)).catch((e) => setErro(e.message));
  }, []);

  const fotoDestaque = produtos?.[0]?.imagens[0];

  return (
    <Pagina>
      <div className="pagina-flow">
        <section className="flow-hero" aria-labelledby="flow-titulo">
          <div className="flow-hero-arte" aria-hidden="true">
            {fotoDestaque ? <img src={fotoDestaque.url} alt="" /> : <img src="/assets/marca-expansao.png" alt="" />}
          </div>
          <div className="flow-container flow-hero-conteudo">
            <p className="flow-sobretitulo">Ministério de Jovens <span>·</span> Expansão</p>
            <h1 id="flow-titulo">3º Flow<br /><span>Blumenau.</span></h1>
            <p className="flow-hero-sub">Flow de Jovens de Blumenau</p>
            <div className="flow-hero-dados">
              <span>05 dezembro 2026</span><span aria-hidden="true">/</span><span>A partir das 17h</span>
            </div>
            <div className="flow-acoes">
              <a href="#camiseta" className="flow-botao">Ver a camiseta <span aria-hidden="true">↗</span></a>
              <a href={PUBLICACAO} target="_blank" rel="noopener noreferrer" className="flow-link-claro">Publicação do evento ↗</a>
            </div>
          </div>
          <span className="flow-hero-indice" aria-hidden="true">01 / EXPANSÃO</span>
        </section>

        <section className="flow-evento" aria-labelledby="evento-titulo">
          <div className="flow-container flow-evento-grid">
            <div>
              <p className="flow-kicker">O encontro</p>
              <h2 id="evento-titulo" className="flow-titulo-secao">3º Flow<br />Blumenau</h2>
              <p className="flow-evento-sub">Ministério de Jovens · Expansão</p>
              <a className="flow-link-escuro" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">@expansaoblumenau ↗</a>
            </div>
            <div className="flow-evento-detalhes">
              <div><span>Quando</span><strong>05 de dezembro de 2026<br />A partir das 17h</strong></div>
              <div><span>Onde</span><strong>R. Eugen Fouquet, 66<br />Victor Konder, Blumenau – SC<br />89012-140</strong></div>
              <a href={MAPA} target="_blank" rel="noopener noreferrer" className="flow-link-escuro">Abrir localização ↗</a>
            </div>
          </div>
        </section>

        <section className="flow-versiculo" aria-labelledby="versiculo-titulo">
          <div className="flow-container flow-versiculo-grid">
            <p className="flow-versiculo-numero" aria-hidden="true">1:7</p>
            <div>
              <p className="flow-kicker">A mensagem do encontro</p>
              <h2 id="versiculo-titulo" className="flow-titulo-secao">Andar na luz.</h2>
              <blockquote>“Mas, se andarmos na luz, como ele está na luz, temos comunhão uns com os outros...”</blockquote>
              <p className="flow-versiculo-referencia">1 João 1:7</p>
            </div>
          </div>
        </section>

        <section id="camiseta" className="flow-produtos" aria-labelledby="camiseta-titulo">
          <div className="flow-container">
            <div className="flow-produtos-cabecalho">
              <div>
                <p className="flow-kicker">A camiseta do Flow</p>
                <h2 id="camiseta-titulo" className="flow-titulo-secao">Imperfeitos.</h2>
              </div>
              <p>Escolha seus tamanhos e faça o pedido para retirada.</p>
            </div>

            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            {!produtos && !erro && <Carregando texto="Carregando a camiseta…" />}
            {produtos?.length === 0 && <Aviso>Nenhum produto disponível no momento.</Aviso>}

            <div className="flow-lista-produtos">
              {produtos?.map((produto) => {
                const menor = produto.variacoes.length ? Math.min(...produto.variacoes.map((v) => v.valor_centavos)) : null;
                const total = produto.variacoes.reduce((s, v) => s + v.disponivel, 0);

                return (
                  <Link key={produto.id} to="/produto/$slug" params={{ slug: produto.slug }} className="flow-produto">
                    <div className="flow-produto-foto"><FotoProduto imagens={produto.imagens} nome={produto.nome} /></div>
                    <div className="flow-produto-info">
                      <p className="flow-kicker">Camiseta oficial do evento</p>
                      <h3>{produto.nome}</h3>
                      <p className="flow-produto-preco">{menor !== null ? `A partir de ${formatarBRL(menor)}` : "Preço em breve"}</p>
                      <div className="flow-tamanhos" aria-label="Tamanhos cadastrados">
                        {produto.variacoes.map((v) => <span key={v.id} className={v.disponivel === 0 ? "esgotado" : ""}>{v.nome}</span>)}
                      </div>
                      <p className="flow-produto-estoque">{total > 0 ? `${total} peças disponíveis` : "Esgotado"}</p>
                      <span className="flow-botao">Escolher tamanhos <span aria-hidden="true">↗</span></span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="flow-medidas-home"><TabelaMedidas /></div>
          </div>
        </section>

        <footer className="flow-rodape">
          <div className="flow-container flow-rodape-grid">
            <div>
              <img src="/assets/logo-expansao.png" alt="Expansão" />
              <p>3º Flow Blumenau · 05 de dezembro de 2026</p>
            </div>
            <div className="flow-rodape-links">
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
              <a href={PUBLICACAO} target="_blank" rel="noopener noreferrer">Publicação do evento ↗</a>
              <a href={MAPA} target="_blank" rel="noopener noreferrer">Como chegar ↗</a>
            </div>
          </div>
          <div className="flow-container flow-rodape-igreja">
            <span>Ministério de Jovens Expansão · Igreja Pentecostal Deus é Amor</span>
            <img src="/assets/logo-ipda-oficial.webp" alt="Igreja Pentecostal Deus é Amor" />
          </div>
        </footer>
      </div>
    </Pagina>
  );
}
