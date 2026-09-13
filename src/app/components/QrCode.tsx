import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/** Desenha o QR no cliente. Nada de gerar imagem no servidor à toa. */
export function QrCode({ valor, tamanho = 260 }: { valor: string; tamanho?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    QRCode.toCanvas(canvas.current, valor, {
      width: tamanho,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#10201E", light: "#FFFFFF" },
    }).catch((e) => console.error("Falha ao desenhar o QR:", e));
  }, [valor, tamanho]);

  return (
    <canvas
      ref={canvas}
      width={tamanho}
      height={tamanho}
      className="h-auto max-w-full rounded-lg"
      aria-label="QR Code de retirada"
    />
  );
}
