(() => {
  "use strict";
  const forms = [...document.querySelectorAll("form[data-hardware-search]")];
  if (!forms.length) return;
  const status = document.querySelector("#hardware-search-status");
  const results = document.querySelector("#hardware-search-results");
  const modeLabels = {
    demo: "Mod demonstrativ · interpretare locală",
    openai: "Mod OpenAI"
  };
  const categories = { cpu: "Procesor", gpu: "Placă video", ram: "Memorie RAM", psu: "Sursă",
    motherboard: "Placă de bază", case: "Carcasă", cooler: "Cooler", storage: "Stocare internă" };
  const uses = { gaming: "gaming", video_editing: "editare video", office: "birou", workstation: "stație de lucru" };
  const specs = {
    cores: ["Nuclee", ""], base_ghz: ["Frecvență de bază", " GHz"], boost_ghz: ["Boost", " GHz"],
    tdp_w: ["TDP", " W"], architecture: ["Arhitectură", ""], graphics: ["Grafică integrată", ""],
    chipset: ["Chipset", ""], chipset_vendor: ["Proiectant GPU", ""], memory_gb: ["Memorie", " GB"],
    base_mhz: ["Frecvență de bază", " MHz"], boost_mhz: ["Boost", " MHz"], length_mm: ["Lungime", " mm"],
    ddr_generation: ["Generație DDR", ""], modules: ["Module", ""], module_gb: ["Per modul", " GB"],
    speed_mhz: ["Viteză declarată", " MHz"], cas_latency: ["Latență CAS", ""], first_word_ns: ["Latență inițială", " ns"],
    form_factor: ["Format", ""], socket: ["Socket", ""], max_memory_gb: ["Memorie maximă", " GB"], memory_slots: ["Sloturi RAM", ""],
    wattage_w: ["Putere", " W"], efficiency: ["Eficiență", ""], modular: ["Modularitate", ""],
    case_type: ["Tip", ""], volume_l: ["Volum", " L"], included_psu_w: ["Sursă inclusă", " W"],
    bays_35: ["Locașuri de 3,5″", ""], side_panel: ["Panou lateral", ""], fan_rpm: ["Turație", " RPM"],
    noise_db: ["Zgomot", " dB"], radiator_mm: ["Radiator", " mm"], capacity_gb: ["Capacitate", " GB"],
    interface: ["Interfață", ""], drive_type: ["Tip", ""], rpm: ["Turație", " RPM"]
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function setMode(mode) {
    if (modeLabels[mode]) document.querySelectorAll("[data-search-mode]").forEach(node => { node.textContent = modeLabels[mode]; });
  }

  function apiUrl(path) {
    const configured = document.querySelector('meta[name="overclock-api-origin"]')?.content.trim();
    const origin = new URL(configured || window.location.origin);
    if (!["http:", "https:"].includes(origin.protocol) || (configured && configured !== origin.origin)) {
      throw new Error("Origine API invalidă");
    }
    return new URL(path, origin.origin);
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(apiUrl(path), { ...options, credentials: "omit", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) {
        setMode(data.mode);
        let message = data.error?.message || "Cererea nu a putut fi procesată.";
        const seconds = Number(response.headers.get("Retry-After"));
        if (response.status === 429 && Number.isSafeInteger(seconds) && seconds > 0) {
          const wait = seconds < 60 ? seconds + " s" : Math.ceil(seconds / 60) + " min";
          message += " Timp de așteptare: " + wait + ".";
        }
        return { error: message };
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function describe(c) {
    const items = [];
    if (c.intent === "build_request") items.push("PC complet");
    if (c.intent === "compatibility_check") items.push("Verificare de compatibilitate");
    if (c.category) items.push(categories[c.category]);
    if (c.brand) items.push((c.brand_policy === "preferred" ? "Marcă preferată: " : "Marcă: ") + c.brand);
    if (c.family) items.push("Familie/model: " + c.family);
    if (c.min_cores != null) items.push("Minimum " + c.min_cores + " nuclee");
    if (c.min_memory_gb != null) items.push("Minimum " + c.min_memory_gb + " GB");
    if (c.memory_gb != null) items.push(c.memory_gb + " GB");
    if (c.ddr_generation != null) items.push("DDR" + c.ddr_generation);
    if (c.module_count != null) items.push(c.module_count + " module");
    if (c.min_wattage_w != null) items.push("Minimum " + c.min_wattage_w + " W");
    if (c.budget_max != null) items.push((c.budget_exclusive ? "Buget sub " : "Buget maxim: ") + c.budget_max + " " + (c.currency === "other" ? "(altă monedă)" : c.currency || "(monedă nespecificată)"));
    if (c.usage) items.push(uses[c.usage]);
    if (c.resolution) items.push(c.resolution);
    return items.join(" · ");
  }

  function productCard(p) {
    const card = element("article", "col");
    const body = element("div", "border rounded p-3 h-100");
    body.append(element("h3", "h6", p.name), element("p", "small mb-2", p.explanation));
    const list = element("ul", "small ps-3 mb-2");
    for (const [key, value] of Object.entries(p.specs)) {
      if (value == null || !Object.hasOwn(specs, key)) continue;
      const [label, unit] = specs[key];
      list.append(element("li", "", label + ": " + (Array.isArray(value) ? value.join("–") : value) + unit));
    }
    body.append(list);
    if (p.price?.currency === "USD" && Number.isFinite(p.price.amount)) {
      const display = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "USD", currencyDisplay: "code" }).format(p.price.amount);
      body.append(element("p", "small text-muted mb-0", "Preț istoric: " + display + " · catalog " + p.price.dataset_date));
    }
    card.append(body);
    return card;
  }

  function render(data) {
    setMode(data.mode);
    const content = document.createDocumentFragment();
    if (data.mode === "openai" && data.interpretation_source === "validation") {
      content.append(element("p", "small text-muted mb-2", "Verificare locală · fără apel OpenAI."));
    }
    const criteria = describe(data.criteria);
    if (criteria) content.append(element("p", "fw-bold mb-2", "Criterii identificate: " + criteria));
    for (const message of data.messages) content.append(element("p", "mb-2", message));
    if (data.configuration) {
      const list = element("ul", "small");
      for (const check of data.configuration.required_checks) list.append(element("li", "", check));
      content.append(element("p", "fw-bold mb-1", "Date necesare pentru validare"), list);
    }
    for (const message of data.suggestions) content.append(element("p", "text-muted mb-1", message));
    if (data.products.length) {
      const grid = element("div", "row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3 mt-1");
      for (const product of data.products) grid.append(productCard(product));
      content.append(grid, element("p", "small text-muted mt-2", "Catalog de referință. Stocurile și prețurile comerciale nu sunt disponibile."));
    }
    results.replaceChildren(content);
    const summary = data.criteria.intent === "component_search"
      ? "Produse afișate: " + data.products.length + " din " + data.total + "."
      : "Interpretarea cererii";
    status.replaceChildren(element("h2", "h5 my-3", summary));
  }

  async function submit(event) {
    event.preventDefault();
    if (results.getAttribute("aria-busy") === "true") return;
    const query = event.currentTarget.elements.query.value.trim();
    results.replaceChildren();
    results.setAttribute("aria-busy", "true");
    const spinner = element("span", "spinner-border spinner-border-sm me-2");
    spinner.setAttribute("aria-hidden", "true");
    status.replaceChildren(spinner, document.createTextNode("Se caută în catalog…"));
    forms.forEach(f => { f.querySelector("button").disabled = true; });
    status.scrollIntoView({ block: "nearest" });
    try {
      const data = await api("/api/ai/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      if (data.error) status.replaceChildren(element("p", "alert alert-warning mt-2", data.error));
      else render(data);
    } catch {
      status.replaceChildren(element("p", "alert alert-warning mt-2", "Serviciul de căutare nu răspunde. Verifică adresa backend-ului și încearcă din nou."));
    } finally {
      results.setAttribute("aria-busy", "false");
      forms.forEach(f => { f.querySelector("button").disabled = false; });
    }
  }

  forms.forEach(form => form.addEventListener("submit", submit));
  api("/api/health").then(data => setMode(data.mode)).catch(() => {});
})();
