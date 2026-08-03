import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { RespostaAnalisavel } from './regras-progresso';

interface LinhaResposta {
  questao_id: string;
  acertou: boolean;
  respondido_em: string;
}

interface LinhaQuestao {
  id: string;
  materia: string | null;
  banca_nome: string | null;
  anulada: boolean;
}

/**
 * Data access do progresso — read-only, sem exceção.
 *
 * Não existe tabela de estatística e não deve existir (docs/03): tudo é
 * derivado de `respostas` subindo a árvore. Esta tela não escreve nada.
 *
 * Duas consultas e a junção em memória, mesmo padrão e mesmo argumento do
 * passo 7: é o que deixa as regras serem funções puras testáveis sem banco.
 * Uma view agregadora ou uma RPC dariam o número pronto e esconderiam a regra
 * dos testes — e as regras aqui (o que conta, o que ranqueia, o que compara)
 * são exatamente a parte que precisa ser testável.
 *
 * ONDE ISSO DEIXA DE VALER: a alguns milhares de respostas continua trivial.
 * Passando de dezenas de milhares, a resposta é agregar no banco — não um
 * remendo no cliente.
 */
@Injectable({ providedIn: 'root' })
export class ProgressoService {
  private readonly supabase = inject(SupabaseService);

  async historico(): Promise<RespostaAnalisavel[]> {
    const [respostas, questoes] = await Promise.all([
      this.supabase.client.from('respostas').select('questao_id, acertou, respondido_em'),
      this.supabase.client.from('questoes_completas').select('id, materia, banca_nome, anulada'),
    ]);

    if (respostas.error) {
      throw new Error(`Não foi possível carregar o histórico: ${respostas.error.message}`);
    }
    if (questoes.error) {
      throw new Error(`Não foi possível carregar as questões: ${questoes.error.message}`);
    }

    const porId = new Map((questoes.data as LinhaQuestao[]).map((q) => [q.id, q]));

    return (respostas.data as LinhaResposta[]).map((r) => {
      const questao = porId.get(r.questao_id);
      return {
        questaoId: r.questao_id,
        acertou: r.acertou,
        respondidoEm: r.respondido_em,
        materia: questao?.materia ?? null,
        bancaNome: questao?.banca_nome ?? null,
        // Sem questão correspondente não há como saber; tratar como não
        // anulada mantém a resposta na conta em vez de sumir com ela em
        // silêncio. Na prática o CASCADE impede o caso.
        anulada: questao?.anulada ?? false,
      };
    });
  }
}
