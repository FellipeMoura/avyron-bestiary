/**
 * PM2 process manifest for the bestiary API in production.
 *
 * Only the api process runs under PM2 — the web app is a static bundle
 * served by Nginx from apps/web/dist. One instance is intentional; the
 * traffic volume doesn't justify clustering and it keeps the mental model
 * simple.
 *
 * The api runs via `tsx` directly on the TypeScript source. Skipping the
 * tsc/esbuild step is deliberate: internal imports across the monorepo use
 * bundler-style resolution (no `.js` extensions) so Node's own ESM loader
 * would reject them. Cold start costs ~50ms more; runtime after warmup is
 * identical to compiled JS.
 *
 * Reload flow: `pm2 reload ecosystem.config.cjs --update-env` (called by
 * scripts/deploy.sh). Zero-downtime because PM2 waits for the new process
 * to be listening before killing the old one.
 */
module.exports = {
  apps: [
    {
      name: "bestiary-api",
      script: "apps/api/src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      cwd: "/srv/bestiary/current",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/srv/bestiary/logs/api.err.log",
      out_file: "/srv/bestiary/logs/api.out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss.SSS",
    },
  ],
};
