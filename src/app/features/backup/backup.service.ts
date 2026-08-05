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

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly supabase = inject(SupabaseService);

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
      const { error } = await this.supabase.client
        .from('questoes')
        .update({ imagem_path: null })
        .in('id', [...zerarPonteirosOrfaos]);

      if (error) throw new Error(`Falha ao corrigir os ponteiros: ${error.message}`);
    }
  }
}
