# Como inserir e corrigir dados

Guia operacional. Vale para agente e para humano.

## O princípio

**A API é a única via de escrita.** O `seed/` está congelado, e o frontend não tem CRUD — a única tela de edição é `/elements`, que monta um `PATCH` da API como qualquer outro cliente (ver [Editar a paleta de um elemento](#editar-a-paleta-de-um-elemento)). Toda mudança carrega `reason` e `impact`, e o servidor grava a entrada de changelog e atribui a versão na mesma transação. O changelog é o registro — não um arquivo, não um commit.

**Tudo roda local.** A API sobe com `pnpm dev`, o Postgres é o container da porta 5102, e o durável é o snapshot commitado no repositório.

```
escrever  →  API local, em pnpm dev
persistir →  pnpm db:dump      (snapshot vai para o git)
jogo      →  pnpm game:export
```

> **Produção está aposentada.** O bestiário rodou em `bestiary.sysnode.com.br` enquanto a ideia era um Claude *web* alimentar o catálogo por HTTP. Quem escreve hoje roda na mesma máquina que o banco, então o VPS virou latência e um passo de deploy entre escrever um número e jogar com ele. O serviço foi desligado; a receita para religá-lo continua em [DEPLOYMENT.md](DEPLOYMENT.md) e [VPS_RUNBOOK.md](VPS_RUNBOOK.md), e `pnpm db:restore` reidrata o banco de lá em um comando.

## O ciclo completo

```powershell
pnpm dev                    # API em localhost:5101, UI em 5100
# ... escritas via API ...
pnpm db:dump                # grava packages/db/snapshot/
pnpm game:export            # gera data/bestiary.json no repo do jogo
git add packages/db/snapshot ; git commit -m "..."
```

**O `db:dump` não é opcional.** Sem ele, o conteúdo existe só no volume Docker da sua máquina — e ao contrário do código, não está em lugar nenhum. Commitar o snapshot é o que substitui o backup que produção fazia sem ninguém ter pedido.

Isso **não** viola a regra do seed congelado: aquela regra existe porque conteúdo escrito como TypeScript entra no banco por fora da API e por fora do changelog. O snapshot é o *resultado* de escritas que já passaram pela API e já geraram changelog — a tabela `changelog` está dentro dele.

## Máquina nova

```powershell
docker run -d --name pg-bestiary -e POSTGRES_PASSWORD=postgres -p 5102:5432 postgres:16
pnpm install
Copy-Item .env.example .env
pnpm db:create
pnpm db:restore             # migrations + snapshot, sem rede
```

## Antes de qualquer escrita

```powershell
curl.exe -s http://localhost:5101/api/v1/context
```

Devolve, em markdown compacto: terminologia travada, códigos de referência, invariantes de domínio, a camada de números, o índice de endpoints e as últimas versões. É a leitura mais barata que existe e evita a maioria dos 422.

> **Cuidado no PowerShell:** `curl` é alias de `Invoke-WebRequest` e não aceita as flags do curl real. Use `curl.exe` com o `.exe`, ou `Invoke-RestMethod`.

## Preparo

```powershell
$api = "http://localhost:5101/api/v1"
$h   = @{ "X-API-Key" = "<chave do .env>"; "Content-Type" = "application/json" }
```

Leitura é aberta; só escrita exige a chave.

## Adicionar uma criatura

Cinco passos, nesta ordem. Os quatro primeiros são obrigatórios — **o export para o jogo aborta** se uma criatura estiver sem stats, sem regra de captura ou sem golpes.

### 1. A criatura

```powershell
$body = @{
  code           = "CRT-028"
  originalName   = "Estemmenosuchus"
  baseSpecies    = "Estemmenosuchus"
  classCode      = "CLS-002"      # Theria
  elementCode    = "ELE-004"      # Terra
  mapCode        = "PZ-01"
  biomeCode      = $null
  role           = "hero"
  silhouetteNote = "Protuberancias osseas no cranio em forma de leque; corpo macico quadrupede."
  status         = "Rascunho"
  reason         = "Preencher lacuna de Theria pesado no fim do PZ-01"
  impact         = "Habilita encontro de chefe no bioma vulcanico"
} | ConvertTo-Json

Invoke-RestMethod "$api/creatures" -Method Post -Headers $h -Body $body
# → { "code": "CRT-028", "version": "0.91" }
```

Chaves estrangeiras vão **por código**, nunca por id. Código desconhecido responde 422 listando os válidos.

### 2. Os stats

```powershell
$body = @{
  creatureCode = "CRT-028"
  baseHp = 90; baseAttack = 60; baseDefense = 75; baseSpeed = 30; baseCharge = 45
  growthRate = 0.034
  reason = "Stats de chefe defensivo do fim do mapa"
  impact = "Encontro exige time com vantagem elemental, nao forca bruta"
} | ConvertTo-Json

Invoke-RestMethod "$api/creature-stats" -Method Post -Headers $h -Body $body
```

Referências para calibrar: o mais frágil do elenco tem HP 40, o mais resistente 100. Ataque vai de 30 a 85. `baseCharge` **50 é o neutro** — acima enche o Despertar mais rápido. `growthRate` fica entre 0.029 e 0.037.

### 3. A regra de captura

```powershell
$body = @{
  creatureCode = "CRT-028"
  catchRate = 65
  awakenedMultiplier = 0.35
  reason = "Chefe deve ser dificil de capturar"
  impact = "Exige enfraquecer antes; captura em Despertar fica quase inviavel"
} | ConvertTo-Json

Invoke-RestMethod "$api/capture-rules" -Method Post -Headers $h -Body $body
```

`catchRate` de 1 a 255, maior é mais fácil. Iniciais ficam perto de 200, chefes entre 50 e 70.

### 4. Os golpes

Seis por criatura é o padrão do elenco: três do elemento, um utilitário, `Concentrar` e a assinatura do Despertar.

```powershell
$body = @{
  items = @(
    @{ creatureCode="CRT-028"; abilityCode="HAB-010"; learnLevel=1;  sortOrder=0 }  # Seixo
    @{ creatureCode="CRT-028"; abilityCode="HAB-019"; learnLevel=8;  sortOrder=1 }  # Encouracar
    @{ creatureCode="CRT-028"; abilityCode="HAB-011"; learnLevel=12; sortOrder=2 }  # Fenda
    @{ creatureCode="CRT-028"; abilityCode="HAB-025"; learnLevel=20; sortOrder=3 }  # Concentrar
    @{ creatureCode="CRT-028"; abilityCode="HAB-012"; learnLevel=28; sortOrder=4 }  # Soterrar
    @{ creatureCode="CRT-028"; abilityCode="HAB-029"; learnLevel=1;  sortOrder=5 }  # Colapso Ancestral
  )
  reason = "Repertorio padrao de Terra com utilitario defensivo"
  impact = "CRT-028 fica jogavel do nivel 1 ao 28"
} | ConvertTo-Json -Depth 4

Invoke-RestMethod "$api/creature-abilities/batch" -Method Post -Headers $h -Body $body
```

A assinatura do Despertar fica em `learnLevel` 1 — ela é travada pela transformação estar ativa, não pelo nível.

### 5. O Despertar (opcional, mas mire no 1:1)

```powershell
$body = @{
  code = "DSP-028"
  creatureCode = "CRT-028"
  name = "Estemmenosuchus Coroado"
  type = "reinforcement"        # ou "swap"
  referenceSpecies = $null      # preencher quando for "swap"
  notes = "As protuberancias crescem em coroa ossea continua."
  reason = "Manter cobertura 1:1 de Despertar no bestiario"
  impact = "Elenco segue dentro da regra 70/30 entre reforco e troca"
} | ConvertTo-Json

Invoke-RestMethod "$api/awakenings" -Method Post -Headers $h -Body $body
```

**Vigie a proporção 70/30.** Hoje: 22 reforço / 9 troca (71% / 29%), cobertura 31/31. Uma criatura já com Despertar responde 409 — é 1:1.

A cobertura é **meta**: o export avisa e escreve o bundle assim mesmo, e `test_data.gd` reporta sem reprovar. O que os dois **abortam/reprovam** é o caso vizinho — criatura sem Despertar que já conhece o golpe de assinatura (`awakeningOnly`), porque aí o golpe fica permanentemente bloqueado. Foi o que aconteceu com `CRT-013` até 2026-08: jogou com 5 golpes contra 6 do resto do elenco, e nenhum dos dois guardas apontava para isso. Ver [O que o export cobra](#o-que-o-export-cobra).

O `awakeningMultiplier` em `creature_stats` deve acompanhar o tipo: **1.5** para reforço, **1.7** para troca.

## Adicionar uma habilidade

Dois passos: a habilidade e os números dela.

```powershell
$body = @{
  code = "HAB-032"; name = "Avalanche"; elementCode = "ELE-006"
  type = "Ataque"; effect = "Dano elemental pesado com precisao reduzida."
  awakeningOnly = $false
  reason = "Gelo so tinha tres golpes"; impact = "Amplia o repertorio de Gelo"
} | ConvertTo-Json
Invoke-RestMethod "$api/abilities" -Method Post -Headers $h -Body $body

$body = @{
  abilityCode = "HAB-032"; power = 100; accuracy = 80; uses = 6
  effectCode = "damage"
  reason = "Alto risco, alta recompensa"; impact = "Alternativa a Nevasca"
} | ConvertTo-Json
Invoke-RestMethod "$api/ability-stats" -Method Post -Headers $h -Body $body
```

`effectCode` válidos: `damage`, `buff_attack`, `buff_defense`, `debuff_attack`, `debuff_defense`, `heal`, `charge_gain`. Com `power` 0 a habilidade não causa dano — é movimento de status e trabalha pelo `effectCode`.

## Adicionar um item

Dois passos, como habilidade: o item e os números dele.

```powershell
$body = @{
  code = "ITM-022"; name = "Emplastro Acido"; category = "heal"
  effect = "Recupera uma fatia media do vigor da criatura."
  acquisition = "Comerciante"
  reason = "Faixa intermediaria entre Emplastro de Limo e Emplastro Espesso"
  impact = "Suaviza o salto de preco de 60 para 180"
} | ConvertTo-Json
Invoke-RestMethod "$api/items" -Method Post -Headers $h -Body $body

$body = @{
  itemCode = "ITM-022"; value = 110
  effectCode = "heal_percent"; effectValue = 50
  reason = "Preco entre os dois vizinhos, cura proporcional"
  impact = "~70s de mineracao no PZ-01"
} | ConvertTo-Json
Invoke-RestMethod "$api/item-stats" -Method Post -Headers $h -Body $body
```

`category` válidas: `mineral`, `capture`, `heal`, `material`. **Não é rótulo** — o export filtra minério nesta coluna, e um consumível marcado como `mineral` vira minério de chão. `capture` é uma categoria legada: o sistema de captura passou a usar o Relicário (equipamento, ver documento `relicario`), e nenhum item novo deve nascer com essa categoria.

`effectCode` válidos: `none`, `capture_bonus`, `heal_flat`, `heal_percent`. O `effectValue` muda de unidade conforme o código: multiplicador em `capture_bonus`, pontos de HP em `heal_flat`, porcentagem do HP máximo em `heal_percent`.

O export **aborta** se um item tiver efeito com `effectValue` zero, ou se um item não-mineral não tiver preço — os dois seriam comprados e não fariam nada.

## Montar um comerciante

```powershell
$body = @{
  code = "NPC-002"; name = "Ferreira Tulk"; faction = "Guilda dos Curadores"
  mapCode = "PZ-01"; role = "merchant"
  reason = "..."; impact = "..."
} | ConvertTo-Json
Invoke-RestMethod "$api/npcs" -Method Post -Headers $h -Body $body

$body = @{
  items = @(
    @{ npcCode="NPC-002"; itemCode="ITM-016"; sortOrder=0 }
    @{ npcCode="NPC-002"; itemCode="ITM-022"; price=140; sortOrder=1 }
  )
  reason = "..."; impact = "..."
} | ConvertTo-Json -Depth 4
Invoke-RestMethod "$api/merchant-offers/batch" -Method Post -Headers $h -Body $body
```

`role` válidos: `merchant`, `duelist`, `quest`, `flavor` — decide qual tela o jogo abre. `price` omitido cobra `item_stats.value`; preenchido, é o sobrepreço daquele comerciante.

O export **aborta** se um NPC com papel `merchant` não tiver nenhuma oferta — uma loja vazia é sempre erro de cadastro.

## Balancear a economia

`economy_rules` é singleton, como `combat_rules`:

```powershell
$body = @{
  sellRatio = 0.35
  reason = "0.40 deixava a mineracao pagar rapido demais pela Seiva Primordial"
  impact = "Alonga a progressao economica em ~15%"
} | ConvertTo-Json
Invoke-RestMethod "$api/economy-rules" -Method Patch -Headers $h -Body $body
```

`sellRatio` fica em (0, 1) por CHECK: em 1.0 o jogador lucraria comprando e revendendo em loop.

## Balancear o combate

As constantes que governam dano, carga e captura ficam em `combat_rules`, um recurso singleton. Sem código, sem lista, sem POST — só `GET` e `PATCH`.

```powershell
Invoke-RestMethod "$api/combat-rules"     # leitura aberta
```

```powershell
$body = @{
  damageConstant = 0.22
  chargeTakenMultiplier = 3.0
  chargeDealtMultiplier = 1.5
  reason = "lutas duravam 3,6 rodadas, curto demais para troca e buff importarem"
  impact = "alonga para ~5 rodadas e mantem o Despertar como virada de jogo"
} | ConvertTo-Json

Invoke-RestMethod "$api/combat-rules" -Method Patch -Headers $h -Body $body
```

Manda só o que muda. Cada campo tem faixa validada, e os pares ordenados (`damageVarianceMin`/`Max`, `captureMinChance`/`Max`, `levelMin`/`Max`) são checados contra o estado atual — o erro nomeia os dois valores em vez de estourar como violação de constraint.

**Meça antes de gravar.** A sonda do repo do jogo simula 2.600 batalhas e aceita os valores como argumento:

```powershell
cd ..\avyron
& $godot --headless --script res://scripts/dev/balance_probe.gd -- 0.22 3 3.0
```

## Editar a paleta de um elemento

A paleta é o que o jogo usa para **recolorir os corpos placeholder** por elemento e para acender a aura do Despertar Ancestral. Cinco campos em `elements`:

| campo | o que é |
|---|---|
| `paletteShadow` | onde cai o texel mais **escuro** do atlas do corpo |
| `paletteMid` | o miolo — a cor que a criatura "é" |
| `paletteHighlight` | onde cai o texel mais **claro** |
| `paletteAura` | a aura do Despertar Ancestral |
| `paletteSpread` | quanto cada criatura pode variar dentro da família, 0 a 0.5 |

As três primeiras **não são três cores soltas**: são posições numa rampa que o jogo lê por luminância. É isso que faz "amarelo com preto" caber num elemento só — Eletricidade sai de quase-preto e chega em amarelo, e a forma do bicho distribui as duas pontas sozinha.

**Prefira a tela.** `http://localhost:5100/elements` é a única tela de edição do app, e existe porque paleta não se autora às cegas: ela mostra a rampa e a aura contra os fundos reais do PZ-01 (água, névoa, costa seca) enquanto você escolhe. Uma criatura de Água azul num mapa azul com névoa azul é o modo de falha mais provável desta feature, e ele não aparece num swatch sobre branco. `reason`/`impact` continuam obrigatórios ali como em qualquer escrita.

Pela API, quando for mais prático:

```powershell
$body = @{
  paletteShadow    = "#08243B"
  paletteMid       = "#2E7FA8"
  paletteHighlight = "#9FE3F0"
  paletteAura      = "#4FD2FF"
  paletteSpread    = 0.18
  reason = "Agua sumia contra a nevoa do PZ-01"
  impact = "Contraste de valor em vez de matiz; corpo le de longe no bioma aquatico"
} | ConvertTo-Json

Invoke-RestMethod "$api/elements/ELE-002" -Method Patch -Headers $h -Body $body
```

Hex é `#RRGGBB`, seis dígitos — a forma de três é rejeitada de propósito, porque a tela usa um `input[type=color]` que só devolve seis e a expansão silenciosa gravaria um changelog de uma edição que ninguém fez.

**`paletteAura` tem coluna própria, e não é o `paletteHighlight` reaproveitado.** A escolha óbvia é a errada: com o corpo já recolorido pelo elemento, uma aura na mesma cor some justamente na criatura em que ela deveria gritar. Autore mais clara que o brilho. Deixar `null` faz o jogo cair no highlight — funciona, com esse risco.

**`paletteSpread` alto não é "mais variedade".** Ele desloca a posição na rampa, nunca o matiz, então nunca vaza para outro elemento; mas acima de ~0.25 uma criatura da família cai perto da sombra enquanto a vizinha cai perto do brilho, e as duas param de ler como parentes. O elenco hoje usa 0.12 a 0.22.

## Corrigir

Depende da tabela.

**Catálogo** (criaturas, habilidades, itens, mapas, documentos) — `PATCH`, só os campos que mudam:

```powershell
$body = @{ role = "regular"; reason = "..."; impact = "..." } | ConvertTo-Json
Invoke-RestMethod "$api/creatures/CRT-028" -Method Patch -Headers $h -Body $body
```

**`combat-rules`** — singleton, usa `PATCH` (ver acima).

**Camada de números e junções** (`creature-stats`, `ability-stats`, `capture-rules`, `creature-abilities`, `drops`, `map-biomes`, `elemental-advantages`, `merchant-offers`, `mining-rates`) — **não têm PATCH**. Re-POST com os valores novos; o upsert sobrescreve. Vale igual para o endpoint unitário e para o `/batch` — até 2026-08 três dos lotes sobrescreviam só na aparência, inseriam o que era novo e ignoravam em silêncio o que já existia, enquanto o changelog gravava uma versão dizendo que tinham atualizado. Se você suspeitar de um lote que "não pegou", releia o recurso antes de reescrever. Você pode mandar só o campo que mudou:

```powershell
$body = @{ creatureCode="CRT-028"; baseAttack=55; reason="..."; impact="..." } | ConvertTo-Json
Invoke-RestMethod "$api/creature-stats" -Method Post -Headers $h -Body $body
```

## Tirar do escopo

```powershell
$body = @{ reason="..."; impact="..." } | ConvertTo-Json
Invoke-RestMethod "$api/creatures/CRT-028" -Method Delete -Headers $h -Body $body
```

Despertar, stats, regra de captura, vínculos de habilidade e drops caem em cascata. A entrada de changelog sobrevive à remoção — `changelog.entityId` não é chave estrangeira de propósito.

## Depois de escrever

```powershell
pnpm db:dump                                                    # snapshot para o git
pnpm game:export --out ..\avyron                                # bundle para o jogo
git add packages/db/snapshot; git commit -m "..."
cd ..\avyron; git add data/bestiary.json; git commit -m "..."   # bundle versionado
```

Dois commits de propósito, um em cada repositório: o snapshot é a verdade do catálogo, o bundle é o recorte que o jogo consome. Eles podem divergir de propósito — dá para escrever cinco criaturas e exportar só quando as cinco estiverem completas.

O export **aborta sem escrever nada** e lista o que falta se alguma criatura estiver incompleta. Se ele reclamar, o dado está errado — não o script.

## O que o export cobra

`pnpm game:export` é o segundo guarda do catálogo — o primeiro é a validação da API, na hora da escrita. Ele **aborta sem escrever nada** e lista tudo o que falta; se ele reclamar, o dado está errado, não o script.

**Aborta** — contradição de dado, o jogo consumiria algo quebrado:

| | |
|---|---|
| criatura sem `creature_stats`, `capture_rules`, golpes ou `sizeMeters` | não dá pra instanciar nem lutar |
| criatura sem Despertar que **conhece um golpe `awakeningOnly`** | o golpe aparece na ficha e é impossível de usar |
| drop de `material` de classe diferente da criatura | quebra a ligação classe → material da progressão |
| item com `effectCode` != `none` e `effectValue` zero | compra-se e não faz nada |
| item não-mineral e não-material sem `value` | está à venda sem preço |
| habilidade sem `ability_stats`, relic sem `relic_stats` | número que o jogo executa faltando |
| NPC `merchant` sem `merchant_offers` | loja vazia é sempre erro de cadastro |
| `modelUrl` fora de `/models/` ou apontando para arquivo inexistente | cápsula silenciosa no lugar do corpo |
| elemento com paleta **pela metade** (alguma das três paradas faltando) | rampa incompleta não é rampa: o jogo teria de inventar a cor que falta |
| parada de paleta que não seja `#RRGGBB` | a API valida na escrita, mas snapshot restaurado de outra máquina não passou por ela |
| peça de `appearance` fora do manifest do kit de personagens | mesma política do `modelUrl` |
| taxa de mineração apontando para item que **não é `mineral`** | o peso viaja em `mining.rates`, o item não entra em `mining.items`, e o número some na normalização |
| classe com criatura no elenco sem `mining_rates` ou sem `workFunction` | o perfil de trabalho da classe vira decoração |

**Avisa e escreve** — meta de conteúdo, não invariante:

| | |
|---|---|
| criatura sem Despertar (cobertura 1:1) | ela ainda joga, só não usa o medidor de carga |
| elemento **sem paleta nenhuma** | as criaturas dele saem no corpo neutro; o jogo roda |

A divisão é deliberada e vale nos dois lados: `scripts/dev/test_data.gd`, no repo do jogo, usa exatamente os mesmos dois critérios — reprova no golpe inalcançável, avisa na cobertura. Suíte vermelha significa "quebrado"; alvo de conteúdo sai como aviso. Os dois guardas já discordaram: o export não olhava nenhuma dessas linhas, o teste reprovava na cobertura e não checava o golpe morto, e foi por essa fresta que `CRT-013` saiu num bundle jogando com 5 golpes contra 6 do resto do elenco.

## Erros comuns

| Código | Significa | O que fazer |
|---|---|---|
| 401 | falta ou está errado o `X-API-Key` | leitura é aberta, escrita não |
| 409 | `code` duplicado, ou a criatura já tem Despertar | escolha outro código, ou use PATCH |
| 422 | terminologia descontinuada em algum campo | a mensagem aponta o campo; o termo oficial é **Despertar Ancestral** |
| 422 | código de FK inexistente | a mensagem lista os válidos |
| 422 | `?fields=` com coluna desconhecida | a mensagem lista as colunas |

Toda mensagem nomeia o campo e os valores aceitos — leia antes de tentar de novo.

## O que nunca fazer

- **Não adicionar conteúdo em `packages/db/src/seed/`.** Está congelado. Conteúdo lá não gera changelog nem versão, e o `upsertClass` chega a sobrescrever nomes em silêncio na próxima execução.
- **Não editar `data/bestiary.json` à mão** no repo do jogo. É gerado; a próxima exportação sobrescreve.
- **Não escrever no banco por SQL direto.** Pula o changelog, o validador de terminologia e a atribuição de versão.
- **Não criar criatura fora de Loricati, Theria ou Draconis.** Escopo fechado.
- **Não escolher a versão.** O servidor atribui. Mandar `version` no body não faz nada.
- **Não citar os termos descontinuados em documento**, nem para explicar que estão descontinuados — foi assim que o documento `despertar-ancestral` se corrompeu. A lista vive em `terminology.ts`.
