import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { categories } from "./catalog-data.js";
import { criteriaSchema, currencies, emptyCriteria, requestSchema } from "./criteria.js";
import { ApiError } from "./errors.js";
import { createInterpreter } from "./interpret.js";
import { listProducts, search } from "./search.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const htmlPages = ["index", "shop", "cart", "bestseller", "cheackout", "contact", "single", "404"];
const numeric = z.string().max(16).regex(/^\d+(?:\.\d+)?$/).transform(Number);
const positiveInt = max => z.string().max(7).regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
const productQuery = z.strictObject({
  category: z.enum(categories).optional(), brand: z.string().trim().min(1).max(64).optional(), family: z.string().trim().min(1).max(64).optional(),
  min_cores: numeric.optional(), min_memory_gb: numeric.optional(), memory_gb: numeric.optional(),
  ddr_generation: numeric.optional(), module_count: numeric.optional(), min_wattage_w: numeric.optional(), budget_max: numeric.optional(),
  currency: z.enum(currencies).optional(), page: positiveInt(1000000).optional(), page_size: positiveInt(50).optional()
});
const badInput = () => new ApiError(400, "invalid_input", "Verifică textul cererii, filtrele și valorile numerice.");

function limiter(limit) {
  return rateLimit({ windowMs: 60000, limit, standardHeaders: "draft-7", legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, "rate_limited", "Prea multe cereri. Reîncearcă după perioada indicată.")) });
}

export function createApp({ repository, mode = "demo", key, model = "gpt-5.4-mini", client,
  origins = [], searchLimit = 12, catalogLimit = 90, dailyLimit, maxConcurrent }) {
  const interpret = createInterpreter({ mode, key, model, client, dailyLimit, maxConcurrent });
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => { res.set("X-Content-Type-Options", "nosniff"); next(); });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.vary("Origin");
    const origin = req.get("Origin");
    if (origin && origin !== req.protocol + "://" + req.get("host") && !origins.includes(origin)) {
      return next(new ApiError(403, "origin_denied", "Originea frontend-ului nu este permisă."));
    }
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Expose-Headers", "Retry-After");
    }
    if (req.method !== "OPTIONS") return next();
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok", mode, interpreter_ready: mode === "demo" || Boolean(key || client) }));
  app.post("/api/ai/search", limiter(searchLimit), (req, _res, next) =>
    req.is("application/json") ? next() : next(new ApiError(415, "unsupported_media_type", "Trimite un obiect JSON.")),
  express.json({ limit: "4kb", inflate: false }), async (req, res) => {
    const input = requestSchema.safeParse(req.body);
    if (!input.success) throw badInput();
    const { criteria, source, issue } = await interpret(input.data.query);
    res.json({ mode, interpretation_source: source, ...search(repository, criteria, issue) });
  });
  app.get("/api/products", limiter(catalogLimit), (req, res) => {
    const query = productQuery.safeParse(req.query);
    if (!query.success) throw badInput();
    const { page = 1, page_size: size = 20, ...filters } = query.data;
    if (!filters.category && ["min_cores", "min_memory_gb", "memory_gb", "ddr_generation", "module_count", "min_wattage_w"].some(k => k in filters)) throw badInput();
    const c = criteriaSchema.safeParse({ ...emptyCriteria(filters.category ? "component_search" : "clarify"),
      ...filters, brand_policy: filters.brand ? "required" : null });
    if (!c.success) throw badInput();
    res.json({ ...listProducts(repository, c.data, page, size),
      messages: c.data.budget_max !== null && c.data.currency !== "USD" ? ["Nu există prețuri comparabile pentru moneda solicitată."] : [] });
  });
  app.use("/api", (_req, _res, next) => next(new ApiError(404, "not_found", "Endpoint necunoscut.")));

  // Only public site assets and the existing pages can be served from this origin.
  for (const folder of ["css", "js", "img", "lib"]) app.use("/" + folder, express.static(path.join(root, folder), { index: false }));
  for (const page of htmlPages) app.get("/" + page + ".html", (_req, res) => res.sendFile(path.join(root, page + ".html")));
  app.get("/", (_req, res) => res.sendFile(path.join(root, "index.html")));
  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    let e = err;
    if (err.type === "entity.parse.failed" || err.type === "request.aborted" || err.type === "request.size.invalid") e = badInput();
    if (err.type === "entity.too.large") e = new ApiError(413, "body_too_large", "Cererea depășește limita de 4 KiB.");
    if (["encoding.unsupported", "charset.unsupported"].includes(err.type)) e = new ApiError(415, "unsupported_media_type", "Codificare nesuportată.");
    if (!(e instanceof ApiError)) e = new ApiError(500, "internal_error", "Cererea nu a putut fi procesată.");
    if (e.retryAfter !== undefined) res.set("Retry-After", String(e.retryAfter));
    res.status(e.status).json({ mode, error: { code: e.code, message: e.message } });
  });
  return app;
}
