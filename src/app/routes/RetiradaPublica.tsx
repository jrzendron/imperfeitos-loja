import { Pagina } from "../components/ui";
import { useParams } from "@tanstack/react-router";

/**
 * Página que abre quando alguém aponta a câmera comum do celular para o QR.
 *
 * Não mostra nome, valor, nem número do pedido — nada que identifique a
 * pessoa (ARQUITETURA §18). Quem precisa dos dados é o atendente, e ele
 * chega neles pelo painel autenticado, não por esta tela.
 */
export function RetiradaPublica() {
  const { token } = useParams({ from: "/retirada/$token" });
  return (
    <Pagina>
      <div className="cartao mx-auto max-w-md p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-marca-100 text-marca-700">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-bold">Código de retirada</h1>
        {token.startsWith("RET-") && (
          <p className="mt-3 text-2xl font-extrabold tracking-widest text-marca-800">{token}</p>
        )}
        <p className="mt-2 text-suave">
          Apresente esta tela no ponto de retirada. O atendente vai confirmar o
          pagamento e escanear o código antes da entrega.
        </p>
      </div>
    </Pagina>
  );
}
