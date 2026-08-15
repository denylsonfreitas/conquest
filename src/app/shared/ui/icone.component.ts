import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type NomeIcone =
  | 'abrir'
  | 'fechar'
  | 'aprovar'
  | 'desfazer'
  | 'editar'
  | 'excluir'
  | 'anexar'
  | 'ver'
  | 'revisar'
  | 'processar'
  | 'repetir'
  | 'processando'
  | 'destravar'
  | 'bloqueado'
  | 'cancelar'
  | 'gabarito'
  | 'info';

const TRACOS: Record<NomeIcone, string> = {
  abrir: 'M6 9l6 6 6-6',
  fechar: 'M18 15l-6-6-6 6',
  aprovar: 'M20 6L9 17l-5-5',
  desfazer: 'M9 14L4 9l5-5 M4 9h11a5 5 0 010 10h-4',
  editar: 'M12 20h9 M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  excluir: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6',
  anexar: 'M12 5v14 M5 12h14',
  ver: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 15a3 3 0 100-6 3 3 0 000 6',
  revisar: 'M9 11l3 3 8-8 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  processar: 'M7 4l12 8-12 8z',
  repetir: 'M20 12a8 8 0 11-2.3-5.6 M20 3v5h-5',
  // Duas setas em círculo, sem começo nem fim visíveis: o giro fica contínuo.
  processando: 'M21 12a9 9 0 01-9 9 M3 12a9 9 0 019-9 M21 12h-4 M3 12h4',
  destravar: 'M8 10V7a4 4 0 017.5-2 M5 10h14v10H5z',
  bloqueado: 'M8 10V7a4 4 0 018 0v3 M5 10h14v10H5z',
  cancelar: 'M18 6L6 18 M6 6l12 12',
  gabarito: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z M14 3v6h6 M9 15l2 2 4-4',
  info: 'M12 16v-5 M12 8h.01 M21 12a9 9 0 11-18 0 9 9 0 0118 0',
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
      [class.animate-spin]="girando()"
    >
      <path [attr.d]="traco()" />
    </svg>
  `,
})
export class IconeComponent {
  readonly nome = input.required<NomeIcone>();
  readonly tamanho = input(16);

  // O giro vai no próprio SVG, não no host: <app-icone> é inline, e transform
  // não se aplica a elemento inline não substituído.
  readonly girando = input(false);

  protected traco(): string {
    return TRACOS[this.nome()];
  }
}
