import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();
app.listen(env.port, () => {
  console.log(`bestiary api listening on http://localhost:${env.port}`);
  console.log(`openapi: http://localhost:${env.port}/openapi.json`);
});
