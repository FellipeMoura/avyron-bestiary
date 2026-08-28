# CLAUDE.md — briefing para sessões do Claude Code

Contexto essencial para trabalhar neste repositório. Leitura obrigatória antes de propor mudanças. Complementa o `README.md` (que foca em como rodar).

## O que é isto

App web de catálogo/documentação de um jogo 3D de coleção de criaturas com tema paleontológico. **Este repositório NÃO é o jogo** — o jogo em Godot vive em um repositório irmão em `c:\code\fellipe\avyron` e não deve ser tocado a partir daqui. A ponte entre os dois é `pnpm game:export`, que escreve um bundle JSON versionado lá.

O jogo chama-se **Avyron**: Godot, câmera isométrica ortográfica travada em 30°/45°, exploração em tempo real e **combate por turnos** (1v1 com troca livre, in-world, sem arena separada).

**Nomenclatura in-world.** As cinco classes e as três eras (Aetheris, Titanor, Novaterra) carregam nomes ficcionais próprios. Esses são nomes de *exibição* — os códigos (`CLS-*`) e os enums do banco (`paleozoic`, `mesozoic`, `cenozoic`) seguem inalterados. Nomes de classe não têm significado linguístico real e não descrevem clado: o que a classe significa está em `creature_classes.primaryStat`. As eras traduzem por `ERA_LABEL` em `labels.ts`; a especialização de classe, por `PRIMARY_STAT_LABEL`. Ver documentos `nomenclatura` e `classes`.

**Dois públicos com necessidades opostas:**
- **Humanos leem** o bestiário, mapas, lore e histórico na UI. Não há painel admin, login de usuário, CRUD genérico nem sessão.
- **Agentes de IA escrevem** conteúdo via API.

Isso não proíbe uma ação pontual e específica disparada por um botão no frontend (ex.: um botão que dispara uma sincronização já implementada na API) — o que se evita é construir telas de edição genéricas (CRUD, sessão, edição concorrente no navegador) sem necessidade real. Toda lógica de escrita, changelog e versão continua vivendo exclusivamente na API, nunca inline no frontend.

**A exceção declarada é `/elements`** (`routes/Elements.tsx`), a única tela de edição do app. Ela existe porque a paleta é o único campo do catálogo que **não se autora às cegas**: um `PATCH` com `#2E7FA8` no corpo não diz se o azul de Água some no fundo d'água do PZ-01, e a tela mostra a rampa contra os fundos reais do mapa enquanto se escolhe. Continua sem sessão, sem CRUD genérico e sem lógica de escrita no cliente — o formulário só monta o corpo de um `PATCH /elements/{code}` que já existia, com `reason`/`impact` obrigatórios. Tela de edição nova precisa do mesmo tipo de justificativa: um campo que o olho decide.

## Modelo de ameaça

**Os dados do bestiário não são valiosos.** Vazamento total do banco não geraria prejuízo — é catálogo de design de um jogo, nada pessoal, nada financeiro. Isso muda como pensamos segurança:

- **O que importa proteger:** os vizinhos do servidor. Uma vulnerabilidade no bestiário não pode ser trampolim para o quartzo, o Postgres compartilhado, ou o sistema operacional.
- **O que NÃO precisa de rigor:** confidencialidade dos dados, integridade forte, backup diário obsessivo, alertas 24/7.
- **Consequência prática:** role Postgres `bestiary_app` estritamente sem `SUPERUSER`/`BYPASSRLS` e sem grants em outros DBs; processo PM2 rodando como user não-root sem sudo; sem endpoints que executem comandos de shell / uploads arbitrários; UFW seguindo o padrão da VPS (só 22/80/443); Nginx com `server_name` específico, sem catch-all. Rate limit leve ainda vale — protege a VPS de saturar, não os dados.

Ao propor mudanças, calibrar por este modelo. Não perder tempo com criptografia de campos, auditoria fina, backup horário; **não** relaxar isolamento de perímetro.

## Stack

Monorepo pnpm workspaces:

- **`apps/api`** — Node + TypeScript + Express + Drizzle + Zod + zod-to-openapi + PostgreSQL
- **`apps/web`** — Vite + React 19 + React Router 7 + TanStack Query + Tailwind + openapi-fetch
- **`packages/db`** — schemas Drizzle e migrations. O `seed/` está **congelado** (ver abaixo).
- **`scripts/export-game-data.mjs`** — export build-time do bundle para o repo Godot

**Não usamos:** Docker em prod, Redis, BullMQ, Socket.io, MinIO, RLS multi-tenant, JWT, OAuth, migrations com Alembic-like, rate limiting. Padrão inspirado no `c:\code\saas\frostie` mas enxuto.

Portas: web 5100, api 5101, postgres 5102.

## Regras invioláveis

Estas quatro regras não têm exceção. Se algo parecer conflitar com elas, elas ganham.

1. **Lógica de escrita só vive na API.** Toda transação, changelog e cálculo de versão fica em `apps/api` — nunca inline no frontend ou em script solto. O frontend não tem CRUD genérico; pode disparar uma ação de escrita pontual e já implementada na API (um botão que chama um endpoint específico) e tem **uma** tela de edição declarada, `/elements`, pelo motivo registrado acima. Nos dois casos a `x-api-key` de dev vem de `VITE_API_KEY`, e o corpo carrega `reason`/`impact` como qualquer outra escrita.
2. **Terminologia travada.** Termo oficial: **"Despertar Ancestral"** (transformação temporária, retorno à forma base). Os termos **"Evolução"** e **"Forma Ancestral"** estão descontinuados. Middleware `rejectForbiddenTerms` scaneia todo body de escrita e retorna `422` se achar essas expressões em qualquer campo de texto, apontando o campo ofensor. Ver `apps/api/src/shared/services/terminology.ts`.
3. **Toda escrita gera changelog na mesma transação.** Campos `reason` e `impact` são obrigatórios em todo body de POST/PATCH. O servidor grava a entrada de changelog e incrementa a versão (formato `0.NN`) sozinho — agente **nunca** escolhe a versão. Ver `apps/api/src/shared/services/changelog.ts`.
4. **Economia de tokens é requisito funcional.** Quem consome a API é LLM pagando por token. `POST` responde só `{"code","version"}`. `GET` aceita `?fields=code,name`. Erros nomeiam campo e valores válidos: `"classCode: 'CLS-999' does not exist"`, não `"invalid"`.

5. **O seed está congelado.** Passo a passo de inserção de dados: [docs/DATA_WORKFLOW.md](docs/DATA_WORKFLOW.md). `packages/db/src/seed/` existiu para tirar o corpus dos `.docx`/`.xlsx` antes do primeiro deploy. Esse trabalho acabou. **Nunca adicionar lote de conteúdo novo lá.** Conteúdo entra pela API — que gera changelog e versão sozinha. Conteúdo commitado como TypeScript não tem nem um nem outro. Para hidratar uma máquina, `pnpm db:restore`.

6. **Toda escrita termina em `pnpm db:dump`.** O banco é um container local; o durável é `packages/db/snapshot/` commitado. Sem o dump, o catálogo existe numa máquina só e não está no git. O snapshot **não** contradiz a regra 5: ele é o resultado de escritas que já passaram pela API e já geraram changelog — a tabela `changelog` está dentro dele.

## Onde cada informação mora

Três casas, e um teste de duas perguntas para escolher entre elas. A dúvida "isto é tabela, documento ou Godot?" reaparece toda vez que um sistema novo nasce, e errar é barato agora e caro depois: o que duplica, deriva.

**Pergunta 1 — o jogo lê isso em runtime?** Se sim, é **tabela**, sem exceção. É a regra 1 do repo do jogo generalizada: não é sobre *número*, é sobre qualquer coisa que o Godot consulte. Corolário duro: **documento de design nunca é fonte de verdade de algo que o jogo lê.** Se o documento é o único lugar onde a informação existe e o jogo precisa dela, falta uma tabela.

**Pergunta 2 — sobreviveria a uma troca de motor?** Só para o que o jogo não lê. Se sobrevive, é **documento** — o critério, a justificativa, a regra estrutural. Se não sobrevive, é **Godot** — posição de nó, densidade de névoa, raio de colisão, seed de ruído: só faz sentido dentro de uma cena.

| | Tabela | Documento | Godot |
|---|---|---|---|
| Forma | N linhas com os mesmos campos | prosa única, sem instâncias | código e cena |
| Responde | *quais* e *quanto* | *por quê* e *sob que critério* | *como aparece* e *onde fica* |
| Muda quando | o conteúdo do jogo muda | uma decisão muda | a implementação muda |
| Nunca contém | o racional longo | contagem, lista, constante | número de balanceamento |

`notes` de uma linha é para uma frase de contexto, não para o racional — o racional é do documento. Foi por ignorar isso que `progression_rules.notes` virou cópia de um parágrafo inteiro, e envelheceu junto com ele.

**A quarta casa é nenhuma: derivado não se guarda.** "Quantas criaturas por classe", "média de `xpYield`", "quantas batalhas até o teto" são consultas, não dados — se dá para contar, conta-se na hora. Foi guardando derivado que o documento `progressao` passou a afirmar uma contagem de criaturas por classe enquanto o elenco já era outro, e a mesma frase velha ficou copiada dentro de `progression_rules.notes`. Rótulo qualitativo que é leitura de um número cai na mesma regra: a "raridade" de um minério é o peso dele em `mining_rates`, e transcrevê-la como texto só cria um segundo lugar para ela discordar de si mesma.

**O que um documento contém, então:** a regra estrutural, o critério de autoria, e um ponteiro para as tabelas onde as instâncias vivem. Nada mais. Um documento só é editado quando a **estrutura** muda — tabela nova, campo com significado novo, critério novo. Cadastrar PZ-04 não toca documento nenhum. O modelo curto e certo é `eras-e-regioes`; o modo de falha é uma tabela de instâncias transcrita dentro do markdown, que foi o que `mineracao` e `progressao` faziam até 2026-08.

Ponteiro não precisa repetir a lista para ser útil: `GET /api/v1/context` já entrega prefixos de código, invariantes e o índice de endpoints, e `GET /openapi.json` entrega os schemas.

**A fronteira Godot/bestiário se move, e o gatilho é declarável.** Layout de mapa (`MapDressing.PZ01_LANDMARKS`) fica no Godot enquanto for instância única autorada visualmente. Vira tabela quando as duas coisas valerem: se repete com a mesma forma em vários mapas, **e** alguém que não programa precisa autorar. Com um mapa, GDScript é honesto; com nove, é gargalo.

## Naming (aprendido na marra)

- **Código = inglês:** tabelas (`creatures`, `awakenings`, `creature_classes`, `game_maps`, `design_documents`), colunas (`original_name`, `activation_chance_pct`), endpoints (`/api/v1/creatures/{code}`), variáveis, componentes, pastas.
- **Colisões TS resolvidas:** `CreatureClass` (não `Class`), `GameMap` (não `Map`), `DesignDocument` (não `Document`).
- **UI = português:** títulos, botões, labels, mensagens de estado, mensagens de erro. Nunca inline nas rotas — passa por `apps/web/src/lib/labels.ts`.
- **Conteúdo do domínio = português:** valores em campos de texto (nomes de criaturas, notas, corpo dos documentos, motivo/impacto do changelog).
- **Enums no banco = inglês** (`reinforcement`, `swap`, `paleozoic`), traduzidos na apresentação via `labels.ts` (`AWAKENING_TYPE_LABEL`, `ERA_LABEL`, `DOCUMENT_STATUS_LABEL`).
- **Prefixos de código dos dados** preservados dos fontes originais em português: `CRT`, `DSP`, `ELE`, `CLS`, `BIO`, `HAB`, `ITM`, `NPC`, `MIS`, `DRP`. São valores, não código.

## Convenções por camada

**API — feature-folder por recurso** em `apps/api/src/modules/<feature>/`:
- `{Feature}Types.ts` — Zod schemas com `.openapi()` (single source of truth para validação + docs)
- `{Feature}Service.ts` — data access, escreve dentro de `db.transaction` com `recordChange`
- `{Feature}Controller.ts` — thin, delega para Service, `satisfies RequestHandler`
- `{Feature}Routes.ts` — Express router + `registerPath` no `registry`

**Seis helpers reduzem boilerplate** em `apps/api/src/shared/services/`:
- `crudFactory.ts` — gera list/get/create/update/batchCreate para tabelas SEM FKs (elements, biomes, items, creature-classes)
- `crudRoutes.ts` — gera as 5 rotas padrão + registerPath OpenAPI a partir dos schemas
- `childUpsertFactory.ts` — para tabelas 1:1 filhas de um pai com `code`, endereçadas pelo código do pai e escritas por upsert (creature-stats, ability-stats, capture-rules)
- `childUpsertRoutes.ts` — as 4 rotas desse padrão: list, get-by-parent-code, upsert, batch
- `singletonFactory.ts` — para as tabelas de regra de linha única (combat-rules, progression-rules, economy-rules, relic-rules): `get` + `update`, `ensureRow` que recria a linha sozinho, e `orderedPairs` para os pares `min <= max` validados contra a linha **já mesclada com o patch**, não só contra o que veio no corpo
- `singletonRoutes.ts` — as 2 rotas desse padrão: `GET` e `PATCH`. Existe menos pelas linhas economizadas e mais porque a cadeia de middleware (`writeLimiter`, `requireApiKey`, `rejectForbiddenTerms`, `validateBody`) fica num lugar só: um arquivo que esquecesse um deles passaria despercebido, já que todos são idênticos de longe

**Quando NÃO usar factory:**
- Recursos com FK (creatures, awakenings, missions, npcs, abilities) — Service manual porque precisa resolver códigos para ids dentro da transação via `resolveCodeInTx` (`apps/api/src/shared/services/fkResolver.ts`)
- Awakenings tem constraint 1-para-1 em `creatureCode` — POST em criatura que já tem despertar responde `409`
- **As 6 junções** (`drops`, `map-biomes`, `elemental-advantages`, `merchant-offers`, `mining-rates`, `creature-abilities`) usam semântica upsert (`onConflictDoUpdate`) e continuam manuais **por decisão, não por omissão**: quatro cabem no mesmo molde, mas `mining-rates` tem chave polimórfica (`classId` XOR `biomeId`, dois alvos parciais com `targetWhere`) e `creature-abilities` faz o lote sequencial de propósito e é a única com `DELETE`. Uma `junctionFactory` teria que ganhar condicional para acomodar as duas — o custo que ela deveria estar evitando. Reavaliar quando aparecer a sétima — **ela apareceu** em 2026-08-28 (`equipment-recipes`, par simples, escrita à mão espelhando `drops`), e a decisão ficou de manter manual mais uma vez: com cinco cópias de par simples, o argumento pela fábrica passou de hipótese a contagem. Ver `../avyron/AUDITORIA.md`, 5(c)
- **Cuidado ao escrever lote à mão:** em `onConflictDoUpdate`, `set: { col: schema.tabela.col }` renderiza `SET col = tabela.col` e reescreve a linha antiga consigo mesma — o lote insere o que é novo e ignora em silêncio o que já existia, enquanto o changelog grava que atualizou. O certo é `` sql`excluded.col` ``. Três módulos nasceram com esse defeito por cópia e foram corrigidos em 2026-08
- **Coluna anulável no alvo do conflito** precisa de `UNIQUE ... NULLS NOT DISTINCT`: em Postgres `NULL` nunca conflita com `NULL`, então dois POSTs iguais duplicam a linha em vez de sobrescrever. `drops.condition` é o único caso hoje, corrigido na migration `0015`

**Endpoints especiais:**
- `GET /context` — snapshot markdown compacto (terminologia + elementos + classes + contagens + últimas 5 versões). Primeira leitura de qualquer agente escritor.
- `GET /documents/{slug}` — content negotiation: `Accept: text/markdown` devolve texto puro, senão JSON com envelope.

## Regras de domínio (não estão no código)

- **Elenco fechado em 5 classes, e classe é especialização de atributo — não linhagem.** Cada classe declara um `primaryStat` (um dos cinco stats de `creature_stats`, sem o prefixo `base`) e um `primaryStatBonusPct`. Foi elenco fechado em 3 *linhagens* (artrópodes / sinapsídeos / sauropsídeos) até 2026-08; a mudança veio porque amarrar taxonomia a gameplay travava o elenco justamente nos mapas mais antigos e mais recentes. **Taxonomia é independente da classe:** criatura de qualquer linhagem pode receber qualquer classe, e não existe validação taxonômica em lugar nenhum — não criar uma. Quais classes existem: `creature_classes`. Ver `classes`.
- **A classe engrossa o próprio stat; não existe matchup CLS×CLS.** Esta é a regra do Changelog 0.01 com a formulação corrigida, não relaxada. O que continua proibido para sempre: campo em `creature_classes` cujo valor dependa da classe do **oponente**, e ciclo entre classes como o anel elemental. O que passou a existir: `primaryStatBonusPct`, um bônus plano que o jogo aplica ao `primaryStat` da própria criatura, igual contra qualquer adversário. Mesmo refinamento no Relicário: um *equipamento* concede bônus de captura vinculado à classe, mas isso é propriedade do equipamento. O Relicário **não** concede buff de combate — `combatBuffBase`/`combatBuffPerLevel` saíram do banco em 2026-08 (ver `relicario`). Ver `classes`, `captura`, `relicario`.
- **Elementos SIM, em anel fechado:** Água → Fogo → Natureza → Terra → Eletricidade → Água (seta = vence). Vantagem 2.0, desvantagem 0.5, resto 1.0 por omissão. Cada elemento vence exatamente um e perde para exatamente um — a simetria é o ponto, não um acidente.
- **Criatura ↔ Despertar é 1-para-1.** Tabela `awakenings` tem `UNIQUE(creature_id)`. Ausência de linha = criatura sem despertar. A cobertura é meta de conteúdo, e é `test_data.gd` no repo do jogo que acusa quando ela cai, não o export.
- **3 eras, cada uma dividida em 3 submapas (9 mapas no total).** Cada submapa é um `game_map` próprio (`era` compartilhada, `code` sequencial: `PZ-01/02/03`, depois `MZ-*`, `CZ-*`) e representa um bloco cronológico/ecológico, não um único período geológico rígido. A macroprogressão de cada era é decisão de design; a de Aetheris é MAR → MARGEM → TERRA. `~20 criaturas inéditas` é meta agregada por era — a distribuição entre os 3 submapas ainda não foi decidida. Reaparições em mapas posteriores não contam para o limite. Quais mapas existem e em que ordem: `game_maps` (`GET /maps`); quais biomas cada um tem: `map_biomes`. Ver `eras-e-regioes`.
- **Arena em todo mapa; Glifo só no último mapa da era.** Vencer qualquer arena é marco com recompensa própria, mas só a arena que fecha a era concede o Glifo que abre a seguinte. Daí duas nulidades que são estado NORMAL e não dado faltando: `npc_duelists.grants_glyph_id` nulo (arena intermediária) e `map_connections.required_glyph_id` nulo (travessia dentro de uma era, livre e sem guardião). Duas invariantes ficam no banco e no export, não na prosa: um Glifo é concedido por no máximo uma arena (`UNIQUE`), e travessia exigindo Glifo que arena nenhuma concede **aborta o export** — senão o guardião nunca deixa passar e a campanha trava sem erro em lugar nenhum. Ver `glifos-e-portais`.
- **Regra 70/30** do Despertar Ancestral: ~70% "reforço" (mesma espécie amplificada, multiplicador 1.5), ~30% "troca" (vira outra espécie relacionada, multiplicador 1.7).
- **Subir de nível pede XP _e_ material.** As duas condições juntas, nunca só uma. O material é o item `category: "material"` da classe da **própria criatura que sobe** — um por classe, ligado por `items.class_id` —, e ele cai de criatura selvagem derrotada: a classe do **derrotado** decide qual item sai, não a de quem venceu. Isso é categorização de loot, não matchup: a classe do vencedor não entra na conta. **CLS-004 e CLS-005 ainda não têm material** — o export avisa enquanto elas não tiverem elenco e **aborta** na primeira criatura que entrar numa delas, porque essa criatura acumularia XP e nunca subiria de nível. Ver documento `progressao`.
- **Silhueta é critério de corte** — cada criatura deve ser reconhecível pela sombra, projetada em 30°/45°.

## Camada de números (o que o jogo consome)

Estas tabelas separam o catálogo editorial dos valores que o jogo executa.

- `combat_rules` — **singleton** (`id = 1`, garantido por CHECK). As constantes de tuning: escala de dano, variância, taxas de enchimento da carga, limites de captura, teto de nível. `GET /combat-rules` e `PATCH /combat-rules` — sem código, sem lista, sem POST. **É aqui que se balanceia o jogo.**
- `progression_rules` — **singleton**. As constantes de subida de nível: curva de XP, divisor do XP concedido, custo de material por nível. `GET /progression-rules` e `PATCH /progression-rules`. Mesmo contrato de `combat_rules`.
- `creature_stats` — 1:1 com criatura. `baseHp`, `baseAttack`, `baseDefense`, `baseSpeed`, `baseCharge`, `growthRate`, `xpYield`. Valor efetivo: `floor(base * (1 + growthRate * (nível - 1)))`, e depois **o bônus da classe sobre o `primaryStat` dela**: `floor(valor * (1 + primaryStatBonusPct / 100))`. Os dois passos vivem em `CombatMath`; quem os combina é `BestiaryData.stats_at_level`, o funil único por onde combate, time, ficha e painel passam.
- `ability_stats` — 1:1 com habilidade. `power` 0 = movimento de status; `effectCode` é o switch que o Godot roda.
- `capture_rules` — 1:1 com criatura. `catchRate` 1–255.
- `creature_abilities` — junção: qual criatura sabe qual golpe, em que nível.
- `item_stats` — 1:1 com item. `value` (preço de compra) e o par `effectCode`/`effectValue`, que é o switch que o Godot roda ao usar o item. Mesmo contrato de `ability_stats`.
- `economy_rules` — **singleton**. Nome da moeda (`Óbolo`), bolsa inicial, e `sellRatio`: a fração do `value` que o comerciante paga ao comprar do jogador. O CHECK trava em (0, 1) — em 1.0 o jogador lucraria comprando e revendendo em loop.
- `equipment` / `equipment_stats` / `equipment_recipes` — Amplificador e Encantador, as peças passivas do set do domador. Descritivo, números (`tier`, `effectCode`, `effectValue`) e receita (junção equipamento × item, só minério). **Não existe `equipment_rules`**: o único número global do sistema é o clamp acumulado de modificador, que é do `Battle` e vale para toda fonte — tabela sem consumidor é a lição da migration `0014`. Ver documento `equipamentos`.
- `merchant_offers` — junção npc × item: o catálogo de cada comerciante. `price` nulo cobra `item_stats.value`, o que faz um segundo vilarejo mais caro custar dado em vez de código.

As junções e as tabelas 1:1 usam upsert — re-POST para mudar, sem PATCH. `combat_rules` e `economy_rules` são a exceção: sendo singletons, PATCH é a operação natural.

**Enums que decidem comportamento no jogo**, não rótulos:
- `item_category` (`mineral`, `capture`, `heal`, `material`) — o export filtra minério nesta coluna. Era texto livre, e por isso `mining.items` recebia a tabela inteira: o primeiro item de comerciante teria sido exportado como minerável. `material` é o drop de combate gasto na subida de nível — fica fora de `mineral` pelo mesmo motivo.
- `item_effect` (`none`, `capture_bonus`, `heal_flat`, `heal_percent`).
- `npc_role` (`merchant`, `duelist`, `quest`, `flavor`) — decide qual tela o jogo abre ao interagir.

**Dano:** `floor((power * attack / defense) * damageConstant * multElemental * random(varianceMin, varianceMax))`, com piso em `damageMinimum`.
**Carga do Despertar:** enche com dano recebido (×`chargeTakenMultiplier`) e causado (×`chargeDealtMultiplier`), escalado por `baseCharge / chargeNeutralCharge`. Cheia em `chargeMax`, dura 3 turnos, zera na reversão. Receber enche mais que causar — deliberado, para o Despertar ser virada de jogo e não amplificador de vitória.

Nenhuma dessas constantes está escrita em código. O jogo lê o bloco `rules` do bundle, e o bundle lê `combat_rules`. Mudar balanceamento é um PATCH versionado, não um commit.

**A contagem de tabelas não é regra.** Cinco é o que o jogo precisa hoje; se um sistema novo pedir mais, crie.

Especificação legível para humanos: documentos `combate`, `carga-e-despertar` e `captura` na API.

## Frontend visual

Direção: **arquivo científico dark editorial**. Não é padrão frostie/shadcn — tokens próprios em `apps/web/tailwind.config.ts`:

- Paleta: `void #0A0B0D`, `slate`, `bone`, `moss`, `graphite`, `ember`
- Fontes: Space Grotesk (display) + JetBrains Mono (códigos) + Inter (body)
- Cards angulares (radius 0-2px), sem sombra, escala tipográfica não-linear
- **`ember` é o único acento quente.** Regra: máximo 1 uso por tela, nunca como fundo de botão
- **A ficha de criatura é o único lugar com peso visual.** Hero number CRT-XXX em display XL + barra `moss` de escala à esquerda. Bestiário/docs/changelog ficam quietos.
- Piso: `prefers-reduced-motion` respeitado, foco de teclado visível (`outline ember`), `bone` só ≥14px (abaixo cair para `#F5F1E6`)

## Comandos frequentes

```powershell
pnpm dev                  # sobe api + web em paralelo
pnpm typecheck            # três workspaces
pnpm db:dump              # grava packages/db/snapshot/ — rode depois de toda escrita
pnpm db:migrate           # aplica as migrations pendentes, uma transacao por arquivo
pnpm db:restore           # migrations + snapshot; hidrata uma maquina do zero
pnpm db:studio            # drizzle-kit GUI para inspecionar
pnpm openapi:generate     # regera schema.d.ts do web a partir da API rodando
pnpm game:export          # gera o bundle JSON e espelha os .glb vinculados no repo Godot irmão
pnpm models:optimize      # comprime .glb novo para KTX2 — rode ao adicionar modelo
pnpm models:placeholders  # converte placeholder_models/ (glTF) em .glb com clipes normalizados
pnpm models:biomes        # prepara o kit de props de bioma (texturas 1024², gltf compartilhado)
pnpm models:characters    # prepara o kit de personagens humanos (corpos, outfits modulares, animações normalizadas)
pnpm db:seed              # CONGELADO — bootstrap offline, não usar para conteúdo novo
pnpm db:reset             # create + generate + migrate + seed (setup do zero, sem dados de prod)
```

**O export tem dois níveis.** Contradição de dado **aborta** (criatura sem stats/captura/golpes, golpe `awakeningOnly` numa criatura sem Despertar, taxa de mineração apontando para item não-mineral, classe do elenco sem pesos ou sem `workFunction`, `modelUrl` quebrado, loja vazia…); meta de conteúdo **avisa e escreve** (cobertura 1:1 de Despertar, bioma de mapa sem `mining_rates`). O mesmo par de critérios vale em `scripts/dev/test_data.gd` no repo do jogo — os dois guardas precisam concordar sobre o que é erro e o que é alvo. Lista completa em [docs/DATA_WORKFLOW.md](docs/DATA_WORKFLOW.md). `pnpm game:export` aceita `--from <url>` (default API local) e `--out <path>` (default `../avyron`). Ele **falha** se alguma criatura estiver sem stats, sem regra de captura ou sem golpes — em vez de gerar um bundle que quebra o jogo em runtime. Além do `data/bestiary.json`, ele espelha todo `.glb` referenciado por `modelUrl` em `<repo-godot>/models/`, preservando o caminho da URL (o jogo lê `res://models/...`); `modelUrl` apontando para arquivo inexistente também aborta o export. Os props de bioma (`apps/web/public/models/biomes/`, gerados por `pnpm models:biomes`) são espelhados por diretório inteiro — nenhuma criatura os referencia; quem os consome é a cena do mapa. Eles ficam como `.gltf` + texturas compartilhadas de propósito: empacotar em `.glb` embutiria uma cópia privada da textura da casca em cada árvore. O kit de personagens humanos (`apps/web/public/models/characters/`, gerado por `pnpm models:characters`) segue o mesmo contrato de espelhamento por diretório.

**Kit de personagens humanos.** Player e NPCs são o mesmo sistema: um esqueleto compartilhado de 65 ossos (packs Quaternius, CC0 — fonte local-only em `../exportado-quaternius`, como `fontes/`) e uma "receita de aparência" (gênero + corpo + cabelo + uma peça por slot de outfit) montada em runtime no Godot (`CharacterRig`). A receita de NPC é conteúdo do catálogo: tabela `npc_appearances` (1:1 com `npcs`, padrão childUpsert, endpoint `/npc-appearances`), exportada como `appearance` em `merchants`/`duelists` — o export valida cada nome de peça contra o manifest e aborta se não existir, mesma política do `modelUrl`. A receita do player é do jogo (hardcoded hoje, save amanhã), nunca do catálogo. O `manifest.json` do kit é o cardápio: `bodies` (Base_Male/Base_Female), `hair` (slots hair/beard/eyebrows), `outfitParts` (gender/outfit/slot) e `animations` (UAL1/UAL2 com clipes normalizados pro vocabulário do jogo — `Idle`, `Walk`, `Run`, `Attack`, `Throw` para arremesso de captura, `Consume`, `Chop`…; clipes fora de tema, como pistolas e zumbis, foram removidos na conversão). As peças substituem o corpo — vestindo outfit, só a cabeça do corpo base fica visível (regra do pack para evitar clipping).

## Coisas para NÃO fazer

- **Não adicionar campo de matchup em `creature_classes`.** A linha que separa o permitido do proibido: um valor que depende da classe da própria criatura (como `primaryStatBonusPct`) é especialização; um valor que depende da classe do **oponente** é a matriz CLS×CLS, e essa nunca entra.
- **Não criar validação que amarre classe a taxonomia.** Do tipo "artrópode ⇒ CLS-001". As afinidades entre biologia e classe são tendências de design, não regras de dados, e foi justamente esse acoplamento que a refatoração de 2026-08 desfez.
- Não adicionar lote de conteúdo em `packages/db/src/seed/`. Está congelado — conteúdo entra pela API.
- Não citar os termos descontinuados em documento, nem para explicar que estão descontinuados. Foi exatamente assim que o documento `despertar-ancestral` se corrompeu: o replace automático do import reescreveu as citações e produziu uma frase dizendo que o termo oficial estava descontinuado. A lista vive em `terminology.ts`, que sabe a diferença entre usar um termo e falar sobre ele.
- Não usar "Evolução" ou "Forma Ancestral" em nenhum lugar — código, comentário, exemplo, mock, teste. Se aparecer em texto vindo de fora (tabela do usuário, docx importado), fazer replace automático `Evolução → Despertar`, `Forma Ancestral → Despertar Ancestral` no ato do import.
- Não escrever changelog manualmente pelo lado do agente/frontend. Sempre `recordChange(tx, ...)` dentro da transação do write.
- Não devolver o objeto criado inteiro em `POST` — só `{code, version}`. O agente já enviou; devolver duplica tokens.
- Não usar shadcn/ui. Componentes trazem radius e paleta que brigam com a direção visual — mais retrabalho refinar do que HTML nativo + Tailwind.
- Não instalar Alembic, Prisma, tRPC, GraphQL, MinIO, Redis, Docker Compose. Se propuser algo que puxe uma dessas, questionar antes.
- **Não presumir sufixo `.vN` em nome de modelo.** A convenção mudou: os arquivos são `CRT-XXX.glb`, sem versão no nome. Quem escrever seletor de modelo deve casar `CRT-XXX.glb` puro — foi assim que o antigo `publish-models.mjs` virou no-op silencioso, imprimindo "nothing to do" e saindo com sucesso.
- **`modelUrl` é N:1 com placeholders compartilhados.** Enquanto não existem modelos definitivos animados, várias criaturas apontam para o mesmo `.glb` em `apps/web/public/models/placeholders/<grupo>/` (gerados de `placeholder_models/` por `pnpm models:placeholders`, packs CC0 do Quaternius; o script também emite o `manifest.json` que o seletor do frontend lê). O vínculo se faz pelo botão **"vincular/alterar modelo"** na ficha da criatura (dev only — PATCH normal da API, changelog e versão automáticos), que mostra em cada opção 3D quais criaturas já a usam. O `syncModels` só gerencia URLs no padrão `/models/CRT-XXX.glb`: um arquivo definitivo que aparecer ganha do placeholder, mas ponteiro de placeholder nunca é apagado pela varredura — "nenhuma mudança" no botão de sincronizar é o estado normal com placeholders vinculados. Os clipes de animação são normalizados na conversão para um vocabulário único (`Idle`, `Walk`, `Run`, `Attack`, `Attack2`, `HitReact`, `Death`…) — o jogo e o viewer nunca veem os nomes originais dos packs, e o viewer da ficha toca o `Idle` em loop.
- **Não criar script que escreva em host remoto.** O escopo é estritamente a máquina local: API em `localhost:5101`, Postgres no container da 5102, durável em `packages/db/snapshot/`. `publish-models.mjs` e `migrate-docs-to-prod.mjs` foram removidos por apontarem para o `bestiary.sysnode.com.br` desligado. A receita de religar o VPS continua em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) e [docs/VPS_RUNBOOK.md](docs/VPS_RUNBOOK.md) — é referência histórica, não caminho de trabalho.
- **Não servir `.glb` do Meshy sem passar por `pnpm models:optimize`.** O arquivo cru custa ~89 MB de VRAM por criatura, e o `KHR_texture_basisu` que o script marca como obrigatório é o que o `CreatureViewer` espera. Ver [docs/MODEL_OPTIMIZATION.md](docs/MODEL_OPTIMIZATION.md).
- **Não medir otimização de modelo por MB do arquivo.** Foi assim que a redução de 4k para 2k de textura pareceu não ter feito nada: ela economizou ~270 MB de VRAM por criatura sem mexer visivelmente no `.glb`, porque JPEG só comprime em disco — a GPU decodifica tudo para RGBA cru. Arquivo governa download; resolução e formato de textura governam VRAM. São dois problemas separados. A geometria é ~2% do arquivo, então mexer em contagem de polígonos não resolve nenhum dos dois.
- **Não remover uma textura emissiva sem zerar `emissiveFactor`.** Em glTF o emissivo é `emissiveFactor × emissiveTexture` — tirar a textura deixando o fator em `[1,1,1]` faz a criatura brilhar branco sólido e virar silhueta chapada. `scripts/optimize-models.mjs` zera o fator junto e se recusa a gravar se achar essa combinação; se mexer nesse trecho, mantenha a checagem.
- **Não criar tabela sem adicioná-la a `packages/db/src/tables.ts`.** Esquecer é silencioso da pior forma: o `db:dump` roda, reporta sucesso, e o snapshot sai sem ela — e como o restore usa a mesma lista, ninguém percebe até precisar dos dados. Foi exatamente o que aconteceu com a camada de números inteira enquanto essa lista morava dentro de um script: `creature_stats`, `ability_stats`, `capture_rules` e `creature_abilities` nunca estiveram nela, e toda máquina hidratada ficava com catálogo completo e zero números.
- **Não comparar versão (`0.NN`) como texto.** `'0.99' > '0.104'` em ordenação lexicográfica, então `ORDER BY version DESC` para de funcionar na centésima versão — e parou, silenciosamente, nos dois lugares que faziam isso. Use `LATEST_VERSION_SQL` de `tables.ts`.
- Não commitar arquivos de `./fontes/` (xlsx/docx). Cada dev traz sua cópia — `.gitignore` cobre.
- Não commitar `.env`. Só `.env.example` vai para o repo.

## Onde procurar informação

- **`../avyron/AUDITORIA.md`** — a rodada de saneamento estrutural de agosto de 2026, que cobre os dois repositórios: o que foi consertado aqui (fábrica de singletons, `excluded` nos lotes de junção, `NULLS NOT DISTINCT` em `drops`, migrador por arquivo), como cada coisa foi provada, e o que ficou pendente

- **README.md** — como clonar e rodar
- **docs/DATA_WORKFLOW.md** — como inserir e corrigir dados via API (leitura obrigatória antes de escrever)
- **docs/MODEL_OPTIMIZATION.md** — como preparar um `.glb` do Meshy (leitura obrigatória antes de mexer em modelo ou textura)
- **docs/BIOME_PROPS.md** — o que os modelos 3D de **cenário** precisam ser: o contrato que `MapDressing` impõe a todo prop, o orçamento de densidade por bioma, e o pedido de peças por bioma do PZ-01 (leitura obrigatória antes de encomendar ou gerar prop de bioma)
- **`packages/db/src/tables.ts`** — a lista de tabelas que dump e restore compartilham, e o SQL de ordenação de versão
- **`packages/db/snapshot/`** — o conteúdo do catálogo, em JSONL diffável. É a cópia durável.
- **`packages/db/src/schema/`** — modelo de dados: tabelas, junções e enums (a lista canônica é `tables.ts`)
- **`packages/db/src/schema/gameMaps.ts`** — mapas, biomas, e as duas peças espaciais: `map_connections` (quem leva a quem, e a que preço) e `map_biome_regions` (onde cada bioma fica). O comentário de `map_biome_regions` explica por que as coordenadas são normalizadas a [-1, 1] e nunca metros, e por que a resolução declara um fallback
- **`packages/db/src/schema/stats.ts`** — a camada de números, com as fórmulas documentadas
- **`maps[].biomes` e `maps[].biomeRegions` no bundle** — a junção `map_biomes` é exportada desde 2026-08 em ordem de `sortOrder`, e diz quais biomas o mapa TEM; `map_biome_regions` viaja desde 2026-08-28 e diz ONDE cada um fica. O jogo consulta o segundo por posição (`MapBiomes.biome_at`) e usa o primeiro para conferir o bioma de fallback e para acusar bioma que região nenhuma reivindica. Os dois campos nasceram **no mesmo commit** que seus leitores, e é regra que continuem assim: campo no bundle é promessa ao jogo, e exportar partição que ninguém consulta recria o contrato-que-mente que o item 7 da auditoria foi consertar
- **`packages/db/src/runMigrations.ts`** — por que as migrations rodam **uma transação por arquivo** em vez do `migrate()` do Drizzle, que envolve todas numa só. Com transação única, banco novo não passa da `0008`: ela adiciona `material` ao enum `item_category` e a `0010` usa o valor num CHECK, o que o Postgres recusa antes do commit (`55P04`). Como `restore.ts` migra antes de carregar o snapshot, era o `pnpm db:restore` de máquina nova que quebrava. Contrapartida documentada lá: falha no meio deixa as anteriores aplicadas
- **`apps/api/src/shared/services/`** — as decisões arquiteturais principais (terminology, changelog, crudFactory, crudRoutes, childUpsertFactory, childUpsertRoutes, singletonFactory, singletonRoutes, fkResolver, query)
- **`apps/api/src/modules/elements/`** — módulo de referência para o padrão sem FK
- **`apps/api/src/modules/creatures/`** — módulo de referência para o padrão com múltiplas FKs
- **`apps/api/src/modules/drops/`** — padrão upsert para junctions
- **`apps/api/src/modules/creatureStats/`** — padrão filho-1:1-por-código-do-pai
- **`scripts/export-game-data.mjs`** — o contrato de dados com o jogo (bundle + espelhamento dos `.glb`)
- **`scripts/convert-placeholders.mjs`** — placeholders glTF → `.glb`, normalização dos clipes e `manifest.json`
- **`apps/web/src/routes/CreatureDetail.tsx`** — a única tela com peso visual; referência da direção editorial
- **`apps/web/src/routes/Maps.tsx`** — a leitura espacial do catálogo. Junta `game_maps`, `map_biomes`, `map_biome_regions` e `map_connections`, e desenha o plano de cada mapa **resolvendo** as regiões pela regra declarada no schema em vez de empilhá-las: o fundo é o fallback e as formas são pintadas da maior `sortOrder` para a menor, de modo que a que resolve primeiro fica por cima. A cor de bioma é derivada da paleta dos elementos predominantes — bioma não tem cor no banco e não deve ganhar uma
- **`apps/web/src/lib/labels.ts`** — todas as traduções enum → português
- **`fontes/README.md`** — o que vai na pasta ignorada
