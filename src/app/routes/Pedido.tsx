import { useCallback, useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { api, ErroApi } from "../lib/api";
import { formatarBRL, formatarDataHora } from "../../shared/format";
import { Pagina, Carregando, Aviso, Etiqueta } from "../components/ui";
import { QrCode } from "../components/QrCode";
import { PagamentoCartao } from "../components/PagamentoCartao";
import type { PedidoPublico } from "../../shared/types";

export function Pedido() {
  const { token } = useParams({ from: "/pedido/$token" });
  const [pedido, setPedido] = useState<PedidoPublico | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroPix, setErroPix] = useState<string | null>(null);
  const [criandoPix, setCriandoPix] = useState(false);
  const [metodo, setMetodo] = useState<"pix" | "cartao" | "dinheiro" | null>(null);
  const [ativandoDinheiro, setAtivandoDinheiro] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { pedido } = await api.pedido(token);
      setPedido(pedido);
      if (pedido.codigo_retirada) {
        setQr(`${window.location.origin}/retirada/${pedido.codigo_retirada}`);
      } else if (["PAGO", "PRONTO_PARA_RETIRADA", "RETIRADO"].includes(pedido.status)) {
        try {
          const r = await api.qrRetirada(token);
          setQr(`${window.location.origin}/retirada/${r.token}`);
        } catch {
          setQr(null);
        }
      } else {
        setQr(null);
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar o pedido.");
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const gerarPix = useCallback(async () => {
    setCriandoPix(true);
    setErroPix(null);
    try {
      const { pagamento } = await api.criarPix(token);
      setPedido((atual) => (atual ? { ...atual, pagamento } : atual));
    } catch (e) {
      setErroPix(e instanceof ErroApi ? e.message : "Não foi possível gerar o Pix.");
    } finally {
      setCriandoPix(false);
    }
  }, [token]);

  const escolherDinheiro = useCallback(async () => {
    setAtivandoDinheiro(true);
    setErroPix(null);
    try {
      await api.pagarEmDinheiro(token);
      await carregar();
    } catch (e) {
      setErroPix(e instanceof ErroApi ? e.message : "Não foi possível reservar para pagamento em dinheiro.");
    } finally {
      setAtivandoDinheiro(false);
    }
  }, [token, carregar]);

  async function cancelar() {
    if (!window.confirm("Cancelar este pedido e devolver as peças ao estoque?")) return;
    setCancelando(true);
    try {
      await api.cancelarPedido(token);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível cancelar o pedido.");
    } finally {
      setCancelando(false);
    }
  }

  /**
   * Enquanto o pedido aguarda pagamento, a tela reconsulta com intervalo
   * CRESCENTE — 3 s, 8 s, 20 s — e para em qualquer status final.
   *
   * Não é capricho. Trinta minutos consultando a cada 3 s são 600
   * requisições por comprador; 170 compradores esgotariam a cota diária do
   * plano gratuito e derrubariam a loja (ARQUITETURA §1.2). Quando o
   * Mercado Pago entrar, é exatamente esta função que acompanha o Pix.
   */
  useEffect(() => {
    if (!pedido || pedido.status !== "AGUARDANDO_PAGAMENTO") return;

    let tentativa = 0;
    let timer: number;

    const agendar = () => {
      const espera = tentativa < 6 ? 3000 : tentativa < 15 ? 8000 : 20000;
      timer = window.setTimeout(async () => {
        tentativa++;
        if (document.visibilityState === "visible") await carregar();
        if (tentativa < 120) agendar();
      }, espera);
    };

    agendar();
    return () => window.clearTimeout(timer);
  }, [pedido, carregar]);

  if (erro) return <Pagina><Aviso tipo="erro">{erro}</Aviso></Pagina>;
  if (!pedido) return <Pagina><Carregando /></Pagina>;

  const aguardando = pedido.status === "AGUARDANDO_PAGAMENTO";
  const podeEscolher =
    aguardando &&
    (!pedido.pagamento || ["REJECTED", "CANCELLED"].includes(pedido.pagamento.status));

  return (
    <Pagina>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tabular-nums">{pedido.numero}</h1>
        <Etiqueta status={pedido.status} />
      </div>
      <p className="mt-1 text-suave">{pedido.cliente_nome}</p>

      {aguardando && (
        <div className="mt-5">
          <Aviso tipo="alerta" titulo="Aguardando pagamento">
            Escolha Pix ou cartão e pague até o horário indicado. A confirmação ocorre
            automaticamente. O código e o QR de retirada aparecem depois que o pagamento for aprovado.
            {pedido.expires_at && (
              <> As peças ficam reservadas até <strong>{formatarDataHora(pedido.expires_at)}</strong>.</>
            )}
          </Aviso>
        </div>
      )}

      {podeEscolher && (
        <section className="cartao mt-5 p-5">
          <h2 className="text-center font-bold">Como você quer pagar?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <button type="button" className={metodo === "pix" ? "btn-primario" : "btn-secundario"} onClick={() => setMetodo("pix")}>
              Pix
            </button>
            <button type="button" className={metodo === "cartao" ? "btn-primario" : "btn-secundario"} onClick={() => setMetodo("cartao")}>
              Cartão de crédito
            </button>
            <button type="button" className={metodo === "dinheiro" ? "btn-primario" : "btn-secundario"} onClick={() => setMetodo("dinheiro")}>
              Dinheiro
            </button>
          </div>
          {metodo === "pix" && (
            <div className="mt-4 rounded-lg border border-marca-100 bg-marca-50 p-4 text-center">
              <p className="text-sm text-suave">Vamos gerar um QR Code Pix para este pedido.</p>
              <button type="button" className="btn-primario mt-3 w-full" disabled={criandoPix} onClick={() => void gerarPix()}>
                {criandoPix ? "Gerando Pix…" : "Continuar com Pix"}
              </button>
            </div>
          )}
          {metodo === "dinheiro" && (
            <div className="mt-4 rounded-lg border border-marca-100 bg-marca-50 p-4 text-center">
              <p className="text-sm text-suave">As peças ficarão reservadas e o pagamento será confirmado pela equipe no dia da retirada.</p>
              <button type="button" className="btn-primario mt-3 w-full" disabled={ativandoDinheiro} onClick={() => void escolherDinheiro()}>
                {ativandoDinheiro ? "Reservando…" : "Reservar e pagar na retirada"}
              </button>
            </div>
          )}
        </section>
      )}

      {podeEscolher && metodo === "cartao" && (
        <PagamentoCartao
          tokenPedido={token}
          valorCentavos={pedido.valor_total_centavos}
          aoConcluir={carregar}
        />
      )}

      {aguardando && pedido.pagamento?.provider === "MANUAL" && pedido.pagamento.status === "PENDING" && (
        <div className="mt-5">
          <Aviso tipo="sucesso" titulo="Pagamento em dinheiro">
            Pedido reservado. Apresente o código abaixo e faça o pagamento no dia da retirada.
          </Aviso>
        </div>
      )}

      {aguardando && pedido.pagamento?.provider !== "MANUAL" && pedido.pagamento?.status === "PENDING" && !pedido.pagamento.pix_copia_cola && (
        <div className="mt-5">
          <Aviso tipo="alerta" titulo="Pagamento em processamento">
            Aguarde a confirmação do cartão. Esta página será atualizada automaticamente.
          </Aviso>
        </div>
      )}

      {aguardando && pedido.pagamento?.pix_copia_cola && (
        <section className="cartao mt-5 p-5 text-center">
          <h2 className="font-bold">Pague com Pix</h2>
          <p className="mt-1 text-sm text-suave">
            Escaneie o QR Code no aplicativo do seu banco ou copie o código abaixo.
          </p>
          <div className="mt-4 flex justify-center">
            <QrCode
              valor={pedido.pagamento.pix_copia_cola}
              rotulo="QR Code para pagamento Pix"
            />
          </div>
          <textarea
            className="campo mt-4 min-h-24 resize-none text-xs"
            readOnly
            aria-label="Código Pix Copia e Cola"
            value={pedido.pagamento.pix_copia_cola}
          />
          <button
            type="button"
            className="btn-primario mt-3 w-full"
            onClick={() => void navigator.clipboard.writeText(pedido.pagamento!.pix_copia_cola!)}
          >
            Copiar código Pix
          </button>
        </section>
      )}

      {aguardando && erroPix && (metodo === "pix" || metodo === "dinheiro") && (
        <div className="mt-5">
          <Aviso tipo="erro" titulo="Não foi possível gerar o Pix">{erroPix}</Aviso>
          {metodo === "pix" && <button type="button" className="btn-secundario mt-3" onClick={() => void gerarPix()}>Tentar novamente</button>}
        </div>
      )}

      {qr && (
        <section className="cartao mt-5 p-5 text-center">
          <h2 className="font-bold">Código de retirada</h2>
          {pedido.codigo_retirada && (
            <p className="mt-3 text-2xl font-extrabold tracking-widest text-marca-800">{pedido.codigo_retirada}</p>
          )}
          <p className="mt-1 text-sm text-suave">
            Mostre o código ou o QR no balcão. A entrega será liberada somente após a confirmação do pagamento.
          </p>
          <div className="mt-4 flex justify-center">
            <QrCode valor={qr} />
          </div>
          {pedido.retirado_em && (
            <p className="mt-4 text-sm font-semibold text-sucesso">
              Retirado em {formatarDataHora(pedido.retirado_em)}
            </p>
          )}
        </section>
      )}

      <ul className="cartao mt-5 divide-y divide-linha text-sm">
        {pedido.itens.map((i) => (
          <li key={i.produto_variacao_id} className="flex justify-between gap-3 px-4 py-3">
            <span>
              {i.quantidade}× {i.produto_nome_snapshot} — {i.variacao_nome_snapshot}
            </span>
            <span className="font-semibold tabular-nums">{formatarBRL(i.subtotal_centavos)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 px-4 py-3 font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatarBRL(pedido.valor_total_centavos)}</span>
        </li>
      </ul>

      {aguardando && (
        <button type="button" className="btn-perigo mt-4 w-full sm:w-auto" disabled={cancelando} onClick={() => void cancelar()}>
          {cancelando ? "Cancelando…" : "Cancelar pedido"}
        </button>
      )}

      <p className="mt-5 text-xs text-suave">
        Você pode consultar este pedido novamente em “Meus pedidos” usando seu CPF.
        Pedido feito em {formatarDataHora(pedido.created_at)}.
      </p>
    </Pagina>
  );
}
