import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { api, ErroApi } from "../lib/api";
import { carrinho, useCarrinho } from "../lib/carrinho";
import { formatarBRL } from "../../shared/format";
import { Pagina, Aviso } from "../components/ui";

/**
 * Identificação por nome + telefone, sem login e sem CPF.
 * O acesso ao pedido depois é pelo link secreto que o servidor devolve.
 * É a decisão D6 do plano ainda em aberto — e trocar isso por login
 * depois não exige refazer nada aqui além deste formulário.
 */
export function Checkout() {
  const itens = useCarrinho();
  const navegar = useNavigate();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const aoConectar = () => setOnline(true);
    const aoDesconectar = () => setOnline(false);
    window.addEventListener("online", aoConectar);
    window.addEventListener("offline", aoDesconectar);
    return () => {
      window.removeEventListener("online", aoConectar);
      window.removeEventListener("offline", aoDesconectar);
    };
  }, []);

  const total = itens.reduce((s, i) => s + i.valor_centavos * i.quantidade, 0);

  if (itens.length === 0) {
    return (
      <Pagina>
        <h1 className="text-2xl font-bold">Finalizar pedido</h1>
        <div className="mt-5"><Aviso>Seu carrinho está vazio.</Aviso></div>
        <Link to="/" className="btn-secundario mt-4">Ver produtos</Link>
      </Pagina>
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) {
      setErro("Sem conexão. O pedido não foi criado; conecte-se e tente novamente.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      // Só vão o id da variação e a quantidade. Preço, nunca.
      const { acesso_token } = await api.criarPedido({
        cliente: { nome: nome.trim(), telefone, email: email.trim() },
        itens: itens.map((i) => ({
          produto_variacao_id: i.produto_variacao_id,
          quantidade: i.quantidade,
        })),
      });
      carrinho.limpar();
      navegar({ to: "/pedido/$token", params: { token: acesso_token } });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível criar o pedido.");
      setEnviando(false);
    }
  }

  return (
    <Pagina>
      <h1 className="text-2xl font-bold">Finalizar pedido</h1>

      <ul className="cartao mt-5 divide-y divide-linha text-sm">
        {itens.map((i) => (
          <li key={i.produto_variacao_id} className="flex justify-between gap-3 px-4 py-3">
            <span>
              {i.quantidade}× {i.produto_nome} — {i.variacao_nome}
            </span>
            <span className="font-semibold tabular-nums">
              {formatarBRL(i.valor_centavos * i.quantidade)}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-3 px-4 py-3 font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatarBRL(total)}</span>
        </li>
      </ul>

      <form onSubmit={enviar} className="mt-6 max-w-md">
        <div className="mb-4">
          <label className="rotulo" htmlFor="nome">Nome completo</label>
          <input
            id="nome"
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            minLength={3}
            autoComplete="name"
            placeholder="Como está no seu documento"
          />
        </div>

        <div className="mb-4">
          <label className="rotulo" htmlFor="telefone">Telefone com DDD</label>
          <input
            id="telefone"
            className="campo"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="(47) 99999-0000"
          />
          <p className="mt-1.5 text-xs text-suave">
            Usamos só para avisar sobre o seu pedido. Não pedimos CPF.
          </p>
        </div>

        <div className="mb-4">
          <label className="rotulo" htmlFor="email">E-mail</label>
          <input
            id="email"
            className="campo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
          />
          <p className="mt-1.5 text-xs text-suave">
            Necessário para gerar o pagamento Pix.
          </p>
        </div>

        {!online && (
          <div className="mb-4">
            <Aviso tipo="erro" titulo="Sem conexão">
              O pedido não pode ser criado offline. Seus itens continuam no carrinho.
            </Aviso>
          </div>
        )}

        {erro && <div className="mb-4"><Aviso tipo="erro">{erro}</Aviso></div>}

        <button className="btn-primario w-full" disabled={enviando || !online}>
          {enviando ? "Criando pedido…" : "Criar pedido"}
        </button>

        <p className="mt-3 text-xs text-suave">
          As peças ficam reservadas por 30 minutos. Você recebe um link para
          acompanhar o pedido — guarde-o.
        </p>
      </form>
    </Pagina>
  );
}
