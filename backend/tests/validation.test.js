import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";
import { emptyCriteria } from "../src/criteria.js";
import { createQuota } from "../src/llm-quota.js";

const catalogRow = { id: "gpu-1", name: "NVIDIA test fixture", category: "gpu", manufacturer: "NVIDIA",
  specs: { chipset_vendor: "NVIDIA", memory_gb: 12 }, price: { amount: 300, currency: "USD" } };
const repository = { list: () => [catalogRow] };
const modelCriteria = { ...emptyCriteria("component_search"), category: "gpu", unhandled_requirements: [] };

async function endpoint(t, options = {}) {
  const server = createApp({ repository, searchLimit: 200, ...options }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    get: path => fetch(base + path),
    post: query => fetch(base + "/api/ai/search", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }) })
  };
}

const groups = {
  negative: ["GPU fără NVIDIA", "Procesor AMD dar nu Ryzen", "GPU, orice marcă în afară de AMD",
    "I don't want NVIDIA GPUs", "Vreau un PC de gaming fără Intel", "GPU != AMD"],
  multiple_brands: ["GPU NVIDIA și MSI", "GPU NVIDIA/AMD", "RAM Corsair + Kingston", "GPU marca Acme și marca Zebra", "GPU marca Acme și Zebra"],
  alternative: ["RAM de 16 GB sau 32 GB", "CPU Ryzen vs Xeon", "RAM DDR4 și DDR5"],
  multiple_components: ["procesor și placă video", "SSD și RAM"],
  range: ["GPU între 8 și 16 GB", "CPU 6–8 nuclee", "GPU 8 GB - 12 GB", "PSU 650 W și 750 W"],
  unsupported_bound: ["GPU cu maximum 8 GB VRAM", "GPU cu 8 GB VRAM maxim", "CPU cu cel mult 6 nuclee",
    "Sursă de până la 750 de wați", "RAM ≤ 16 GB", "GPU < 12GB", "GPU 12 GB or less", "GPU cu buget minim de 300 USD", "GPU mai mult de 300 USD"],
  invalid_quantity: ["GPU -12 GB", "GPU cu buget de −300 USD", "CPU cu 0 nuclee", "CPU cu 6,5 nuclee"],
  unsupported_spec: ["GPU cu ray tracing", "CPU cu TDP de 65 W", "RAM DDR5-6000 MHz",
    "GPU care are trei ventilatoare", "SSD PCIe 5.0", "GPU în stoc", "GPU cu 120 FPS la 1440p", "GPU 3 ventilatoare"],
  ambiguous_budget: ["GPU de 400 lei sau 300 USD", "GPU 300 USD EUR", "GPU CAD $300", "GPU cu buget"],
  missing_category: ["Ceva bun pentru gaming", "Prefer AMD", "Vreau ceva ieftin pentru gaming la 1440p"]
};

for (const [reason, queries] of Object.entries(groups)) {
  test("requests requiring clarification: " + reason, async t => {
    let calls = 0;
    const client = { responses: { parse: async () => { calls++; return { status: "completed", output_parsed: modelCriteria }; } } };
    for (const mode of ["demo", "openai"]) {
      const api = await endpoint(t, { mode, client });
      for (const query of queries) {
        const r = await api.post(query);
        assert.equal(r.status, 200, query);
        const body = await r.json();
        assert.equal(body.clarification_reason, reason, query);
        assert.equal(body.criteria.intent, "clarify", query);
        assert.equal(body.criteria.brand, null, query);
        assert.equal(body.interpretation_source, "validation", query);
        assert.deepEqual(body.products, [], query);
        assert.ok(body.messages[0] && body.suggestions.length, query);
      }
    }
    assert.equal(calls, 0);
  });
}

test("incompatible and missing currencies keep the amount; neither mode spends a call", async t => {
  const pairs = [["900 lei", "RON", 900], ["1.299,95 EUR", "EUR", 1299.95], ["900 CAD", "other", 900], ["900 HKD", "other", 900],
    ["£900", "GBP", 900], ["cu buget de 900", null, 900], ["sub 900", null, 900]];
  const client = { responses: { parse: () => assert.fail("Unexpected model call") } };
  for (const mode of ["openai", "demo"]) {
    const api = await endpoint(t, { mode, client });
    for (const [budget, currency, amount] of pairs) {
      const r = await api.post("GPU NVIDIA " + budget);
      const body = await r.json();
      assert.equal(r.status, 200); assert.equal(body.criteria.budget_max, amount, budget); assert.equal(body.criteria.currency, currency, budget);
      assert.equal(body.interpretation_source, "validation"); assert.deepEqual(body.products, []); assert.match(body.messages[0], /USD/);
    }
  }
});

test("supported USD ceilings compare the exact boundary and preserve hardware minimums", async t => {
  for (const mode of ["demo", "openai"]) {
    const client = { responses: { parse: async () => ({ status: "completed",
      output_parsed: { ...modelCriteria, min_memory_gb: 12, budget_max: 300, currency: "USD" } }) } };
    const api = await endpoint(t, { mode, client });
    for (const [bound, expected] of [["cel mult", 1], ["nu mai mult de", 1], ["at most", 1], ["≤", 1], ["sub", 0], ["<", 0]]) {
      const r = await api.post("GPU cu minimum 12 GB, " + bound + " 300 USD");
      const body = await r.json();
      assert.equal(r.status, 200); assert.equal(body.criteria.min_memory_gb, 12, bound);
      assert.equal(body.total, expected, bound); assert.equal(body.criteria.budget_exclusive, expected === 0, bound);
    }
  }
});

test("daily quota and concurrency are enforced before dispatch and released on failure", async t => {
  let release, entered, calls = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const client = { responses: { parse: async () => {
    calls++;
    if (calls === 1) { entered(); await pending; throw new Error("internal fixture"); }
    return { status: "completed", output_parsed: modelCriteria };
  } } };
  const api = await endpoint(t, { mode: "openai", client, maxConcurrent: 1, dailyLimit: 2 });
  const first = api.post("GPU");
  await started;
  try {
    const busy = await api.post("GPU");
    assert.equal(busy.status, 429); assert.equal((await busy.json()).error.code, "llm_busy");
    assert.ok(Number(busy.headers.get("Retry-After")) > 0); assert.equal(calls, 1);
  } finally { release(); }
  assert.equal((await first).status, 502);
  assert.equal((await api.post("GPU")).status, 200);
  const exhausted = await api.post("GPU");
  assert.equal(exhausted.status, 429); assert.equal((await exhausted.json()).error.code, "llm_daily_limit");
  assert.ok(Number(exhausted.headers.get("Retry-After")) > 0);
  assert.equal((await api.post("GPU fără AMD")).status, 200);
  assert.equal(calls, 2);
});

test("zero daily quota, UTC rollover and invalid quota settings", async () => {
  let time = Date.UTC(2026, 0, 1, 23, 59, 59);
  const run = createQuota({ dailyLimit: 1, now: () => time });
  assert.equal(await run(() => "ok"), "ok");
  await assert.rejects(run(() => assert.fail()), e => e.code === "llm_daily_limit" && e.retryAfter === 1);
  time += 1000;
  assert.equal(await run(() => "next day"), "next day");
  await assert.rejects(createQuota({ dailyLimit: 0 })(() => assert.fail()), e => e.status === 429);
  assert.throws(() => createQuota({ dailyLimit: NaN })); assert.throws(() => createQuota({ maxConcurrent: 0 }));
});

test("health, invalid bodies and per-IP throttling cannot consume additional provider attempts", async t => {
  let calls = 0;
  const client = { responses: { parse: async () => { calls++; return { status: "completed", output_parsed: modelCriteria }; } } };
  const api = await endpoint(t, { mode: "openai", client, searchLimit: 3 });
  assert.equal((await api.get("/api/health")).status, 200);
  assert.equal((await api.post("???")).status, 400);
  assert.equal((await api.post("a".repeat(5001))).status, 413);
  assert.equal(calls, 0);
  assert.equal((await api.post("GPU")).status, 200);
  const limited = await api.post("GPU");
  assert.equal(limited.status, 429); assert.equal((await limited.json()).error.code, "rate_limited");
  assert.equal(calls, 1);
});

test("private configuration, injected credentials and provider errors stay off public surfaces", async t => {
  const sentinel = "unit-test-secret-sentinel";
  const client = { responses: { parse() { throw Object.assign(new Error(sentinel), { status: 401 }); } } };
  const api = await endpoint(t, { mode: "openai", key: sentinel, client });
  for (const path of ["/.env", "/backend/.env", "/backend/.env.example", "/.git/config", "/backend/src/interpret.js"]) {
    assert.equal((await api.get(path)).status, 404);
  }
  for (const path of ["/api/health", "/shop.html", "/index.html", "/js/ai-search.js"]) {
    const r = await api.get(path); assert.equal(r.status, 200);
    const text = await r.text();
    assert.ok(!text.includes(sentinel)); assert.ok(!text.includes("OPENAI_API_KEY"));
  }
  const r = await api.post("GPU");
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes(sentinel)); assert.ok(!JSON.stringify([...r.headers]).includes(sentinel));
});
