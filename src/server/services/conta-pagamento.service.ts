import { comparaSeguro } from "../utils/crypto";
import { erro } from "../utils/http";
import { agora, novoId } from "../utils/ids";

interface ContaSalva {
  id: string;
  nome: string;
  public_key: string;
  access_token_cifrado: string;
  webhook_secret_cifrado: string;
  mercado_pago_user_id: string | null;
  created_at: string;
}

export interface CredenciaisPagamento {
  id: string | null;
  publicKey: string;
  accessToken: string;
  webhookSecret: string;
}

function bytesBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64Bytes(valor: string): Uint8Array {
  return Uint8Array.from(atob(valor), (c) => c.charCodeAt(0));
}

async function chaveVault(env: Env): Promise<CryptoKey> {
  if (!env.PAYMENT_CONFIG_KEY) {
    throw erro(503, "COFRE_INDISPONIVEL", "O cofre de pagamentos ainda não foi configurado.");
  }
  let bytes: Uint8Array;
  try {
    bytes = base64Bytes(env.PAYMENT_CONFIG_KEY);
  } catch {
    throw erro(503, "COFRE_INVALIDO", "A chave do cofre de pagamentos é inválida.");
  }
  if (bytes.length !== 32) throw erro(503, "COFRE_INVALIDO", "A chave do cofre de pagamentos é inválida.");
  return crypto.subtle.importKey("raw", Uint8Array.from(bytes).buffer as ArrayBuffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function cifrar(env: Env, valor: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await chaveVault(env),
    new TextEncoder().encode(valor),
  );
  return `v1:${bytesBase64(iv)}:${bytesBase64(new Uint8Array(dados))}`;
}

export async function decifrar(env: Env, cifrado: string): Promise<string> {
  const [versao, iv, dados] = cifrado.split(":");
  if (versao !== "v1" || !iv || !dados) throw erro(503, "COFRE_INVALIDO", "Credenciais armazenadas inválidas.");
  try {
    const texto = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(base64Bytes(iv)).buffer as ArrayBuffer },
      await chaveVault(env),
      Uint8Array.from(base64Bytes(dados)).buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(texto);
  } catch {
    throw erro(503, "COFRE_INVALIDO", "Não foi possível abrir as credenciais de pagamento.");
  }
}

async function contaAtiva(db: D1Database): Promise<ContaSalva | null> {
  return db.prepare("SELECT * FROM contas_pagamento WHERE ativo = 1 LIMIT 1").first<ContaSalva>();
}

export async function credenciaisPagamento(db: D1Database, env: Env, id?: string | null): Promise<CredenciaisPagamento> {
  // NULL representa a conta original, mantida nos Secrets do Worker. Cobranças
  // antigas continuam consultáveis mesmo após cadastrar outra conta no painel.
  const conta = id === undefined ? await contaAtiva(db) : id ? await db.prepare(
    "SELECT * FROM contas_pagamento WHERE id = ?1 LIMIT 1",
  ).bind(id).first<ContaSalva>() : null;
  if (id && !conta) throw erro(503, "CONTA_NAO_ENCONTRADA", "A conta original desta cobrança não está disponível.");
  if (!conta) {
    return {
      id: null,
      publicKey: env.MERCADO_PAGO_PUBLIC_KEY || "",
      accessToken: env.MERCADO_PAGO_ACCESS_TOKEN || "",
      webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET || "",
    };
  }
  return {
    id: conta.id,
    publicKey: conta.public_key,
    accessToken: await decifrar(env, conta.access_token_cifrado),
    webhookSecret: await decifrar(env, conta.webhook_secret_cifrado),
  };
}

export async function resumoContaPagamento(db: D1Database, env: Env) {
  const conta = await contaAtiva(db);
  const pendentes = await db.prepare(
    "SELECT COUNT(*) AS total FROM pagamentos WHERE provider = 'MERCADO_PAGO' AND status = 'PENDING'",
  ).first<{ total: number }>();
  if (!conta) return {
    origem: "worker" as const,
    nome: "Conta atual do Mercado Pago",
    public_key_final: env.MERCADO_PAGO_PUBLIC_KEY?.slice(-6) || null,
    access_token_configurado: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN),
    webhook_configurado: Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET),
    user_id: null,
    atualizado_em: null,
    pagamentos_pendentes: pendentes?.total ?? 0,
  };
  return {
    origem: "painel" as const,
    nome: conta.nome,
    public_key_final: conta.public_key.slice(-6),
    access_token_configurado: true,
    webhook_configurado: true,
    user_id: conta.mercado_pago_user_id,
    atualizado_em: conta.created_at,
    pagamentos_pendentes: pendentes?.total ?? 0,
  };
}

/** Verifica a credencial ativa sem criar cobrança e sem devolver segredos ao navegador. */
export async function testarContaPagamento(db: D1Database, env: Env) {
  const conta = await credenciaisPagamento(db, env);
  if (!conta.accessToken || !conta.publicKey || !conta.webhookSecret) {
    throw erro(503, "CONTA_INCOMPLETA", "A conta de pagamento precisa de Public Key, Access Token e segredo do webhook.");
  }
  let resposta: Response;
  try {
    resposta = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${conta.accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw erro(502, "MP_INDISPONIVEL", "Não foi possível verificar a conta no Mercado Pago agora.");
  }
  if (!resposta.ok) throw erro(502, "TOKEN_MP_INVALIDO", "O Mercado Pago não aceitou o Access Token ativo.");
  const usuario = await resposta.json() as { id?: string | number };
  if (!usuario.id) throw erro(502, "RESPOSTA_MP_INVALIDA", "O Mercado Pago não identificou a conta recebedora.");
  return { ok: true, user_id: String(usuario.id), verificado_em: agora() };
}

export interface NovaContaPagamento {
  nome: string;
  public_key: string;
  access_token: string;
  webhook_secret: string;
  senha_admin: string;
}

export async function trocarContaPagamento(db: D1Database, env: Env, entrada: NovaContaPagamento, adminEmail: string) {
  if (!comparaSeguro(entrada.senha_admin, env.ADMIN_TOKEN || "")) {
    throw erro(401, "SENHA_INVALIDA", "Senha do painel incorreta.");
  }
  if (!entrada.public_key || !entrada.access_token || !entrada.webhook_secret) {
    throw erro(400, "CREDENCIAIS_INCOMPLETAS", "Informe as três credenciais do Mercado Pago.");
  }
  // Verifica o Access Token no provedor antes de redirecionar novos pagamentos.
  // A Public Key e o segredo do webhook devem pertencer à mesma aplicação;
  // essa relação não é exposta por esta API e precisa ser conferida pelo admin.
  let resposta: Response;
  try {
    resposta = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${entrada.access_token}` },
    });
  } catch {
    throw erro(502, "VALIDACAO_INDISPONIVEL", "Não foi possível conferir o Access Token no Mercado Pago.");
  }
  if (!resposta.ok) throw erro(422, "TOKEN_MP_INVALIDO", "O Mercado Pago não aceitou o Access Token.");
  const usuario = await resposta.json() as { id?: number | string };
  if (!usuario.id) throw erro(502, "VALIDACAO_INDISPONIVEL", "O Mercado Pago não identificou a conta.");

  const id = novoId("mpa");
  const ts = agora();
  const [accessCifrado, webhookCifrado] = await Promise.all([
    cifrar(env, entrada.access_token),
    cifrar(env, entrada.webhook_secret),
  ]);
  await db.batch([
    db.prepare("UPDATE contas_pagamento SET ativo = 0 WHERE ativo = 1"),
    db.prepare(`INSERT INTO contas_pagamento
      (id, nome, public_key, access_token_cifrado, webhook_secret_cifrado,
       mercado_pago_user_id, ativo, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)`)
      .bind(id, entrada.nome, entrada.public_key, accessCifrado, webhookCifrado, String(usuario.id), ts),
    db.prepare(`INSERT INTO auditoria
      (id, actor_type, actor_identifier, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?1, 'ADMIN', ?2, 'CONTA_PAGAMENTO_ALTERADA', 'CONTA_PAGAMENTO', ?3, ?4, ?5)`)
      .bind(novoId("aud"), adminEmail, id, JSON.stringify({ nome: entrada.nome, user_id: String(usuario.id) }), ts),
  ]);
  return resumoContaPagamento(db, env);
}
