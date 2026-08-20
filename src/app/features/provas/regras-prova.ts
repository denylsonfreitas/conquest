import { StatusProva } from '../../shared/models';

export interface ProvaParaRegra {
  readonly status: StatusProva;
  readonly arquivo_path: string | null;
}

// Três minutos não é chute: a Edge Function trabalha com orçamento de ~110s e
// a plataforma a encerra pouco depois disso. Passados três minutos, ela não
// está lenta — está morta, e ninguém mais vai gravar o desfecho. Dez minutos
// só faziam a pessoa esperar por algo que não vinha.
export const MINUTOS_ATE_TRAVADA = 3;

export interface ProvaEmProcessamento {
  readonly status: StatusProva;
  readonly processando_desde: string | null;
}

export function podeProcessar(prova: ProvaParaRegra, temQuestaoRevisada = false): boolean {
  if (prova.arquivo_path === null) return false;
  if (prova.status === 'pendente' || prova.status === 'erro') return true;
  return prova.status === 'aguardando_revisao' && !temQuestaoRevisada;
}

export function estaTravada(prova: ProvaEmProcessamento, agora: Date = new Date()): boolean {
  if (prova.status !== 'processando' || !prova.processando_desde) return false;
  const minutos = (agora.getTime() - new Date(prova.processando_desde).getTime()) / 60_000;
  return minutos >= MINUTOS_ATE_TRAVADA;
}

export function minutosProcessando(
  prova: ProvaEmProcessamento,
  agora: Date = new Date(),
): number | null {
  if (!prova.processando_desde) return null;
  return Math.floor((agora.getTime() - new Date(prova.processando_desde).getTime()) / 60_000);
}

export function podeAnexarPdf(status: StatusProva): boolean {
  return status === 'pendente' || status === 'erro';
}

export function motivoBloqueioAnexo(status: StatusProva): string | null {
  if (podeAnexarPdf(status)) return null;
  return status === 'processando'
    ? 'A prova está sendo processada. Aguarde para trocar o PDF.'
    : 'A prova já foi extraída. Trocar o PDF invalidaria as questões existentes.';
}

export function rotuloStatusProva(prova: ProvaParaRegra): string {
  if (prova.status === 'pendente') {
    return prova.arquivo_path ? 'Aguardando processamento' : 'Sem PDF';
  }

  const rotulos: Record<Exclude<StatusProva, 'pendente'>, string> = {
    processando: 'Processando',
    aguardando_revisao: 'Aguardando revisão',
    pronta: 'Pronta',
    erro: 'Erro',
  };
  return rotulos[prova.status];
}

export function corStatusProva(prova: ProvaParaRegra): string {
  if (prova.status === 'pendente') {
    return prova.arquivo_path
      ? 'bg-info-fundo text-info ring-info'
      : 'bg-superficie-sutil text-texto-fraco ring-borda';
  }

  const cores: Record<Exclude<StatusProva, 'pendente'>, string> = {
    processando: 'bg-info-fundo text-info ring-info',
    aguardando_revisao: 'bg-atencao-fundo text-atencao ring-atencao',
    pronta: 'bg-sucesso-fundo text-sucesso ring-sucesso',
    erro: 'bg-perigo-fundo text-perigo ring-perigo',
  };
  return cores[prova.status];
}

export function caminhoPdf(concursoId: string, provaId: string): string {
  return `${concursoId}/${provaId}.pdf`;
}

export function caminhoGabarito(concursoId: string, provaId: string): string {
  return `${concursoId}/${provaId}-gabarito.pdf`;
}

/**
 * Enquanto a extração roda na Edge Function, o estado real só existe no banco:
 * a aba pode ter perdido a resposta, o cliente pode ter desistido antes, e a
 * função continua até gravar o desfecho. Sem reconsultar, o cartão congela no
 * "processando" e só um F5 revela que já havia falhado.
 *
 * Para de valer quando a prova passa do limite de travada: aí a tela já oferece
 * Destravar, e insistir seria consultar para sempre uma prova que ninguém vai
 * terminar.
 */
export function valeReconsultar(
  provas: readonly ProvaEmProcessamento[],
  agora: Date = new Date(),
): boolean {
  return provas.some((p) => p.status === 'processando' && !estaTravada(p, agora));
}
