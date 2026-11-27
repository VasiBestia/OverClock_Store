(() => {
  "use strict";
  if (document.getElementById("hardware-search")) return;
  const nav = document.querySelector(".nav-bar");
  if (!nav) return;
  const scopes = { "GPUs & CPUs": "cpu_gpu", "Motherboards & RAM": "board_ram",
    "Storage & PSUs": "storage_psu", "Custom PCs": "build", "IT Service": "service" };
  const forms = [];
  const section = element("section", "container my-3");
  section.id = "hardware-search";
  section.lang = "ro";
  section.setAttribute("aria-label", "Căutare hardware");
  const headerInput = document.querySelector('input[data-bs-target="#dropdownToggle123"]');
  const group = headerInput?.closest(".d-flex");
  const headerButton = group?.querySelector("button");
  if (headerButton && !group.closest("form")) {
    const form = element("form");
    group.before(form);
    form.append(group);
    const select = group.querySelector("select");
    // Only the original blank template uses these placeholder categories.
    if (select?.querySelector('option[value="Pest Control-2"]')) select.remove();
    else if (select) {
      select.name = "scope";
      select.setAttribute("aria-label", "Domeniul căutării");
    }
    prepareForm(form, headerInput, headerButton, "desktop");
    form.after(modeLabel());
  }
  const small = element("div", forms.length ? "d-lg-none" : "");
  const mobileForm = element("form");
  const fieldGroup = element("div", "input-group");
  const input = element("input", "form-control");
  const button = element("button", "btn btn-primary", "Caută");
  fieldGroup.append(input, button);
  mobileForm.append(fieldGroup);
  prepareForm(mobileForm, input, button, "mobile");
  small.append(mobileForm, modeLabel());
  const status = element("div");
  status.id = "hardware-search-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const results = element("div");
  results.id = "hardware-search-results";
  results.setAttribute("aria-label", "Rezultatele căutării");
  section.append(small, status, results);
  nav.after(section);

  function modeLabel() {
    const label = element("small", "text-muted", "Căutare în catalogul hardware");
    label.lang = "ro";
    label.dataset.searchMode = "";
    return label;
  }

  function prepareForm(form, field, submitButton, variant) {
    form.setAttribute("role", "search");
    form.dataset.hardwareSearch = "";
    form.lang = "ro";
    field.id = "hardware-query-" + variant;
    field.name = "query";
    field.type = "search";
    field.minLength = 3;
    field.maxLength = 500;
    field.required = true;
    if (!field.placeholder || field.placeholder === "Search Looking For?") field.placeholder = "Ex. 32 GB RAM DDR5";
    const label = element("label", variant === "desktop" ? "visually-hidden" : "form-label fw-bold", "Ce componentă cauți?");
    label.htmlFor = field.id;
    form.prepend(label);
    submitButton.type = "submit";
    submitButton.setAttribute("aria-label", "Caută componente");
    forms.push(form);
  }
  const modeLabels = {
    demo: "Mod demonstrativ · interpretare locală",
    openai: "Mod OpenAI",
    deepseek: "Mod DeepSeek"
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
    if (["openai", "deepseek"].includes(data.mode) && data.interpretation_source === "validation") {
      const provider = data.mode === "deepseek" ? "DeepSeek" : "OpenAI";
      content.append(element("p", "small text-muted mb-2", "Verificare locală · fără apel " + provider + "."));
    } else if (data.interpretation_source === "deepseek") {
      content.append(element("p", "small text-muted mb-2", "Criterii interpretate de DeepSeek."));
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
    const selection = event.currentTarget.elements.scope?.value;
    const scope = selection && Object.hasOwn(scopes, selection) ? scopes[selection] : undefined;
    results.replaceChildren();
    results.setAttribute("aria-busy", "true");
    const spinner = element("span", "spinner-border spinner-border-sm me-2");
    spinner.setAttribute("aria-hidden", "true");
    status.replaceChildren(spinner, document.createTextNode("Se caută în catalog…"));
    forms.forEach(f => { f.querySelector("button").disabled = true; });
    status.scrollIntoView({ block: "nearest" });
    try {
      const data = await api("/api/ai/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, scope }) });
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
  api("/api/ai/health").then(data => setMode(data.mode)).catch(() => {});
})();
