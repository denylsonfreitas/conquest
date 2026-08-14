import { normalizar } from './identificar-prova.ts';

export interface BancaConhecida {
  readonly id: string;
  readonly nome: string;
}

// A mesma forma está declarada em src/app/shared/schema.ts, como
// SugestaoConcursoSchema, e o front valida a resposta contra ela. Não dá para
// importar de lá: models.ts importa './schema' sem extensão, e o Deno exige
// extensão explícita — só schema.ts atravessa. A validação na volta é o que
// impede as duas declarações de divergirem em silêncio.
export interface SugestaoConcurso {
  readonly banca_id: string | null;
  readonly banca_nome: string | null;
  readonly orgao: string | null;
}

const SEM_SUGESTAO: SugestaoConcurso = { banca_id: null, banca_nome: null, orgao: null };

const RUIDO_DE_RODAPE = /\s*GABARITO\s+\d+\s*$|\s*TIPO\s+\d+\s*$/i;
const SO_SIMBOLOS = /^[\d\s\W_]+$/;

const MIN_CARACTERES = 4;
const MAX_CARACTERES = 90;
const MIN_REPETICOES = 2;

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A banca é nomeada em caixa alta no cabeçalho da prova ("FUNDAÇÃO CESGRANRIO",
// "A FGV coletará"). Exigir isso não é preciosismo: sem a exigência, uma banca
// chamada "Outra" casaria com a palavra "outra" em qualquer enunciado.
function ocorrenciasEmCaixaAlta(texto: string, nome: string): number {
  const padrao = new RegExp(`(?<![\\p{L}\\d])${escapar(nome)}(?![\\p{L}\\d])`, 'giu');
  let quantas = 0;

  for (const achado of texto.matchAll(padrao)) {
    const trecho = achado[0];
    if (trecho === trecho.toLocaleUpperCase('pt-BR')) quantas++;
  }

  return quantas;
}

export function identificarBanca(
  texto: string,
  bancas: readonly BancaConhecida[],
): BancaConhecida | null {
  let melhor: { banca: BancaConhecida; quantas: number } | null = null;

  for (const banca of bancas) {
    const quantas = ocorrenciasEmCaixaAlta(texto, banca.nome);
    if (quantas === 0) continue;
    if (!melhor || quantas > melhor.quantas) melhor = { banca, quantas };
  }

  return melhor?.banca ?? null;
}

// O órgão não vem rotulado em lugar nenhum, mas se repete: é o cabeçalho ou o
// rodapé impresso em toda página. A linha mais frequente que parece nome de
// órgão é o melhor palpite disponível — e por ser palpite, quem decide é a
// revisão humana, não este código.
export function identificarOrgao(texto: string, banca: BancaConhecida | null): string | null {
  const vezes = new Map<string, number>();

  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim().replace(RUIDO_DE_RODAPE, '').trim();

    if (linha.length < MIN_CARACTERES || linha.length > MAX_CARACTERES) continue;
    if (SO_SIMBOLOS.test(linha)) continue;
    if (linha !== linha.toLocaleUpperCase('pt-BR')) continue;

    vezes.set(linha, (vezes.get(linha) ?? 0) + 1);
  }

  const candidatas = [...vezes.entries()]
    .filter(([, quantas]) => quantas >= MIN_REPETICOES)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  const escolhida = candidatas[0]?.[0];
  if (!escolhida) return null;

  return limpar(escolhida, banca);
}

// O rodapé costuma emendar o órgão com a banca e com o que vem depois dela
// ("... - DATAPREV FGV CONHECIMENTO"). Cortar a partir do nome da banca devolve
// o órgão sozinho.
function limpar(linha: string, banca: BancaConhecida | null): string | null {
  let limpa = linha;

  if (banca) {
    const corte = new RegExp(`\\s*(?<![\\p{L}\\d])${escapar(banca.nome)}(?![\\p{L}\\d]).*$`, 'iu');
    limpa = limpa.replace(corte, '');
  }

  limpa = limpa
    .replace(/^\d+\s*/, '')
    .replace(/\s*\d+$/, '')
    .replace(/[\s\-–—:]+$/, '')
    .trim();

  return limpa.length >= MIN_CARACTERES ? limpa : null;
}

export function identificarConcurso(
  texto: string,
  bancas: readonly BancaConhecida[],
): SugestaoConcurso {
  if (!texto.trim()) return SEM_SUGESTAO;

  const banca = identificarBanca(texto, bancas);
  const orgao = identificarOrgao(texto, banca);

  return {
    banca_id: banca?.id ?? null,
    banca_nome: banca?.nome ?? null,
    orgao,
  };
}

export { normalizar };
