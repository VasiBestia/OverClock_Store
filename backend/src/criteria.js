import { z } from "zod";
import { categories } from "./catalog-data.js";

export const currencies = ["USD", "RON", "EUR", "GBP", "other"];
export const shape = z.strictObject({
  intent: z.enum(["component_search", "build_request", "compatibility_check", "clarify"]),
  category: z.enum(categories).nullable(),
  brand: z.string().nullable(),
  brand_policy: z.enum(["required", "preferred"]).nullable(),
  family: z.string().nullable(),
  min_cores: z.number().nullable(),
  min_memory_gb: z.number().nullable(),
  memory_gb: z.number().nullable(),
  module_count: z.number().nullable(),
  ddr_generation: z.number().nullable(),
  min_wattage_w: z.number().nullable(),
  budget_max: z.number().nullable(),
  budget_exclusive: z.boolean(),
  currency: z.enum(currencies).nullable(),
  usage: z.enum(["gaming", "video_editing", "office", "workstation"]).nullable(),
  resolution: z.enum(["1080p", "1440p", "2160p"]).nullable()
});

export function emptyCriteria(intent = "clarify") {
  const empty = Object.fromEntries(Object.keys(shape.shape).map(key => [key, null]));
  return { ...empty, intent, budget_exclusive: false };
}

const bounds = { min_cores: 1024, min_memory_gb: 100000, memory_gb: 100000, ddr_generation: 5,
  module_count: 64, min_wattage_w: 20000, budget_max: 1000000000 };
const categoryFields = {
  min_cores: ["cpu"], min_memory_gb: ["gpu", "ram", "storage"], memory_gb: ["gpu", "ram", "storage"],
  ddr_generation: ["ram"], module_count: ["ram"], min_wattage_w: ["psu"]
};

export const criteriaSchema = shape.superRefine((c, ctx) => {
  function invalid(key) {
    ctx.addIssue({ code: "custom", path: [key], message: "Invalid criterion" });
  }
  if (c.intent === "component_search" && c.category === null) invalid("category");
  if (c.intent === "build_request" && c.category !== null) invalid("category");
  if ((c.brand === null) !== (c.brand_policy === null)) invalid("brand_policy");
  if ((c.currency !== null || c.budget_exclusive) && c.budget_max === null) invalid("budget_max");
  if (c.min_memory_gb !== null && c.memory_gb !== null) invalid("memory_gb");
  for (const key of ["brand", "family"]) {
    if (c[key] !== null && !/^[\p{L}\p{N}][\p{L}\p{N} .!+/-]{0,63}$/u.test(c[key])) invalid(key);
  }
  for (const [key, max] of Object.entries(bounds)) {
    if (c[key] !== null && (c[key] <= 0 || c[key] > max)) invalid(key);
  }
  for (const key of ["min_cores", "ddr_generation", "module_count", "min_wattage_w"]) {
    if (c[key] !== null && !Number.isInteger(c[key])) invalid(key);
  }
  if (c.intent === "component_search") {
    for (const [key, allowed] of Object.entries(categoryFields)) {
      if (c[key] !== null && !allowed.includes(c.category)) invalid(key);
    }
  }
});

export const requestSchema = z.strictObject({
  query: z.string().max(500).trim().min(3)
    .refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\/?[a-z][^>]*>/iu.test(s))
});
