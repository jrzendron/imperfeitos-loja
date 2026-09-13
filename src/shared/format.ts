/** Centavos -> "R$ 45,00". Dinheiro nunca vira float no caminho. */
export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** "47999887766" -> "(47) 99988-7766" */
export function formatarTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

/** Mascarado por padrão nas listagens do admin (ARQUITETURA §35). */
export function mascararTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length < 6) return "•••";
  return `(${d.slice(0, 2)}) ${"•".repeat(d.length - 6)}-${d.slice(-4)}`;
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
