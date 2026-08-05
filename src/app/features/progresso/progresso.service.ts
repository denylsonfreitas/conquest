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
        anulada: questao?.anulada ?? false,
      };
    });
  }
}
