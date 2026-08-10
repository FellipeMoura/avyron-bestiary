import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Side-effect import: must run once before any schema uses `.openapi(...)`.
extendZodWithOpenApi(z);

export { z };
