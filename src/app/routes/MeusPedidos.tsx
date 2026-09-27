import { useState } from "react";
import { api, ErroApi } from "../lib/api";
import { Pagina, Aviso, Etiqueta } from "../components/ui";
import { QrCode } from "../components/QrCode";
import { formatarBRL, formatarDataHora } from "../../shared/format";
import type { PedidoConsultadoCpf } from "../../shared/types";

export function MeusPedidos() {
  const [cpf, setCpf] = useState("");
  const [pedidos, setPedidos] = useState<PedidoConsultadoCpf[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
        <p className="mt-1 text-suave">Informe o CPF usado na compra para recuperar os códigos de retirada.</p>

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
            <article key={pedido.numero} className="cartao overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-5 py-4">
                <div><h2 className="font-bold">{pedido.numero}</h2><p className="text-xs text-suave">{formatarDataHora(pedido.created_at)}</p></div>
                <Etiqueta status={pedido.status} />
              </div>
              <div className="p-5">
                <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm text-suave">Código de retirada</p>
                    <p className="mt-1 text-2xl font-extrabold tracking-widest text-marca-800">{pedido.codigo_retirada}</p>
                    <p className="mt-3 text-sm font-semibold">Total: {formatarBRL(pedido.valor_total_centavos)}</p>
                    <ul className="mt-3 space-y-1 text-sm text-suave">
                      {pedido.itens.map((item, i) => <li key={i}>{item.quantidade}× {item.produto_nome_snapshot} — {item.variacao_nome_snapshot}</li>)}
                    </ul>
                  </div>
                  <QrCode valor={`${window.location.origin}/retirada/${pedido.codigo_retirada}`} tamanho={150} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Pagina>
  );
}
