# Fontes

Coloque aqui os quatro arquivos originais do jogo, com estes nomes exatos:

- `01_Game_Design_Bible.docx`
- `02_Game_Database.xlsx`
- `03_Development_Log.docx`
- `04_Roadmap.docx`

O `seed.py` lê deste diretório. Os arquivos `.docx`/`.xlsx` são ignorados pelo `.gitignore` — só este README fica versionado.

## O que o seed espera

- **`02_Game_Database.xlsx`** — uma aba por tabela estruturada. A aba `Despertares` já está renomeada (não é mais "Evoluções"). Linhas em cinza itálico são exemplos e são ignoradas.
- **`01_Game_Design_Bible.docx`** — um registro por capítulo em `documentos`, convertendo para markdown e preservando o campo de status de cada capítulo.
- **`03_Development_Log.docx`** — vira `changelog`, versões 0.01 a 0.10.
- **`04_Roadmap.docx`** — um `documento` markdown único.

O seed é **idempotente**: rodar duas vezes não duplica nada.
