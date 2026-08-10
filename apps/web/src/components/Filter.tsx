import { cn } from "../lib/cn";

interface FilterProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

/**
 * O select de filtro das telas de listagem. Nasceu no bestiário e saiu de lá
 * quando a página de itens precisou do mesmo controle — dois filtros com a
 * mesma função e alturas de linha diferentes seriam ruído visual em um site
 * cuja direção é ficar quieto fora da ficha de criatura.
 */
export function Filter({ label, value, onChange, options }: FilterProps) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-micro uppercase tracking-widest text-graphite">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "border border-graphite/60 bg-void px-2 py-1.5 font-mono text-xs text-bone",
          "focus:border-bone focus:outline-none",
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
