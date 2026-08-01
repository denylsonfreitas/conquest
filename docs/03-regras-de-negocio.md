# Regras de Negócio

O subsistema read-side: como o acervo vira estudo. Estas regras definem o
comportamento do app independente de como as questões foram importadas.

## Elegibilidade de questões

Uma questão só aparece em quizzes se:

```
revisada = true
AND anulada = false
AND (tem_imagem = false OR imagem_path IS NOT NULL)
```

Ou seja: aprovada, não anulada, e — se depender de imagem — com a imagem
efetivamente anexada. Questões em rascunho, com problema, anuladas, ou que
dependem de uma figura ausente ficam invisíveis ao modo estudo. Essa é a fronteira
entre os dois subsistemas.

## Normalização de matérias

Problema: o LLM pode escrever "Dir. Constitucional", "Direito Constitucional",
"D. Const." para a mesma coisa. Se não normalizar, os filtros quebram.

**Regra:** existe uma lista canônica de matérias. Na revisão, a matéria de cada
questão é atribuída a partir dessa lista (autocomplete/select), não texto livre.
O LLM sugere, você confirma escolhendo da lista. Assim "Direito Constitucional"
é sempre exatamente essa string.

**Implementação sugerida:** uma tabela `materias` (id, nome) ou uma enum
mantida no código. Tabela é mais flexível (você adiciona matérias sem deploy).
Comece com uma lista semente das matérias comuns de concurso e expanda.

O **mesmo princípio vale para bancas** (tabela `bancas`, ver doc `01`): ao criar
um concurso, a banca vem de uma lista, não de texto livre. Sem isso o filtro
transversal por banca não funciona de forma confiável — "FCC" e "F.C.C." seriam
tratadas como bancas distintas e o acervo se fragmentaria.

## Edição de questão já aprovada

A revisão inicial não é a última palavra. Semanas depois você vai notar um erro
("essa matéria está errada", "faltou anexar a figura", "quero corrigir o
gabarito"). Regra: **qualquer questão aprovada permanece editável** a qualquer
momento, não só no fluxo de importação.

- Um modo/tela de edição abre a questão com os mesmos campos da revisão.
- Editar não a tira do acervo nem apaga o histórico de `respostas` já dado a ela.
- `updated_at` é atualizado (trigger no banco), então dá para saber o que mudou.
- Se você marca uma questão antes elegível como `anulada` ou `tem_imagem` sem
  anexo, ela simplesmente deixa de aparecer em quizzes futuros — as respostas
  passadas continuam válidas nas estatísticas.

Ponto de acesso sugerido: a partir da tela de resultado do quiz (editar uma
questão que você achou errada na hora) e de uma busca/listagem de questões.

## Montagem de quiz

O usuário monta um quiz escolhendo filtros. Parâmetros:

| Parâmetro | Opções |
|---|---|
| Banca | uma banca específica, ou "todas" |
| Concurso | um concurso específico, ou "todos" |
| Matéria(s) | uma, várias, ou todas |
| Quantidade | número de questões (ex: 10, 20, 50) |
| Modo | ver abaixo |

**Banca e concurso são filtros independentes e combináveis.** Filtrar por banca
reúne questões de *todos* os concursos daquela banca (a query transversal do doc
`01`) — é o caso de uso central: "quero treinar o estilo da FCC". Filtrar por
concurso restringe a um edital específico. Você pode usar um, outro, ou ambos
(ex.: banca FCC + matéria Português, ignorando o concurso). Quando "banca = todas"
e "concurso = todos", o quiz puxa de todo o acervo elegível.

### Modos de quiz

1. **Aleatório** — sorteia N questões elegíveis dentro dos filtros.
2. **Só não respondidas** — prioriza questões que você nunca respondeu.
3. **Revisão de erros** — sorteia entre questões que você **já errou** antes.
   Este é o modo de maior valor pedagógico.
4. **Simulado** — respeita a proporção de matérias de uma prova real (evolução
   futura; não obrigatório no MVP).

### Regras de sorteio

- Nunca repetir a mesma questão dentro de um mesmo quiz.
- Se os filtros retornarem menos questões que a quantidade pedida, monte com o
  que houver e avise ("só 7 questões disponíveis com esses filtros").
- Embaralhar a ordem das questões e, opcionalmente, das alternativas
  (cuidado: só embaralhe alternativas em múltipla escolha, nunca em
  certo/errado, e reajuste o gabarito ao embaralhar).

## Responder o quiz

- Uma questão por vez ou lista rolável — decisão de UX, ambas válidas no tablet.
- Ao responder, registra em `respostas`: `letra_marcada`, `acertou` (comparando
  com `gabarito`), `respondido_em`, e um `quiz_sessao_id` comum a todo o quiz.
- Feedback pode ser imediato (mostra certo/errado a cada questão) ou só no fim
  (modo simulado). Ofereça as duas; imediato é melhor pra aprender, fim é melhor
  pra simular prova.

## Resultado e estatísticas

Ao fim do quiz, mostrar:

- **Placar geral:** X de N corretas, percentual.
- **Desempenho por matéria:** a informação mais útil. "Direito Const.: 8/10,
  Português: 4/10" mostra onde focar. Vem de agrupar as respostas do quiz por
  `materia` da questão.
- **Revisão das questões:** lista com sua resposta vs gabarito, para reestudar.
  Aqui aparece o `comentario` da questão (se houver) e um atalho para **editar a
  questão** (corrigir gabarito/matéria, anexar imagem) ou **anotar um comentário**
  na hora — útil quando você percebe o erro respondendo. Ver "Edição de questão já
  aprovada".

### Estatísticas globais (fora do quiz)

Uma tela de progresso agregando todo o histórico de `respostas`:

- Percentual de acerto por matéria ao longo do tempo.
- **Percentual de acerto por banca** — útil para saber com qual banca você vai
  melhor ou pior. Vem do mesmo join transversal (respostas → questões → provas →
  concursos → bancas).
- Total de questões praticadas.
- Matérias mais fracas (menor % de acerto) — sugestão de foco.

Tudo derivável de `respostas` + joins subindo a árvore. Não precisa tabela extra.
A view `questoes_completas` sugerida no doc `01` (que já traz banca e concurso
junto da questão) simplifica bastante essas agregações.

## Export / backup do acervo

Faz parte do MVP. O trabalho de importar e revisar questões é o ativo mais valioso
do app, e o plano grátis do Supabase não garante backup robusto — então o app
provê seu próprio seguro.

- **Um botão "Exportar acervo"** gera um arquivo JSON com: bancas, concursos,
  provas (metadados, sem o binário do PDF), e todas as questões revisadas
  (incluindo matéria, gabarito, comentário, flags). O histórico de `respostas`
  pode ir junto opcionalmente.
- O arquivo é baixado para o dispositivo; você guarda onde quiser (nuvem pessoal,
  pendrive). Rode de vez em quando, sobretudo após sessões grandes de revisão.
- **Escopo:** o export é uma leitura serializada das tabelas. Não inclui os PDFs
  originais nem as imagens dos buckets (esses já estão no Storage; o risco que o
  export cobre é perder a *curadoria*, não os arquivos-fonte).
- **Import/restauração** (recriar o acervo a partir de um JSON) fica como evolução
  futura. O export sozinho já elimina o pior cenário: perder horas de trabalho.

## Estados e navegação (mapa de telas)

```
Home
 ├── Concursos
 │    ├── Lista de concursos  [+ novo concurso → seleciona banca da lista]
 │    └── Detalhe do concurso  (mostra a banca)
 │         ├── Lista de provas + status  [+ importar prova]
 │         ├── Fluxo de importação (upload → processando → revisão)
 │         └── Tela de revisão de questões
 ├── Questões
 │    ├── Buscar/listar questões (por banca, concurso, matéria)
 │    └── Editar questão  (corrigir campos, anexar imagem, comentar)
 ├── Estudar
 │    ├── Montar quiz (filtros: banca, concurso, matéria + modo)
 │    ├── Quiz em andamento
 │    └── Resultado do quiz  (revisar, editar questão, comentar)
 ├── Progresso
 │    └── Estatísticas globais (por matéria e por banca)
 └── Gerenciar  (opcional, leve)
      ├── Bancas   (listar/adicionar)
      ├── Matérias (listar/adicionar)
      └── Exportar acervo (backup JSON)
```

A tela "Gerenciar" pode ser mínima — só para semear e adicionar bancas/matérias
canônicas e disparar o export. Como bancas/matérias são listas pequenas e
estáveis, não precisa de nada elaborado; até um seed inicial no banco já resolve o
começo, e você adiciona pela UI quando aparecer uma banca nova. A área "Questões"
(busca + edição) é o que dá acesso perene ao acervo depois da importação.

## O que fica FORA do MVP (evoluções futuras)

Anotado para não virar escopo agora, mas ficar registrado:

- **Deduplicação de questões repetidas entre provas.** Bancas reaproveitam
  questões, então a mesma questão pode existir em provas/concursos diferentes e
  aparecer duas vezes num quiz por banca. Resolver isso bem é espinhoso (questões
  "quase iguais" geram falsos positivos), então fica para depois — e, se
  atacado, provavelmente como marcação manual ("é a mesma dessa"), não
  agrupamento automático. Por ora, conviver com eventual repetição é aceitável.
- **OCR para provas escaneadas** (PDF que é imagem, sem texto extraível).
- **Modo simulado** com cronômetro e proporção de matérias de uma prova real.
- **Repetição espaçada (SRS)** — reagendar questões erradas por intervalos.
- **Importar/restaurar acervo** a partir do JSON de export (o *export* já é MVP;
  a restauração é que fica para depois).
- **Tags livres** além de matéria/assunto.

Manter o MVP enxuto no núcleo: importar → revisar → montar quiz → responder → ver
resultado. Os acréscimos aprovados (questão-com-imagem, edição pós-aprovação,
comentário e export) reforçam esse núcleo sem desviar dele.
