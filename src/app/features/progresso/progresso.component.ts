import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { BackupComponent } from '../backup/backup.component';
import { ProgressoService } from './progresso.service';
import {
  evolucaoPorMateria,
  JANELA_EVOLUCAO,
  maisFracas,
  PISO_RANQUEAMENTO,
  porBanca,
  porMateria,
  RespostaAnalisavel,
  totalPraticado,
} from './regras-progresso';

type Status = 'carregando' | 'ok' | 'erro';

@Component({
  selector: 'app-progresso',
  imports: [RouterLink, EstadoCarregandoComponent, EstadoErroComponent, BackupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './progresso.component.html',
})
export class ProgressoComponent {
  private readonly service = inject(ProgressoService);

  protected readonly status = signal<Status>('carregando');
  protected readonly erro = signal<string | null>(null);
  protected readonly historico = signal<RespostaAnalisavel[]>([]);

  protected readonly total = computed(() => totalPraticado(this.historico()));
  protected readonly materias = computed(() => porMateria(this.historico()));
  protected readonly bancas = computed(() => porBanca(this.historico()));
  protected readonly fracas = computed(() => maisFracas(this.materias()));
  protected readonly evolucao = computed(() => evolucaoPorMateria(this.historico()));

  protected readonly temEvolucao = computed(() => this.evolucao().some((e) => e.delta !== null));

  protected readonly vazio = computed(() => this.total().respostas === 0);

  protected readonly JANELA = JANELA_EVOLUCAO;
  protected readonly PISO = PISO_RANQUEAMENTO;

  constructor() {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.status.set('carregando');
    this.erro.set(null);
    try {
      this.historico.set(await this.service.historico());
      this.status.set('ok');
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Erro inesperado.');
      this.status.set('erro');
    }
  }

  protected cor(percentual: number): string {
    if (percentual >= 70) return 'text-sucesso';
    if (percentual >= 50) return 'text-atencao';
    return 'text-perigo';
  }

  protected corDelta(delta: number): string {
    if (delta > 0) return 'text-sucesso';
    if (delta < 0) return 'text-perigo';
    return 'text-texto-fraco';
  }
}
