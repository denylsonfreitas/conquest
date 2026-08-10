import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EdicaoQuestao, QuestaoEditavel } from '../edicao-questao';
import { EditorQuestaoComponent } from './editor-questao.component';

const MATERIAS = [
  { id: 'm1', nome: 'Língua Portuguesa' },
  { id: 'm2', nome: 'Raciocínio Lógico' },
];

const questao = (over: Partial<QuestaoEditavel> = {}): QuestaoEditavel => ({
  id: 'q1',
  numero: 1,
  enunciado: 'Enunciado',
  alternativas: [
    { letra: 'A', texto: 'um' },
    { letra: 'B', texto: 'dois' },
  ],
  materia_id: 'm1',
  gabarito: 'A',
  comentario: null,
  tem_imagem: false,
  imagem_path: null,
  anulada: false,
  incerto: false,
  ...over,
});

function montar(q: QuestaoEditavel = questao()) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(EditorQuestaoComponent);
  fixture.componentRef.setInput('questao', q);
  fixture.componentRef.setInput('materias', MATERIAS);
  fixture.detectChanges();
  return fixture;
}

const interno = (fixture: ComponentFixture<EditorQuestaoComponent>) =>
  fixture.componentInstance as unknown as {
    mudar: (campo: string, valor: unknown) => void;
    confirmar: () => void;
    descartar: () => void;
    tem: () => boolean;
  };

async function assentar(fixture: ComponentFixture<EditorQuestaoComponent>) {
  fixture.detectChanges();
  await new Promise((r) => setTimeout(r, 5));
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('EditorQuestaoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('abre os campos com o valor que a questão já tem', async () => {
    const fixture = montar(questao({ materia_id: 'm2', gabarito: 'B' }));
    await assentar(fixture);

    const selects = (fixture.nativeElement as HTMLElement).querySelectorAll('select');
    const selecionado = (s: HTMLSelectElement) => s.options[s.selectedIndex]?.textContent?.trim();
    expect(selecionado(selects[0])).toBe('Raciocínio Lógico');
    expect(selecionado(selects[1])).toBe('B');
  });

  it('acumula os campos e emite uma edição só', () => {
    const fixture = montar();
    const emitido: EdicaoQuestao[] = [];
    fixture.componentInstance.salvar.subscribe((e) => emitido.push(e));

    const c = interno(fixture);
    c.mudar('materia_id', 'm2');
    c.mudar('gabarito', 'B');
    c.confirmar();

    expect(emitido).toEqual([{ materia_id: 'm2', gabarito: 'B' }]);
  });

  it('esquece a mudança que volta ao valor original', () => {
    const fixture = montar();
    const c = interno(fixture);

    c.mudar('gabarito', 'B');
    expect(c.tem()).toBe(true);
    c.mudar('gabarito', 'A');
    expect(c.tem()).toBe(false);
  });

  it('avisa o pai sobre o rascunho, para ele proteger a saída', () => {
    const fixture = montar();
    const rascunhos: EdicaoQuestao[] = [];
    fixture.componentInstance.rascunhoMudou.subscribe((r) => rascunhos.push(r));
    fixture.detectChanges();

    interno(fixture).mudar('comentario', 'anotação');
    fixture.detectChanges();

    expect(rascunhos.at(-1)).toEqual({ comentario: 'anotação' });
  });

  it('avisa quantas respostas serão recontadas, e só ao mexer no gabarito', async () => {
    const fixture = montar();
    fixture.componentRef.setInput('respostasAfetadas', 3);
    const c = interno(fixture);

    c.mudar('comentario', 'só um comentário');
    expect(await assentar(fixture)).not.toContain('recontada');

    c.mudar('gabarito', 'B');
    expect(await assentar(fixture)).toContain('3 respostas passadas serão recontadas');
  });

  it('descarta o rascunho quando a questão exibida troca', () => {
    const fixture = montar();
    interno(fixture).mudar('gabarito', 'B');
    expect(interno(fixture).tem()).toBe(true);

    fixture.componentRef.setInput('questao', questao({ id: 'q2' }));
    fixture.detectChanges();
    expect(interno(fixture).tem()).toBe(false);
  });

  it('não oferece salvar sem mudança', async () => {
    const fixture = montar();
    await assentar(fixture);
    const botao = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Salvar'));
    expect(botao?.disabled).toBe(true);
  });

  it('emite o arquivo escolhido para o pai enviar', () => {
    const fixture = montar(questao({ tem_imagem: true }));
    const recebido = vi.fn();
    fixture.componentInstance.anexarImagem.subscribe(recebido);
    fixture.detectChanges();

    const entrada = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    const arquivo = new File(['x'], 'figura.png', { type: 'image/png' });
    Object.defineProperty(entrada, 'files', { value: [arquivo] });
    entrada.dispatchEvent(new Event('change'));

    expect(recebido).toHaveBeenCalledWith(arquivo);
  });

  it('mantém a quebra de linha da alternativa sem herdar a indentação do template', () => {
    const fixture = montar(
      questao({
        alternativas: [
          { letra: 'A', texto: 'primeira\nsegunda' },
          { letra: 'B', texto: 'dois' },
        ],
      }),
    );

    const primeira = (fixture.nativeElement as HTMLElement).querySelector('li') as HTMLElement;

    expect(primeira.textContent?.trim()).toBe('(A) primeira\nsegunda');
    expect(primeira.textContent).not.toMatch(/\n\s*\n/);
    expect(primeira.className).toContain('whitespace-pre-line');
  });
});
