import { useState } from "react";

/**
 * A arte de card de uma criatura, endereçada por `code` (`/crt-cards/CRT-XXX.png`).
 *
 * Mesma lógica do `CodeIcon`: some sozinha quando o arquivo não existe, em vez
 * de deixar o ícone de imagem quebrada do navegador na tela. Isso importa mais
 * aqui do que lá — hoje só 21 das 60 criaturas do catálogo têm card desenhado,
 * então "sem imagem" é o estado normal da maioria das linhas, não uma falha.
 *
 * `alt` fica vazio de propósito quando não recebido: o nome e o código da
 * criatura já aparecem como texto ao lado da imagem em todo lugar que este
 * componente é usado, então anunciar de novo é ruído para leitor de tela.
 */
export function CardImage({
  code,
  className,
  alt = "",
}: {
  code: string;
  className?: string;
  alt?: string;
}) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <img
      src={`/crt-cards/${code}.png`}
      alt={alt}
      className={className}
      onError={() => setMissing(true)}
    />
  );
}
