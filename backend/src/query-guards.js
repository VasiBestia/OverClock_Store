import { findBrands } from "./catalog-data.js";

export const plain = value => value.normalize("NFKC").normalize("NFD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/[’‘]/g, "'").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/−/g, "-");

const currencies = {
  lei: "RON", leu: "RON", ron: "RON", usd: "USD", dolar: "USD", dolari: "USD", dollar: "USD", dollars: "USD", "$": "USD",
  eur: "EUR", euro: "EUR", "€": "EUR", gbp: "GBP", "£": "GBP"
};

// Other common budget currencies are identified so their amounts cannot become USD.
const codes = "cad aud nzd chf pln czk huf bgn mdl sek nok dkk jpy cny inr brl rub uah mxn hkd sgd zar".split(" ");
const moneyUnits = [...new Set([...codes, ...Object.keys(currencies).filter(s => /^[a-z]+$/.test(s))])].join("|");
const unit = "(?:\\b(?:" + moneyUnits + ")\\b|[$€£¥₹])";
const suffixUnit = "(?:(?:" + moneyUnits + ")\\b|[$€£¥₹])";
const digits = "\\d+(?:[.,]\\d+| \\d{3}(?!\\d))*";
const amountWithUnit = new RegExp("(?<![\\w.,])(" + digits + ")\\s*(" + suffixUnit + ")|(" + unit + ")\\s*(" + digits + ")", "g");
const currencyToken = new RegExp(unit, "g");
const upper = "(?:cel mult|pana la|maximum|maxim(?:um)?|max\\.?|at most|up to|no more than|nu mai mult de|nu mai scump[ae]? de|<=)";
const under = "(?:sub|mai putin de|under|below|less than|<)";
const lower = "(?:minimum|minim(?:um)?|min\\.?|cel putin|macar|at least|peste|mai mult de|more than|over|>=?)";
const beforeAmount = new RegExp("(?:" + upper + "|" + under + "|" + lower + ")(?:\\s+de)?\\s*$");
const lowerBound = new RegExp("^(?:" + lower + ")$");
const exclusiveBound = new RegExp("^(?:" + under + ")$");
const afterAmount = /^\s*(maximum|maxim(?:um)?|max\b|minimum|minim(?:um)?|min\b|or (?:less|more)|sau (?:mai putin|mai mult))\b/;
const bareBudget = new RegExp("\\b(?:buget(?:ul)?|budget|plafon)(?:\\s+(?:de|of|este|is|maxim(?:um)?|maximum|max|cel mult|pana la))*\\s*[:=]?\\s*(" + digits + ")\\b");
const bareCeiling = new RegExp("(?:" + upper + "|" + under + ")\\s*(" + digits + ")(?=\\s*(?:$|[!?;]|[.,](?!\\d)|\\b(?:pentru|for|cu|with|si|and)\\b))");
const range = /\b(?:intre|between|from|de la)\s+(?:[$€£]\s*)?\d[^!?;]{0,35}?\b(?:si|and|to|la)\s+(?:[$€£]\s*)?\d|(?<![a-z0-9])\d+\s*(?:(?:gb|tb|w|lei|ron|usd|eur)\s*)?(?:[-–—]|\bto\b|\bpana la\b)\s*(?:[$€£]\s*)?\d/;

function amount(raw) {
  if (!raw) return null;
  const value = raw.replace(/ /g, "");
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value)) return Number(value.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)) return Number(value.replace(/,/g, ""));
  return /^\d+(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(",", ".")) : null;
}

export function readBudget(query) {
  const s = plain(query);
  const mentions = [...s.matchAll(amountWithUnit)];
  const denominations = new Set([...s.matchAll(currencyToken)].map(m => currencies[m[0]] ?? m[0]));
  for (const m of mentions) {
    const token = m[2] ?? m[3];
    denominations.add(currencies[token] ?? token);
  }
  if (mentions.length > 1 || denominations.size > 1) return { issue: "ambiguous_budget", remaining: s };
  const monetary = mentions[0];
  const match = monetary ?? s.match(bareBudget) ?? s.match(bareCeiling);
  if (!match) {
    if (denominations.size || /\b(?:buget(?:ul)?|budget|plafon)\b/.test(s)) return { issue: "ambiguous_budget", remaining: s };
    return { remaining: s };
  }
  const raw = monetary ? monetary[1] ?? monetary[4] : match[1];
  const denomination = monetary ? monetary[2] ?? monetary[3] : null;
  const value = amount(raw);
  const left = s.slice(0, match.index);
  const right = s.slice(match.index + match[0].length);
  const before = left.match(beforeAmount)?.[0] ?? "";
  const after = right.match(afterAmount)?.[0] ?? "";
  const internal = !monetary ? match[0].slice(0, match[0].lastIndexOf(raw)).match(beforeAmount)?.[0] : "";
  const originalBound = (before || internal || "").trim();
  const bound = originalBound.replace(/\s+de$/, "");
  if (lowerBound.test(bound) || lowerBound.test(originalBound) || /minim|\bmin\b|or more|mai mult/.test(after)) {
    return { issue: "unsupported_bound", remaining: s };
  }
  if (value === null || value <= 0 || value > 1e9) return { issue: "invalid_quantity", remaining: s };
  const remaining = left.slice(0, left.length - before.length) + " " + right.slice(after.length);
  if (bareBudget.test(remaining) || /\b(?:canadieni|canadian|australieni|australian)\b/.test(s) && currencies[denomination] === "USD") {
    return { issue: "ambiguous_budget", remaining: s };
  }
  return { budget_max: value, currency: denomination ? currencies[denomination] ?? "other" : null,
    budget_exclusive: exclusiveBound.test(bound) || exclusiveBound.test(originalBound), remaining };
}

const qty = "\\d+(?:[.,]\\d+)?\\s*(?:de\\s+)?(?:gb|go|gib|tb|to|nuclee|cores?|w|wati|watts?)\\b";
const unsupportedHardwareBound = new RegExp("(?:" + upper + "|" + under + "|>(?!=)|peste|more than|mai mult de)\\s*(?:de\\s+)?" + qty +
  "|" + qty + "(?:\\s+(?:vram|ram|memorie))?\\s*(?:" + upper + "|or less|sau mai putin|max\\b)" +
  "|(?:exact(?:ly)?\\s+\\d+\\s*(?:nuclee|cores?|w|wati|watts?)\\b)");
const negation = /\b(?:nu|nici|fara|exclu(?!siv)\w*|except\w*|evit\w*|in afara de|alt[ae]? decat|in loc de|non|not|no|without|avoid\w*|excluding|other than|anything but|don't|doesn't|isn't|sans|sauf)\b|!=|≠/;
const alternative = /\b(?:ori|sau|versus|vs|or|either|between|intre)\b/;
// These properties have no deterministic search predicate in this API.
const unsupportedSpecs = [
  /\b(?:wi[\s-]?fi\w*|wireless|bluetooth|rgb|argb|ray[\s-]?tracing|dlss\w*|fsr\w*|cuda|fps|benchmarks?)\b/,
  /\b(?:tdp|threads?|fire de executie|ghz|mhz|khz|mt\/s|cache|gddr\w*|overclock\w*|latenta|latency|cl\d+)\b/,
  /\b(?:pcie|pci[- ]express|nvme|sata|am[2-6]|lga\s*\d+|socket|soclu|bios|e?atx|m[- ]?atx|itx|mini[- ]itx)\b/,
  /\b(?:modular\w*|conector\w*|connectors?|certific\w*|gold|platinum|bronze|silent\w*|quiet|fanless)\b/,
  /\b(?:stoc|stock|garantie|warranty|livrare|delivery|second[- ]hand|negr\w*|white|black|alb[ae]?|culoare|color|rosie?)\b/,
  /\b(?:tastatura|keyboard|mouse|monitor)\b/,
  /\d\s*(?:[gmk]hz|fps|mm\b|cm\b|rpm\b|db\b|gb\/s|mt\/s)|\bddr\s*\d\s*[- ]\s*\d{3,}/
];
const negativeQuantity = /(?:^|[^\p{L}\p{N}])[-−]\s*(?:[$€£¥₹]\s*)?\d/u;

export function queryIssue(s, budget, brands, special) {
  if (budget.issue) return budget.issue;
  if (range.test(s)) return "range";
  if (negativeQuantity.test(s) || /\d+[.,]\d+\s*(?:de\s+)?(?:nuclee|cores?|watts?|wati|w)\b/.test(s)) return "invalid_quantity";
  const rest = budget.remaining;
  if (negation.test(rest)) return "negative";
  if (brands.length > 1) return "multiple_brands";
  if (unsupportedHardwareBound.test(rest) || /\b(?:maxim\w*|max|cel mult|pana la|at most|up to|mai putin de)\b/.test(rest)) return "unsupported_bound";
  if (alternative.test(rest)) return "alternative";
  // Compatibility/build responses never select parts.
  if (special) return null;
  // A brand name can itself contain a specification word, e.g. "be quiet!".
  const specs = brands.reduce((text, brand) => text.replace(plain(brand), " "), rest);
  if (unsupportedSpecs.some(pattern => pattern.test(specs))) return "unsupported_spec";
  return null;
}

export function mentionedBrands(query) {
  const known = findBrands(query);
  const normalized = plain(query);
  const explicit = [...normalized.matchAll(/\b(?:marca|marcile|brand(?:ul|urile)?|producator(?:ul|ii)?)\s+([\p{L}\d][\p{L}\d.!-]*)/gu)]
    .map(m => m[1]).filter(word => !known.some(brand => plain(brand).startsWith(word)));
  const lists = normalized.matchAll(/\b(?:marca|marcile|brand(?:ul|urile)?|producator(?:ul|ii)?)\s+[\p{L}\d.!-]+\s*(?:[+/]|\b(?:si|and|sau|or)\b)\s*([\p{L}][\p{L}\d.!-]*)/gu);
  for (const [, next] of lists) {
    if (!/^(?:marca|brand|cu|with|min\w*|max\w*|cel|de|un|buget|budget|prefer\w*)$/.test(next) &&
        !known.some(brand => plain(brand).startsWith(next))) explicit.push(next);
  }
  return [...new Set([...known, ...explicit])];
}
