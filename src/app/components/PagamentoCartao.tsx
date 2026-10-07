import { useEffect, useRef, useState } from "react";
import { api, ErroApi } from "../lib/api";
import { Aviso, Carregando } from "./ui";

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => {
      bricks: () => {
        create: (tipo: string, container: string, settings: unknown) => Promise<{ unmount: () => void }>;
      };
    };
    MP_DEVICE_SESSION_ID?: string;
  }
}

function carregarScript(src: string): Promise<void> {
  const existente = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existente?.dataset.carregado === "sim") return Promise.resolve();
  if (existente) {
    return new Promise((resolve, reject) => {
      existente.addEventListener("load", () => resolve(), { once: true });
      existente.addEventListener("error", () => reject(new Error("Falha ao carregar SDK.")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.carregado = "sim";
      resolve();
    };
    script.onerror = () => reject(new Error("Falha ao carregar SDK."));
    document.head.appendChild(script);
  });
}

export function PagamentoCartao({
  tokenPedido,
  valorCentavos,
  aoConcluir,
}: {
  tokenPedido: string;
  valorCentavos: number;
  aoConcluir: () => Promise<void>;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [processando, setProcessando] = useState(false);
  const controller = useRef<{ unmount: () => void } | null>(null);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const [{ mercado_pago_public_key }] = await Promise.all([
          api.configuracaoPagamentos(),
          carregarScript("https://sdk.mercadopago.com/js/v2"),
          carregarScript("https://www.mercadopago.com/v2/security.js?view=checkout"),
        ]);
        if (!mercado_pago_public_key) throw new Error("Public Key do Mercado Pago não configurada.");
        if (!window.MercadoPago) throw new Error("O formulário de cartão não pôde ser carregado.");
        const mp = new window.MercadoPago(mercado_pago_public_key, { locale: "pt-BR" });
        const brick = await mp.bricks().create("cardPayment", "cardPaymentBrick_container", {
          initialization: { amount: valorCentavos / 100 },
          customization: {
            visual: { style: { theme: "default" } },
            paymentMethods: { types: { excluded: ["debit_card", "prepaid_card"] } },
          },
          callbacks: {
            onReady: () => ativo && setPronto(true),
            onSubmit: async (formData: any, additionalData: any) => {
              setErro(null);
              setProcessando(true);
              try {
                const resultado = await api.pagarCartao(tokenPedido, {
                  attempt_id: crypto.randomUUID(),
                  token: formData.token,
                  payment_method_id: formData.payment_method_id,
                  payment_type_id: additionalData.paymentTypeId,
                  installments: Number(formData.installments),
                  payer: {
                    email: formData.payer.email,
                    identification: formData.payer.identification,
                  },
                  ...(window.MP_DEVICE_SESSION_ID ? { device_id: window.MP_DEVICE_SESSION_ID } : {}),
                });
                if (resultado.status === "RECUSADO") {
                  await aoConcluir();
                  throw new Error("Pagamento recusado. Confira os dados ou tente outro cartão.");
                }
                await aoConcluir();
              } catch (e) {
                setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Não foi possível processar o cartão.");
                throw e;
              } finally {
                setProcessando(false);
              }
            },
            onError: (e: unknown) => {
              console.error("Card Payment Brick", e);
              if (ativo) setErro("O formulário do Mercado Pago não conseguiu iniciar. Recarregue a página e tente novamente.");
            },
          },
        });
        if (ativo) controller.current = brick;
        else brick.unmount();
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível abrir o pagamento por cartão.");
      }
    })();

    return () => {
      ativo = false;
      controller.current?.unmount();
      controller.current = null;
    };
  }, [tokenPedido, valorCentavos, aoConcluir]);

  return (
    <section className="cartao mt-5 p-5">
      <h2 className="text-center font-bold">Pagar com cartão de crédito</h2>
      <p className="mt-1 text-center text-sm text-suave">
        Preencha os dados no formulário seguro do Mercado Pago.
      </p>
      {!pronto && !erro && <div className="mt-5"><Carregando /></div>}
      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      {processando && <div className="mt-4"><Aviso tipo="alerta">Processando pagamento…</Aviso></div>}
      <div id="cardPaymentBrick_container" className="mt-4" />
    </section>
  );
}
