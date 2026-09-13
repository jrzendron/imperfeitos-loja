import { useCallback, useEffect, useState } from "react";
import { api, adminToken, ErroApi } from "../lib/api";
import { formatarBRL, formatarDataHora, mascararTelefone, formatarTelefone } from "../../shared/format";
import { Pagina, Aviso, Etiqueta, Carregando } from "../components/ui";
import { Scanner } from "../components/Scanner";
import { AdminProdutos } from "./AdminProdutos";
import type { StatusPedido } from "../../shared/types";

type Aba = "pedidos" | "produtos" | "estoque" | "retirada";

export function Admin() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [aba, setAba] = useState<Aba>("pedidos");

  useEffect(() => {
    if (!adminToken.ler()) return setAutenticado(false);
    api.admin.sessao().then(() => setAutenticado(true)).catch(() => setAutenticado(false));
  }, []);

  if (autenticado === null) return <Pagina admin><Carregando /></Pagina>;
  if (!autenticado) return <Login aoEntrar={() => setAutenticado(true)} />;

  return (
    <Pagina admin>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Painel</h1>
        <button
          className="ml-auto text-sm font-semibold text-suave hover:text-tinta"
          onClick={() => {
            adminToken.limpar();
            setAutenticado(false);
          }}
        >
          Sair
        </button>
      </div>

      <nav className="mt-5 flex gap-1 border-b border-linha">
        {(["pedidos", "produtos", "estoque", "retirada"] as Aba[]).map((nome) => (
          <button
            key={nome}
            onClick={() => setAba(nome)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold capitalize transition ${
              aba === nome
                ? "border-marca-600 text-marca-700"
                : "border-transparent text-suave hover:text-tinta"
            }`}
          >
            {nome}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {aba === "pedidos" && <AbaPedidos />}
        {aba === "produtos" && <AdminProdutos />}
        {aba === "estoque" && <AbaEstoque />}
        {aba === "retirada" && <AbaRetirada />}
      </div>
    </Pagina>
  );
}

function Login({ aoEntrar }: { aoEntrar: () => void }) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    adminToken.gravar(valor.trim());
    try {
      await api.admin.sessao();
      aoEntrar();
    } catch {
      adminToken.limpar();
      setErro("Token inválido.");
    }
  }

  return (
    <Pagina admin>
      <form onSubmit={entrar} className="cartao mx-auto mt-8 max-w-sm p-6">
        <h1 className="text-xl font-bold">Painel administrativo</h1>
        <p className="mt-1.5 text-sm text-suave">
          Token de desenvolvimento, definido em <code className="text-xs">.dev.vars</code>.
          Em produção quem autentica é o Cloudflare Access.
        </p>
        <label className="rotulo mt-5" htmlFor="token">Token</label>
        <input
          id="token"
          type="password"
          className="campo"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          autoFocus
        />
        {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
        <button className="btn-primario mt-4 w-full">Entrar</button>
      </form>
    </Pagina>
  );
}

interface LinhaPedido {
  id: string;
  numero: string;
  status: StatusPedido;
  valor_total_centavos: number;
  created_at: string;
  cliente_nome: string;
  cliente_telefone: string;
  itens: number;
  retirado: number;
}

function AbaPedidos() {
  const [pedidos, setPedidos] = useState<LinhaPedido[] | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const params: Record<string, string> = { limite: "25" };
    if (busca) params.busca = busca;
    if (status) params.status = status;
    const r = await api.admin.pedidos(params);
    setPedidos(r.pedidos);
  }, [busca, status]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(id: string, tipo: "pagar" | "cancelar") {
    setOcupado(id);
    setAviso(null);
    try {
      if (tipo === "pagar") {
        await api.admin.marcarPago(id);
        setAviso({ tipo: "sucesso", texto: "Pagamento registrado. O QR de retirada já está disponível para o comprador." });
      } else {
        await api.admin.cancelar(id);
        setAviso({ tipo: "sucesso", texto: "Pedido cancelado e estoque devolvido." });
      }
      await carregar();
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof ErroApi ? e.message : "Falha na operação." });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input
          className="campo max-w-56 flex-1"
          placeholder="Número, nome ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="campo max-w-52" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="AGUARDANDO_PAGAMENTO">Aguardando pagamento</option>
          <option value="PAGO">Pago</option>
          <option value="RETIRADO">Retirado</option>
          <option value="EXPIRADO">Expirado</option>
          <option value="CANCELADO">Cancelado</option>
          <option value="PAGO_REVISAR">Pago — revisar</option>
        </select>
      </div>

      {aviso && <div className="mt-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}
      {!pedidos && <Carregando />}
      {pedidos?.length === 0 && <div className="mt-4"><Aviso>Nenhum pedido encontrado.</Aviso></div>}

      <ul className="mt-4 space-y-3">
        {pedidos?.map((p) => (
          <li key={p.id} className="cartao p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-bold tabular-nums">{p.numero}</span>
              <Etiqueta status={p.status} />
              {p.retirado === 1 && (
                <span className="etiqueta bg-sucesso/10 text-sucesso">Entregue</span>
              )}
              <span className="ml-auto font-bold tabular-nums">
                {formatarBRL(p.valor_total_centavos)}
              </span>
            </div>

            <p className="mt-1.5 text-sm text-suave">
              {p.cliente_nome} · {mascararTelefone(p.cliente_telefone)} · {p.itens} item(ns) ·{" "}
              {formatarDataHora(p.created_at)}
            </p>

            {p.status === "AGUARDANDO_PAGAMENTO" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn-primario !py-2 !text-sm"
                  disabled={ocupado === p.id}
                  onClick={() => acao(p.id, "pagar")}
                >
                  {ocupado === p.id ? "Registrando…" : "Confirmar pagamento"}
                </button>
                <button
                  className="btn-perigo !py-2 !text-sm"
                  disabled={ocupado === p.id}
                  onClick={() => acao(p.id, "cancelar")}
                >
                  Cancelar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-suave">
        O botão “Confirmar pagamento” ocupa o lugar do webhook do Mercado Pago.
        Quando o Pix entrar, ele chama exatamente a mesma função do servidor.
      </p>
    </>
  );
}

interface LinhaEstoque {
  id: string;
  nome: string;
  sku: string;
  produto_nome: string;
  valor_centavos: number;
  quantidade_fisica: number;
  quantidade_reservada: number;
  disponivel: number;
}

function AbaEstoque() {
  const [linhas, setLinhas] = useState<LinhaEstoque[] | null>(null);
  const [faturamento, setFaturamento] = useState(0);
  const [editando, setEditando] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const r = await api.admin.dashboard();
    setLinhas(r.estoque);
    setFaturamento(r.faturamento_centavos);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(id: string) {
    setAviso(null);
    try {
      await api.admin.ajustarEstoque({
        produto_variacao_id: id,
        delta: Number(delta),
        motivo: motivo.trim(),
      });
      setEditando(null);
      setDelta("");
      setMotivo("");
      setAviso({ tipo: "sucesso", texto: "Estoque ajustado e movimento registrado." });
      await carregar();
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof ErroApi ? e.message : "Falha no ajuste." });
    }
  }

  if (!linhas) return <Carregando />;

  return (
    <>
      <div className="cartao p-4">
        <p className="text-sm text-suave">Faturamento confirmado</p>
        <p className="text-2xl font-bold tabular-nums">{formatarBRL(faturamento)}</p>
      </div>

      {aviso && <div className="mt-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}

      <ul className="mt-4 space-y-3">
        {linhas.map((l) => (
          <li key={l.id} className="cartao p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-bold">{l.nome}</span>
              <span className="text-sm text-suave">{l.produto_nome}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {formatarBRL(l.valor_centavos)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
              <span>Físico <strong>{l.quantidade_fisica}</strong></span>
              <span className="text-suave">Reservado <strong>{l.quantidade_reservada}</strong></span>
              <span className={l.disponivel > 0 ? "text-sucesso" : "text-perigo"}>
                Disponível <strong>{l.disponivel}</strong>
              </span>
            </div>

            {editando === l.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="campo max-w-28"
                  type="number"
                  placeholder="+10 / -3"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  autoFocus
                />
                <input
                  className="campo min-w-40 flex-1"
                  placeholder="Motivo (obrigatório)"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <button
                  className="btn-primario !py-2 !text-sm"
                  disabled={!delta || motivo.trim().length < 3}
                  onClick={() => salvar(l.id)}
                >
                  Salvar
                </button>
                <button className="btn-secundario !py-2 !text-sm" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                className="btn-secundario mt-3 !py-2 !text-sm"
                onClick={() => {
                  setEditando(l.id);
                  setDelta("");
                  setMotivo("");
                }}
              >
                Ajustar estoque
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function AbaRetirada() {
  const [lendo, setLendo] = useState(false);
  const [manual, setManual] = useState("");
  // Guardamos o token efetivamente lido: o QR traz a URL inteira e o
  // atendente pode ter usado a câmera, não o campo manual.
  const [tokenAtual, setTokenAtual] = useState("");
  const [consulta, setConsulta] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /** O QR carrega a URL inteira; o que interessa é o último segmento. */
  const extrairToken = (texto: string) => texto.trim().split("/").filter(Boolean).pop() ?? texto.trim();

  const consultar = useCallback(async (bruto: string) => {
    const token = extrairToken(bruto);
    setLendo(false);
    setErro(null);
    setConsulta(null);
    setTokenAtual(token);
    try {
      const r = await api.admin.consultarRetirada(token);
      setConsulta(r.retirada);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Falha ao consultar.");
    }
  }, []);

  async function confirmar() {
    if (!consulta || !tokenAtual) return;
    setConfirmando(true);
    setErro(null);
    try {
      const r = await api.admin.confirmarRetirada(tokenAtual);
      setConsulta(r.retirada);
    } catch (e) {
      // A falha mais provável aqui é o outro atendente ter confirmado
      // primeiro. Recarregamos para a tela mostrar "PEDIDO JÁ RETIRADO".
      setErro(e instanceof ErroApi ? e.message : "Falha ao confirmar.");
      await consultar(tokenAtual);
    } finally {
      setConfirmando(false);
    }
  }

  if (!online) {
    return (
      <Aviso tipo="erro" titulo="Sem conexão">
        Não é possível confirmar a retirada offline. Nada é guardado para enviar
        depois — seria o caminho mais curto para entregar a mesma peça duas vezes.
      </Aviso>
    );
  }

  return (
    <>
      {!lendo && !consulta && (
        <button className="btn-primario w-full !py-4 !text-lg" onClick={() => setLendo(true)}>
          Abrir leitor
        </button>
      )}

      {lendo && (
        <>
          <Scanner ativo={lendo} aoLer={consultar} />
          <button className="btn-secundario mt-3 w-full" onClick={() => setLendo(false)}>
            Fechar câmera
          </button>
        </>
      )}

      {!consulta && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="campo min-w-44 flex-1"
            placeholder="Ou cole o código do QR"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button
            className="btn-secundario"
            disabled={manual.trim().length < 10}
            onClick={() => consultar(manual)}
          >
            Consultar
          </button>
        </div>
      )}

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}

      {consulta && (
        <div className="cartao mt-4 p-5">
          <p className="text-2xl font-bold tabular-nums">{consulta.numero}</p>

          <dl className="mt-4 space-y-2.5 text-base">
            <Linha rotulo="Cliente" valor={consulta.cliente_nome} />
            <Linha rotulo="Telefone" valor={formatarTelefone(consulta.cliente_telefone)} />
            {consulta.itens.map((i: any, n: number) => (
              <Linha key={n} rotulo={`Item ${n + 1}`} valor={`${i.quantidade}× ${i.descricao}`} />
            ))}
            <Linha rotulo="Valor" valor={formatarBRL(consulta.valor_total_centavos)} />
            <Linha rotulo="Pagamento" valor={consulta.pago ? "PAGO" : "NÃO CONFIRMADO"} />
          </dl>

          {consulta.retirado_em ? (
            <div className="mt-5">
              <Aviso tipo="sucesso" titulo="ENTREGUE">
                {formatarDataHora(consulta.retirado_em)}
                <br />
                Por: {consulta.retirado_por}
              </Aviso>
            </div>
          ) : consulta.pode_retirar ? (
            <button
              className="btn-primario mt-5 w-full !py-4 !text-lg"
              disabled={confirmando}
              onClick={confirmar}
            >
              {confirmando ? "Confirmando…" : "Confirmar retirada"}
            </button>
          ) : (
            <div className="mt-5">
              <Aviso tipo="erro" titulo={consulta.impedimento ?? "Retirada bloqueada"}>
                Não entregue a peça. Encaminhe o comprador para a equipe.
              </Aviso>
            </div>
          )}

          <button
            className="btn-secundario mt-3 w-full"
            onClick={() => {
              setConsulta(null);
              setManual("");
              setTokenAtual("");
              setErro(null);
            }}
          >
            Ler outro QR
          </button>
        </div>
      )}
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-linha pb-2 last:border-0">
      <dt className="text-sm text-suave">{rotulo}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}
