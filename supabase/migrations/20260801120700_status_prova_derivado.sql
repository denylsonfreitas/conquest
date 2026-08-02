-- =============================================================================
-- `provas.status` entre aguardando_revisao e pronta passa a ser DERIVADO
--
-- "Pronta" significa exatamente "todas as questões desta prova estão
-- revisadas". Sendo derivado do estado das questões, não pode depender de a UI
-- lembrar de recalcular: bastaria um caminho esquecer — aprovar em lote,
-- desaprovar uma, reprocessar — para a prova ficar mentindo.
--
-- Mesmo raciocínio do trigger de updated_at: a invariante mora no banco, onde
-- nenhum cliente consegue contorná-la.
--
-- A transição é bidirecional por construção: desaprovar uma questão de uma
-- prova 'pronta' a devolve para 'aguardando_revisao' no mesmo UPDATE.
-- =============================================================================

create or replace function public.sincronizar_status_prova()
returns trigger
language plpgsql
as $$
declare
  v_prova_id uuid;
  v_total    int;
  v_revisadas int;
begin
  -- DELETE traz a linha em OLD; INSERT/UPDATE em NEW.
  v_prova_id := coalesce(new.prova_id, old.prova_id);

  select count(*), count(*) filter (where revisada)
    into v_total, v_revisadas
    from public.questoes
   where prova_id = v_prova_id;

  update public.provas
     set status = case
                    when v_total > 0 and v_revisadas = v_total then 'pronta'
                    else 'aguardando_revisao'
                  end
   where id = v_prova_id
     -- Guarda essencial: só alterna entre estes dois. Sem isto, gravar as
     -- questões durante a extração tiraria a prova de 'processando', e o
     -- CHECK do carimbo (provas_carimbo_so_em_processando) rejeitaria o UPDATE.
     and status in ('aguardando_revisao', 'pronta');

  return null;
end;
$$;

drop trigger if exists questoes_sincroniza_status on public.questoes;

-- `update of revisada` limita o disparo ao que importa: editar enunciado ou
-- comentário não mexe na conclusão da prova.
create trigger questoes_sincroniza_status
  after insert or delete or update of revisada on public.questoes
  for each row
  execute function public.sincronizar_status_prova();

comment on function public.sincronizar_status_prova is
  'Mantém provas.status coerente com as questões: pronta quando todas revisadas, aguardando_revisao caso contrário.';
