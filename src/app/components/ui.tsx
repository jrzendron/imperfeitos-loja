import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { STATUS_LABEL, type StatusPedido } from "../../shared/types";
import { useCarrinho } from "../lib/carrinho";

export function Cabecalho({ admin = false }: { admin?: boolean }) {
  const itens = useCarrinho();
  const total = itens.reduce((s, i) => s + i.quantidade, 0);

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/90 shadow-[0_1px_20px_rgba(8,87,75,0.06)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="group flex items-center gap-3 text-tinta">
          <img
            src="/assets/logo-ipda-oficial.webp"
            alt="Igreja Pentecostal Deus é Amor"
            className="h-10 w-auto max-w-[190px] object-contain transition group-hover:scale-[1.02] sm:h-12 sm:max-w-[250px]"
          />
          <span className="hidden border-l border-linha pl-3 text-xs font-bold uppercase tracking-[0.16em] text-marca-700 sm:block">
            Loja
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {admin ? (
            <span className="etiqueta bg-marca-100 text-marca-700">Painel</span>
          ) : (
            <>
              <Link to="/meus-pedidos" className="rounded-full px-3 py-2 text-sm font-semibold text-marca-700 transition hover:bg-marca-50">
                <span className="sm:hidden">Pedidos</span><span className="hidden sm:inline">Meus pedidos</span>
              </Link>
              <Link
                to="/carrinho"
                className="relative rounded-full border border-marca-100 bg-marca-50 px-4 py-2 text-sm font-semibold text-marca-700 transition hover:border-marca-200 hover:bg-marca-100"
              >
                Carrinho
                {total > 0 && (
                  <span className="ml-1.5 rounded-full bg-marca-600 px-1.5 py-0.5 text-xs text-white">
                    {total}
                  </span>
                )}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Pagina({ children, admin }: { children: ReactNode; admin?: boolean }) {
  return (
    <div className="min-h-dvh">
      <Cabecalho admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

const CORES: Record<StatusPedido, string> = {
  AGUARDANDO_PAGAMENTO: "bg-alerta/10 text-alerta",
  PAGO: "bg-marca-100 text-marca-700",
  PRONTO_PARA_RETIRADA: "bg-marca-100 text-marca-700",
  RETIRADO: "bg-sucesso/10 text-sucesso",
  CANCELADO: "bg-linha text-suave",
  EXPIRADO: "bg-linha text-suave",
  REEMBOLSADO: "bg-linha text-suave",
  PAGO_REVISAR: "bg-perigo/10 text-perigo",
};

export function Etiqueta({ status }: { status: StatusPedido }) {
  return <span className={`etiqueta ${CORES[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Aviso({
  tipo = "info",
  titulo,
  children,
}: {
  tipo?: "info" | "alerta" | "erro" | "sucesso";
  titulo?: string;
  children: ReactNode;
}) {
  const estilos = {
    info: "border-marca-200 bg-marca-50 text-marca-900",
    alerta: "border-alerta/25 bg-alerta/5 text-alerta",
    erro: "border-perigo/25 bg-perigo/5 text-perigo",
    sucesso: "border-sucesso/25 bg-sucesso/5 text-sucesso",
  }[tipo];

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${estilos}`} role={tipo === "erro" ? "alert" : undefined}>
      {titulo && <p className="font-semibold">{titulo}</p>}
      <div className={titulo ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <p className="py-10 text-center text-sm text-suave">{texto}</p>;
}
