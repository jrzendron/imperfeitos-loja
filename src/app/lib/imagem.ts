/**
 * Redimensiona a foto NO NAVEGADOR, antes de subir.
 *
 * Uma foto de celular tem 4 a 8 MB e 4000 px de largura. Numa loja que
 * mostra a imagem em 400 px, subir isso é desperdício em três frentes:
 * o upload demora no 4G da igreja, ocupa o R2, e cada visita baixa
 * megabytes à toa.
 *
 * Convertendo para WebP com 1400 px de largura, a mesma foto costuma
 * ficar entre 80 e 200 KB — sem diferença visível no catálogo.
 */
const LARGURA_MAXIMA = 1400;
const QUALIDADE = 0.82;

export async function prepararImagem(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/")) {
    throw new Error("Escolha um arquivo de imagem.");
  }

  const bitmap = await criarBitmap(arquivo);
  const escala = Math.min(1, LARGURA_MAXIMA / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem neste navegador.");
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  if ("close" in bitmap) bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALIDADE),
  );

  // Navegador sem suporte a WebP no canvas: devolve o original e deixa o
  // servidor decidir. Melhor subir grande do que não subir.
  if (!blob) return arquivo;

  const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".webp";
  return new File([blob], nome, { type: "image/webp" });
}

async function criarBitmap(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(arquivo);
    } catch {
      /* alguns formatos falham aqui; cai no <img> */
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
