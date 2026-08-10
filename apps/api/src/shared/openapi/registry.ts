import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

/**
 * Single shared registry — each feature module imports this and calls
 * `registry.registerPath(...)` for its endpoints. The generator at
 * `buildOpenApiDocument` walks the registry to produce the final spec.
 */
export const registry = new OpenAPIRegistry();

// The only auth in the system. Registered once here; write endpoints
// reference it via `security: [{ ApiKey: [] }]` in their registerPath call.
registry.registerComponent("securitySchemes", "ApiKey", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
});

export function buildOpenApiDocument(): object {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Bestiary API",
      version: "0.1.0",
      description:
        "Catalog of a 2D paleontological creature-collection game. Reads are open. " +
        "Writes require an X-API-Key header plus `reason` and `impact` fields in the body. " +
        "Free-text fields are rejected with 422 if they contain the deprecated terms " +
        '"Evolução" or "Forma Ancestral" — the official term is "Despertar Ancestral".',
    },
    servers: [{ url: "/api/v1" }],
  });
}
