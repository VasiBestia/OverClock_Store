import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadCatalog, numberCell, parseCatalogFile } from "../src/catalog-data.js";
import { emptyCriteria, criteriaSchema } from "../src/criteria.js";
import { interpretDemo, specialIntent } from "../src/demo.js";
import { listProducts, search } from "../src/search.js";

const repo = await loadCatalog();
const queries = [
  "Caut un procesor AMD Ryzen pentru gaming, cu minimum 6 nuclee.",
  "Vreau o placă video NVIDIA cu minimum 12 GB VRAM pentru editare video.",
  "Am nevoie de 32 GB RAM DDR5 pentru un PC de gaming.",
  "Vreau un PC de gaming de maximum 5000 lei, pentru 1440p, prefer AMD."
];
const component = (category, extra = {}) => ({ ...emptyCriteria("component_search"), category, ...extra });

test("the three component examples extract hard criteria and return real catalog records", () => {
  const fixtures = [
    [{ category: "cpu", brand: "AMD", family: "ryzen", min_cores: 6, usage: "gaming" }, p => p.specs.cores >= 6 && p.name.startsWith("AMD Ryzen")],
    [{ category: "gpu", brand: "NVIDIA", min_memory_gb: 12, usage: "video_editing" }, p => p.specs.chipset_vendor === "NVIDIA" && p.specs.memory_gb >= 12],
    [{ category: "ram", ddr_generation: 5, memory_gb: 32, usage: "gaming" }, p => p.specs.ddr_generation === 5 && p.specs.memory_gb === 32]
  ];
  for (const [index, [expected, matches]] of fixtures.entries()) {
    const c = interpretDemo(queries[index]);
    assert.equal(c.intent, "component_search");
    for (const [key, value] of Object.entries(expected)) assert.equal(c[key], value, key);
    const result = search(repo, c);
    assert.ok(result.total >= result.products.length && result.products.length > 0);
    assert.ok(result.products.every(matches));
    for (const p of result.products) {
      assert.equal(p.name, repo.list(c.category).find(row => row.id === p.id).name);
      assert.ok(p.explanation);
    }
  }
});

test("a whole PC preserves the brief and pending checks, with no parts list", () => {
  const c = interpretDemo(queries[3]);
  assert.deepEqual(c, { ...emptyCriteria("build_request"), budget_max: 5000, currency: "RON",
    resolution: "1440p", usage: "gaming", brand: "AMD", brand_policy: "preferred" });
  const result = search(repo, c);
  assert.deepEqual(result.products, []);
  assert.equal(result.configuration.status, "unverified");
  assert.ok(result.configuration.required_checks.length >= 3);
  assert.equal(specialIntent("32 GB RAM pentru un PC de gaming"), null);
});

test("compatibility questions and unrepresentable requirements do not yield guesses", () => {
  for (const query of ["Acest Ryzen este compatibil cu placa mea de bază?", "CPU cu WiFi și turbo de 7 GHz",
    "procesor și placă video", "GPU fără NVIDIA", "RAM de maximum 8 GB", "exact 4 nuclee procesor"]) {
    const result = search(repo, interpretDemo(query));
    assert.equal(result.products.length, 0, query);
    assert.ok(result.messages.length);
  }
});

test("schema rejects unknown keys, out-of-range numbers, conflicting and cross-category requirements", () => {
  const base = component("gpu");
  for (const patch of [{ products: [] }, { category: "web" }, { min_cores: 4 }, { min_memory_gb: -12 },
    { min_memory_gb: 12, memory_gb: 12 }, { min_memory_gb: Infinity }, { category: "ram", ddr_generation: 4.3 },
    { brand: "NVIDIA" }, { budget_exclusive: true }, { currency: "USD" }, { family: "<em>model</em>" }]) {
    assert.equal(criteriaSchema.safeParse({ ...base, ...patch }).success, false);
  }
  assert.equal(criteriaSchema.safeParse({ intent: "component_search" }).success, false);
});

test("numbers, quoted pairs, numeric ranges and missing cells have distinct meanings", () => {
  for (const raw of ["", " ", "NaN", "Infinity", "3200MHz", "1e3", "-5", "1,2", "9".repeat(40)]) assert.equal(numberCell(raw), null);
  assert.equal(numberCell("0"), 0);
  assert.equal(numberCell(" 12.5 "), 12.5);
  const ram = parseCatalogFile("ram", Buffer.from('name,price,speed,modules\n"Kit, DDR",25,"5,6000","2,16"\nOther,,oops,"2,oops"\n'));
  assert.equal(ram[0].name, "Kit, DDR"); assert.equal(ram[0].specs.memory_gb, 32);
  assert.equal(ram[0].specs.ddr_generation, 5); assert.equal(ram[0].specs.speed_mhz, 6000);
  assert.equal(ram[0].price.currency, null); assert.equal(ram[1].price, null);
  assert.equal(ram[1].specs.ddr_generation, null); assert.equal(ram[1].specs.memory_gb, null);
  const rows = parseCatalogFile("cooler", Buffer.from('name,price,rpm,noise_level\nModel A,,"600,1200","10,24"\nModel B,,800,\n'));
  assert.deepEqual(rows[0].specs.fan_rpm, [600, 1200]); assert.deepEqual(rows[0].specs.noise_db, [10, 24]);
  assert.equal(rows[1].specs.fan_rpm, 800); assert.equal(rows[1].specs.noise_db, null);
  assert.throws(() => parseCatalogFile("cpu", Buffer.from("title,value\nSomething,1\n")));
});

test("exact kits, decimal storage units and PSU power constrain actual specifications", () => {
  const kit = search(repo, interpretDemo("RAM DDR5 2x16 GB"));
  assert.ok(kit.total > 0);
  assert.ok(kit.products.every(p => p.specs.modules === 2 && p.specs.module_gb === 16));
  const drive = search(repo, interpretDemo("SSD 2 TB"));
  assert.ok(drive.total > 0 && drive.products.every(p => p.specs.capacity_gb === 2000 && p.specs.drive_type === "SSD"));
  const psu = search(repo, interpretDemo("sursă Corsair minimum 750 W"));
  assert.ok(psu.total > 0 && psu.products.every(p => p.specs.wattage_w >= 750 && p.manufacturer === "Corsair"));
  const multiword = search(repo, interpretDemo("Sursă Cooler Master cu minimum 650 W"));
  assert.ok(multiword.total > 0 && multiword.products.every(p => p.manufacturer === "Cooler Master"));
});

test("required brands filter, soft preferences rank, GPU chip vendor and board maker stay distinct", () => {
  const base = component("cpu");
  const soft = listProducts(repo, { ...base, brand: "AMD", brand_policy: "preferred" }, 1, 8);
  assert.equal(soft.total, repo.list("cpu").length); assert.ok(soft.products.every(p => p.manufacturer === "AMD"));
  const strict = search(repo, interpretDemo("GPU MSI"));
  assert.ok(strict.total > 0 && strict.products.every(p => p.manufacturer === "MSI"));
  assert.ok(repo.list("gpu").some(p => p.manufacturer === "MSI" && p.specs.chipset_vendor === "NVIDIA"));
  const exhausted = search(repo, component("gpu", { brand: "NoSuchBrand", brand_policy: "required" }));
  assert.equal(exhausted.total, 0); assert.ok(exhausted.suggestions.length);
  const softUnknown = search(repo, component("cpu", { brand: "NoSuchBrand", brand_policy: "preferred" }));
  assert.ok(softUnknown.products.every(p => p.explanation.includes("Altă marcă")));
});

test("budgets preserve currency, fractional amounts, missing prices and strict boundaries", () => {
  for (const [query, value, currency] of [["GPU cu buget de 1.500,50 lei", 1500.50, "RON"],
    ["GPU sub 300 USD", 300, "USD"], ["GPU cu buget de 300", 300, null], ["GPU USD 250", 250, "USD"]]) {
    const parsed = interpretDemo(query);
    assert.equal(parsed.budget_max, value, query); assert.equal(parsed.currency, currency, query);
  }
  for (const currency of [null, "RON", "EUR", "other"]) {
    const result = search(repo, component("gpu", { budget_max: 5000, currency }));
    assert.equal(result.total, 0); assert.match(result.messages.join(" "), /USD/);
  }
  const base = repo.list("gpu")[0];
  const limited = { list: () => [base, { ...base, price: null }, { ...base, price: { ...base.price, currency: null } }] };
  const c = component("gpu", { budget_max: base.price.amount, currency: "USD" });
  assert.equal(search(limited, c).total, 1);
  assert.equal(search(limited, { ...c, budget_exclusive: true }).total, 0);
  assert.equal(base.price.kind, "historical"); assert.equal(base.price.dataset_date, "2025-07-23");
});

test("unknown specifications fail hard filters and zero results retain the original filters", () => {
  const spec = component("cpu", { min_cores: 1024 });
  const result = search(repo, spec);
  assert.equal(result.total, 0); assert.equal(result.criteria.min_cores, 1024); assert.ok(result.suggestions.length);
  const base = repo.list("cpu")[0];
  const missing = { list: () => [{ ...base, specs: { cores: null } }] };
  assert.equal(search(missing, component("cpu", { min_cores: 1 })).total, 0);
});

test("the provenance fingerprint tolerates Windows line endings but detects changed prices", async () => {
  const raw = await readFile(new URL("../../pc-part-dataset/cpu.csv", import.meta.url), "utf8");
  const windows = "\uFEFF" + raw.replace(/\r?\n/g, "\r\n");
  assert.equal(parseCatalogFile("cpu", Buffer.from(windows))[0].price.currency, "USD");
  const changed = raw.replace("451.5", "451.51");
  assert.equal(parseCatalogFile("cpu", Buffer.from(changed))[0].price.currency, null);
});
