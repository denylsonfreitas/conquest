-- =============================================================================
-- Seed das duas dimensões normalizadas
-- Referência: docs/01 ("Semeie com as bancas comuns"), docs/03 ("lista semente
-- das matérias comuns de concurso e expanda").
--
-- Vive como migration (e não em supabase/seed.sql) porque é dado de referência
-- que o app precisa em produção, não fixture de desenvolvimento.
-- `on conflict (nome) do nothing` deixa o script idempotente: rodar de novo,
-- ou você já ter criado a banca pela UI, não quebra nada.
-- =============================================================================

insert into public.bancas (nome) values
  ('Cebraspe'),
  ('FCC'),
  ('FGV'),
  ('Vunesp'),
  ('Cesgranrio'),
  ('IBFC'),
  ('Instituto AOCP'),
  ('Quadrix'),
  ('IADES'),
  ('Consulplan'),
  ('IDECAN'),
  ('Fundatec'),
  ('Instituto Access'),
  ('Outra')
on conflict (nome) do nothing;

insert into public.materias (nome) values
  -- Básicas / comuns a quase todo edital
  ('Língua Portuguesa'),
  ('Raciocínio Lógico'),
  ('Matemática'),
  ('Matemática Financeira'),
  ('Estatística'),
  ('Informática'),
  ('Atualidades'),
  ('Língua Inglesa'),
  -- Direito
  ('Direito Constitucional'),
  ('Direito Administrativo'),
  ('Direito Civil'),
  ('Direito Processual Civil'),
  ('Direito Penal'),
  ('Direito Processual Penal'),
  ('Direito do Trabalho'),
  ('Direito Processual do Trabalho'),
  ('Direito Tributário'),
  ('Direito Previdenciário'),
  ('Direito Empresarial'),
  ('Direito Ambiental'),
  ('Direito Financeiro'),
  ('Direito Eleitoral'),
  ('Direito Internacional'),
  -- Gestão e afins
  ('Administração Geral'),
  ('Administração Pública'),
  ('Administração Financeira e Orçamentária'),
  ('Contabilidade Geral'),
  ('Contabilidade Pública'),
  ('Economia'),
  ('Gestão de Pessoas'),
  ('Arquivologia'),
  ('Ética no Serviço Público'),
  ('Legislação Específica')
on conflict (nome) do nothing;

-- Cada banca aparece uma única vez, na sigla pela qual você a reconhece na
-- prova ("FGV", não "Fundação Getulio Vargas"). Duas grafias da mesma banca
-- recriariam exatamente o problema que a normalização existe para resolver.
