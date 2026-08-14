import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupComponent } from './backup.component';
import { BackupService } from './backup.service';
import { Backup, Previa, TabelaBackup, VERSAO_BACKUP } from './formato-backup';

const dadosVazios = (): Backup['dados'] => ({
  bancas: [],
  materias: [],
  concursos: [],
  provas: [],
  textos_base: [],
  questoes: [],
  respostas: [],
});

const backup = (): Backup => ({
  versao: VERSAO_BACKUP,
  exportado_em: '2026-08-03T00:00:00Z',
  dados: dadosVazios(),
});

const previa = (over: Partial<Previa> = {}): Previa => ({
  diferencas: [{ tabela: 'questoes' as TabelaBackup, criar: 0, atualizar: 70, soNoBanco: 0 }],
  totalCriar: 0,
  totalAtualizar: 70,
  totalSoNoBanco: 0,
  ponteirosOrfaos: [],
  ...over,
});

function montar(service: Partial<BackupService>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: BackupService, useValue: service }],
  });
  const fixture = TestBed.createComponent(BackupComponent);
  fixture.detectChanges();
  return fixture;
}

async function assentar(fixture: ComponentFixture<BackupComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const controles = (fixture: ComponentFixture<BackupComponent>) =>
  fixture.componentInstance as unknown as {
    escolherArquivo: (e: Event) => Promise<void>;
    aplicar: () => Promise<void>;
    cancelar: () => void;
    zerarOrfaos: { set: (v: boolean) => void };
    previa: () => Previa | null;
  };

function eventoDeArquivo(texto: string, nome = 'backup.json'): Event {
  const arquivo = { name: nome, text: async () => texto } as unknown as File;
  return { target: { files: [arquivo], value: '' } } as unknown as Event;
}

describe('BackupComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('recusa arquivo que não é backup, sem tocar no banco', async () => {
    const prever = vi.fn();
    const fixture = montar({
      ler: () => {
        throw new Error('Arquivo não é um backup do Conquest: versao — inválida');
      },
      prever,
    });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{"foo":1}'));
    expect(await assentar(fixture, 'não é um backup')).toContain('não é um backup');
    expect(prever).not.toHaveBeenCalled();
  });

  it('mostra a prévia e avisa quantas linhas serão sobrescritas', async () => {
    const fixture = montar({
      ler: () => backup(),
      prever: async () => previa(),
    });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{}'));
    const texto = await assentar(fixture, 'serão sobrescritas');

    expect(texto).toContain('70 linhas serão sobrescritas');
    expect(texto).toContain('Aplicar');
  });

  it('não aplica nada só por escolher o arquivo', async () => {
    const importar = vi.fn(async () => {});
    const fixture = montar({ ler: () => backup(), prever: async () => previa(), importar });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{}'));
    await assentar(fixture, 'Aplicar');

    expect(importar).not.toHaveBeenCalled();
  });

  it('avisa o que o import não vai apagar', async () => {
    const fixture = montar({
      ler: () => backup(),
      prever: async () => previa({ totalSoNoBanco: 12 }),
    });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{}'));
    expect(await assentar(fixture, 'não apaga')).toContain('12 no banco não estão no arquivo');
  });

  it('oferece zerar os ponteiros órfãos, marcado por padrão', async () => {
    const importar = vi.fn(async (_b: Backup, _o: readonly string[]) => {});
    const fixture = montar({
      ler: () => backup(),
      prever: async () => previa({ ponteirosOrfaos: ['q1', 'q2'] }),
      importar,
    });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{}'));
    const texto = await assentar(fixture, 'imagem fora do bucket');
    expect(texto).toContain('2');

    await controles(fixture).aplicar();
    expect(importar).toHaveBeenCalledWith(expect.anything(), ['q1', 'q2']);
  });

  it('respeita desmarcar o zerar dos ponteiros', async () => {
    const importar = vi.fn(async (_b: Backup, _o: readonly string[]) => {});
    const fixture = montar({
      ler: () => backup(),
      prever: async () => previa({ ponteirosOrfaos: ['q1'] }),
      importar,
    });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{}'));
    await assentar(fixture, 'Aplicar');
    controles(fixture).zerarOrfaos.set(false);
    await controles(fixture).aplicar();

    expect(importar).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('diz que a importação é retomável quando falha no meio', async () => {
    const fixture = montar({
      ler: () => backup(),
      prever: async () => previa(),
      importar: async () => {
        throw new Error('Falha ao importar questoes: rede.');
      },
    });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{}'));
    await assentar(fixture, 'Aplicar');
    await controles(fixture).aplicar();

    expect(await assentar(fixture, 'retomável')).toContain('Rode a importação de novo');
  });

  it('cancelar descarta a prévia sem aplicar', async () => {
    const importar = vi.fn(async () => {});
    const fixture = montar({ ler: () => backup(), prever: async () => previa(), importar });

    await controles(fixture).escolherArquivo(eventoDeArquivo('{}'));
    await assentar(fixture, 'Aplicar');
    controles(fixture).cancelar();
    fixture.detectChanges();

    expect(controles(fixture).previa()).toBeNull();
    expect(importar).not.toHaveBeenCalled();
  });
});
