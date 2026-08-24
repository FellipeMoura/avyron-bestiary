# Otimização de modelos 3D

Como preparar um `.glb` do Meshy antes de servir no bestiário, e por que o processo é o que é.

**Resumo operacional:** jogue o arquivo em `apps/web/public/models/` e rode `pnpm models:optimize`. O script é idempotente — pula o que já está otimizado e processa só o novo. O resto deste documento explica as decisões, para que ninguém as desfaça por engano.

> **Placeholders não passam por aqui.** Os modelos em `apps/web/public/models/placeholders/` (packs CC0 do Quaternius, animados) são gerados por `pnpm models:placeholders` a partir de `placeholder_models/`, que converte glTF → `.glb`, normaliza os nomes dos clipes de animação para o vocabulário único e emite o `manifest.json` do seletor da ficha. KTX2 não compraria nada neles: a textura é um atlas de paleta de 9 KB (ou nenhuma). O `models:optimize` só varre a raiz de `models/`, então os dois pipelines não se tocam. Este documento segue valendo para os `.glb` do Meshy — que hoje estão fora do projeto por não terem animação, mas voltam por este mesmo caminho quando forem animados.

---

## A armadilha central: MB de arquivo não é o custo que importa

A intuição natural é medir otimização pelo tamanho do `.glb`. Ela leva à conclusão errada em quase todos os passos aqui.

Um modelo do Meshy sai com ~8 MB, dos quais **~98% é textura e ~2% é geometria**. Medido nos 9 primeiros:

| | Geometria | Texturas | Total |
|---|---|---|---|
| CRT-009 | 0.20 MB | 8.73 MB | 8.93 MB |
| CRT-001 | 0.19 MB | 7.23 MB | 7.42 MB |

Duas consequências que contrariam a intuição:

**1. Reduzir polígonos não faz diferença.** Ir de 4k para 3k triângulos mexe em ~60 KB — invisível no arquivo. E 3k triângulos não é carga para nenhuma GPU desta década. Contagem de polígonos não é o gargalo destes modelos e não vai ser.

**2. Reduzir a resolução da textura não aparece no arquivo, mas é a mudança que mais importa.** JPEG e PNG só comprimem em disco. Ao chegar na GPU, toda textura é decodificada para RGBA cru:

- 4096² × RGBA × 4 mapas + mipmaps ≈ **~358 MB de VRAM por criatura**
- 2048² × RGBA × 4 mapas + mipmaps ≈ **~89 MB de VRAM por criatura**

A troca de 4k para 2k economizou ~270 MB de VRAM por modelo sem mexer visivelmente no tamanho do `.glb`. Quem estivesse medindo por MB teria concluído que a mudança não fez nada.

**A regra:** o tamanho do arquivo governa o *download*; a resolução e o formato da textura governam a *VRAM*. São dois problemas distintos e exigem soluções distintas.

---

## Por que KTX2, e não só recomprimir o JPEG

Recomprimir os JPEGs em qualidade razoável funciona muito bem para download — e absolutamente nada para VRAM:

| Abordagem | Download (9 modelos) | VRAM (9 modelos) |
|---|---|---|
| Original do Meshy | 70.62 MB | ~800 MB |
| JPEG recomprimido q82–q92 | 18.65 MB | **580 MB** |
| KTX2/Basis | 37.48 MB | **96.63 MB** |

O JPEG recomprimido ganha no download e continua custando 580 MB de VRAM, porque o formato do arquivo não muda o que a GPU armazena. KTX2/Basis permanece comprimido *na própria GPU* — é a única opção que ataca o número de runtime.

Note que o KTX2 tem arquivo **maior** que o JPEG recomprimido. Isso é esperado e é o trade certo: 21 MB a mais de download em troca de 484 MB a menos de VRAM.

---

## As escolhas de codec, por slot

O script usa **ETC1S** como padrão e **UASTC** só no normal map.

- **ETC1S** transcodifica para BC1 (0.5 byte/px). Arquivo pequeno, VRAM pequena, perda aceitável em cor.
- **UASTC** transcodifica para BC7 (1 byte/px). Arquivo grande, qualidade alta.

Normal map é a exceção porque ETC1S o degrada de forma visível — blocagem e banding em superfícies lisas. Como o normal é justamente o que dá detalhe de superfície a criaturas de 3k tris, ele não pode ser o mapa sacrificado.

Três configurações foram medidas no CRT-009 antes da escolha:

| Configuração | Arquivo | VRAM | Normal |
|---|---|---|---|
| **UASTC 2048²** (escolhida) | 4.82 MB | 10.71 MB | máxima |
| ETC1S 2048² | 2.22 MB | 8.05 MB | pior |
| UASTC 1024² | 2.48 MB | 6.71 MB | alta, metade da resolução |

A opção de 1024² vence nos dois números, e continua disponível se o download virar prioridade — é trocar `uastcLDRQualityLevel` por um resize no slot `normal` em `scripts/optimize-models.mjs`. Ficou de fora porque reduzir resolução é decisão de arte, não de engenharia.

---

## Emissive: quase sempre lixo, mas confira antes de apagar

O Meshy exporta um slot emissivo mesmo quando não há brilho nenhum na arte. Medido nos 9 primeiros modelos, o pico de brilho ficou entre 7 e 90 de 255 — nenhum chega perto de um brilho real.

O script classifica cada mapa antes de agir:

- **pico ≤ 8** → a textura é preta (ruído de compressão JPEG sobre uma imagem vazia). Removida.
- **pico > 8** → há forma coerente, ainda que fraca. Reduzida para 256² (ou 512² se o pico passa de 32).

Reduzir para 256² já corta 98% do custo de VRAM daquele mapa, então a diferença prática entre reduzir e remover é desprezível — e reduzir não corre o risco de apagar arte que existe.

### A armadilha do emissiveFactor

Em glTF o emissivo é `emissiveFactor × emissiveTexture`. **Remover a textura deixando o fator em `[1,1,1]` faz a superfície inteira brilhar branco sólido** — a criatura vira uma silhueta chapada.

O script zera o fator junto com a remoção e se recusa a gravar o arquivo se encontrar um material sem textura emissiva e com fator diferente de zero. Se você mexer nesse trecho, mantenha a checagem.

### Se você quiser brilho de verdade

Não conte com o que o Meshy entrega. Um mapa emissivo correto é quase todo preto com poucas regiões muito claras (200+); o que vem do Meshy é o oposto — cinza-escuro fraco espalhado pelo corpo todo, correlacionado com o base color (r ≈ 0.3), que é a assinatura de um subproduto do gerador e não de direção de arte. Para brilho intencional, pinte um mapa pequeno (256² basta, luz é difusa) com valores altos nas regiões acesas.

---

## Sobre a opção "gerar mapas PBR" do Meshy

**Mantenha ligada.** Ela controla se você recebe o conjunto que descreve como a superfície reage à luz (metallic, roughness, normal) ou só a cor base. O normal map é o que sustenta a leitura de superfície em malhas de 3k tris — sem ele as criaturas viram plástico liso.

PBR e emissive são coisas diferentes: PBR descreve como a superfície **responde** à luz que chega; emissive é a superfície **emitindo** luz própria. Apague todas as luzes da cena e tudo que é PBR fica preto; o que continuar aceso é emissive.

Uma observação sobre o que vem empacotado: o glTF junta três mapas num arquivo só — occlusion no canal R, roughness no G, metallic no B. Nos 9 primeiros modelos o **canal de occlusion veio constante em 253–255 nos nove**, ou seja, zero informação, e o metallic ficou com média ~0.5 em oito deles. Na prática aquele arquivo de 2048² carrega um canal útil. Não é defeito do Meshy, é como o formato empacota — mas explica por que ele comprime tão bem e por que não vale investir qualidade nele.

---

## O que o script faz, na ordem

1. Varre `apps/web/public/models/*.glb`.
2. Pula qualquer modelo cujas texturas já sejam `image/ktx2` (idempotência).
3. Trata o emissive **antes** de codificar — não faz sentido gastar encode num mapa prestes a ser descartado.
4. Codifica os mapas restantes para KTX2 com mipmaps completos.
5. Marca `KHR_texture_basisu` como extensão obrigatória.
6. **Valida antes de gravar**: contagem de triângulos e vértices idêntica à entrada, e nenhum material com `emissiveFactor` não-zero sem textura. Se falhar, não grava.
7. Faz backup do original em `apps/web/.model-backups/` — **nunca sobrescrevendo um backup existente**.

### Flags

- `--dry` — mostra o que faria, sem gravar nada.
- `--force` — reprocessa modelos já otimizados, **partindo do backup**, não do arquivo já comprimido. Recomprimir arte já comprimida empilha perda geracional; é por isso que a flag lê do backup.

---

## Os backups são o ativo mais importante aqui

`apps/web/.model-backups/` guarda os `.glb` originais do Meshy, é gitignorada (~90 MB) e **é a única fonte a partir da qual um reencode futuro pode partir sem empilhar perda**.

Toda compressão com perda é destrutiva. Se amanhã você quiser trocar UASTC por ETC1S, ou 2048² por 1024², partir do arquivo já comprimido produz resultado pior que partir do original. Por isso o script nunca sobrescreve um backup existente e o `--force` lê de lá.

Se essa pasta se perder, o caminho de volta é re-baixar do Meshy.

---

## O que a aplicação precisa para carregar isto

`KHR_texture_basisu` é marcada como **obrigatória**. Um `GLTFLoader` sem `KTX2Loader` configurado não degrada — ele falha o carregamento.

O wiring vive em [`apps/web/src/components/CreatureViewer.tsx`](../apps/web/src/components/CreatureViewer.tsx):

- `KTX2Loader` em instância única de escopo de módulo (cada instância abre o próprio pool de workers).
- `detectSupport(gl)` escolhe o alvo de transcodificação conforme a GPU (BC7, ASTC, ETC2…). Precisa rodar antes da primeira transcodificação.
- Os binários do transcoder são servidos de `apps/web/public/basis/` (~570 KB), copiados de `three/examples/jsm/libs/basis/`. **Esses arquivos são versionados de propósito** — sem eles a aplicação não carrega modelo nenhum.

`three-stdlib` é dependência **explícita** de `apps/web` porque o drei tipa o callback `extendLoader` com o `GLTFLoader` dela, e sob pnpm estrito importar dependência transitiva quebra o build.

---

## Checklist para um modelo novo

1. Exportar do Meshy com "gerar mapas PBR" ligado, textura 2048².
2. Salvar como `CRT-XXX.glb` (sem sufixo de versão) em `apps/web/public/models/`.
3. `pnpm models:optimize`
4. Conferir a saída: geometria inalterada, redução de ~45–50% no arquivo.
5. `pnpm build` — `dist/` é saída de build e não se atualiza sozinho; sem rebuild, `vite preview` continua servindo o arquivo antigo.
6. Abrir a ficha da criatura e confirmar que renderiza.

Se o modelo aparecer preto ou branco chapado, o suspeito número um é o `emissiveFactor` — ver a armadilha acima.
