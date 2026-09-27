import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

/**
 * Leitor de QR pela câmera.
 *
 * Pede a câmera traseira com `facingMode: environment`. O spike S2 do plano
 * existe justamente para confirmar isso em PWA instalado no iOS antes de
 * a Fase 7 depender do componente.
 *
 * Se a câmera não abrir, cai para entrada manual em vez de travar o
 * atendimento — uma fila parada é pior do que digitar um código.
 */
export function Scanner({
  aoLer,
  ativo,
}: {
  aoLer: (texto: string) => void;
  ativo: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const controles = useRef<IScannerControls | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo || !video.current) return;
    let cancelado = false;
    const leitor = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 200 });

    leitor
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        video.current,
        (resultado) => {
          if (resultado && !cancelado) aoLer(resultado.getText());
        },
      )
      .then((c) => {
        if (cancelado) c.stop();
        else controles.current = c;
      })
      .catch((e) => {
        console.error(e);
        setErro(
          e?.name === "NotAllowedError"
            ? "Permissão de câmera negada. Libere no navegador ou use o código manual."
            : "Não foi possível abrir a câmera. Use o código manual.",
        );
      });

    return () => {
      cancelado = true;
      controles.current?.stop();
      controles.current = null;
    };
  }, [ativo, aoLer]);

  if (erro) {
    return (
      <div className="rounded-lg border border-alerta/25 bg-alerta/5 px-4 py-3 text-sm text-alerta">
        {erro}
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black sm:aspect-square">
      <video ref={video} className="h-full min-h-[55dvh] w-full object-cover sm:min-h-0" muted playsInline />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="relative aspect-square w-[72%] max-w-80 rounded-2xl border-4 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.38)]">
          <span className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">Centralize o QR aqui</span>
        </div>
      </div>
    </div>
  );
}
