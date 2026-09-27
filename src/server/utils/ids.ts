/** Identificadores curtos e legíveis nos logs. Sem dependência externa. */
export function novoId(prefixo: string): string {
  return `${prefixo}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function agora(): string {
  return new Date().toISOString();
}

export function somarMinutos(iso: string, minutos: number): string {
  return new Date(new Date(iso).getTime() + minutos * 60_000).toISOString();
}

/** Código curto para digitação no balcão, sem caracteres ambíguos. */
export function gerarCodigoRetirada(): string {
  const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `RET-${[...bytes].map((b) => alfabeto[b % alfabeto.length]).join("")}`;
}
