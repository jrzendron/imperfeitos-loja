import type { VariacaoPublica } from "../../shared/types";

function formatarMedida(valor: number | null): string {
  return valor === null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor)} cm`;
}

export function TabelaMedidas({ variacoes, categoria }: {
  variacoes: VariacaoPublica[];
  categoria: "ADULTO" | "INFANTIL";
}) {
  const medidas = variacoes.filter((v) =>
    v.categoria === categoria && v.altura_cm !== null && v.largura_cm !== null,
  );
  if (medidas.length === 0) return null;

  return (
    <section className="tabela-medidas" aria-labelledby="titulo-medidas">
      <div className="tabela-medidas-intro">
        <p className="flow-kicker">Escolha com mais segurança</p>
        <h2 id="titulo-medidas" className="flow-titulo-secao">Medidas · {categoria === "INFANTIL" ? "Infantil" : "Adulto"}</h2>
        <p>Medidas em centímetros da peça estendida. A altura vai da gola até a barra; a largura é medida de uma lateral à outra.</p>
      </div>
      <div className="tabela-medidas-rolagem">
        <table>
          <thead>
            <tr><th scope="col">Tamanho</th><th scope="col">Altura</th><th scope="col">Largura</th></tr>
          </thead>
          <tbody>
            {medidas.map((item) => <tr key={item.id}><th scope="row">{item.nome}</th><td>{formatarMedida(item.altura_cm)}</td><td>{formatarMedida(item.largura_cm)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
