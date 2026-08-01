# Estudos para Concurso

App pessoal de estudos: importe PDFs de provas, o sistema extrai as questões, e
você monta questionários filtrados para praticar. Histórico de respostas alimenta
um modo de revisão focado nos seus erros. Feito para rodar no tablet, com custo
mínimo (plano grátis de ponta a ponta).

## Documentação

Leia nesta ordem:

1. **[docs/00-visao-e-arquitetura.md](docs/00-visao-e-arquitetura.md)** —
   o que é, princípios, stack e por quê.
2. **[docs/01-banco-de-dados.md](docs/01-banco-de-dados.md)** —
   schema completo das tabelas (bancas, concursos, provas, questões, respostas),
   relações, índices e RLS.
3. **[docs/02-pipeline-importacao.md](docs/02-pipeline-importacao.md)** —
   como um PDF vira questões aprovadas (o subsistema mais delicado).
4. **[docs/03-regras-de-negocio.md](docs/03-regras-de-negocio.md)** —
   elegibilidade, montagem de quiz, modos, estatísticas, mapa de telas.
5. **[docs/04-estrutura-e-convencoes.md](docs/04-estrutura-e-convencoes.md)** —
   estrutura de pastas, convenções e roadmap de implementação.

## Stack

Angular (standalone + signals) + TypeScript · Tailwind · Supabase (Postgres +
Storage + Edge Functions) · LLM para extração (Gemini Flash ou Claude Haiku) ·
Zod · deploy estático (Cloudflare Pages / Vercel).

## Ideia em uma frase

Dois subsistemas isolados que só conversam pelo banco: um **importa e extrai**
questões de PDFs (com revisão humana), outro **monta e aplica** quizzes sobre as
questões aprovadas.

## Por onde começar a codar

Siga o roadmap no fim de `docs/04`. Resumo: fundação → concursos/provas →
upload → **extração (Edge Function)** → revisão → quiz → resultados. Ataque a
extração cedo, com uma prova real — é onde estão as surpresas.
