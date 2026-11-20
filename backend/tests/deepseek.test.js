import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import OpenAI from "openai";
import { createApp } from "../src/app.js";
import { emptyCriteria } from "../src/criteria.js";

const product = {
  id: "gpu-1", category: "gpu", name: "MSI GeForce RTX 3060 Ventus 2X 12G",
  manufacturer: "MSI", specs: { chipset_vendor: "NVIDIA", memory_gb: 12 },
  price: { amount: 299.97, currency: "USD", kind: "historical" }
};
const repo = { list: () => [product] };
const parsed = { ...emptyCriteria("component_search"), category: "gpu",
  brand: "NVIDIA", brand_policy: "required", min_memory_gb: 12,
  unhandled_requirements: [] };
const fakeResponse = (content, finish_reason = "stop") => ({
  choices: [{ finish_reason, message: { role: "assistant", content } }]
});
async function endpoint(t, options = {}) {
  const server = createApp({ repository: repo, mode: "deepseek", model: "deepseek-flash", ...options })
    .listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    get: pathname => fetch(base + pathname),
    post: query => fetch(base + "/api/ai/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    })
  };
}

test("DeepSeek requires an API key when no client was supplied", async t => {
  const api = await endpoint(t);
  const health = await (await api.get("/api/health")).json();
  assert.equal(health.mode, "deepseek");
  assert.equal(health.interpreter_ready, false);
  const response = await api.post("GPU NVIDIA minimum 12 GB VRAM");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "deepseek_not_configured");
});

test("DeepSeek Chat Completions JSON results are schema-validated and filter real products", async t => {
  let captured;
  const client = new OpenAI({
    apiKey: "test-only", baseURL: "https://api.deepseek.com", maxRetries: 0,
    fetch: async (url, init) => {
      captured = { url: String(url), body: JSON.parse(init.body) };
      return Response.json({
        id: "chatcmpl-test", object: "chat.completion", created: 0,
        model: "deepseek-flash", ...fakeResponse(JSON.stringify(parsed))
      });
    }
  });
  const api = await endpoint(t, { client });
  const response = await api.post("GPU NVIDIA minimum 12 GB VRAM");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "deepseek");
  assert.equal(body.interpretation_source, "deepseek");
  assert.equal(body.criteria.brand, "NVIDIA");
  assert.equal(body.criteria.min_memory_gb, 12);
  assert.equal(body.products.length, 1);
  assert.equal(body.products[0].name, product.name);
  assert.equal(new URL(captured.url).host, "api.deepseek.com");
  assert.equal(new URL(captured.url).pathname, "/chat/completions");
  assert.equal(captured.body.model, "deepseek-flash");
  assert.deepEqual(captured.body.response_format, { type: "json_object" });
  assert.equal(captured.body.messages[1].role, "user");
  assert.ok(captured.body.messages[0].content.includes("JSON"));
  assert.ok(!JSON.stringify(captured.body).includes(product.name));
});

test("DeepSeek rejects malformed, incomplete, blank, and invalid JSON responses", async t => {
  const invalid = [
    fakeResponse("{broken"),
    fakeResponse("  "),
    fakeResponse(JSON.stringify(parsed), "length"),
    fakeResponse(JSON.stringify({ ...parsed, products: ["invented"] })),
    fakeResponse(JSON.stringify({ ...parsed, min_memory_gb: -10 })),
    fakeResponse(JSON.stringify({ ...parsed, min_memory_gb: null })),
    fakeResponse(JSON.stringify({ ...parsed, unhandled_requirements: "none" }))
  ];
  for (const fixture of invalid) {
    const api = await endpoint(t, { client: { chat: { completions: { create: async () => fixture } } } });
    const response = await api.post("GPU NVIDIA minimum 12 GB VRAM");
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, "llm_invalid_response");
  }
});

test("DeepSeek cannot silently discard unsupported requirements", async t => {
  const api = await endpoint(t, { client: { chat: { completions: { create: async () =>
    fakeResponse(JSON.stringify({ ...parsed, unhandled_requirements: ["ray tracing"] })) } } } });
  const response = await api.post("GPU NVIDIA cu minimum 12 GB");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.criteria.intent, "clarify");
  assert.deepEqual(body.products, []);
  assert.equal(body.interpretation_source, "deepseek");
});

test("DeepSeek provider failures are sanitized and local guards avoid billed requests", async t => {
  let calls = 0;
  const client = { chat: { completions: { create: async () => {
    calls++;
    throw Object.assign(new Error("secret-provider-detail"), { status: 401 });
  } } } };
  const api = await endpoint(t, { client });
  const local = await api.post("GPU NVIDIA cu buget de 900 lei");
  assert.equal(local.status, 200);
  assert.equal((await local.json()).interpretation_source, "validation");
  assert.equal(calls, 0);
  const response = await api.post("GPU NVIDIA minimum 12 GB");
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.ok(!body.includes("secret-provider-detail"));
  assert.equal(calls, 1);
});
