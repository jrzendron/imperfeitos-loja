const medidas = [
  { tamanho: "PP", altura: 66, largura: 47 },
  { tamanho: "P", altura: 68, largura: 51 },
  { tamanho: "M", altura: 71, largura: 54 },
  { tamanho: "G", altura: 73, largura: 57 },
  { tamanho: "GG", altura: 75, largura: 60 },
  { tamanho: "XG", altura: 78, largura: 63 },
  { tamanho: "G2", altura: 83, largura: 67 },
  { tamanho: "G3", altura: 87, largura: 71 },
];

export function TabelaMedidas() {
  return (
    <section className="tabela-medidas" aria-labelledby="titulo-medidas">
      <div className="tabela-medidas-intro">
        <p className="flow-kicker">Escolha com mais segurança</p>
        <h2 id="titulo-medidas" className="flow-titulo-secao">Tabela de medidas</h2>
        <p>Medidas em centímetros da camiseta convencional. A altura vai da gola até a barra; a largura é medida de uma lateral à outra, com a peça estendida.</p>
      </div>
      <div className="tabela-medidas-rolagem">
        <table>
          <thead>
            <tr><th scope="col">Tamanho</th><th scope="col">Altura</th><th scope="col">Largura</th></tr>
          </thead>
          <tbody>
            {medidas.map((item) => <tr key={item.tamanho}><th scope="row">{item.tamanho}</th><td>{item.altura} cm</td><td>{item.largura} cm</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="tabela-medidas-nota">A tabela enviada identifica o tamanho XG. A correspondência com o G1 da loja ainda precisa ser confirmada.</p>
    </section>
  );
}
