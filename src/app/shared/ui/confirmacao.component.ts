import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Confirmação de ação irreversível.
 *
 * Modal por critério, não por gosto: modal serve quando a ação precisa
 * BLOQUEAR tudo e tem saída binária — confirmar ou cancelar. Editar não se
 * encaixa nisso (precisa do contexto em volta), e por isso o editor de questão
 * e a prévia do backup seguem embutidos.
 *
 * `consequencias` é o que separa isto de um "tem certeza?" mudo. Excluir um
 * concurso dispara CASCADE em provas, questões e respostas — e quem clica
 * precisa ver o tamanho do estrago ANTES, do mesmo jeito que a prévia do import
 * mostra quantas linhas serão sobrescritas.
 *
 * Burro por contrato (docs/04): input/output, sem service.
 */
@Component({
  selector: 'app-confirmacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirmacao.component.html',
})
export class ConfirmacaoComponent {
  readonly titulo = input.required<string>();
  /** O que vai junto. Vazio = a ação não arrasta mais nada. */
  readonly consequencias = input<readonly string[]>([]);
  readonly rotuloConfirmar = input('Excluir');
  readonly ocupado = input(false);

  readonly confirmar = output<void>();
  readonly cancelar = output<void>();
}
