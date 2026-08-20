import { ExtracaoBruta, QuestaoBruta, TextoBaseBruto } from './questao-bruta.ts';

/**
 * Junta o que voltou de cada lote numa extração só.
 *
 * Os lotes são chamadas independentes, então cada um numera seus textos a
 * partir do zero e cada um pode ter visto o mesmo texto-base — dois problemas
 * que só existem porque a prova foi cortada, e que precisam morrer aqui, antes
 * de qualquer coisa chegar ao banco.
 */

const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Todo lote devolve "t1". Sem prefixar por lote, o texto do lote 2 sobrescreve
 * o do lote 1 e as questões passam a apontar para o texto errado — que é pior
 * que apontar para nenhum, porque ninguém percebe.
 */
function prefixar(idLocal: string, lote: number): string {
  return `L${lote}_${idLocal}`;
}

export function juntarLotes(porLote: readonly ExtracaoBruta[]): ExtracaoBruta {
  const textos: TextoBaseBruto[] = [];
  const questoes: QuestaoBruta[] = [];

  // Conteúdo normalizado -> id_local já publicado. O mesmo texto-base pode
  // aparecer em dois lotes quando as questões que o usam ficaram dos dois lados
  // do corte; gravá-lo duas vezes duplicaria o texto na revisão e no quiz.
  const idPorConteudo = new Map<string, string>();
  const idPorOriginal = new Map<string, string>();

  porLote.forEach((extracao, lote) => {
    for (const texto of extracao.textos ?? []) {
      const chave = normalizar(texto.conteudo ?? '');
      if (chave.length === 0) continue;

      const jaVisto = idPorConteudo.get(chave);
      if (jaVisto) {
        idPorOriginal.set(prefixar(texto.id_local, lote), jaVisto);
        continue;
      }

      const id = prefixar(texto.id_local, lote);
      idPorConteudo.set(chave, id);
      idPorOriginal.set(id, id);
      textos.push({ ...texto, id_local: id });
    }
  });

  const vistas = new Set<number>();

  porLote.forEach((extracao, lote) => {
    for (const questao of extracao.questoes ?? []) {
      // Uma questão só pode entrar uma vez. Números repetidos entre lotes
      // significam que o modelo extrapolou a faixa pedida; vale a primeira.
      if (vistas.has(questao.numero)) continue;
      vistas.add(questao.numero);

      const apontava = questao.texto_base;
      const resolvido = apontava ? (idPorOriginal.get(prefixar(apontava, lote)) ?? null) : null;

      questoes.push({ ...questao, texto_base: resolvido });
    }
  });

  questoes.sort((a, b) => a.numero - b.numero);
  return { textos, questoes };
}
