/**
 * O token de retirada é o único segredo que circula fora do servidor:
 * ele vai dentro do QR Code, na tela do comprador.
 *
 * 32 bytes de `crypto.getRandomValues` em base64url. O banco guarda só o
 * SHA-256 — aqui SHA-256 puro está correto, e vale entender por quê:
 * com 256 bits de entropia não existe dicionário nem tabela pré-computada
 * a atacar. (É o oposto do CPF, que tem só ~1,45 bilhão de valores válidos
 * e por isso exige HMAC com pepper — ver ARQUITETURA §1.3.)
 */

function paraBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Token do QR de retirada, derivado em vez de armazenado.
 *
 *   token = HMAC-SHA256(QR_TOKEN_SECRET, pedido_id || ':' || nonce)
 *
 * A entropia vem da chave, que vive só como Secret do Worker. O nonce
 * fica em claro no banco e não precisa ser segredo. A vantagem: o
 * comprador pode pedir o token de volta quando quiser (trocou de
 * celular, limpou o histórico) e mesmo assim um vazamento do D1 não
 * produz nenhum QR válido.
 */
export async function derivarTokenRetirada(
  segredo: string,
  pedidoId: string,
  nonce: string,
): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(`${pedidoId}:${nonce}`),
  );
  return paraBase64Url(new Uint8Array(assinatura));
}

/** Valor aleatório público, guardado em claro junto do token derivado. */
export function gerarNonce(): string {
  return paraBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export function gerarTokenRetirada(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(valor: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Comparação em tempo constante. Usada no token do admin em
 * desenvolvimento; em produção quem autentica é o Cloudflare Access.
 */
export function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
