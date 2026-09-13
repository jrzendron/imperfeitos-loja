import type { ImagemPublica } from "../../shared/types";

/**
 * Mostra a primeira foto do produto; sem foto cadastrada, cai no desenho
 * genérico. O placeholder existe para o catálogo não ficar com buracos
 * enquanto ninguém subiu imagem — e para a altura não pular quando subir.
 */
export function FotoProduto({
  imagens,
  nome,
  className = "",
}: {
  imagens: ImagemPublica[];
  nome: string;
  className?: string;
}) {
  const foto = imagens[0];

  if (foto) {
    return (
      <img
        src={foto.url}
        alt={foto.alt ?? nome}
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div className={`grid h-full w-full place-items-center bg-marca-50 text-marca-600 ${className}`}>
      <svg viewBox="0 0 120 120" className="h-20 w-20" aria-hidden="true">
        <path d="M38 34h44l-4 54H42z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
        <path d="M49 34a11 11 0 0 0 22 0" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
