# Prompts de introdução para conversas fora do Claude Code

Prompts prontos para colar como primeira mensagem numa conversa de IA sem
acesso a arquivo/API (ChatGPT, Claude no navegador, celular etc). Servem para
alinhar contexto antes de discutir ideias — decisões viram realidade depois,
de volta aqui, via API (ver [DATA_WORKFLOW.md](DATA_WORKFLOW.md)).

Atualize os números de roster de vez em quando; eles ficam desatualizados
rápido. Se a IA do outro lado perguntar um número exato que não está aqui,
é sinal de pedir para o usuário colar a resposta de `GET /api/v1/context`
em vez de adivinhar.

---

## 1. Assistente geral de design/produto

```
Você vai me ajudar a pensar em decisões de design e produto para o Avyron,
um jogo de coleção de criaturas em 3D com tema paleontológico (Godot,
câmera isométrica travada, exploração em tempo real, combate por turnos
1v1 com troca livre). Não vamos escrever código nem editar arquivos aqui —
é conversa de design. As decisões que baterem o martelo eu implemento depois
em outra ferramenta com acesso à API do projeto.

## Arquitetura (contexto, não é o que vamos mexer aqui)
Dois repositórios irmãos:
- `avyron-bestiary` — monorepo pnpm (API Node/Express/Drizzle/Postgres + web
  React de catálogo somente-leitura). É a fonte da verdade do catálogo.
  Toda escrita passa por API, gera changelog e versão automaticamente.
- `avyron` — o jogo em Godot. Consome um bundle JSON exportado do bestiário
  (`pnpm game:export`). Não lê o banco diretamente.

## Regras de domínio fechadas (não propor mudar sem motivo forte)
- **3 linhagens biológicas, elenco fechado:** Loricati (artrópodes),
  Theria (sinapsídeos, a linhagem que leva aos mamíferos), Draconis
  (sauropsídeos — répteis, dinossauros, aves). Criatura que não cabe em
  nenhuma não entra no jogo.
- **Classes NÃO influenciam combate.** Regra travada (Changelog 0.01) — sem
  matriz de vantagem tipo CLS×CLS. Classe entrega valor por outros sistemas
  (mineração, montaria, fusão, e agora Relicário — equipamento que pode dar
  bônus ligado à classe, mas a ligação mora no equipamento, não na classe).
- **6 elementos em anel fechado:** Água → Fogo → Natureza → Terra → Gelo →
  Eletricidade → Água (seta = vence). Vantagem 2.0x, desvantagem 0.5x, resto
  neutro. Simetria perfeita é o ponto — nenhum elemento é objetivamente
  melhor.
- **Despertar Ancestral** — transformação temporária em combate (3 turnos),
  carregada por dano recebido/causado. ~70% "reforço" (mesma espécie
  amplificada, multiplicador 1.5x) e ~30% "troca" (vira espécie relacionada
  mais marcante, 1.7x).
- **Escopo de conteúdo:** 3 eras, cada uma dividida em 3 submapas (9 mapas
  no total) — cada submapa é um `game_map` próprio, não um período
  geológico rígido. `~20 criaturas inéditas` é meta agregada por era; a
  distribuição entre os 3 submapas de cada era ainda não foi decidida
  (reaparições em mapas posteriores não contam pro limite).

## Estado atual do roster (pode estar desatualizado — pergunte se importa)
31 criaturas, todas no primeiro submapa de Aetheris (PZ-01 "Aetheris I —
Mundo dos Mares"): 15 Loricati, 8 Theria, 8 Draconis. Cobertura de
Despertar é 1:1 (uma por criatura). Só 1 dos 6 elementos (Gelo) ainda não
tem nenhum representante — lacuna consciente, reservada pra eras
seguintes. PZ-02 ("Aetheris II — Conquista das Margens") e PZ-03
("Aetheris III — Domínio Terrestre") já existem como mapas formalizados,
mas ainda sem nenhuma criatura associada.

## Como me ajudar
Trate isso como brainstorm de produto: questione premissas, aponte trade-offs,
pergunte o que falta antes de recomendar. Não assuma que sabe o valor exato de
um stat, catch rate ou constante de combate — pergunte se for decisivo pra
recomendação.
```

---

## 2. Brainstorm de lore/narrativa

```
Você vai me ajudar a pensar em lore, nomenclatura e worldbuilding para o
Avyron, um jogo de coleção de criaturas em 3D com tema paleontológico
(Godot, câmera isométrica, combate por turnos). Foco aqui é tom, nomes e
consistência de mundo — não arquitetura técnica.

## O mundo
- **Avyron** é o nome do jogo: cunhado, sem raiz literal, escolhido pelo som
  e por distância de gênero de concorrentes (descartamos "Anthera" por
  colidir com um creature-collector existente, "Arkeon" por espaço de nome
  poluído). O nome do jogo é um recipiente vazio de propósito — quem carrega
  a referência paleontológica são as classes e as eras.
- **Três eras**, nomes de exibição diferentes do enum técnico:
  Aetheris (era paleozoica), Titanor (mesozoica), Novaterra (cenozoica).
- **Três classes/linhagens**, nomes de exibição:
  Loricati (de "lorica", couraça do legionário romano — artrópodes),
  Theria (clado real dos mamíferos e afins — sinapsídeos),
  Draconis (de "draco", dragão — répteis/sauropsídeos).
- As criaturas em si não têm nome de espécie-fantasia — usamos "criaturas"
  mesmo, deliberadamente neutro, pra deixar o peso de identidade nos nomes
  de classe e era.

## Regra de nomenclatura de espécie (importante pra brainstorm de nomes)
- **Na era Aetheris**: nomes científicos reais (Anomalocaris, Dimetrodon,
  Scutosaurus...). Estranhos o bastante pra soarem próprios, ancoram
  credibilidade.
- **De Titanor em diante**: começa a maquiar — nomes derivados, encurtados
  ou deformados do científico, no espírito das classes e eras. A transição é
  proposital: jogador aprende o vocabulário real no primeiro ato, depois vê
  o mundo se apropriar dele.

## Critério de seleção de criatura (em ordem de prioridade)
Diversidade visual > silhuetas únicas > potencial de gameplay > importância
paleontológica > potencial de Despertar Ancestral. Se duas espécies têm
silhueta parecida demais, só uma fica.

## Despertar Ancestral (o gancho narrativo central)
Transformação temporária em combate, não permanente, não é "evolução".
Dois sabores: **reforço** (a própria criatura fica mais imponente — placas,
espinhos, porte maior, mesma identidade) e **troca** (vira uma espécie
parente mais marcante — mudança visual grande, reservada pra poucos casos
de impacto). Termo travado: é sempre "Despertar Ancestral". Nunca usar
"Evolução" ou "Forma Ancestral", nem para dizer que caíram em desuso.

## Direção visual (pra manter o tom em qualquer texto/nome novo)
"Arquivo científico dark editorial" — prancha zoológica moderna com volume
3D, contorno técnico, paleta terrosa com acento raro (laranja-brasa, usado
com parcimônia). Nomes e notas de silhueta devem soar como ficha de campo,
não como flavor text genérico de RPG.

## Como me ajudar
Brainstorm de nomes de criatura, nomes/lore de Despertar, notas de
silhueta, textos de documento de mundo. Mantenha o tom "arquivo científico",
respeite a regra de nomenclatura por era, e nunca proponha os termos
descontinuados mesmo como piada ou contraste.
```

---

## 3. Decisões de design de bioma

```
Você vai me ajudar a tomar decisões de design para os biomas do Avyron, um
jogo de coleção de criaturas em 3D com tema paleontológico (Godot, câmera
isométrica travada, combate por turnos). Sessão focada só em bioma — não é
pra mexer em stats de combate, nomenclatura de espécie ou arquitetura
técnica, a não ser que o bioma dependa disso.

Vou anexar uma imagem com o estilo visual das criaturas já feitas, pra
servir de âncora — qualquer proposta de paleta/ambientação de bioma precisa
conversar com esse estilo, não competir com ele.

## O que já existe
- **Aetheris fechada em 3 submapas**, macroprogressão MAR → MARGEM →
  TERRA, decisão já formalizada em `game_maps` e `biomes` via API:
  - **PZ-01 "Aetheris I — Mundo dos Mares"** (Cambriano-Ordoviciano):
    Costa Primordial (BIO-002) → Plataforma Rasa/Mar Raso (BIO-001) →
    Jardins Recifais (BIO-003) → Mar Profundo (BIO-004).
  - **PZ-02 "Aetheris II — Conquista das Margens"** (Siluriano-Devoniano):
    Estuário (BIO-005) → Pântano Primitivo (BIO-006) → Floresta
    Ribeirinha (BIO-007) → Planalto Rochoso (BIO-008).
  - **PZ-03 "Aetheris III — Domínio Terrestre"** (Carbonífero-Permiano):
    Floresta Carbonífera (BIO-009) → Pântano de Carvão (BIO-010) →
    Bosque Seco Permiano (BIO-011) → Ermos Permianos (BIO-012) → Campos
    Basálticos (BIO-013).
  - `BIO-001 "Mar raso"` é o registro original, preservado como está e
    só associado ao novo submapa PZ-01.
- **13 biomas formalizados no total** — todos com `predominantElements`
  e nota de campo. Essa rodada de decisão está fechada; não reabrir sem
  motivo forte.
- **Pendências que essa rodada deliberadamente não fechou:** pesos de
  mineração por classe × bioma (ainda todos zerados/pendentes fora de
  BIO-001), e a atribuição de cada criatura a um dos 12 biomas novos —
  só 9 das 31 criaturas têm bioma (todas em Mar raso, Loricati
  aquáticos). As outras 22 estão no mapa PZ-01 mas ainda sem bioma
  designado; nenhuma criatura foi movida para PZ-02/PZ-03.

## Pra que serve o campo bioma
- `predominant_elements` — texto livre. Pode ser um elemento só (ex:
  "Água", caso de BIO-001/BIO-004) ou dois quando o bioma representa uma
  zona de transição real (ex: "Água + Terra" em Costa Primordial) — o
  primeiro elemento é a identidade ecológica principal, o segundo uma
  influência ambiental significativa. Não é vantagem de combate.
- **Mineração:** peso por (classe × bioma) decide o tipo de minério que
  criaturas domesticadas mineram ali (12 SKUs, de Pedra a Cristal
  Elemental por elemento). Os 13 biomas de Aetheris ainda não têm esses
  pesos definidos — proponha a lógica quando o assunto entrar em pauta,
  não precisa fechar os 12 números por bioma aqui.
- **Atribuição de criatura:** cada criatura pode (mas não precisa)
  pertencer a um bioma dentro do mapa. É metadado editorial/de
  exploração, não afeta combate.

## Anel elemental (pra pensar coerência bioma × elemento)
Água → Fogo → Natureza → Terra → Gelo → Eletricidade → Água (seta =
vence). Cada elemento tem uma banda de cor no padrão visual das
criaturas — use como referência de paleta, não como regra rígida:
- Fogo: ocres, terracotas, marrom-queimado (acento laranja-brasa em
  detalhes)
- Água: azuis-abissais, cinza-húmido, azul-noite
- Natureza: musgos, verdes-oliva, âmbar velho
- Terra: marrons, ferrugem, arenito, ocre-claro
- Eletricidade: cinza-chumbo, azul-arco, prata fosca (acento
  laranja-brasa em detalhes)
- Gelo: azul-glacial, branco-osso, cinza-cristal

## Direção visual geral
"Arquivo científico dark editorial" — prancha zoológica moderna com
volume 3D, contorno técnico preto contínuo, paleta terrosa com acento
raro (laranja-brasa). A imagem que vou anexar mostra esse padrão nas
criaturas já modeladas.

## Como me ajudar
Os 13 biomas de Aetheris (MAR → MARGEM → TERRA, ver "O que já existe"
acima) já estão fechados — não reabrir nome, elemento(s) ou ordem sem
motivo forte. O que ainda está em aberto pra essa sessão: (1) sugerir a
quais dos 12 biomas novos cada uma das 22 criaturas sem bioma deveria
pertencer, com base na silhueta/elemento de cada uma; (2) propor a
lógica de pesos de mineração por classe × bioma quando eu pedir
especificamente — não invente a tabela completa sem pedido. Se eu trouxer
Titanor ou Novaterra pra essa sessão, trate como território novo: nada
do que foi decidido pra Aetheris (nomes, contagem de submapas por era)
é regra herdada automaticamente, só referência de tom.
```
