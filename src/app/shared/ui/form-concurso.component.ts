import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export interface ValoresConcurso {
  nome: string;
  orgao: string | null;
  banca_id: string | null;
}

export interface OpcaoBanca {
  id: string;
  nome: string;
}

@Component({
  selector: 'app-form-concurso',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-concurso.component.html',
})
export class FormConcursoComponent {
  readonly bancas = input.required<readonly OpcaoBanca[]>();
  readonly valorInicial = input<ValoresConcurso | null>(null);
  readonly salvando = input(false);
  readonly erro = input<string | null>(null);
  readonly rotuloSalvar = input('Salvar');

  readonly salvar = output<ValoresConcurso>();
  readonly cancelar = output<void>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nome: ['', Validators.required],
    orgao: [''],
    banca_id: [''],
  });

  private readonly bancaEscolhida = toSignal(this.form.controls.banca_id.valueChanges, {
    initialValue: '',
  });

  // Trocar a banca reclassifica todas as questões do concurso nos filtros e no
  // progresso. Não corrompe nada, mas os números mudam — e mudar sem avisar
  // parece defeito.
  protected readonly bancaTrocada = computed(() => {
    const inicial = this.valorInicial();
    return inicial !== null && (this.bancaEscolhida() || null) !== inicial.banca_id;
  });

  constructor() {
    // As bancas chegam depois da primeira renderização, e um select só assume o
    // valor quando a opção correspondente já existe. Por isso o formulário é
    // preenchido de novo quando a lista muda, não uma vez só no construtor.
    effect(() => {
      const valor = this.valorInicial();
      this.bancas();
      this.form.setValue({
        nome: valor?.nome ?? '',
        orgao: valor?.orgao ?? '',
        banca_id: valor?.banca_id ?? '',
      });
    });
  }

  protected enviar(): void {
    if (this.form.invalid || this.salvando()) return;
    const { nome, orgao, banca_id } = this.form.getRawValue();
    this.salvar.emit({ nome, orgao: orgao || null, banca_id: banca_id || null });
  }
}
