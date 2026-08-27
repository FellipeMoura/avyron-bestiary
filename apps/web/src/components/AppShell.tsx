import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/cn";

const links = [
  { to: "/bestiary", label: "Bestiário", code: "CRT" },
  { to: "/items", label: "Itens", code: "ITM" },
  { to: "/elements", label: "Elementos", code: "ELE" },
  { to: "/documents", label: "Documentos", code: "DOC" },
  { to: "/changelog", label: "Histórico", code: "LOG" },
] as const;

/**
 * Global shell: a thin top bar with the code prefix + label per section.
 * Kept intentionally quiet — the ficha de criatura is where visual weight
 * lives. The rest is chrome.
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-void text-bone">
      <header className="border-b border-graphite/40">
        <div className="mx-auto flex max-w-page items-baseline gap-8 px-6 py-5">
          <NavLink
            to="/"
            className="font-mono text-micro tracking-widest text-graphite hover:text-bone"
          >
            BESTIÁRIO / v0.1
          </NavLink>
          <nav className="flex items-baseline gap-6">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  cn(
                    "font-mono text-micro uppercase tracking-widest transition-colors",
                    isActive ? "text-bone" : "text-graphite hover:text-bone",
                  )
                }
              >
                <span className="mr-2 text-ember/70">{l.code}</span>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-page px-6 py-10 md:py-16">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-page px-6 py-8 font-mono text-micro text-graphite">
        alterações passam pela API — e a tela de elementos escreve por ela
      </footer>
    </div>
  );
}
