import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

// Fingerprints bind the source's USD declaration to the audited files only.
const sources = {
  cpu: ["cpu", "8f5f6ff15ef3ddd0b7a10c32ec311581e6f3b025dc9570c97b8a0479993458bc"],
  gpu: ["video-card", "b2a21f9478c0a2b0aaa7c16d399ecff32ea4a5d242cb45b20000a2ec07d4c5ab"],
  ram: ["memory", "fef502bf91949d50410035cfac49132b8bf774535400595d969d86f18ca9716f"],
  motherboard: ["motherboard", "db385645ecc51bb3b87f2758d721d5be4ebbcd9d375adf82267babe3fdd2eac4"],
  psu: ["power-supply", "7d733d828a89318133e8cd405341ee5a0bbe481f682c6aaca1220df9f86f78af"],
  case: ["case", "93287bba509dd9c57d071fe50c460bb10ad4a5631c48137bed1a261131e76f23"],
  cooler: ["cpu-cooler", "6c91631f9b197b15bdf4f033f55499f9a1307f00bad441b9bd875b04c24d0c34"],
  storage: ["internal-hard-drive", "05c2a9655ad2b43ecbe07e6665f817248fdda63f9264e36efa5f8641c9a43df3"]
};
export const categories = Object.keys(sources);
const defaultDirectory = new URL("../../pc-part-dataset/", import.meta.url);

export function numberCell(raw) {
  const text = raw?.trim();
  if (!text || !/^\d+(?:\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER ? value : null;
}

function pair(raw) {
  const parts = (raw ?? "").split(",").map(numberCell);
  return parts.length === 2 && parts.every(n => n !== null && n > 0) ? parts : [null, null];
}

function range(raw) {
  const parts = (raw ?? "").split(",").map(numberCell);
  if (parts.length === 1) return parts[0];
  return parts.length === 2 && parts.every(n => n !== null) && parts[0] <= parts[1] ? parts : null;
}

const knownBrands = [
  "AMD", "Intel", "NVIDIA", "MSI", "Asus", "Gigabyte", "ASRock", "EVGA", "XFX", "Zotac",
  "Sapphire", "PNY", "PowerColor", "Palit", "Inno3D", "GALAX", "HIS", "Gainward", "KFA2",
  "Corsair", "G.Skill", "Kingston", "TEAMGROUP", "Crucial", "Patriot", "ADATA", "GeIL",
  "Mushkin", "Silicon Power", "OLOy", "Thermaltake", "Cooler Master", "SeaSonic",
  "be quiet!", "Silverstone", "Lian Li", "Fractal Design", "In Win", "Deepcool", "Thermalright",
  "ID-COOLING", "ARCTIC", "NZXT", "Noctua", "Antec", "Montech", "Phanteks", "Biostar",
  "Samsung", "Seagate", "Western Digital", "Toshiba", "SanDisk", "Acer", "FSP", "Super Flower"
];

export const fold = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function wordPrefix(name, prefix) {
  return name === prefix || name.startsWith(prefix + " ");
}
const brands = knownBrands.map(brand => [fold(brand), brand]);

export function findBrands(text) {
  const padded = " " + fold(text) + " ";
  return brands.filter(([key]) => padded.includes(" " + key + " ")).map(([, brand]) => brand);
}

function chipsetVendor(chipset) {
  if (/^(geforce|quadro|rtx|titan|nvs|t400|t600|t1000)\b/i.test(chipset)) return "NVIDIA";
  if (/^(radeon|firepro|firegl|vega)\b/i.test(chipset)) return "AMD";
  if (/^arc\b/i.test(chipset)) return "Intel";
  return null;
}

const textCell = value => value?.trim() || null;
const specsFor = {
  cpu: r => ({ cores: numberCell(r.core_count), base_ghz: numberCell(r.core_clock), boost_ghz: numberCell(r.boost_clock),
    tdp_w: numberCell(r.tdp), architecture: textCell(r.microarchitecture), graphics: textCell(r.graphics) }),
  gpu: r => ({ chipset: textCell(r.chipset), chipset_vendor: chipsetVendor(r.chipset),
    memory_gb: numberCell(r.memory), base_mhz: numberCell(r.core_clock), boost_mhz: numberCell(r.boost_clock), length_mm: numberCell(r.length) }),
  ram: r => {
    const [ddr, speed] = pair(r.speed);
    const [count, size] = pair(r.modules);
    return { ddr_generation: ddr, speed_mhz: speed, modules: count, module_gb: size,
      memory_gb: count !== null && Number.isSafeInteger(count) && Number.isFinite(count * size) ? count * size : null,
      cas_latency: numberCell(r.cas_latency), first_word_ns: numberCell(r.first_word_latency) };
  },
  motherboard: r => ({ socket: textCell(r.socket), form_factor: textCell(r.form_factor),
    max_memory_gb: numberCell(r.max_memory), memory_slots: numberCell(r.memory_slots) }),
  psu: r => ({ wattage_w: numberCell(r.wattage), form_factor: textCell(r.type),
    efficiency: textCell(r.efficiency), modular: textCell(r.modular) }),
  case: r => ({ case_type: textCell(r.type), volume_l: numberCell(r.external_volume),
    included_psu_w: numberCell(r.psu), bays_35: numberCell(r.internal_35_bays), side_panel: textCell(r.side_panel) }),
  cooler: r => ({ fan_rpm: range(r.rpm), noise_db: range(r.noise_level), radiator_mm: numberCell(r.size) }),
  storage: r => ({ capacity_gb: numberCell(r.capacity), interface: textCell(r.interface), form_factor: textCell(r.form_factor),
    drive_type: r.type === "SSD" ? "SSD" : numberCell(r.type) > 0 ? "HDD" : null, rpm: numberCell(r.type) })
};

export function parseCatalogFile(category, buffer) {
  const [file, fingerprint] = sources[category];
  const csv = buffer.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const verified = createHash("sha256").update(csv).digest("hex") === fingerprint;
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  if (!rows.length || !Object.hasOwn(rows[0], "name") || !Object.hasOwn(rows[0], "price")) {
    throw new Error("Invalid catalog header or empty file: " + file);
  }
  return rows.flatMap((row, index) => {
    const name = textCell(row.name);
    if (!name) return [];
    const foldedName = fold(name);
    const manufacturer = brands.find(([key]) => wordPrefix(foldedName, key))?.[1] ?? null;
    const amount = numberCell(row.price);
    return [{ id: category + "-" + (index + 1), category, name, manufacturer, specs: specsFor[category](row),
      price: amount === null ? null : { amount, currency: verified ? "USD" : null, dataset_date: verified ? "2025-07-23" : null, kind: "historical" },
      source: { file: file + ".csv", record: index + 1 } }];
  });
}

// A SQL/API adapter can implement the same list(category) contract.
export async function loadCatalog(directory = defaultDirectory) {
  const groups = new Map(await Promise.all(categories.map(async category => {
    const bytes = await readFile(new URL(sources[category][0] + ".csv", directory));
    return [category, parseCatalogFile(category, bytes)];
  })));
  const all = [...groups.values()].flat();
  return { list: category => category ? groups.get(category) ?? [] : all };
}
