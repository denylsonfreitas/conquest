import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModalComponent } from './modal.component';

function montar(bloqueado = false) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(ModalComponent);
  fixture.componentRef.setInput('titulo', 'Nova prova');
  fixture.componentRef.setInput('bloqueado', bloqueado);

  const fechou = vi.fn();
  fixture.componentInstance.fechar.subscribe(fechou);
  fixture.detectChanges();

  return { fixture, fechou, raiz: fixture.nativeElement as HTMLElement };
}

const esc = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('ModalComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('fecha no Esc, no fundo e no X — mas não no conteúdo', () => {
    const { raiz, fechou } = montar();

    raiz.querySelector<HTMLElement>('[role=dialog]')?.click();
    expect(fechou).not.toHaveBeenCalled();

    esc();
    raiz.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    raiz.querySelector<HTMLButtonElement>('[aria-label=Fechar]')?.click();

    expect(fechou).toHaveBeenCalledTimes(3);
  });

  it('bloqueado não fecha por nenhum caminho — o envio está em curso', () => {
    const { raiz, fechou } = montar(true);

    esc();
    raiz.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(raiz.querySelector<HTMLButtonElement>('[aria-label=Fechar]')?.disabled).toBe(true);

    expect(fechou).not.toHaveBeenCalled();
  });

  it('devolve a rolagem da página ao ser destruído', () => {
    const { fixture } = montar();
    expect(document.body.style.overflow).toBe('hidden');

    fixture.destroy();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('aponta o título pelo aria-labelledby, com id próprio por instância', () => {
    const primeiro = montar();
    const dialogo = primeiro.raiz.querySelector('[role=dialog]');
    const id = dialogo?.getAttribute('aria-labelledby');

    expect(primeiro.raiz.querySelector(`#${id}`)?.textContent).toContain('Nova prova');

    const segundo = montar();
    expect(segundo.raiz.querySelector('[role=dialog]')?.getAttribute('aria-labelledby')).not.toBe(
      id,
    );
  });
});
