# Pipeline de Importação

O subsistema write-side. Transforma um PDF numa lista de questões aprovadas.
É a parte mais delicada do projeto — trate com o cuidado descrito aqui.

## Visão geral do fluxo

```
[1] Upload PDF (tablet)
      │  calcula hash, checa duplicata
      ▼
[2] Storage + registro em `provas` (status: pendente)
      │
      ▼
[3] Edge Function dispara (status: processando)
      │  extrai texto bruto do PDF
      ▼
[4] LLM estrutura → JSON de questões
      │  casa com gabarito
      ▼
[5] Valida contra schema Zod
      │  grava questoes (revisada: false)
      │  status: aguardando_revisao
      ▼
[6] Você revisa na UI, corrige, aprova
      │  questoes.revisada = true
      ▼
[7] status: pronta → questões entram nos quizzes
```

## Etapa por etapa

### 1–2. Upload e deduplicação

No tablet, antes de subir: o front lê o arquivo, calcula SHA-256, e consulta se
já existe `prova` com esse `arquivo_hash` no concurso. Se existir, avisa e não
sobe. Caso contrário, envia o PDF ao bucket e cria o registro em `provas` com
`status = 'pendente'`.

**Prova e gabarito separados:** a UI de upload aceita dois arquivos — a prova
(obrigatório) e o gabarito (opcional). Muitas provas trazem o gabarito num PDF à
parte. Se vier junto no mesmo PDF, o segundo campo fica vazio e o LLM extrai
ambos do único arquivo.

### 3. Extração de texto bruto

A Edge Function baixa o PDF do storage e extrai o texto com `unpdf` (leve, feito
pra serverless) ou `pdf.js`. Saída: texto por página. Não tente parsear a
estrutura aqui — só obtenha o texto. A inteligência fica no LLM.

**Caso PDF escaneado (imagem):** se a extração vier vazia/curta, o PDF
provavelmente é imagem. Marque `status = 'erro'` com mensagem clara ("PDF parece
escaneado, precisa de OCR"). OCR fica fora do MVP — anote como evolução futura.

### 4. Estruturação via LLM

Mande o texto ao LLM com instrução para devolver **estritamente JSON** no schema
canônico. Pontos críticos do prompt:

- Peça o formato exato: array de objetos com `numero`, `enunciado`,
  `alternativas` (array de `{letra, texto}`), `tipo`.
- Instrua a **não inventar** questões nem alternativas; se algo estiver ilegível,
  marcar com um campo `incerto: true` para a revisão pegar.
- Detectar tipo: múltipla escolha (A–E) vs certo/errado (estilo Cebraspe).
- **Detectar dependência de imagem:** instrua o LLM a marcar `tem_imagem: true`
  quando o enunciado referencia um elemento visual ausente do texto ("observe a
  figura", "com base no gráfico", "a imagem acima", mapa, tabela-imagem). Como a
  extração é só de texto, essas questões chegam incompletas — a flag garante que a
  revisão as pegue.
- Não incluir o gabarito ainda se ele está em texto separado — casa no passo
  seguinte.

**Casamento com gabarito:** se o gabarito veio separado ("1-C, 2-A, 3-D..."),
parseie esse mapa (número → letra) e aplique a cada questão pelo `numero`. Se
veio junto, o LLM já devolve o gabarito por questão. Sempre valide que **toda**
questão recebeu um gabarito; as que ficarem sem entram na revisão sinalizadas.

**Volume:** provas grandes podem estourar o contexto do modelo. Se necessário,
divida o texto em blocos (por página ou por faixa de questões) e junte os
resultados. Mantenha o `numero` como chave de reconciliação.

### 5. Validação

Antes de gravar, cada questão passa pelo schema Zod canônico (o mesmo do front).
Rejeita: alternativas vazias, gabarito que não corresponde a nenhuma letra
existente, enunciado vazio. Questões que falham não são descartadas
silenciosamente — são gravadas com flag de problema pra você resolver na revisão,
ou logadas no `erro_msg`. Nunca perca dado sem avisar.

Grava as questões com `revisada = false`. Prova vai para `aguardando_revisao`.

### 6. Revisão humana

Tela que lista as questões extraídas daquela prova, mostrando enunciado,
alternativas e **gabarito destacado**. Você pode:

- Editar qualquer campo (enunciado, alternativa, matéria, gabarito).
- Atribuir/corrigir a **matéria** (o LLM chuta, você confirma — ver normalização
  em `03`).
- Confirmar/ajustar a flag **`tem_imagem`** e, se aplicável, **anexar a imagem**
  (vai para o bucket `questao-imagens`, preenche `imagem_path`). Enquanto uma
  questão com imagem não tiver a figura anexada, ela fica inelegível para quizzes.
- Escrever um **comentário/justificativa** (opcional) — anotação de estudo.
- Marcar como **anulada**.
- Aprovar individualmente ou "aprovar todas".

Questões marcadas `incerto`, `tem_imagem` sem anexo, ou sem gabarito aparecem no
topo, destacadas — são as que exigem tua atenção antes de aprovar.

### 7. Conclusão

Ao aprovar, `revisada = true`. Quando todas as questões da prova estão revisadas
(ou você clica "concluir revisão"), a prova vira `pronta`. A partir daí as
questões são elegíveis para quizzes.

## Tratamento de erros

Cada etapa que pode falhar atualiza `provas.status = 'erro'` e preenche
`erro_msg` com algo acionável. A UI mostra o erro e oferece "tentar novamente"
(reprocessa a partir do PDF já no storage — não precisa reupload). Nunca deixe
uma prova presa em `processando` sem timeout/fallback.

## Decisão de LLM

**Decidido: Google Gemini Flash** — camada grátis, bom custo-benefício e sólido
em extração estruturada. É o ponto de partida.

Ainda assim, o pipeline **não deve depender de um provedor específico**: isole a
chamada do LLM atrás de uma função `extrairQuestoes(texto): QuestaoRaw[]`. Se um
dia quiser trocar (ex.: Claude Haiku, que é pago mas muito forte em seguir
schema), troca-se a implementação sem tocar no resto. A chave da API do Gemini
vive **apenas** como segredo da Edge Function, nunca no front.
