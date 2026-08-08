import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EnunciadoComponent } from './enunciado.component';

function montar(texto: string) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(EnunciadoComponent);
  fixture.componentRef.setInput('texto', texto);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EnunciadoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('enunciado sem código não vira bloco de código', () => {
    const raiz = montar('Assinale a alternativa correta.');
    expect(raiz.querySelector('pre')).toBeNull();
    expect(raiz.textContent).toContain('Assinale a alternativa correta.');
  });

  it('renderiza o código em <pre><code> e a prosa fora dele', () => {
    const raiz = montar(
      ['Considere o trecho:', '```java', 'int x = 1;', '```', 'Qual a saída?'].join('\n'),
    );

    const pre = raiz.querySelector('pre code') as HTMLElement;
    expect(pre.textContent).toBe('int x = 1;');
    expect(raiz.querySelectorAll('p')).toHaveLength(2);
  });

  it('o <pre> não herda a indentação do template — só o código está lá dentro', () => {
    const raiz = montar(['```', 'linha um', '  linha dois', '```'].join('\n'));
    const codigo = raiz.querySelector('pre code') as HTMLElement;

    expect(codigo.textContent).toBe('linha um\n  linha dois');
  });

  it('o bloco de código rola sozinho em vez de esticar a página', () => {
    const raiz = montar('```\numa linha muito comprida de codigo\n```');
    const pre = raiz.querySelector('pre') as HTMLElement;

    expect(pre.className).toContain('overflow-x-auto');
    expect(pre.className).toContain('font-mono');
  });
});
