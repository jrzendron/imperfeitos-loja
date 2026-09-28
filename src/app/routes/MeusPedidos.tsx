import { useEffect, useState } from "react";
import { api, ErroApi } from "../lib/api";
import { Pagina, Aviso, Etiqueta } from "../components/ui";
import { QrCode } from "../components/QrCode";
import { formatarBRL, formatarDataHora } from "../../shared/format";
import { STATUS_RETIRAVEL, type PedidoConsultadoCpf } from "../../shared/types";

export function MeusPedidos() {
  const [cpf, setCpf] = useState("");
  const [pedidos, setPedidos] = useState<PedidoConsultadoCpf[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<PedidoConsultadoCpf | null>(null);
  const prontoParaRetirada = pedidoAberto ? STATUS_RETIRAVEL.includes(pedidoAberto.status) : false;

  useEffect(() => {
    if (!pedidoAberto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fecharComEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setPedidoAberto(null);
    };
    window.addEventListener("keydown", fecharComEscape);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEscape);
    };
  }, [pedidoAberto]);

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await api.consultarPedidosCpf(cpf);
      setPedidos(resposta.pedidos);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível consultar os pedidos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Pagina>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Meus pedidos</h1>
        <p className="mt-1 text-suave">Informe o CPF usado na compra para consultar seus pedidos.</p>

        <form onSubmit={consultar} className="cartao mt-5 p-5">
          <label className="rotulo" htmlFor="cpf-consulta">CPF</label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input id="cpf-consulta" className="campo" value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" required />
            <button className="btn-primario shrink-0" disabled={carregando}>{carregando ? "Consultando…" : "Consultar"}</button>
          </div>
        </form>

        {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
        {pedidos?.length === 0 && <div className="mt-4"><Aviso>Nenhum pedido encontrado para este CPF.</Aviso></div>}

        <div className="mt-5 grid gap-5">
          {pedidos?.map((pedido) => (
            <article
              key={pedido.numero}
              className={`cartao overflow-hidden transition ${pedido.codigo_retirada ? "cursor-pointer hover:-translate-y-0.5 hover:border-marca-200 hover:shadow-lg" : ""}`}
              role={pedido.codigo_retirada ? "button" : undefined}
              tabIndex={pedido.codigo_retirada ? 0 : undefined}
              onClick={() => pedido.codigo_retirada && setPedidoAberto(pedido)}
              onKeyDown={(evento) => {
                if (pedido.codigo_retirada && (evento.key === "Enter" || evento.key === " ")) {
                  evento.preventDefault();
                  setPedidoAberto(pedido);
                }
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-5 py-4">
                <div><h2 className="font-bold">{pedido.numero}</h2><p className="text-xs text-suave">{formatarDataHora(pedido.created_at)}</p></div>
                <Etiqueta status={pedido.status} />
              </div>
              <div className="p-5">
                <div className="grid items-center gap-5">
                  <div>
                    {pedido.codigo_retirada ? (
                      <>
                        <p className="text-sm text-suave">Código de retirada</p>
                        <p className="mt-1 text-2xl font-extrabold tracking-widest text-marca-800">{pedido.codigo_retirada}</p>
                      </>
                    ) : (
                      <Aviso tipo="alerta" titulo="Código ainda indisponível">
                        O código e o QR de retirada aparecem após a confirmação do pagamento.
                      </Aviso>
                    )}
                    <p className="mt-3 text-sm font-semibold">Total: {formatarBRL(pedido.valor_total_centavos)}</p>
                    <ul className="mt-3 space-y-1 text-sm text-suave">
                      {pedido.itens.map((item, i) => <li key={i}>{item.quantidade}× {item.produto_nome_snapshot} — {item.variacao_nome_snapshot}</li>)}
                    </ul>
                  </div>
                  {pedido.codigo_retirada && (
                    <span className="btn-primario w-full sm:w-fit">
                      Abrir código e QR Code <span aria-hidden="true">→</span>
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {pedidoAberto?.codigo_retirada && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-marca-900 text-white" role="dialog" aria-modal="true" aria-labelledby="titulo-codigo-retirada">
          <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 pb-8 pt-5 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{pedidoAberto.numero}</p>
                <Etiqueta status={pedidoAberto.status} />
              </div>
              <button
                type="button"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-3xl leading-none transition hover:bg-white/20"
                onClick={() => setPedidoAberto(null)}
                aria-label="Fechar código de retirada"
              >
                ×
              </button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <div className="faixa-arco mb-5 h-1.5 w-36 rounded-full" aria-hidden="true" />
              <h2 id="titulo-codigo-retirada" className="text-3xl font-black tracking-tight sm:text-4xl">
                {prontoParaRetirada
                  ? "Código para retirada"
                  : pedidoAberto.status === "RETIRADO"
                    ? "Pedido já retirado"
                    : "Código do pedido"}
              </h2>
              <p className="mt-3 max-w-md text-white/70">
                {prontoParaRetirada
                  ? "Apresente esta tela no balcão para retirar o seu pedido."
                  : "Este código permanece disponível apenas para consulta do pedido."}
              </p>

              <div className="mt-7 rounded-[1.5rem] bg-white p-4 shadow-2xl sm:p-6">
                <QrCode
                  valor={`${window.location.origin}/retirada/${pedidoAberto.codigo_retirada}`}
                  tamanho={340}
                  rotulo={prontoParaRetirada ? "QR Code para retirada" : "QR Code do pedido"}
                />
              </div>

              <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-white/60">Código do pedido</p>
              <p className="mt-2 break-all text-4xl font-black tracking-[0.14em] text-ouro-400 sm:text-5xl">
                {pedidoAberto.codigo_retirada}
              </p>
              <p className="mt-5 text-sm text-white/60">Aumente o brilho da tela para facilitar a leitura do QR Code.</p>
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}
