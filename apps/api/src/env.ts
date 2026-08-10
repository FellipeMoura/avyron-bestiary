import "./loadEnv.js";

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  apiKey: required("API_KEY"),
  port: Number.parseInt(optional("API_PORT", "5101"), 10),
  nodeEnv: optional("NODE_ENV", "development"),
  // Comma-separated origins. Empty in dev = permissive (origin: true).
  // Empty in prod = blocks all cross-origin (origin: false).
  corsOrigin: optional("CORS_ORIGIN", ""),
};

export const isProd = env.nodeEnv === "production";
