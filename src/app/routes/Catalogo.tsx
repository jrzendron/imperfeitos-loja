import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { formatarBRL } from "../../shared/format";
import { Pagina, Carregando, Aviso } from "../components/ui";
import { FotoProduto } from "../components/FotoProduto";
import type { ProdutoPublico } from "../../shared/types";

const INSTAGRAM = "https://www.instagram.com/expansaoblumenau/";
const PUBLICACAO = "https://www.instagram.com/p/DcPe3d2NAvv/";
const ENDERECO = "R. Eugen Fouquet, 66 · Victor Konder · Blumenau, SC";
const MAPA = "https://www.google.com/maps/search/?api=1&query=R.%20Eugen%20Fouquet%2C%2066%20-%20Victor%20Konder%2C%20Blumenau%20-%20SC%2C%2089012-140";
const MAPA_EMBED = "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1sR.+Eugen+Fouquet,+66,+Victor+Konder,+Blumenau,+SC!6i16";

export function Catalogo() {
  const [produtos, setProdutos] = useState<ProdutoPublico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.catalogo().then((r) => setProdutos(r.produtos)).catch((e) => setErro(e.message));
  }, []);

  return (
    <Pagina>
      <div className="pagina-flow">
        <section className="flow-hero" aria-labelledby="flow-titulo">
          <div className="flow-hero-orbe flow-hero-orbe-um" aria-hidden="true" />
          <div className="flow-hero-orbe flow-hero-orbe-dois" aria-hidden="true" />
          <div className="flow-container flow-hero-grid">
            <div className="flow-hero-conteudo">
              <p className="flow-sobretitulo"><span className="flow-ponto" /> Ministério de Jovens · Expansão</p>
              <h1 id="flow-titulo"><span>3º FLOW</span><strong>BLUMENAU<span className="flow-titulo-ponto">.</span></strong></h1>
              <p className="flow-hero-sub">Flow de Jovens de Blumenau</p>
              <div className="flow-hero-dados">
                <span>05.12.2026</span><span className="flow-dados-barra" aria-hidden="true" /><span>A partir das 17h</span>
              </div>
              <div className="flow-acoes">
                <a href="#camiseta" className="flow-botao">Ver a camiseta <span aria-hidden="true">↗</span></a>
                <a href="#local" className="flow-link-claro">Onde vai ser <span aria-hidden="true">↘</span></a>
              </div>
              <p className="flow-hero-rodape">1 João 1:7 <span aria-hidden="true">*</span> Blumenau / SC</p>
            </div>
            <div className="flow-hero-visual" aria-hidden="true">
              <div className="flow-hero-foto">
                <img src="/assets/camiseta-flow.webp" alt="" fetchPriority="high" />
              </div>
              <div className="flow-hero-stamp"><span>05</span><small>DEZ<br />17H</small></div>
              <div className="flow-hero-asterisco" aria-hidden="true">*</div>
            </div>
          </div>
          <a className="flow-hero-descer" href="#evento">Descubra o evento <span aria-hidden="true">↓</span></a>
        </section>

        <div className="flow-faixa" aria-label="Flow de Jovens de Blumenau · 05 de dezembro · Expansão">
          <div className="flow-faixa-trilho" aria-hidden="true">
            {Array.from({ length: 4 }, (_, n) => <span key={n}>FLOW DE JOVENS <b>*</b> 05 DE DEZEMBRO <b>*</b> EXPANSÃO <b>*</b></span>)}
          </div>
        </div>

        <section id="evento" className="flow-evento" aria-labelledby="evento-titulo">
          <div className="flow-container">
            <div className="flow-secao-abertura">
              <p className="flow-kicker"><span>01</span> O encontro</p>
              <h2 id="evento-titulo" className="flow-titulo-secao">Blumenau,<br /><em>nos vemos lá.</em></h2>
              <p>3º Flow Blumenau · Ministério de Jovens Expansão</p>
            </div>
            <div className="flow-evento-cartoes">
              <div className="flow-info-card flow-info-data">
                <span className="flow-info-icone" aria-hidden="true">*</span>
                <p>Quando</p>
                <strong>05<small>DEZ</small></strong>
                <span className="flow-info-legenda">Sábado, a partir das 17h</span>
              </div>
              <div className="flow-info-card flow-info-local">
                <span className="flow-info-icone" aria-hidden="true">↗</span>
                <p>Onde</p>
                <strong>Victor<br />Konder.</strong>
                <span className="flow-info-legenda">{ENDERECO}</span>
                <a href="#local">Ver no mapa <span aria-hidden="true">↗</span></a>
              </div>
              <div className="flow-info-card flow-info-social">
                <span className="flow-info-icone" aria-hidden="true">@</span>
                <p>Acompanhe</p>
                <strong>Expansão<br />Blumenau.</strong>
                <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">@expansaoblumenau <span aria-hidden="true">↗</span></a>
              </div>
            </div>
          </div>
        </section>

        <section className="flow-versiculo" aria-labelledby="versiculo-titulo">
          <div className="flow-container flow-versiculo-grid">
            <div className="flow-versiculo-arte" aria-hidden="true"><span>1</span><span>:</span><span>7</span><i>*</i></div>
            <div className="flow-versiculo-texto">
              <p className="flow-kicker"><span>02</span> A mensagem do encontro</p>
              <h2 id="versiculo-titulo" className="flow-titulo-secao">Andar<br /><em>na luz.</em></h2>
              <blockquote>“Mas, se andarmos na luz, como ele está na luz, temos comunhão uns com os outros...”</blockquote>
              <p className="flow-versiculo-referencia">1 João 1:7</p>
            </div>
          </div>
        </section>

        <section id="camiseta" className="flow-produtos" aria-labelledby="camiseta-titulo">
          <div className="flow-container">
            <div className="flow-produtos-cabecalho">
              <div>
                <p className="flow-kicker"><span>03</span> A camiseta do Flow</p>
                <h2 id="camiseta-titulo" className="flow-titulo-secao">Imperfeitos<span className="flow-titulo-ponto">.</span></h2>
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
                    <div className="flow-produto-foto"><FotoProduto imagens={produto.imagens} nome={produto.nome} /><span className="flow-foto-selo">1 JOÃO 1:7</span></div>
                    <div className="flow-produto-info">
                      <p className="flow-kicker">Camiseta do Flow</p>
                      <h3>{produto.nome}</h3>
                      <p className="flow-produto-preco">{menor !== null ? `A partir de ${formatarBRL(menor)}` : "Preço em breve"}</p>
                      <p className="flow-produto-texto">Escolha mais de um tamanho no mesmo pedido.</p>
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
          </div>
        </section>

        <section id="local" className="flow-localizacao" aria-labelledby="local-titulo">
          <div className="flow-container">
            <div className="flow-local-cabecalho">
              <div>
                <p className="flow-kicker"><span>04</span> Chegue junto</p>
                <h2 id="local-titulo" className="flow-titulo-secao">Onde<br /><em>acontece.</em></h2>
              </div>
              <p>R. Eugen Fouquet, 66<br />Victor Konder, Blumenau – SC<br />89012-140</p>
            </div>
            <div className="flow-mapa-card">
              <iframe title="Mapa do local do 3º Flow Blumenau" src={MAPA_EMBED} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              <div className="flow-mapa-info">
                <span className="flow-mapa-pin" aria-hidden="true">⌖</span>
                <div><strong>3º Flow Blumenau</strong><span>{ENDERECO}</span></div>
                <a href={MAPA} target="_blank" rel="noopener noreferrer">Abrir no Google Maps <span aria-hidden="true">↗</span></a>
              </div>
            </div>
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
