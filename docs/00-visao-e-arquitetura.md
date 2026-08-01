# Estudos para Concurso — Visão & Arquitetura

## O que é

Aplicação pessoal de estudos. Você importa PDFs de provas de concursos, o sistema
extrai as questões automaticamente, e você monta questionários filtrados por
matéria/quantidade para praticar. O histórico de respostas alimenta um modo de
revisão focado nos seus erros.

**Uso:** pessoal, single-user. Sem cadastro de múltiplos usuários.
**Dispositivo alvo:** tablet (interface web responsiva), também usável no desktop.
**Restrição central:** custo mínimo. Idealmente R$ 0/mês fixo.

## Princípios de design

1. **Separar processamento de consumo.** O pipeline que importa e extrai questões
   de PDFs é um subsistema isolado do app de estudar. Eles se comunicam apenas
   pelo banco de dados. Trocar o método de extração não pode afetar o quiz.

2. **Schema canônico da questão.** Existe um único formato de questão válido no
   sistema. Todo dado que entra é validado contra ele antes de persistir. Lixo
   não passa da fronteira.

3. **Idempotência na importação.** Importar o mesmo PDF duas vezes nunca duplica
   questões. Identidade estável via hash de arquivo.

4. **Revisão humana obrigatória.** Extração por LLM é boa, não perfeita. Toda
   prova importada passa por um estado de revisão antes de virar questão
   "aprovada" e disponível para quizzes.

5. **Estado explícito.** Processamento é assíncrono. Cada prova carrega um status
   observável (pendente → processando → aguardando revisão → pronta / erro).

## Stack escolhida

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | **Angular 22** (standalone + signals) + TypeScript | Framework do dia a dia do dev; projeto serve para aprofundar nele; build estático. Versão estável atual (jun/2026) |
| UI | **Tailwind CSS v4** | CSS-first (`@import "tailwindcss"`, sem config JS clássico); rápido, responsivo |
| Backend / DB | Supabase (Postgres + Storage + Edge Functions) | Plano grátis generoso; banco, storage e funções serverless num lugar só |
| Extração | **Google Gemini Flash** (via API) | Decidido: robusto a formatos variados, camada grátis, custo irrisório. Isolado atrás de uma função para trocar depois se preciso |
| Parsing PDF | `unpdf` ou `pdf.js` na Edge Function | Extrai texto bruto antes de mandar pro LLM |
| Validação | Zod | Schema canônico compartilhado entre app e Edge Functions |
| Deploy front | Cloudflare Pages ou Vercel | Estático, grátis |
| Auth | **Supabase Auth** (single user) | Decidido: protege o acervo com login real; e-mail/senha basta para um usuário |

### Por que serverless e não um servidor sempre ligado

Você adiciona provas esporadicamente. Um servidor 24h cobraria pelo tempo ocioso.
Edge Functions rodam sob demanda (no upload) e dormem depois — custo zero quando
não está processando. É a arquitetura certa pro padrão de uso "importo às vezes,
estudo às vezes".

### Nota sobre custo real

- Supabase free: 500MB DB, 1GB storage, 500k invocações de função/mês, 5GB
  bandwidth. Muito acima do uso de uma pessoa.
- LLM: processar uma prova de ~60 questões custa frações de centavo. Gemini Flash
  tem camada grátis; Claude Haiku é pago mas trivial no volume.
- Deploy estático: grátis nos dois provedores citados.

**Custo fixo mensal realista: R$ 0.** Variável: centavos de LLM por prova importada.

## Os dois subsistemas

### A. Pipeline de importação (write-side)
Recebe PDF → guarda no storage → extrai texto → estrutura via LLM → valida →
grava questões em estado "rascunho" → você revisa → aprova. Detalhado em
`02-pipeline-importacao.md`.

### B. App de estudo (read-side)
Lê questões aprovadas → você filtra e monta quiz → responde → registra resultado
→ estatísticas e revisão de erros. Detalhado em `03-regras-de-negocio.md`.

## Hierarquia de dados (resumo)

```
banca               "FCC"  (dimensão transversal)
  └── concurso      "TRT 15 Região"
        └── prova   "Analista Judiciário — 2024" (1 PDF importado)
              └── questao "RF sobre..." (matéria, assunto, alternativas, gabarito)
                    └── resposta  (seu histórico: acertou/errou, quando)
```

A camada `prova` é o que permite importar incrementalmente, rastrear origem,
reprocessar e evitar duplicatas. A camada `banca` é **transversal**: cada
concurso pertence a uma banca, o que permite reunir todas as questões de uma
mesma banca atravessando concursos diferentes — o principal ganho de estudo
("treinar o estilo da FCC"). Schema completo em `01-banco-de-dados.md`.
