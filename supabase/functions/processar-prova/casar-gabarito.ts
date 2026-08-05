import { normalizar } from './identificar-prova.ts';
import type { IdentificacaoProva } from './identificar-prova.ts';

const TITULO_BLOCO = /^(.+?)\s+[–-]\s+PROVA\s+TIPO\s+(\d+)\s*$/i;
const LINHA_NUMEROS = /^\s*\d+(?:\s+\d+)+\s*$/;
const LINHA_LETRAS = /^\s*[A-E](?:\s+[A-E])+\s*$/i;

export interface BlocoGabarito {
  readonly cargo: string;
  readonly tipo: number;
  readonly respostas: ReadonlyMap<number, string>;
}

export type ResultadoCasamento =
  | { readonly aplicavel: true; readonly respostas: ReadonlyMap<number, string> }
  | { readonly aplicavel: false; readonly motivo: string };

export function lerBlocos(textoGabarito: string): BlocoGabarito[] {
  const linhas = textoGabarito.split('\n');
  const blocos: BlocoGabarito[] = [];

  let atual: { cargo: string; tipo: number; respostas: Map<number, string> } | null = null;
  let numerosPendentes: number[] | null = null;

  for (const linha of linhas) {
    const titulo = TITULO_BLOCO.exec(linha.trim());
    if (titulo) {
      if (atual) blocos.push(atual);
      atual = { cargo: titulo[1].trim(), tipo: Number(titulo[2]), respostas: new Map() };
      numerosPendentes = null;
      continue;
    }

    if (!atual) continue;

    const conteudo = linha.trim();
    if (LINHA_NUMEROS.test(conteudo)) {
      numerosPendentes = conteudo.split(/\s+/).map(Number);
      continue;
    }

    if (LINHA_LETRAS.test(conteudo) && numerosPendentes) {
      const letras = conteudo.toUpperCase().split(/\s+/);
      if (letras.length === numerosPendentes.length) {
        numerosPendentes.forEach((n, i) => atual!.respostas.set(n, letras[i]));
      }
      numerosPendentes = null;
    }
  }

  if (atual) blocos.push(atual);
  return blocos;
}

export function casarGabarito(
  textoGabarito: string,
  identificacao: IdentificacaoProva,
  totalQuestoes: number,
): ResultadoCasamento {
  if (!identificacao.cargo || identificacao.tipo === null) {
    return {
      aplicavel: false,
      motivo: 'Não foi possível identificar cargo e tipo da prova para escolher o gabarito.',
    };
  }

  const blocos = lerBlocos(textoGabarito);
  if (blocos.length === 0) {
    return { aplicavel: false, motivo: 'Nenhum bloco de gabarito reconhecido no PDF.' };
  }

  const alvoCargo = normalizar(identificacao.cargo);
  const candidatos = blocos.filter(
    (b) => normalizar(b.cargo) === alvoCargo && b.tipo === identificacao.tipo,
  );

  if (candidatos.length === 0) {
    return {
      aplicavel: false,
      motivo: `Nenhum bloco de gabarito para "${identificacao.cargo}" tipo ${identificacao.tipo} (o PDF tem ${blocos.length} blocos).`,
    };
  }

  if (candidatos.length > 1) {
    return {
      aplicavel: false,
      motivo: `${candidatos.length} blocos de gabarito casam com "${identificacao.cargo}" tipo ${identificacao.tipo}. Ambíguo demais para aplicar.`,
    };
  }

  const bloco = candidatos[0];
  if (bloco.respostas.size !== totalQuestoes) {
    return {
      aplicavel: false,
      motivo: `O gabarito tem ${bloco.respostas.size} respostas, mas a extração encontrou ${totalQuestoes} questões. Contagens divergentes — gabarito não aplicado.`,
    };
  }

  return { aplicavel: true, respostas: bloco.respostas };
}
