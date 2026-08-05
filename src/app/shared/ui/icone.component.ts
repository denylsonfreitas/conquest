import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Ícones das ações inline.
 *
 * SVG inline, sem biblioteca: são oito traços simples, e uma dependência
 * externa custaria mais que eles valem. `currentColor` no stroke faz o ícone
 * herdar a cor do botão — é o que impede a versão vermelha do "excluir" de
 * precisar de um ícone próprio.
 *
 * Acompanham o rótulo, nunca o substituem: ícone sozinho vira adivinhação, e o
 * ganho aqui é varredura visual da lista, não economia de espaço.
 */
export type NomeIcone =
  'abrir' | 'fechar' | 'aprovar' | 'desfazer' | 'editar' | 'excluir' | 'anexar' | 'ver';

/** Traços do `<path>` de cada ícone, num grid de 24. */
const TRACOS: Record<NomeIcone, string> = {
  abrir: 'M6 9l6 6 6-6',
  fechar: 'M18 15l-6-6-6 6',
  aprovar: 'M20 6L9 17l-5-5',
  desfazer: 'M9 14L4 9l5-5 M4 9h11a5 5 0 010 10h-4',
  editar: 'M12 20h9 M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  excluir: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6',
  anexar: 'M12 5v14 M5 12h14',
  ver: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 15a3 3 0 100-6 3 3 0 000 6',
};

@Component({
  selector: 'app-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="tamanho()"
      [attr.height]="tamanho()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="inline-block shrink-0 align-[-0.125em]"
    >
      <path [attr.d]="traco()" />
    </svg>
  `,
})
export class IconeComponent {
  readonly nome = input.required<NomeIcone>();
  readonly tamanho = input(16);

  protected traco(): string {
    return TRACOS[this.nome()];
  }
}
