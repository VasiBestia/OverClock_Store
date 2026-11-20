import { findBrands, fold } from "./catalog-data.js";
import { criteriaSchema, emptyCriteria } from "./criteria.js";

const plain = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
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
  if (/\b(?:configurati[ae]|configurator|asambl(?:are|eaza)|pc (?:build|complet)|build (?:me )?(?:a |un )?pc|(?:vreau|caut|doresc|nevoie de|want|need)\s+(?:sa (?:cumpar|fac) )?(?:un |a )?(?:pc|calculator|sistem|gaming pc|computer))\b/.test(s)
    || /^(?:(?:un|a) )?(?:pc|calculator)(?: de| pentru)? (?:gaming|birou|editare)\b/.test(s)) return "build_request";
  if (/\b(?:compatibil\w*|compatib\w*|se potriveste|merge cu|functioneaza cu|fits with|work with)\b/.test(s)) return "compatibility_check";
  return null;
}

function amount(raw) {
  const value = raw.replace(/\s/g, "");
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value)) return Number(value.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)) return Number(value.replace(/,/g, ""));
  return /^\d+(?:[,.]\d{1,2})?$/.test(value) ? Number(value.replace(",", ".")) : null;
}

export function readBudget(query) {
  const s = plain(query);
  const code = { lei: "RON", ron: "RON", usd: "USD", dolari: "USD", dollars: "USD", "$": "USD",
    eur: "EUR", euro: "EUR", "€": "EUR", gbp: "GBP", "£": "GBP" };
  const money = /\b(\d+(?:[., ]\d+)*)\s*(lei|ron|usd|dolari|dollars|eur|euro|gbp)\b|([$€£]|\b(?:usd|eur|ron|gbp)\b)\s*(\d+(?:[.,]\d+)*)|\b(\d+(?:[.,]\d+)*)\s*([$€£])/g;
  const matches = [...s.matchAll(money)];
  if (matches.length > 1) return { ambiguous: true };
  if (matches.length) {
    const [, a, u, prefix, b, c, suffix] = matches[0];
    const before = s.slice(0, matches[0].index);
    return { budget_max: amount(a ?? b ?? c), currency: code[u ?? prefix ?? suffix], matched: matches[0][0],
      budget_exclusive: /(?:\bsub|\bunder|\bless than|<)\s*$/.test(before) };
  }
  const bare = /\b(?:buget(?: de)?|budget(?: of)?)\s+(?:(?:de |cel mult |maxim(?:um)? |max )*)(\d+(?:[., ]\d+)*)\b/.exec(s);
  return bare ? { budget_max: amount(bare[1]), currency: null, matched: bare[0] } : {};
}

const minWords = /(?:min(?:im(?:um)?)?\.?|cel putin|at least|>=)\s*$/;
const familyPattern = /\b(?:ryzen(?:\s+[3579](?:\s+\d{4,5}[a-z0-9-]*)?)?|(?:geforce\s+)?(?:rtx|gtx)(?:\s*\d{3,4}(?:\s*(?:ti|super))*)?|geforce|radeon(?:\s+rx\s*\d{3,4}(?:\s*xtx?)?)?|core\s+i[3579](?:[- ]\d{4,5}[a-z]*)?|xeon|ssd|hdd)\b/;
const filler = new Set(("caut vreau doresc am nevoie de un o a an the pentru cu si din la pe prefer preferabil preferinta preferat preferata " +
  "marca brand model seria familie familia tip cel putin minimum minim max maxim maximum mult pana in sub buget gaming gamer jocuri " +
  "pc calculator sistem editare video editing workstation lucru office birou montaj at least with for i need want please recommend " +
  "mi te rog gaseste arata da recomandare recomanda cauta componenta componente kit capacitate total exact and my of preferred " +
  "minimi minimumul lei ron usd dolari eur euro gbp pretul pret la plafon bugetul").split(/\s+/));

export function interpretDemo(query) {
  const s = plain(query);
  const c = emptyCriteria();
  const special = specialIntent(query);
  c.usage = /\b(?:editare video|montaj video|video editing)\b/.test(s) ? "video_editing" :
    /\b(?:gaming|jocuri)\b/.test(s) ? "gaming" : /\b(?:birou|office)\b/.test(s) ? "office" :
    /\bworkstation\b/.test(s) ? "workstation" : null;
  const resolution = s.match(/\b(1080p|1440p|2160p|4k)\b/);
  c.resolution = resolution?.[1] === "4k" ? "2160p" : resolution?.[1] ?? null;
  const brands = findBrands(query);
  const namedBrand = s.match(/\b(?:marca|brand)\s+([\p{L}\d.!-]+)/u);
  c.brand = brands[0] ?? namedBrand?.[1] ?? null;
  c.brand_policy = c.brand ? (/\b(?:prefer\w*|ideal)\b/.test(s) ? "preferred" : "required") : null;
  const price = readBudget(query);
  c.budget_max = price.budget_max ?? null;
  c.budget_exclusive = price.budget_exclusive ?? false;
  c.currency = price.currency ?? null;
  const unclear = () => emptyCriteria("clarify");
  if (price.ambiguous || brands.length > 1 || (price.matched && c.budget_max === null)) return unclear();
  if (special) {
    c.intent = special;
    return criteriaSchema.safeParse(c).success ? c : unclear();
  }

  // Remove more specific category names before testing for incidental CPU/RAM terms.
  let context = s.replace(/\b(?:editare video|montaj video|video editing)\b/g, "");
  if (c.brand) context = context.replace(plain(c.brand), " ");
  const found = [];
  for (const [category, pattern] of Object.entries(categoryWords)) {
    if (!pattern.test(context)) continue;
    if (category === "ram" && found.includes("gpu") && !/\bram\b/.test(context)) continue;
    found.push(category);
    context = context.replace(new RegExp(pattern, "g"), " ");
  }
  if (found.length !== 1 || /\b(?:fara|except|exceptand|exclude|nu|not|without|between|intre)\b/.test(s)) return unclear();
  c.intent = "component_search";
  c.category = found[0];
  const family = s.match(familyPattern);
  c.family = family?.[0] ?? null;
  const cores = s.match(/\b(\d+)[\s-]*(?:nuclee|cores?)\b/);
  c.min_cores = cores ? Number(cores[1]) : null;
  const generation = s.match(/\bddr\s*([1-5])\b/);
  c.ddr_generation = generation ? Number(generation[1]) : null;
  const capacities = [...s.matchAll(/\b(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(gb|tb)\b/g)];
  if (capacities.length > 1) return unclear();
  const memory = capacities[0];
  if (memory) {
    c.module_count = memory[1] ? Number(memory[1]) : null;
    const capacity = Number(memory[2].replace(",", ".")) * Number(memory[1] ?? 1) * (memory[3] === "tb" ? 1000 : 1);
    const key = minWords.test(s.slice(0, memory.index)) ? "min_memory_gb" : "memory_gb";
    c[key] = capacity;
  }
  const watts = s.match(/\b(\d+)\s*(?:w|wati|watts?)\b/);
  c.min_wattage_w = watts ? Number(watts[1]) : null;

  // An upper hardware limit or a lower price bound has different semantics.
  if (/(?:max(?:im(?:um)?)?|cel mult|pana la|sub|<=?|>(?!=))\s*\d+(?:[.,]\d+)?\s*(?:gb|tb|nuclee|core|w\b)/.test(s) ||
      /\bexact\s+\d+\s*(?:nuclee|cores?|w|wati|watts?)\b/.test(s) ||
      (price.matched && minWords.test(s.slice(0, s.indexOf(price.matched))))) return unclear();

  let rest = s;
  if (c.brand) rest = rest.replace(plain(c.brand), " ");
  for (const match of [price.matched, memory?.[0], watts?.[0], cores?.[0], resolution?.[0], generation?.[0], family?.[0]]) {
    if (match) rest = rest.replace(match, " ");
  }
  for (const pattern of Object.values(categoryWords)) rest = rest.replace(new RegExp(pattern, "g"), " ");
  rest = " " + fold(rest) + " ";
  if (rest.trim().split(/\s+/).some(word => word && !filler.has(word))) return unclear();
  return criteriaSchema.safeParse(c).success ? c : unclear();
}
