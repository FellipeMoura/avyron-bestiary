# Modelos 3D de criatura: contrato e preparo

Como um corpo de criatura chega a `apps/web/public/models/`, o que `pnpm models:optimize` faz com ele, e por que o KTX2 saiu.

**Resumo operacional:** o corpo é produzido pelo fluxo "base + casca" (`../mestre/README.md`, no diretório irmão `games/mestre/`) e entra por `pnpm models:publish -- --code CRT-XXX`, que grava `CRT-XXX.glb` aqui, roda o `models:optimize` e espelha no repo do jogo. Não há passo manual.

## O contrato do arquivo

Um `.glb` por criatura, nome igual ao `code`, solto na raiz de `apps/web/public/models/`. O `syncModels` do bestiário liga o `modelUrl` pelo nome do arquivo. O que o arquivo carrega desde 2026-09-17:

| | |
|---|---|
| Esqueleto | 55 ossos, nomes da UAL (`pelvis`, `spine_01`…), o mesmo da mestre |
| Animação | nenhuma — o jogo dá a biblioteca UAL em runtime por retarget |
| Malha | ~12k triângulos, T-pose, frente em +Z |
| Texturas | cor, normal e metal/rugosidade, JPEG ou PNG, no máximo 2048² |
| Material | PBR comum, sem emissivo |

O jogo recebe o arquivo **byte a byte** pelo `pnpm game:export`. Não existe mais formato de site e formato de jogo.

## O que `models:optimize` faz

1. Recusa arquivo ainda em KTX2 (republicar da fonte resolve).
2. Remove emissivo cujo pico é preto e zera o `emissiveFactor` junto. Em glTF o emissivo é fator × textura: tirar a textura deixando o fator em 1 acende o corpo inteiro em branco. O script se recusa a gravar se encontrar essa combinação.
3. Reduz textura acima de 2048² para 2048².
4. Valida que a geometria não mudou, e só então grava. Arquivo sem nada a mudar é `SKIP`. O original vai para `apps/web/.model-backups/` se ainda não houver um lá; republicação guarda o anterior como `<CODE>.prev.glb`.

`--dry` lista sem gravar. `--dir <pasta>` trata outra pasta, não recursivo.

## Por que o KTX2 saiu

Ele entrou em 2026-08 porque o viewer three.js do site renderizava os corpos e a VRAM era o gargalo: JPEG e PNG só comprimem em disco, a GPU guarda o mapa cru, e KTX2/Basis fica comprimido na própria GPU. Isso continua verdade, mas as duas premissas caíram:

- o site parou de renderizar modelo em 2026-09; o único consumidor é o Godot;
- o Godot 4.7 decodifica o ETC1S com a cor escurecida e, ao mesmo tempo, comprime PNG e JPEG para VRAM sozinho na importação (`detect_3d/compress_to`).

O resultado era codificar KTX2 aqui para decodificar de volta a PNG no espelho do jogo, com um decoder vendorizado do three.js no meio. Saíram o encoder, o decoder e o passo de espelho. A regra que sobrevive é a de resolução: **o tamanho do arquivo governa download; a resolução da textura governa VRAM**. Por isso o teto de 2048² continua, e reduzir mais é decisão de arte, não de engenharia.

## O corpo do jogador

Não existe mais um `.glb` de jogador: desde 2026-09-17 ele é montado pelo kit de personagens (`apps/web/public/models/characters/`, `pnpm models:characters`), como os NPCs, a partir de uma receita fixa no jogo. O export Meshy anterior está em `../shared-assets/legacy/meshy-player/`.
