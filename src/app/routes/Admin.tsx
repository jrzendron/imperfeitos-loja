import { useCallback, useEffect, useState } from "react";
import { api, adminToken, ErroApi } from "../lib/api";
import { formatarBRL, formatarDataHora, formatarTelefone } from "../../shared/format";
import { Pagina, Aviso, Etiqueta, Carregando } from "../components/ui";
import { Scanner } from "../components/Scanner";
import { AdminProdutos } from "./AdminProdutos";
import type { StatusPedido } from "../../shared/types";

type Aba = "pedidos" | "produtos" | "estoque" | "retirada";

const ABAS: { id: Aba; titulo: string; curto: string; descricao: string }[] = [
  { id: "pedidos", titulo: "Gestão de pedidos", curto: "Pedidos", descricao: "Compradores, pagamentos e entregas" },
  { id: "estoque", titulo: "Controle de estoque", curto: "Estoque", descricao: "Peças físicas, reservadas e disponíveis" },
  { id: "produtos", titulo: "Produtos da loja", curto: "Produtos", descricao: "Fotos, tamanhos, preços e publicação" },
  { id: "retirada", titulo: "Retirada de pedidos", curto: "Retirada", descricao: "Leitura do QR e confirmação da entrega" },
];

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
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-marca-600">Administração</p>
          <h1 className="text-2xl font-bold">Painel da loja</h1>
        </div>
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

      <nav className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Seções do painel">
        {ABAS.map((item) => (
          <button
            key={item.id}
            onClick={() => setAba(item.id)}
            className={`min-h-16 rounded-xl border px-3 py-3 text-left transition ${
              aba === item.id
                ? "border-marca-500 bg-marca-600 text-white shadow-md shadow-marca-900/10"
                : "border-linha bg-white text-tinta hover:border-marca-200 hover:bg-marca-50"
            }`}
          >
            <span className="block text-sm font-bold">{item.curto}</span>
            <span className={`mt-0.5 hidden text-xs lg:block ${aba === item.id ? "text-white/75" : "text-suave"}`}>{item.descricao}</span>
          </button>
        ))}
      </nav>

      <div className="mt-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold">{ABAS.find((item) => item.id === aba)?.titulo}</h2>
          <p className="mt-1 text-sm text-suave">{ABAS.find((item) => item.id === aba)?.descricao}</p>
        </div>
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
          Digite o token de acesso para gerenciar pedidos, estoque e retiradas.
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
  codigo_retirada: string | null;
  status: StatusPedido;
  valor_total_centavos: number;
  created_at: string;
  cliente_nome: string;
  cliente_telefone: string;
  itens: number;
  itens_resumo: string;
  pagamento_status: string | null;
  pagamento_provider: string | null;
  paid_at: string | null;
  retirado: number;
  retirado_em: string | null;
  retirado_por: string | null;
}

function AbaPedidos() {
  const [pedidos, setPedidos] = useState<LinhaPedido[] | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<any>(null);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const params: Record<string, string> = { limite: "25", pagina: String(pagina) };
    if (busca) params.busca = busca;
    if (status) params.status = status;
    const [r, painel] = await Promise.all([api.admin.pedidos(params), api.admin.dashboard()]);
    setPedidos(r.pedidos);
    setTotal(r.total);
    setResumo(painel);
  }, [busca, status, pagina]);

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

  async function abrirDetalhe(id: string) {
    if (detalhe?.pedido?.id === id) return setDetalhe(null);
    setCarregandoDetalhe(id);
    try {
      setDetalhe(await api.admin.pedido(id));
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof ErroApi ? e.message : "Falha ao abrir o pedido." });
    } finally {
      setCarregandoDetalhe(null);
    }
  }

  const totalStatus = (status: StatusPedido) =>
    resumo?.por_status?.find((item: any) => item.status === status)?.total ?? 0;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Aguardando pagamento" valor={totalStatus("AGUARDANDO_PAGAMENTO")} tom="alerta" />
        <Indicador titulo="Pagos para entregar" valor={totalStatus("PAGO") + totalStatus("PRONTO_PARA_RETIRADA")} tom="marca" />
        <Indicador titulo="Entregues" valor={totalStatus("RETIRADO")} tom="sucesso" />
        <Indicador titulo="Faturamento confirmado" valor={formatarBRL(resumo?.faturamento_centavos ?? 0)} tom="neutro" />
      </div>

      <div className="cartao mt-5 grid gap-3 p-4 sm:grid-cols-[1fr_14rem]">
        <input
          className="campo"
          placeholder="Número, nome ou telefone"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
        />
        <select className="campo" value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }}>
          <option value="">Todos os status</option>
          <option value="AGUARDANDO_PAGAMENTO">Aguardando pagamento</option>
          <option value="PAGO">Pago</option>
          <option value="PRONTO_PARA_RETIRADA">Pronto para retirada</option>
          <option value="RETIRADO">Retirado</option>
          <option value="EXPIRADO">Expirado</option>
          <option value="CANCELADO">Cancelado</option>
          <option value="PAGO_REVISAR">Pago — revisar</option>
          <option value="REEMBOLSADO">Reembolsado</option>
        </select>
      </div>

      {aviso && <div className="mt-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}
      {!pedidos && <Carregando />}
      {pedidos?.length === 0 && <div className="mt-4"><Aviso>Nenhum pedido encontrado.</Aviso></div>}

      <ul className="mt-4 space-y-3">
        {pedidos?.map((p) => (
          <li key={p.id} className="cartao overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-lg font-bold tabular-nums">{p.numero}</span>
              <Etiqueta status={p.status} />
              <span className="ml-auto font-bold tabular-nums">
                {formatarBRL(p.valor_total_centavos)}
              </span>
            </div>

            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoPedido rotulo="Comprador" valor={p.cliente_nome} complemento={formatarTelefone(p.cliente_telefone)} />
              <InfoPedido rotulo="Itens" valor={p.itens_resumo || `${p.itens} item(ns)`} />
              <InfoPedido
                rotulo="Pagamento"
                valor={p.pagamento_status === "APPROVED" ? "Pago" : p.pagamento_status === "PENDING" ? "Pendente" : "Não confirmado"}
                complemento={p.paid_at ? formatarDataHora(p.paid_at) : undefined}
              />
              <InfoPedido
                rotulo="Entrega"
                valor={p.retirado_em ? "Entregue" : "Não entregue"}
                complemento={p.retirado_em ? formatarDataHora(p.retirado_em) : p.codigo_retirada ?? undefined}
              />
            </div>

            <p className="mt-3 text-xs text-suave">Pedido criado em {formatarDataHora(p.created_at)}</p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button className="btn-secundario !py-2 !text-sm" onClick={() => void abrirDetalhe(p.id)}>
                {carregandoDetalhe === p.id ? "Carregando…" : detalhe?.pedido?.id === p.id ? "Fechar detalhes" : "Ver detalhes"}
              </button>
              {p.status === "AGUARDANDO_PAGAMENTO" && (
                <>
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
                </>
              )}
            </div>
            </div>

            {detalhe?.pedido?.id === p.id && (
              <div className="border-t border-linha bg-fundo/70 p-4 sm:p-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="font-bold">Dados do comprador</h3>
                    <dl className="mt-3 space-y-2 text-sm">
                      <Linha rotulo="Nome" valor={detalhe.pedido.cliente_nome} />
                      <Linha rotulo="Telefone" valor={formatarTelefone(detalhe.pedido.cliente_telefone)} />
                      <Linha rotulo="E-mail" valor={detalhe.pedido.cliente_email || "Não informado"} />
                      <Linha rotulo="Código" valor={detalhe.pedido.pagamento_status === "APPROVED" ? (detalhe.pedido.codigo_retirada || "Pedido antigo") : "Disponível após o pagamento"} />
                    </dl>
                  </div>
                  <div>
                    <h3 className="font-bold">Itens do pedido</h3>
                    <ul className="mt-3 divide-y divide-linha rounded-lg border border-linha bg-white text-sm">
                      {detalhe.itens.map((item: any) => (
                        <li key={item.id} className="flex justify-between gap-3 px-3 py-2.5">
                          <span>{item.quantidade}× {item.produto_nome_snapshot} — {item.variacao_nome_snapshot}</span>
                          <strong className="shrink-0">{formatarBRL(item.subtotal_centavos)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Aviso tipo={detalhe.pedido.pagamento_status === "APPROVED" ? "sucesso" : "alerta"} titulo="Pagamento">
                    {detalhe.pedido.pagamento_status === "APPROVED"
                      ? `Confirmado${detalhe.pedido.paid_at ? ` em ${formatarDataHora(detalhe.pedido.paid_at)}` : ""}`
                      : "Ainda não confirmado"}
                  </Aviso>
                  <Aviso tipo={detalhe.pedido.retirado_em ? "sucesso" : "info"} titulo="Entrega">
                    {detalhe.pedido.retirado_em
                      ? `Entregue em ${formatarDataHora(detalhe.pedido.retirado_em)} por ${detalhe.pedido.retirado_por}`
                      : "Ainda não entregue"}
                  </Aviso>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {total > 25 && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button className="btn-secundario !py-2 !text-sm" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
          <p className="text-sm text-suave">Página {pagina} de {Math.ceil(total / 25)}</p>
          <button className="btn-secundario !py-2 !text-sm" disabled={pagina >= Math.ceil(total / 25)} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
        </div>
      )}
    </>
  );
}

function Indicador({ titulo, valor, tom }: { titulo: string; valor: string | number; tom: "alerta" | "marca" | "sucesso" | "neutro" }) {
  const cores = { alerta: "border-alerta/20 bg-alerta/5", marca: "border-marca-200 bg-marca-50", sucesso: "border-sucesso/20 bg-sucesso/5", neutro: "border-linha bg-white" };
  return <div className={`rounded-xl border p-4 ${cores[tom]}`}><p className="text-xs font-semibold text-suave">{titulo}</p><p className="mt-1 text-2xl font-black tabular-nums">{valor}</p></div>;
}

function InfoPedido({ rotulo, valor, complemento }: { rotulo: string; valor: string; complemento?: string }) {
  return <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-suave">{rotulo}</p><p className="mt-1 break-words font-semibold">{valor}</p>{complemento && <p className="mt-0.5 text-xs text-suave">{complemento}</p>}</div>;
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
  const [busca, setBusca] = useState("");

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

  const totais = linhas.reduce(
    (acc, linha) => ({
      fisico: acc.fisico + linha.quantidade_fisica,
      reservado: acc.reservado + linha.quantidade_reservada,
      disponivel: acc.disponivel + linha.disponivel,
    }),
    { fisico: 0, reservado: 0, disponivel: 0 },
  );
  const linhasFiltradas = linhas.filter((linha) =>
    `${linha.produto_nome} ${linha.nome} ${linha.sku}`.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Peças físicas" valor={totais.fisico} tom="neutro" />
        <Indicador titulo="Reservadas" valor={totais.reservado} tom="alerta" />
        <Indicador titulo="Disponíveis" valor={totais.disponivel} tom="sucesso" />
        <Indicador titulo="Faturamento" valor={formatarBRL(faturamento)} tom="marca" />
      </div>

      {aviso && <div className="mt-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}

      <div className="cartao mt-5 p-4">
        <label className="rotulo" htmlFor="busca-estoque">Localizar tamanho ou SKU</label>
        <input id="busca-estoque" className="campo" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: M, GG ou código SKU" />
      </div>

      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {linhasFiltradas.map((l) => (
          <li key={l.id} className="cartao p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-bold">{l.nome}</span>
              <span className="text-sm text-suave">{l.produto_nome}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {formatarBRL(l.valor_centavos)}
              </span>
            </div>

            <p className="mt-1 text-xs text-suave">SKU {l.sku}</p>

            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-linha text-center text-sm tabular-nums">
              <div className="p-2"><span className="block text-xs text-suave">Físico</span><strong className="text-lg">{l.quantidade_fisica}</strong></div>
              <div className="border-x border-linha bg-alerta/5 p-2"><span className="block text-xs text-suave">Reservado</span><strong className="text-lg">{l.quantidade_reservada}</strong></div>
              <div className={`p-2 ${l.disponivel > 0 ? "bg-sucesso/5 text-sucesso" : "bg-perigo/5 text-perigo"}`}><span className="block text-xs">Disponível</span><strong className="text-lg">{l.disponivel}</strong></div>
            </div>

            {editando === l.id ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-[7rem_1fr_auto_auto]">
                <input
                  className="campo"
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
    <div className="mx-auto max-w-xl">
      {!lendo && !consulta && (
        <section className="cartao p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-marca-100 text-xl text-marca-700">▦</div>
            <div><h3 className="font-bold">Escanear QR Code</h3><p className="mt-1 text-sm text-suave">Use a câmera traseira e mantenha o código dentro do quadro.</p></div>
          </div>
          <button className="btn-primario mt-4 w-full !min-h-14 !text-lg" onClick={() => setLendo(true)}>
            Abrir câmera
          </button>
        </section>
      )}

      {lendo && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-tinta p-3 sm:static sm:z-auto sm:rounded-2xl sm:p-4">
          <div className="mb-3 flex items-center justify-between text-white"><div><p className="font-bold">Ler QR de retirada</p><p className="text-xs text-white/70">Aponte para o código do comprador</p></div><button className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl" onClick={() => setLendo(false)} aria-label="Fechar câmera">×</button></div>
          <Scanner ativo={lendo} aoLer={consultar} />
          <button className="btn-secundario mt-3 min-h-12 w-full" onClick={() => setLendo(false)}>
            Fechar câmera
          </button>
        </div>
      )}

      {!consulta && !lendo && (
        <form className="cartao mt-4 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); void consultar(manual); }}>
          <label className="rotulo" htmlFor="codigo-retirada">Digitar código de retirada</label>
          <p className="mb-3 text-sm text-suave">Use esta opção quando a câmera não estiver disponível.</p>
          <input
            id="codigo-retirada"
            className="campo min-h-14 text-center text-lg font-bold uppercase tracking-widest"
            placeholder="RET-XXXXXXXX"
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
          />
          <button
            className="btn-secundario mt-3 min-h-14 w-full !text-base"
            disabled={manual.trim().length < 8}
            type="submit"
          >
            Buscar pedido
          </button>
        </form>
      )}

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}

      {consulta && (
        <div className="cartao mt-4 overflow-hidden">
          <div className={`p-5 text-white ${consulta.pode_retirar ? "bg-sucesso" : consulta.retirado_em ? "bg-marca-700" : "bg-perigo"}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-white/75">Resultado da consulta</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{consulta.numero}</p>
            <p className="mt-1 font-bold">{consulta.pode_retirar ? "LIBERADO PARA ENTREGA" : consulta.retirado_em ? "PEDIDO JÁ ENTREGUE" : consulta.impedimento}</p>
          </div>

          <div className="p-5">

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
              className="btn-primario mt-5 min-h-16 w-full !text-lg"
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
            className="btn-secundario mt-3 min-h-14 w-full"
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
        </div>
      )}
    </div>
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
