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
    <div className="relative overflow-hidden rounded-xl bg-tinta">
      <video ref={video} className="aspect-square w-full max-w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-3/5 w-3/5 rounded-lg border-2 border-white/70" />
      </div>
    </div>
  );
}
