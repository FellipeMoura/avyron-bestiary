# Props de bioma — o que os modelos 3D de cenário precisam ser

O que encomendar, modelar ou gerar para vestir os biomas do PZ-01, e por que cada exigência existe.

**Escopo.** Aqui é só **cenário** — coral, rocha, gelo, sedimento. O corpo das criaturas está coberto e não se repete: estilo e orçamento em `direcao-3d-arte`, paleta e contorno em `identidade-visual`, geração via Meshy em `pipeline-meshy-ai`, e o pipeline de otimização em [MODEL_OPTIMIZATION.md](MODEL_OPTIMIZATION.md). Prop é outra coisa: não tem rig, não tem animação, não é recolorido por elemento, e aparece dezenas de vezes na tela em vez de uma.

**Por que agora.** O PZ-01 fechou a partição espacial em 2026-08-28: cinco biomas, sete regiões, o jogo respondendo o bioma por posição. A mineração distingue cinco lugares, a partição distingue cinco lugares, e **a imagem distingue um** — uma captura da Plataforma Glacial hoje mostra o painel dizendo "Plataforma Glacial" sobre um leito coberto de coral turquesa. Este documento é o que fecha essa lacuna.

---

## 1. O contrato — o que TODO prop precisa cumprir

Estas não são preferências. São o que `scripts/world/map_dressing.gd` faz com o arquivo, e um prop que não as cumpra entra torto sem ninguém ser avisado.

| # | Exigência | Por quê |
|---|---|---|
| 1 | **Origem no centro da BASE**, não no centro do volume | O código escreve `pos.y = terrain.height_at(pos)`. Origem no meio do volume enterra metade da peça. |
| 2 | **Normalizado em ~1×1×1** | O código aplica `scale = Vector3.ONE * prop_scale`. O porte é decisão da cena; o arquivo entrega escala unitária. É o que o Meshy já faz por padrão. |
| 3 | **Base plana e fechada** | O prop é afundado 5% da escala (`- 0.05 * prop_scale`) para esconder o corte reto da malha. Base côncava ou aberta mostra o vazio por dentro na câmera inclinada. |
| 4 | **Sem frente** — legível de qualquer giro | O yaw é sorteado (`rng.randf() * TAU`). Peça com fachada aparece de costas em metade das instâncias. |
| 5 | **Sem rig e sem animação** | Nenhum prop emite sinal, dá drop ou entra em fórmula. `AnimationPlayer` num prop é peso morto que o importador ainda assim carrega. |
| 6 | **Uma superfície, um material** | Hoje é bom senso; a partir de ~300 props vira obrigação (ver §5). Retrofitar isso significa reexportar o acervo inteiro. |
| 7 | **Planta aproximadamente circular** nas peças maciças | A colisão é um `CylinderShape3D` de raio único. Peça alongada ou em L colide como cilindro e o jogador esbarra no ar. |
| 8 | **Silhueta acima de detalhe** | Câmera ortográfica travada em 30°/45°: o jogador lê contorno, não textura. Detalhe abaixo de ~5 cm não chega à tela. |

**Duas famílias, e a diferença é colisão.** *Landmark* é peça fixa, posta à mão, com raio de colisão declarado — o jogador contorna. *Scatter* é vegetação miúda espalhada por semente, sem colisão nenhuma: pisar numa alga é pisar numa alga.

---

## 2. O que já existe, e o que ele não cobre

**`models/biomes/aquatic/`** — 11 peças geradas no Meshy, `.glb` individuais, normalizadas em ~1×1×1. Todas em uso hoje, e todas do mesmo registro: recife tropical turquesa.

`Aqua_Bloom_Grove` · `Aqua_Coral_Garden` · `Aqua_Sponge_Cluster` · `Coralstone_Arch` · `Emerald_Seaweed_Grove` · `Jade_Reef_Garden` · `Pastel_Tidepool_Treas` · `Reef_Cluster` · `Seafoam_Pipe_Coral` · `Terraced_Stone_Mounds` · `Turquoise_Reef_Stone`

Duas observações que valem para o planejamento:

- **`Terraced_Stone_Mounds` é a única que lê como ROCHA** em vez de coral. É por isso que ela é a peça usada nas duas pedras do topo da ilha — um coral de pé em terra seca contradiz a ilha inteira, e a primeira captura da ilha mostrou exatamente isso.
- **`Pastel_Tidepool_Treas` é a única com leitura de poça de maré**, que é vocabulário de costa, não de recife.

**`models/biomes/megakit/`** — Stylized Nature MegaKit (Quaternius, CC0), preparado por `pnpm models:biomes`. É vegetação terrestre em escala real, reservada para PZ-02/PZ-03. Não serve o PZ-01.

**O que não existe:** nenhuma peça que leia como **gelo**, **sedimento glacial**, **fundo abissal escuro**, **banco de lama** ou **fundo arenoso aberto**. São quatro dos cinco biomas do PZ-01 sem vocabulário próprio.

---

## 3. Quanto — o orçamento por bioma

A densidade **não** é uniforme, e essa é a decisão de design mais importante deste documento: densidade é o que faz um bioma ler como ele mesmo. Recife é espetáculo, abismo é vazio, plataforma glacial é empobrecida — e "empobrecido" se comunica pela ausência, não por props de aparência pobre.

| bioma | do plano | densidade | props (120 m) | props (350 m) |
|---|---|---|---|---|
| Jardins Recifais | 17,4% | **×2,5** | 68 | 582 |
| Mar raso | 37,2% | ×1,0 *(base)* | 59 | 502 |
| Mar Profundo | 28,0% | ×0,35 | 15 | 131 |
| Plataforma Glacial | 4,9% | ×0,6 | 5 | 39 |
| Costa Primordial | 12,5% | ×0,15 | 3 | 26 |
| **total** | | | **150** | **1.280** |

A densidade-base é ~1 prop a cada 91 m², calibrada para o total a 120 m ficar perto dos 132 de hoje. A coluna de 350 m é a mesma conta na área do alvo declarado — está aqui porque decisões técnicas tomadas agora (§5) só fazem sentido contra ela.

**A costa em ×0,15 não é descuido.** Ela é o adro da vila: comerciante, posto do Relicário e portais. Cenário lá não pode esconder um serviço, e o `MapDressing` hoje simplesmente não espalha nada na costa. As três peças do orçamento são para a borda d'água, longe dos pontos de interação.

---

## 4. O que cada bioma precisa — o pedido

Quatro a seis peças distintas bastam para um bioma ler como ele mesmo; as 11 aquáticas vestem o mapa inteiro hoje. O que segue é o pedido mínimo por bioma, com a leitura que cada um tem de entregar.

### Jardins Recifais — *"primeiro grande espetáculo visual do jogo"*
Água + Natureza. **Coberto pelas 11 peças atuais.** Falta só porte: **2 peças hero**, estruturas recifais grandes o bastante para servirem de marco à distância (na escala do `Coralstone_Arch`, que hoje entra a 9×). O bioma é o único que pode se dar ao luxo de peça cara — é o menor em área e o mais denso.

### Mar raso — *"zona inicial de artrópodes aquáticos"*
Água. Tem de ler **mais simples que o recife**, não igual. Hoje usa o mesmo kit e por isso os dois se confundem. **4 peças:** banco de areia com marcas de ondulação · pedra isolada submersa · tufo de alga curta · leito de conchas/bioclastos.

### Mar Profundo — *"baixa luminosidade, substrato escuro, sensação de vazio e profundidade"*
Água. A leitura é o **vazio** — poucas peças, cada uma grande e escura. Peça pequena aqui é ruído. **5 peças:** afloramento rochoso escuro (grande) · monte de sedimento · laje de escarpa, para marcar a quebra do talude em silhueta · aglomerado séssil pálido, como acento raro · formação de detrito afundado.

### Plataforma Glacial — *"placas de gelo quebradas, lama e sedimento glacial, rocha exposta, aparência ecologicamente empobrecida"*
Água + Terra. **6 peças:** placa de gelo quebrada (plana, inclinada) · bloco de gelo à deriva · matacão errático (rocha estranha ao substrato — é o que denuncia geleira) · crista de morena · mancha de cascalho/till · borda de canal de água escura.

> **Regra do bioma: nenhuma vegetação.** O conceito diz "sem fauna" e "empobrecido", e o cadastro já leva isso a sério — o carvão dele está em 0,02, o menor do mapa, porque no Ordoviciano não havia planta terrestre. Um prop de alga aqui desfaz de uma vez a decisão que as taxas de mineração tomaram.

### Costa Primordial — *"faixa mineral costeira com rocha úmida, bancos de lama/areia e poças de maré"*
Água + Terra. **4 peças:** borda de poça de maré · rocha costeira molhada · banco de lama/areia · esteira algal ou estromatólito.

> **Regra da era: não existe madeira.** Nada de tronco à deriva, tora ou raiz — o Ordoviciano não tem planta terrestre para fornecê-los. É a mesma regra que zerou o carvão do glacial, e é o tipo de detalhe que passa batido num prompt genérico de "praia".

**Total do pedido: 21 peças novas**, para um acervo de 32 no PZ-01.

---

## 5. Formato e pipeline

**`.gltf` com textura compartilhada, não `.glb` individual.** É a lição já registrada em `convert-biomes.mjs`: o Godot deduplica recurso por caminho, e `.glb` embute uma cópia privada da textura em cada arquivo. Um kit glacial de 6 peças num atlas só custa 1 textura em `.gltf` e 6 em `.glb` — e a conta piora com a instanciação, não com o disco.

O kit aquático atual é `.glb` porque as 11 peças vieram do Meshy com texturas próprias, uma por peça. **Kit novo deve nascer com atlas compartilhado por bioma.**

**Textura.** Sem normal map, sem specular, sem roughness — o cel-shading dispensa, e é a regra que `identidade-visual` já fixa. Base color pintada, UV baked. Resolução: **256²** para peça de scatter, **512²** para landmark, **1024²** só para as duas peças hero do recife. O limite do conversor é 1024², e o motivo está em [MODEL_OPTIMIZATION.md](MODEL_OPTIMIZATION.md): resolução governa VRAM, tamanho de arquivo governa download, e são problemas distintos.

**Triângulos.** Scatter: **150–600**. Landmark: **1.000–3.000**. Hero: até 5.000. São mais apertados que os tiers de criatura de `direcao-3d-arte`, e a razão é multiplicidade — uma criatura aparece uma vez na tela, uma peça de scatter aparece sessenta.

**Paleta.** O prop **não** é recolorido em runtime: `ElementPalette` só entra em `res://models/placeholders/`, e é assim de propósito. A cor vem assada no arquivo, e deve seguir a banda dominante do bioma em `identidade-visual` — azuis-abissais para Água, marrons e arenito para Terra, musgos para Natureza.

**Destino.** `apps/web/public/models/biomes/<kit>/`, espelhado para o repo do jogo por `pnpm game:export` (diretório inteiro, ao contrário dos modelos de criatura, que são dirigidos por `modelUrl`). Um kit por bioma mantém o atlas compartilhado coerente: `glacial/`, `abyssal/`, `shallow/`, `shore/`.

**Superfície única, material único.** Vale a insistência: a 350 m são ~1.280 props, e nessa escala o scatter deixa de ser nó por peça e vira `MultiMesh`. `MultiMesh` exige uma superfície e um material por lote. Peça com duas superfícies fica de fora do lote, e descobrir isso com 21 peças prontas significa reexportar as 21.

---

## 6. O que falta no CÓDIGO antes de o acervo servir

O portfólio sozinho não veste o mapa. Três peças, nesta ordem:

1. **`MapDressing` por bioma.** Hoje é uma lista de landmarks e um pool de scatter para o mapa inteiro — `apply()` começa com `if map_code != "PZ-01": return` e não consulta bioma nenhum. Precisa passar a perguntar `MapBiomes.biome_at(pos)` no sorteio e escolher pool e densidade por resposta.
2. **Reposicionar o recife.** A região saiu do centro no desenho aprovado (`cx -0.34`), e os corais continuam plantados em anel em volta da origem: **5 dos 14 landmarks** caem dentro dos Jardins Recifais hoje. Isso é conta já medida, não estimativa.
3. **Ambiência por bioma.** A névoa e a luz são fragmentadas por **altura**, num `Environment` só. O Mar Profundo pede escuro e o glacial pede frio — nenhum dos dois é expressável como altura, e é a mesma discussão que "trecho seco novo ganha a sua omni" resolveu para a costa e a ilha.

Uma quarta, que é do spawner e não do cenário: a Plataforma Glacial é declarada **sem fauna**, e isso ainda não é expressável em dado — o `CreatureSpawner` exclui por predicado geográfico em código (`on_coast`, `on_island`), não por bioma.

---

## 7. Ordem sugerida

Do que muda mais a leitura do mapa por peça encomendada:

1. **Glacial (6)** — é o bioma que hoje mente na cara do jogador, com o painel dizendo "Plataforma Glacial" sobre coral turquesa.
2. **Mar Profundo (5)** — é 28% do mapa vestido com o vocabulário errado, a maior área em desacordo.
3. **Mar raso (4)** — não está errado, está indistinguível do recife; conserta a confusão entre os dois maiores biomas.
4. **Costa (4)** — pequena em área e já compensada pela vila, que dá a ela leitura própria.
5. **Hero do recife (2)** — o bioma já funciona; isto é porte, não identidade.
