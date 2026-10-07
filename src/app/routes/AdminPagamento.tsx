import { useEffect, useState } from "react";
import { api, ErroApi, type ResumoContaPagamento } from "../lib/api";
import { Aviso, Carregando } from "../components/ui";
import { formatarDataHora } from "../../shared/format";

const VAZIO = { nome: "", public_key: "", access_token: "", webhook_secret: "", senha_admin: "" };

export function AdminPagamento() {
  const [conta, setConta] = useState<ResumoContaPagamento | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    api.admin.contaPagamento()
      .then(({ conta }) => setConta(conta))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível consultar a conta."));
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    setSalvando(true);
    try {
      const resposta = await api.admin.trocarContaPagamento(form);
      setConta(resposta.conta);
      setForm(VAZIO);
      setEditando(false);
      setSucesso("Conta de pagamento atualizada. Novas cobranças usarão esta conta.");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível atualizar a conta.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setErro(null);
    setSucesso(null);
    setTestando(true);
    try {
      const resultado = await api.admin.testarContaPagamento();
      setSucesso(`Access Token aceito pelo Mercado Pago para a conta ${resultado.user_id}. Nenhuma cobrança foi criada. Este teste não confirma se a conta está em modo de produção.`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível testar a conexão.");
    } finally {
      setTestando(false);
    }
  }

  const urlWebhook = `${window.location.origin}/api/webhooks/mercado-pago`;

  return (
    <div className="space-y-5">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {sucesso && <Aviso tipo="sucesso">{sucesso}</Aviso>}
      {!conta ? <Carregando /> : (
        <section className="cartao p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-marca-600">Conta recebedora atual</p>
          <h3 className="mt-2 text-xl font-bold">{conta.nome}</h3>
          <p className="mt-1 text-sm text-suave">
            {conta.origem === "worker" ? "Configurada diretamente na Cloudflare" : "Configurada neste painel"}
            {conta.atualizado_em ? ` · Alterada em ${formatarDataHora(conta.atualizado_em)}` : ""}
          </p>
          <div className="mt-4">
            <Aviso tipo="alerta" titulo="Antes de receber pagamentos reais">
              Confira se a Public Key e o Access Token vieram de <strong>Produção → Credenciais de produção</strong> no Mercado Pago
              e se a conta tem uma chave Pix cadastrada. Credenciais de teste também passam na verificação de conexão,
              mas geram um QR que não pode ser pago em um banco real.
            </Aviso>
          </div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-suave">Public Key</dt><dd className="font-semibold">{conta.public_key_final ? `••••••${conta.public_key_final}` : "Não configurada"}</dd></div>
            <div><dt className="text-suave">Access Token</dt><dd className="font-semibold">{conta.access_token_configurado ? "Configurado e oculto" : "Não configurado"}</dd></div>
            <div><dt className="text-suave">Segredo do webhook</dt><dd className="font-semibold">{conta.webhook_configurado ? "Configurado e oculto" : "Não configurado"}</dd></div>
            {conta.user_id && <div><dt className="text-suave">ID da conta validada</dt><dd className="font-semibold">{conta.user_id}</dd></div>}
          </dl>
          {conta.pagamentos_pendentes > 0 && (
            <div className="mt-5">
              <Aviso tipo="alerta" titulo="Cobranças anteriores em andamento">
                Há {conta.pagamentos_pendentes} pagamento(s) pendente(s). A troca não muda a conta dessas cobranças. Mantenha as credenciais da conta anterior ativas no Mercado Pago até elas serem concluídas ou canceladas.
              </Aviso>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-secundario" disabled={testando} onClick={() => void testar()}>
              {testando ? "Verificando…" : "Testar conexão"}
            </button>
            <button type="button" className="btn-secundario" onClick={() => { setEditando(!editando); setErro(null); }}>
              {editando ? "Fechar edição" : "Alterar conta recebedora"}
            </button>
          </div>
        </section>
      )}

      {editando && (
        <form className="cartao p-5 sm:p-6" onSubmit={(e) => void salvar(e)} autoComplete="off">
          <h3 className="text-lg font-bold">Cadastrar outra conta do Mercado Pago</h3>
          <p className="mt-2 text-sm text-suave">
            Use as credenciais de produção da mesma aplicação. O Access Token e o segredo do webhook ficam cifrados no servidor e nunca são mostrados novamente. Pedidos já cobrados continuam vinculados à conta anterior.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="mp-nome">Nome para identificar a conta</label>
              <input id="mp-nome" className="campo" required maxLength={80} placeholder="Ex.: Conta da igreja" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="mp-public">Public Key</label>
              <input id="mp-public" className="campo" required spellCheck={false} value={form.public_key} onChange={(e) => setForm({ ...form, public_key: e.target.value.trim() })} />
            </div>
            <div>
              <label className="rotulo" htmlFor="mp-token">Access Token</label>
              <input id="mp-token" className="campo" required type="password" autoComplete="new-password" spellCheck={false} value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value.trim() })} />
            </div>
            <div>
              <label className="rotulo" htmlFor="mp-webhook">Segredo do webhook</label>
              <input id="mp-webhook" className="campo" required type="password" autoComplete="new-password" spellCheck={false} value={form.webhook_secret} onChange={(e) => setForm({ ...form, webhook_secret: e.target.value.trim() })} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="mp-senha">Senha do painel administrativo para confirmar a troca</label>
              <input id="mp-senha" className="campo" required type="password" autoComplete="off" value={form.senha_admin} onChange={(e) => setForm({ ...form, senha_admin: e.target.value })} />
            </div>
          </div>
          <p className="mt-4 text-sm text-suave">
            Configure na nova aplicação do Mercado Pago o evento de <strong>Orders</strong> para este endereço: <code className="break-all select-all">{urlWebhook}</code>
          </p>
          <a className="mt-2 inline-block text-sm font-semibold text-marca-700 underline" href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noreferrer">Abrir minhas integrações no Mercado Pago</a>
          <Aviso tipo="alerta" titulo="Antes de salvar">
            Confira que as três credenciais pertencem à mesma aplicação e que o webhook já está configurado. O Access Token será testado com o Mercado Pago; a Public Key e o segredo do webhook dependem dessa conferência.
          </Aviso>
          <button className="btn-primario mt-5 w-full sm:w-auto" type="submit" disabled={salvando}>
            {salvando ? "Validando e salvando…" : "Validar e salvar conta"}
          </button>
        </form>
      )}
    </div>
  );
}
