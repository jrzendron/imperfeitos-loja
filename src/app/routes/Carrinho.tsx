import { Link, useNavigate } from "@tanstack/react-router";
import { carrinho, useCarrinho } from "../lib/carrinho";
import { formatarBRL } from "../../shared/format";
import { Pagina, Aviso } from "../components/ui";

export function CarrinhoPagina() {
  const itens = useCarrinho();
  const navegar = useNavigate();
  const total = itens.reduce((s, i) => s + i.valor_centavos * i.quantidade, 0);

  if (itens.length === 0) {
    return (
      <Pagina>
        <h1 className="text-2xl font-bold">Carrinho</h1>
        <div className="mt-5">
          <Aviso>Seu carrinho está vazio.</Aviso>
        </div>
        <Link to="/" className="btn-secundario mt-4">Ver produtos</Link>
      </Pagina>
    );
  }

  return (
    <Pagina>
      <h1 className="text-2xl font-bold">Carrinho</h1>

      <ul className="cartao mt-5 divide-y divide-linha">
        {itens.map((item) => (
          <li key={item.produto_variacao_id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-40 flex-1">
              <p className="font-semibold">{item.produto_nome}</p>
              <p className="text-sm text-suave">
                Tamanho {item.variacao_nome} · {formatarBRL(item.valor_centavos)}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                className="btn-secundario h-10 w-10 !px-0"
                onClick={() =>
                  carrinho.definirQuantidade(item.produto_variacao_id, item.quantidade - 1)
                }
                aria-label="Diminuir"
              >
                −
              </button>
              <span className="w-8 text-center font-bold tabular-nums">{item.quantidade}</span>
              <button
                className="btn-secundario h-10 w-10 !px-0"
                onClick={() =>
                  carrinho.definirQuantidade(item.produto_variacao_id, item.quantidade + 1)
                }
                aria-label="Aumentar"
              >
                +
              </button>
            </div>

            <span className="w-24 text-right font-bold tabular-nums">
              {formatarBRL(item.valor_centavos * item.quantidade)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-suave">Total</p>
          <p className="text-2xl font-bold tabular-nums">{formatarBRL(total)}</p>
          <p className="mt-0.5 text-xs text-suave">
            O valor final é conferido pelo servidor ao criar o pedido.
          </p>
        </div>
        <button className="btn-primario" onClick={() => navegar({ to: "/checkout" })}>
          Finalizar pedido
        </button>
      </div>
    </Pagina>
  );
}
