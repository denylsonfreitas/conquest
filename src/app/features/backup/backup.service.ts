import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import {
  acharPonteirosOrfaos,
  Backup,
  BackupSchema,
  montarPrevia,
  ORDEM_IMPORTACAO,
  Previa,
  TabelaBackup,
  VERSAO_BACKUP,
} from './formato-backup';

/**
 * Export e import do acervo — o seguro contra perda do docs/03.
 *
 * Export sem import seria teatro de backup: a sensação de estar protegido sem
 * a proteção, descoberta no pior dia possível. Por isso os dois vivem aqui.
 *
 * O import é **upsert por UUID e nunca apaga**. Duas consequências:
 *
 * - É idempotente: rodar duas vezes dá o mesmo resultado que rodar uma. É o
 *   que substitui a atomicidade — o PostgREST não dá transação entre tabelas,
 *   então um import que falha no meio não é desfeito, mas é RETOMÁVEL: roda de
 *   novo e completa.
 * - Espelhar o arquivo (apagar o que ele não conhece) é a composição de duas
 *   ações que você escolhe: `npm run acervo:zerar` e então importar. A parte
 *   destrutiva mora onde é óbvia, não escondida num modo do import.
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Exporta tudo, com `select('*')`.
   *
   * Colunas explícitas envelheceriam em silêncio: uma migration futura
   * adicionaria um campo que o backup pararia de guardar sem ninguém notar.
   */
  async exportar(incluirRespostas = true): Promise<Backup> {
    const tabelas = ORDEM_IMPORTACAO.filter((t) => incluirRespostas || t !== 'respostas');

    const dados: Record<string, unknown[]> = { respostas: [] };
    for (const tabela of tabelas) {
      const { data, error } = await this.supabase.client.from(tabela).select('*');
      if (error) throw new Error(`Não foi possível exportar ${tabela}: ${error.message}`);
      dados[tabela] = data ?? [];
    }

    return {
      versao: VERSAO_BACKUP,
      exportado_em: new Date().toISOString(),
      dados: dados as Backup['dados'],
    };
  }

  /**
   * Valida o arquivo INTEIRO antes de qualquer escrita.
   *
   * Arquivo inconsistente é recusado por completo, não pela metade: metade de
   * um restore é pior que nenhum, porque parece ter funcionado.
   */
  ler(texto: string): Backup {
    let cru: unknown;
    try {
      cru = JSON.parse(texto);
    } catch {
      throw new Error('Arquivo não é um JSON válido.');
    }

    const resultado = BackupSchema.safeParse(cru);
    if (!resultado.success) {
      const primeiro = resultado.error.issues[0];
      throw new Error(
        `Arquivo não é um backup do Conquest: ${primeiro.path.join('.')} — ${primeiro.message}`,
      );
    }
    return resultado.data;
  }

  /** O que o import faria, sem fazer. Etapa obrigatória antes de aplicar. */
  async prever(backup: Backup): Promise<Previa> {
    const idsNoBanco = {} as Record<TabelaBackup, string[]>;
    for (const tabela of ORDEM_IMPORTACAO) {
      const { data, error } = await this.supabase.client.from(tabela).select('id');
      if (error) throw new Error(`Não foi possível ler ${tabela}: ${error.message}`);
      idsNoBanco[tabela] = (data ?? []).map((l) => l.id);
    }

    const orfaos = acharPonteirosOrfaos(backup.dados.questoes, await this.imagensNoBucket());
    return montarPrevia(backup, idsNoBanco, orfaos);
  }

  /** Caminhos que de fato existem no bucket de imagens. */
  private async imagensNoBucket(): Promise<string[]> {
    const raiz = await this.supabase.questaoImagens.list('', { limit: 1000 });
    if (raiz.error) throw new Error(`Não foi possível ler o bucket: ${raiz.error.message}`);

    const caminhos: string[] = [];
    for (const entrada of raiz.data ?? []) {
      if (entrada.id !== null) {
        caminhos.push(entrada.name);
        continue;
      }
      const dentro = await this.supabase.questaoImagens.list(entrada.name, { limit: 1000 });
      for (const arquivo of dentro.data ?? []) caminhos.push(`${entrada.name}/${arquivo.name}`);
    }
    return caminhos;
  }

  /**
   * Aplica o backup.
   *
   * Ordem por dependência — a FK recusaria uma questão cuja prova ainda não
   * existe. Os triggers do banco continuam valendo e não atrapalham: o de
   * status da prova recalcula o mesmo valor que o arquivo traz, e o de
   * `acertou` só dispara quando o gabarito muda de fato.
   */
  async importar(backup: Backup, zerarPonteirosOrfaos: readonly string[]): Promise<void> {
    for (const tabela of ORDEM_IMPORTACAO) {
      const linhas = backup.dados[tabela];
      if (linhas.length === 0) continue;

      const { error } = await this.supabase.client
        .from(tabela)
        .upsert(linhas as never[], { onConflict: 'id' });

      if (error) throw new Error(`Falha ao importar ${tabela}: ${error.message}`);
    }

    if (zerarPonteirosOrfaos.length > 0) {
      // Ponteiro sem arquivo é elegibilidade mentindo: a view olha se HÁ
      // caminho, não se há imagem. Zerar devolve a questão a "precisa de
      // imagem", que a revisão trata e você reanexa.
      const { error } = await this.supabase.client
        .from('questoes')
        .update({ imagem_path: null })
        .in('id', [...zerarPonteirosOrfaos]);

      if (error) throw new Error(`Falha ao corrigir os ponteiros: ${error.message}`);
    }
  }
}
