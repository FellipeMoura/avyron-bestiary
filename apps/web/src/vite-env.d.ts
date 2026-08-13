/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only write key for the "sincronizar modelos" button. See CLAUDE.md. */
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
