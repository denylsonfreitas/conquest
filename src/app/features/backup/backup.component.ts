import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { BackupService } from './backup.service';
import { Backup, nomeDoArquivo, Previa } from './formato-backup';

@Component({
  selector: 'app-backup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './backup.component.html',
})
export class BackupComponent {
  private readonly service = inject(BackupService);

  protected readonly ocupado = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly incluirRespostas = signal(true);

  protected readonly arquivo = signal<Backup | null>(null);
  protected readonly nomeLido = signal<string | null>(null);
  protected readonly previa = signal<Previa | null>(null);
  protected readonly zerarOrfaos = signal(true);

  protected async exportar(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.erro.set(null);
    this.aviso.set(null);
    try {
      const backup = await this.service.exportar(this.incluirRespostas());
      baixar(JSON.stringify(backup, null, 2), nomeDoArquivo());

      const { questoes, respostas } = backup.dados;
      this.aviso.set(
        `Baixado: ${questoes.length} questões e ${respostas.length} respostas. ` +
          'PDFs e imagens ficam de fora — eles carregam a marca d’água com seu IP.',
      );
    } catch (e) {
      this.erro.set(mensagem(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async escolherArquivo(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    entrada.value = ''; // permite reescolher o mesmo arquivo depois
    if (!arquivo) return;

    this.ocupado.set(true);
    this.erro.set(null);
    this.aviso.set(null);
    this.previa.set(null);
    try {
      const backup = this.service.ler(await arquivo.text());
      this.arquivo.set(backup);
      this.nomeLido.set(arquivo.name);
      this.previa.set(await this.service.prever(backup));
    } catch (e) {
      this.arquivo.set(null);
      this.erro.set(mensagem(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected cancelar(): void {
    this.arquivo.set(null);
    this.previa.set(null);
    this.nomeLido.set(null);
  }

  protected async aplicar(): Promise<void> {
    const backup = this.arquivo();
    const previa = this.previa();
    if (!backup || !previa || this.ocupado()) return;

    this.ocupado.set(true);
    this.erro.set(null);
    try {
      const orfaos = this.zerarOrfaos() ? previa.ponteirosOrfaos : [];
      await this.service.importar(backup, orfaos);

      this.aviso.set(
        `Importado: ${previa.totalCriar} criadas, ${previa.totalAtualizar} atualizadas` +
          (orfaos.length > 0 ? `, ${orfaos.length} ponteiros de imagem zerados` : '') +
          '. Recarregue as telas para ver o acervo restaurado.',
      );
      this.cancelar();
    } catch (e) {
      this.erro.set(`${mensagem(e)} Rode a importação de novo: ela é retomável.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}

function baixar(conteudo: string, nome: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
