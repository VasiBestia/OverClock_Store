import { fold } from "./catalog-data.js";
import { mentionedBrands, plain, queryIssue, readBudget } from "./query-guards.js";
import { criteriaSchema, emptyCriteria } from "./criteria.js";

const categoryWords = {
  cooler: /\b(?:cpu[- ]cooler|cooler(?:e)?(?: de| pentru)?(?: cpu| procesor)?|racire(?: pentru procesor)?)\b/,
  motherboard: /\b(?:plac[ai] de baza|motherboards?|mainboard)\b/,
  gpu: /\b(?:plac[ai] (?:video|grafic[ae])|gpu|graphics card|video card|vram|geforce|radeon|rtx|gtx)\b/,
  psu: /\b(?:surs[ae]|psu|power supply)\b/,
  case: /\b(?:carcas[ae]|case|chassis)\b/,
  storage: /\b(?:ssd|hdd|stocare|hard disk|storage)\b/,
  cpu: /\b(?:procesor(?:ul|e)?|procesoare|processor|cpu|ryzen|xeon|core i[3579])\b/,
  ram: /\b(?:ram|ddr\s*[1-5]|memori[ea]|memory)\b/
};

export function specialIntent(query) {
  const s = plain(query);
  if (/\b(?:construi\w*|asamble\w*|configure\w*|build)\s+(?:(?:mi|me|un|a|an|gaming)\s+)*(?:pc|calculator|sistem|computer)\b/.test(s)
    || /^(?:gaming pc|pc complet|sistem complet|configuratie completa)\b/.test(s)) return "build_request";
  if (/\b(?:configurati[ae]|configurator|asambl(?:are|eaza)|pc (?:build|complet)|build (?:me )?(?:a |un )?pc|(?:vreau|caut|doresc|nevoie de|want|need)\s+(?:sa (?:cumpar|fac) )?(?:un |a )?(?:pc|calculator|sistem|gaming pc|computer))\b/.test(s)
    || /^(?:(?:un|a) )?(?:pc|calculator)(?: de| pentru)? (?:gaming|birou|editare)\b/.test(s)) return "build_request";
  if (/\b(?:compatibil\w*|compatib\w*|se potriveste|merge cu|functioneaza cu|fits with|work with)\b/.test(s)) return "compatibility_check";
  return null;
}

const minWords = /(?:min(?:im(?:um)?)?\.?|cel putin|macar|at least|>=)\s*$/;
const minAfter = /^(?:\s+(?:vram|ram|memorie))?[\s,]*(?:min(?:im(?:um)?)?\b|or more\b|sau mai mult\b)/;
const familyPattern = /\b(?:ryzen(?:\s+[3579](?:\s+\d{4,5}[a-z0-9-]*)?)?|(?:geforce\s+)?(?:rtx|gtx)(?:\s*\d{3,4}(?:\s*(?:ti|super))*)?|geforce|radeon(?:\s+rx\s*\d{3,4}(?:\s*xtx?)?)?|core\s+i[3579](?:[- ]\d{4,5}[a-z]*)?|xeon|ssd|hdd)\b/;
const filler = new Set(("caut vreau doresc am nevoie de un o a an the pentru cu si din la pe prefer preferabil preferinta preferat preferata " +
  "marca brand model seria familie familia tip cel putin minimum minim max maxim maximum mult pana in sub buget gaming gamer jocuri " +
  "pc calculator sistem editare video editing workstation lucru office birou montaj at least with for i need want please recommend " +
  "mi te rog gaseste arata da recomandare recomanda cauta componenta componente kit capacitate total exact and my of preferred " +
  "minimi minimumul lei ron usd dolari eur euro gbp pretul pret la plafon bugetul ceva bun buna frumos exclusiv doar").split(/\s+/));

function unrecognized(text) {
  return fold(text).split(/\s+/).some(word => word && !filler.has(word));
}

export function inspectQuery(query) {
  const s = plain(query);
  const c = emptyCriteria();
  const special = specialIntent(query);
  c.usage = /\b(?:editare video|montaj video|video editing)\b/.test(s) ? "video_editing" :
    /\b(?:gaming|jocuri)\b/.test(s) ? "gaming" : /\b(?:birou|office)\b/.test(s) ? "office" :
    /\bworkstation\b/.test(s) ? "workstation" : null;
  const resolution = s.match(/\b(1080p|1440p|2160p|4k)\b/);
  c.resolution = resolution?.[1] === "4k" ? "2160p" : resolution?.[1] ?? null;
  const brands = mentionedBrands(query);
  c.brand = brands[0] ?? null;
  c.brand_policy = c.brand ? (/\b(?:prefer\w*|ideal)\b/.test(s) ? "preferred" : "required") : null;
  const price = readBudget(query);
  c.budget_max = price.budget_max ?? null;
  c.budget_exclusive = price.budget_exclusive ?? false;
  c.currency = price.currency ?? null;
  // Recognized but unsupported constraints must block both interpreters. Unfamiliar
  // phrasing alone may still be interpreted by the model.
  const unclear = (issue = null) => ({ criteria: emptyCriteria(), issue, budget: price, anchors: c });
  const parsed = () => criteriaSchema.safeParse(c).success
    ? { criteria: c, issue: null, budget: price, anchors: c }
    : unclear("invalid_quantity");
  const issue = queryIssue(s, price, brands, special);
  if (issue) return unclear(issue);
  if (special) {
    c.intent = special;
    return parsed();
  }

  // Remove more specific category names before testing for incidental CPU/RAM terms.
  let context = price.remaining.replace(/\b(?:editare video|montaj video|video editing)\b/g, "");
  if (c.brand) context = context.replace(plain(c.brand), " ");
  const found = [];
  for (const [category, pattern] of Object.entries(categoryWords)) {
    if (!pattern.test(context)) continue;
    if (category === "ram" && found.includes("gpu") && !/\bram\b/.test(context)) continue;
    found.push(category);
    context = context.replace(new RegExp(pattern, "g"), " ");
  }
  if (found.length > 1) return unclear("multiple_components");
  if (!found.length) {
    const generic = context.replace(/\b(?:ieftin\w*|rapid\w*|performant\w*|puternic\w*|upgrade|cheap|fast|best|1080p|1440p|2160p|4k)\b/g, " ");
    return unclear(unrecognized(generic) ? null : "missing_category");
  }
  c.intent = "component_search";
  c.category = found[0];
  const families = [...s.matchAll(new RegExp(familyPattern, "g"))];
  if (new Set(families.map(m => fold(m[0]))).size > 1) return unclear("alternative");
  const family = families[0];
  c.family = family?.[0] ?? null;
  const coreCounts = [...s.matchAll(/\b(\d+)(?:\s+de)?[\s-]*(?:nuclee|cores?)\b/g)];
  if (coreCounts.length > 1) return unclear("range");
  const cores = coreCounts[0];
  c.min_cores = cores ? Number(cores[1]) : null;
  const generations = [...s.matchAll(/\bddr\s*(\d+)\b/g)];
  if (generations.length > 1) return unclear("alternative");
  const generation = generations[0];
  c.ddr_generation = generation ? Number(generation[1]) : null;
  const capacities = [...s.matchAll(/\b(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(gb|tb)\b/g)];
  if (capacities.length > 1) return unclear("range");
  const memory = capacities[0];
  if (memory) {
    c.module_count = memory[1] ? Number(memory[1]) : null;
    const capacity = Number(memory[2].replace(",", ".")) * Number(memory[1] ?? 1) * (memory[3] === "tb" ? 1000 : 1);
    const minimum = minWords.test(s.slice(0, memory.index)) || minAfter.test(s.slice(memory.index + memory[0].length));
    const key = minimum ? "min_memory_gb" : "memory_gb";
    c[key] = capacity;
  }
  const powers = [...s.matchAll(/\b(\d+)(?:\s+de)?\s*(?:w|wati|watts?)\b/g)];
  if (powers.length > 1) return unclear("range");
  const watts = powers[0];
  c.min_wattage_w = watts ? Number(watts[1]) : null;

  if (!criteriaSchema.safeParse(c).success) return unclear("invalid_quantity");
  let rest = price.remaining;
  if (c.brand) rest = rest.replace(plain(c.brand), " ");
  for (const match of [memory?.[0], watts?.[0], cores?.[0], resolution?.[0], generation?.[0], family?.[0]]) {
    if (match) rest = rest.replace(match, " ");
  }
  for (const pattern of Object.values(categoryWords)) rest = rest.replace(new RegExp(pattern, "g"), " ");
  if (unrecognized(rest)) {
    const clauses = rest.split(/\b(?:cu|with|having|trebuie sa|care (?:sa|are|suporta)|obligatoriu|doar|must|si|and)\b/);
    const unparsedQuantity = /(?:^|\s)\d+(?:[.,]\d+)?\s*[\p{L}]/u.test(rest);
    return unclear(unparsedQuantity || clauses.slice(1).some(unrecognized) ? "unsupported_spec" : null);
  }
  return parsed();
}

export function interpretDemo(query) {
  return inspectQuery(query).criteria;
}
