import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { STATUS_LABEL, type StatusPedido } from "../../shared/types";
import { useCarrinho } from "../lib/carrinho";

export function Cabecalho({ admin = false }: { admin?: boolean }) {
  const itens = useCarrinho();
  const total = itens.reduce((s, i) => s + i.quantidade, 0);

  return (
    <header className="cabecalho-loja sticky top-0 z-40 border-b border-white/10 bg-[#14110d] shadow-[0_1px_20px_rgba(0,0,0,0.18)]">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <Link to="/" className="group flex min-w-0 items-center gap-3 text-white">
          <img
            src="/assets/logo-expansao.png"
            alt="Expansão"
            className="h-7 w-auto max-w-[155px] object-contain transition group-hover:scale-[1.02] sm:h-9 sm:max-w-[220px]"
          />
          <span className="hidden border-l border-white/20 pl-3 text-xs font-bold uppercase tracking-[0.16em] text-white/70 sm:block">
            Flow Blumenau
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {admin ? (
            <span className="etiqueta bg-white/10 text-white">Painel</span>
          ) : (
            <>
              <Link to="/" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 md:inline-flex">Início</Link>
              <Link to="/meus-pedidos" className="rounded-full px-2 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 sm:px-3">
                <span className="sm:hidden">Pedidos</span><span className="hidden sm:inline">Meus pedidos</span>
              </Link>
              <Link
                to="/carrinho"
                className="relative rounded-full border border-[#d9a62b] bg-[#d9a62b] px-3 py-2 text-sm font-bold text-[#14110d] transition hover:bg-[#efc755] sm:px-4"
              >
                Carrinho
                {total > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#14110d] px-1.5 py-0.5 text-xs text-white">
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
  const caminho = useRouterState({ select: (estado) => estado.location.pathname });
  const destinoVoltar = caminho === "/checkout" ? "/carrinho" : "/";

  return (
    <div className="min-h-dvh">
      <Cabecalho admin={admin} />
      <main className={caminho === "/" ? "" : "mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"}>
        {caminho !== "/" && (
          <button
            type="button"
            className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-marca-700 transition hover:bg-marca-50"
            onClick={() => window.location.assign(destinoVoltar)}
          >
            <span aria-hidden="true">←</span> Voltar
          </button>
        )}
        {children}
      </main>
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
