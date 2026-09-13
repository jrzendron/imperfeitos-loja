import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi } from "../lib/api";
import { prepararImagem } from "../lib/imagem";
import { formatarBRL } from "../../shared/format";
import { gerarSlug } from "../../shared/schemas";
import { Aviso, Carregando } from "../components/ui";

interface Variacao {
  id: string;
  sku: string;
  nome: string;
  valor_centavos: number;
  ativo: number;
  ordem: number;
  quantidade_fisica: number;
  quantidade_reservada: number;
  disponivel: number;
  em_pedidos: number;
}
interface Imagem {
  id: string;
  url: string;
  alt_text: string | null;
  ordem: number;
}
interface Produto {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ativo: number;
  variacoes: Variacao[];
  imagens: Imagem[];
}

/** "45,90" ou "45.90" ou "4590"? Sempre em reais, vira centavos. */
function paraCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
const paraReais = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

export function AdminProdutos() {
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setProdutos((await api.admin.produtos()).produtos);
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof ErroApi ? e.message : "Falha ao carregar." });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const feedback = (tipo: "erro" | "sucesso", texto: string) => setAviso({ tipo, texto });

  if (!produtos) return <Carregando />;

  return (
    <>
      {aviso && (
        <div className="mb-4">
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        </div>
      )}

      {!criando ? (
        <button className="btn-primario w-full" onClick={() => setCriando(true)}>
          Novo produto
        </button>
      ) : (
        <FormularioProduto
          aoCancelar={() => setCriando(false)}
          aoSalvar={async (dados) => {
            await api.admin.criarProduto(dados);
            setCriando(false);
            feedback("sucesso", "Produto criado. Agora adicione os tamanhos e as fotos.");
            await carregar();
          }}
          aoFalhar={(m) => feedback("erro", m)}
        />
      )}

      {produtos.length === 0 && (
        <div className="mt-4">
          <Aviso>Nenhum produto cadastrado ainda.</Aviso>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {produtos.map((produto) => (
          <CartaoProduto
            key={produto.id}
            produto={produto}
            aoMudar={carregar}
            aoAvisar={feedback}
          />
        ))}
      </div>
    </>
  );
}

function FormularioProduto({
  inicial,
  aoSalvar,
  aoCancelar,
  aoFalhar,
}: {
  inicial?: Produto;
  aoSalvar: (dados: Record<string, unknown>) => Promise<void>;
  aoCancelar: () => void;
  aoFalhar: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [slug, setSlug] = useState(inicial?.slug ?? "");
  const [salvando, setSalvando] = useState(false);
  const slugAuto = slug || gerarSlug(nome);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await aoSalvar({
        nome: nome.trim(),
        descricao: descricao.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      });
    } catch (e) {
      aoFalhar(e instanceof ErroApi ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="cartao p-4">
      <div className="mb-3">
        <label className="rotulo" htmlFor="p-nome">Nome do produto</label>
        <input
          id="p-nome"
          className="campo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Camiseta do Encontro 2026"
          required
          minLength={3}
          autoFocus
        />
      </div>

      <div className="mb-3">
        <label className="rotulo" htmlFor="p-desc">Descrição</label>
        <textarea
          id="p-desc"
          className="campo min-h-24"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Malha penteada 30.1, gola careca. Modelagem unissex."
        />
        <p className="mt-1 text-xs text-suave">
          Vale escrever aqui a tabela de medidas — é o que mais reduz troca de tamanho.
        </p>
      </div>

      <div className="mb-4">
        <label className="rotulo" htmlFor="p-slug">Endereço na loja</label>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-suave">/produto/</span>
          <input
            id="p-slug"
            className="campo flex-1"
            value={slug}
            onChange={(e) => setSlug(gerarSlug(e.target.value))}
            placeholder={slugAuto || "camiseta-do-encontro-2026"}
          />
        </div>
        <p className="mt-1 text-xs text-suave">
          Deixe vazio para gerar a partir do nome. Depois que o produto tiver pedidos, mudar
          o endereço quebra os links já compartilhados.
        </p>
      </div>

      <div className="flex gap-2">
        <button className="btn-primario !py-2 !text-sm" disabled={salvando || nome.trim().length < 3}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="btn-secundario !py-2 !text-sm" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CartaoProduto({
  produto,
  aoMudar,
  aoAvisar,
}: {
  produto: Produto;
  aoMudar: () => Promise<void>;
  aoAvisar: (tipo: "erro" | "sucesso", texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [aberto, setAberto] = useState(false);

  async function alternarAtivo() {
    try {
      await api.admin.editarProduto(produto.id, { ativo: produto.ativo !== 1 });
      aoAvisar("sucesso", produto.ativo === 1 ? "Produto escondido da loja." : "Produto publicado.");
      await aoMudar();
    } catch (e) {
      aoAvisar("erro", e instanceof ErroApi ? e.message : "Falha ao alterar.");
    }
  }

  return (
    <div className={`cartao p-4 ${produto.ativo === 1 ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="h-16 w-16 flex-none overflow-hidden rounded-lg border border-linha">
          {produto.imagens[0] ? (
            <img src={produto.imagens[0].url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-marca-50 text-xs text-marca-600">
              sem foto
            </div>
          )}
        </div>

        <div className="min-w-40 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{produto.nome}</span>
            {produto.ativo === 1 ? (
              <span className="etiqueta bg-marca-100 text-marca-700">Na loja</span>
            ) : (
              <span className="etiqueta bg-linha text-suave">Escondido</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-suave">/produto/{produto.slug}</p>
          <p className="mt-1 text-sm text-suave">
            {produto.variacoes.length} tamanho(s) ·{" "}
            {produto.variacoes.reduce((s, v) => s + v.disponivel, 0)} disponíveis ·{" "}
            {produto.imagens.length} foto(s)
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secundario !py-2 !text-sm" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Fechar" : "Tamanhos e fotos"}
        </button>
        <button className="btn-secundario !py-2 !text-sm" onClick={() => setEditando((v) => !v)}>
          Editar
        </button>
        <button className="btn-secundario !py-2 !text-sm" onClick={alternarAtivo}>
          {produto.ativo === 1 ? "Esconder da loja" : "Publicar na loja"}
        </button>
      </div>

      {editando && (
        <div className="mt-3">
          <FormularioProduto
            inicial={produto}
            aoCancelar={() => setEditando(false)}
            aoFalhar={(m) => aoAvisar("erro", m)}
            aoSalvar={async (dados) => {
              await api.admin.editarProduto(produto.id, dados);
              setEditando(false);
              aoAvisar("sucesso", "Produto atualizado.");
              await aoMudar();
            }}
          />
        </div>
      )}

      {aberto && (
        <>
          <Tamanhos produto={produto} aoMudar={aoMudar} aoAvisar={aoAvisar} />
          <Fotos produto={produto} aoMudar={aoMudar} aoAvisar={aoAvisar} />
        </>
      )}
    </div>
  );
}

function Tamanhos({
  produto,
  aoMudar,
  aoAvisar,
}: {
  produto: Produto;
  aoMudar: () => Promise<void>;
  aoAvisar: (tipo: "erro" | "sucesso", texto: string) => void;
}) {
  const [novoNome, setNovoNome] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoEstoque, setNovoEstoque] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    const centavos = paraCentavos(novoValor);
    if (!novoNome.trim() || centavos === null) {
      return aoAvisar("erro", "Informe o tamanho e um valor válido.");
    }
    setSalvando(true);
    try {
      await api.admin.criarVariacao(produto.id, {
        nome: novoNome.trim().toUpperCase(),
        valor_centavos: centavos,
        ordem: produto.variacoes.length + 1,
        estoque_inicial: Number(novoEstoque) || 0,
      });
      setNovoNome("");
      setNovoValor("");
      setNovoEstoque("");
      aoAvisar("sucesso", "Tamanho adicionado.");
      await aoMudar();
    } catch (e) {
      aoAvisar("erro", e instanceof ErroApi ? e.message : "Falha ao adicionar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mt-4 border-t border-linha pt-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-suave">Tamanhos</h4>

      <ul className="mt-2 divide-y divide-linha">
        {produto.variacoes.map((v) => (
          <LinhaTamanho key={v.id} variacao={v} aoMudar={aoMudar} aoAvisar={aoAvisar} />
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="campo w-20"
          placeholder="GG"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          aria-label="Tamanho"
        />
        <input
          className="campo w-28"
          placeholder="45,00"
          inputMode="decimal"
          value={novoValor}
          onChange={(e) => setNovoValor(e.target.value)}
          aria-label="Preço em reais"
        />
        <input
          className="campo w-24"
          placeholder="qtd."
          inputMode="numeric"
          value={novoEstoque}
          onChange={(e) => setNovoEstoque(e.target.value)}
          aria-label="Estoque inicial"
        />
        <button className="btn-primario !py-2 !text-sm" disabled={salvando} onClick={adicionar}>
          Adicionar
        </button>
      </div>
      <p className="mt-1.5 text-xs text-suave">Preço em reais, com vírgula. A quantidade entra como carga inicial.</p>
    </section>
  );
}

function LinhaTamanho({
  variacao,
  aoMudar,
  aoAvisar,
}: {
  variacao: Variacao;
  aoMudar: () => Promise<void>;
  aoAvisar: (tipo: "erro" | "sucesso", texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(paraReais(variacao.valor_centavos));

  async function salvarPreco() {
    const centavos = paraCentavos(valor);
    if (centavos === null) return aoAvisar("erro", "Valor inválido.");
    try {
      await api.admin.editarVariacao(variacao.id, { valor_centavos: centavos });
      setEditando(false);
      aoAvisar("sucesso", "Preço atualizado. Pedidos antigos mantêm o valor que tinham.");
      await aoMudar();
    } catch (e) {
      aoAvisar("erro", e instanceof ErroApi ? e.message : "Falha ao salvar.");
    }
  }

  async function alternar() {
    try {
      await api.admin.editarVariacao(variacao.id, { ativo: variacao.ativo !== 1 });
      await aoMudar();
    } catch (e) {
      aoAvisar("erro", e instanceof ErroApi ? e.message : "Falha ao alterar.");
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="min-w-10 flex-none text-lg font-bold">{variacao.nome}</span>

      {editando ? (
        <>
          <input
            className="campo w-28 !py-1.5"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            autoFocus
          />
          <button className="btn-primario !px-3 !py-1.5 !text-sm" onClick={salvarPreco}>
            Salvar
          </button>
          <button className="btn-secundario !px-3 !py-1.5 !text-sm" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </>
      ) : (
        <button
          className="font-semibold tabular-nums underline decoration-linha underline-offset-4 hover:decoration-marca-500"
          onClick={() => setEditando(true)}
          title="Clique para mudar o preço"
        >
          {formatarBRL(variacao.valor_centavos)}
        </button>
      )}

      <span className="text-sm tabular-nums text-suave">
        {variacao.disponivel} disp.
        {variacao.quantidade_reservada > 0 && ` · ${variacao.quantidade_reservada} reservada(s)`}
      </span>

      <button
        className="ml-auto text-sm font-semibold text-suave hover:text-tinta"
        onClick={alternar}
      >
        {variacao.ativo === 1 ? "Desativar" : "Ativar"}
      </button>
    </li>
  );
}

function Fotos({
  produto,
  aoMudar,
  aoAvisar,
}: {
  produto: Produto;
  aoMudar: () => Promise<void>;
  aoAvisar: (tipo: "erro" | "sucesso", texto: string) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])];
    if (arquivos.length === 0) return;
    setEnviando(true);
    try {
      for (const bruto of arquivos) {
        // Encolhe antes de subir — ver lib/imagem.ts.
        const pronto = await prepararImagem(bruto);
        await api.admin.enviarImagem(produto.id, pronto);
      }
      aoAvisar("sucesso", `${arquivos.length} foto(s) enviada(s).`);
      await aoMudar();
    } catch (err) {
      aoAvisar("erro", err instanceof ErroApi ? err.message : String((err as Error)?.message ?? err));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function remover(id: string) {
    try {
      await api.admin.removerImagem(id);
      aoAvisar("sucesso", "Foto removida.");
      await aoMudar();
    } catch (e) {
      aoAvisar("erro", e instanceof ErroApi ? e.message : "Falha ao remover.");
    }
  }

  return (
    <section className="mt-4 border-t border-linha pt-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-suave">Fotos</h4>

      {produto.imagens.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {produto.imagens.map((img, n) => (
            <li key={img.id} className="relative">
              <img
                src={img.url}
                alt=""
                className="h-24 w-24 rounded-lg border border-linha object-cover"
              />
              {n === 0 && (
                <span className="absolute left-1 top-1 rounded bg-marca-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  capa
                </span>
              )}
              <button
                onClick={() => remover(img.id)}
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-linha bg-white text-sm font-bold text-perigo shadow-sm"
                aria-label="Remover foto"
                title="Remover foto"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={escolher}
      />
      <button
        className="btn-secundario mt-3 !py-2 !text-sm"
        disabled={enviando}
        onClick={() => entrada.current?.click()}
      >
        {enviando ? "Enviando…" : produto.imagens.length ? "Adicionar mais fotos" : "Adicionar foto"}
      </button>
      <p className="mt-1.5 text-xs text-suave">
        A primeira foto é a capa no catálogo. As imagens são reduzidas no seu
        navegador antes de subir, então pode escolher direto da galeria do celular.
      </p>
    </section>
  );
}
