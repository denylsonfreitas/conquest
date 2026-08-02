import { StatusProva } from '../../shared/models';

/**
 * Regras de prova como funções PURAS (docs/04): sem Angular, sem banco, fáceis
 * de testar isoladamente. O service orquestra, estas funções decidem.
 */

/** O mínimo que estas regras precisam saber — não a linha inteira do banco. */
export interface ProvaParaRegra {
  readonly status: StatusProva;
  readonly arquivo_path: string | null;
}

/**
 * Depois de quantos minutos em 'processando' a prova é considerada travada.
 *
 * Generoso de propósito: a extração real leva ~1,5 min (LLM), e destravar uma
 * prova que ainda está viva apagaria trabalho em andamento. Errar para o lado
 * de esperar demais é barato; para o outro, não.
 */
export const MINUTOS_ATE_TRAVADA = 10;

export interface ProvaEmProcessamento {
  readonly status: StatusProva;
  readonly processando_desde: string | null;
}

/**
 * Pode disparar o processamento.
 *
 * `aguardando_revisao` entra na lista porque reprocessar é diferente de trocar
 * o PDF: é rodar o LLM de novo no MESMO arquivo, quando a extração saiu ruim.
 * Sem isso, a única saída seria apagar a prova e recomeçar.
 *
 * Mas reprocessar sobrescreve as questões, então só vale enquanto **nenhuma**
 * foi aprovada — curadoria já feita não pode ser apagada por um clique.
 * A partir de `pronta`, nunca.
 */
export function podeProcessar(prova: ProvaParaRegra, temQuestaoRevisada = false): boolean {
  if (prova.arquivo_path === null) return false;
  if (prova.status === 'pendente' || prova.status === 'erro') return true;
  return prova.status === 'aguardando_revisao' && !temQuestaoRevisada;
}

/**
 * Detecta o beco sem saída: a função morreu por timeout, OOM ou deploy, o
 * catch nunca rodou, e a prova ficou em 'processando' para sempre — o que
 * também bloqueia trocar o PDF pela regra de anexo.
 *
 * Sem o carimbo `processando_desde` não haveria como distinguir isso de um
 * processamento saudável.
 */
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

/**
 * Trocar o PDF só faz sentido antes de existir extração.
 *
 * A partir de 'processando' há questões penduradas naquele arquivo: trocar o
 * PDF deixaria as questões descrevendo um documento que não existe mais.
 */
export function podeAnexarPdf(status: StatusProva): boolean {
  return status === 'pendente' || status === 'erro';
}

/**
 * Rótulo curto para quando o anexo está bloqueado.
 *
 * "PDF travado" dizia o quê, não o porquê — e o porquê ficava só no `title`,
 * que ninguém vê. Aqui a saída para o impasse aparece no próprio rótulo.
 */
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

/**
 * Rótulo do status, DERIVADO do que já existe na linha — mesma filosofia da
 * coluna `elegivel` da view: nada de coluna nova para representar um estado
 * que os dados já contam.
 *
 * 'pendente' significa duas coisas diferentes conforme haja arquivo ou não, e
 * é justamente a distinção que importa para quem olha a lista.
 */
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
      ? 'bg-sky-50 text-sky-700 ring-sky-200'
      : 'bg-tinta-50 text-tinta-500 ring-tinta-200';
  }

  const cores: Record<Exclude<StatusProva, 'pendente'>, string> = {
    processando: 'bg-blue-50 text-blue-700 ring-blue-200',
    aguardando_revisao: 'bg-amber-50 text-amber-700 ring-amber-200',
    pronta: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    erro: 'bg-red-50 text-red-700 ring-red-200',
  };
  return cores[prova.status];
}

/**
 * Caminhos DETERMINÍSTICOS no bucket.
 *
 * Derivar do id (e não de um nome aleatório) é o que torna a retentativa
 * segura: subir de novo sobrescreve o mesmo objeto com `upsert`, em vez de
 * acumular arquivos órfãos a cada tentativa falha.
 */
export function caminhoPdf(concursoId: string, provaId: string): string {
  return `${concursoId}/${provaId}.pdf`;
}

export function caminhoGabarito(concursoId: string, provaId: string): string {
  return `${concursoId}/${provaId}-gabarito.pdf`;
}
