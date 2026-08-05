import { StatusProva } from '../../shared/models';

export interface ProvaParaRegra {
  readonly status: StatusProva;
  readonly arquivo_path: string | null;
}

export const MINUTOS_ATE_TRAVADA = 10;

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

export function rotuloBloqueioAnexo(status: StatusProva): string | null {
  if (podeAnexarPdf(status)) return null;
  return status === 'processando' ? 'Processando…' : 'Extraída — apague a prova para trocar o PDF';
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
    processando: 'bg-blue-50 text-blue-700 ring-blue-200',
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
