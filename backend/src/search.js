import { fold } from "./catalog-data.js";

const checksForBuild = [
  "Socketul procesorului și lista CPU/BIOS acceptată de placa de bază.",
  "Generația DDR acceptată de placa de bază și compatibilitatea kitului RAM.",
  "Prinderea și înălțimea coolerului, spațiul pentru GPU și radiator în carcasă.",
  "Formatele plăcii de bază și sursei, puterea necesară și conectorii sursei."
];
const labels = { cpu: "Procesor", gpu: "Placă video", ram: "Memorie RAM", motherboard: "Placă de bază",
  psu: "Sursă", case: "Carcasă", cooler: "Cooler", storage: "Stocare internă" };
const incompatibleBudget = "Catalogul oferă doar prețuri istorice verificate în USD. Bugetul cerut nu poate fi comparat.";
const hasBudget = c => c.budget_max !== null;
const capacity = p => p.category === "storage" ? p.specs.capacity_gb : p.specs.memory_gb;

function brandMatches(p, brand) {
  if (!brand) return false;
  return [p.manufacturer, p.specs.chipset_vendor].some(value => value && fold(value) === brand) ||
    (" " + fold(p.name) + " ").startsWith(" " + brand + " ");
}

function meets(value, minimum) {
  return minimum === null || (value != null && value >= minimum);
}

// Filter explicit constraints first. Preference and distance above a minimum only rank survivors.
function select(repository, c) {
  if (hasBudget(c) && c.currency !== "USD") return [];
  const brand = c.brand ? fold(c.brand) : null;
  const family = c.family ? " " + fold(c.family) + " " : null;
  const candidates = [];
  for (const p of repository.list(c.category)) {
    const preferred = brandMatches(p, brand);
    if (c.brand_policy === "required" && !preferred) continue;
    if (family && !(" " + fold([p.name, p.specs.chipset, p.specs.drive_type].filter(Boolean).join(" ")) + " ").includes(family)) continue;
    const gb = capacity(p);
    if (!meets(p.specs.cores, c.min_cores) || !meets(gb, c.min_memory_gb) || !meets(p.specs.wattage_w, c.min_wattage_w)) continue;
    if (c.memory_gb !== null && gb !== c.memory_gb) continue;
    if (c.ddr_generation !== null && p.specs.ddr_generation !== c.ddr_generation) continue;
    if (c.module_count !== null && p.specs.modules !== c.module_count) continue;
    if (hasBudget(c) && (!p.price || p.price.currency !== c.currency || p.price.amount > c.budget_max)) continue;
    if (c.budget_exclusive && p.price.amount === c.budget_max) continue;
    const distance = (c.min_cores === null ? 0 : p.specs.cores - c.min_cores) +
      (c.min_memory_gb === null ? 0 : gb - c.min_memory_gb) +
      (c.min_wattage_w === null ? 0 : p.specs.wattage_w - c.min_wattage_w);
    candidates.push({ p, preferred, distance });
  }
  if (c.brand_policy === "preferred" || [c.min_cores, c.min_memory_gb, c.min_wattage_w].some(n => n !== null)) {
    candidates.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.distance - b.distance);
  }
  return candidates;
}

function explain({ p, preferred }, c) {
  const reasons = [labels[p.category]];
  if (c.brand) reasons.push(preferred ? "Marcă solicitată: " + c.brand : "Altă marcă decât cea preferată");
  if (c.family) reasons.push("Familie/model: " + c.family);
  if (c.min_cores !== null) reasons.push(p.specs.cores + " nuclee");
  if (c.memory_gb !== null || c.min_memory_gb !== null) reasons.push(capacity(p) + (p.category === "gpu" ? " GB VRAM" : " GB"));
  if (c.ddr_generation !== null) reasons.push("DDR" + p.specs.ddr_generation);
  if (c.module_count !== null) reasons.push(c.module_count + " module");
  if (c.min_wattage_w !== null) reasons.push(p.specs.wattage_w + " W");
  if (hasBudget(c)) reasons.push("Prețul istoric se încadrează în plafonul USD");
  return reasons.join(" · ");
}

export function listProducts(repository, criteria, page, pageSize) {
  const matches = select(repository, criteria);
  const start = (page - 1) * pageSize;
  return { total: matches.length, page, page_size: pageSize,
    products: matches.slice(start, start + pageSize).map(({ p }) => p) };
}

export function search(repository, criteria) {
  const result = { criteria, total: 0, products: [], messages: [], suggestions: [] };
  const { intent } = criteria;
  if (intent === "build_request" || intent === "compatibility_check") {
    result.messages.push(intent === "build_request"
      ? "Am identificat o cerere pentru un PC complet. Configuratorul nu poate valida încă o listă de piese."
      : "Catalogul nu conține toate datele necesare pentru a confirma compatibilitatea.");
    result.configuration = { status: "unverified", required_checks: checksForBuild };
    if (hasBudget(criteria) && criteria.currency !== "USD") result.messages.push(incompatibleBudget);
    result.suggestions.push("Poți căuta separat o componentă, de exemplu un procesor AMD Ryzen cu minimum 6 nuclee.");
    return result;
  }
  if (intent === "clarify") {
    result.messages.push("Criteriile sunt neclare sau depășesc filtrele disponibile.");
    result.suggestions.push("Precizează o singură componentă și un criteriu, de exemplu „32 GB RAM DDR5”.");
    return result;
  }
  if (hasBudget(criteria) && criteria.currency !== "USD") {
    result.messages.push(incompatibleBudget);
    result.suggestions.push("Reformulează cu un plafon în USD pentru catalogul istoric sau elimină explicit bugetul.");
    return result;
  }
  const matches = select(repository, criteria);
  result.total = matches.length;
  result.products = matches.slice(0, 8).map(match => ({ ...match.p, explanation: explain(match, criteria) }));
  if (criteria.usage || criteria.resolution) {
    result.messages.push("Utilizarea și rezoluția sunt păstrate ca preferințe. Catalogul nu conține teste de performanță.");
  }
  if (!result.total) {
    result.messages.push("Niciun produs cu date verificate nu îndeplinește toate filtrele cerute.");
    if (criteria.brand_policy === "required") result.suggestions.push("Poți reformula marca obligatorie ca preferință.");
    if (hasBudget(criteria)) result.suggestions.push("Poți crește plafonul în USD sau căuta fără buget. Prețurile lipsă sunt excluse din filtrul de buget.");
    if (criteria.family || [criteria.min_cores, criteria.min_memory_gb, criteria.memory_gb, criteria.ddr_generation, criteria.min_wattage_w].some(n => n !== null)) {
      result.suggestions.push("Poți reformula cererea cu mai puține restricții de model sau specificații.");
    }
  }
  return result;
}
