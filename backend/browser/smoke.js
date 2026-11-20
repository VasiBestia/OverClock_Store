import assert from "node:assert/strict";
import { once } from "node:events";
import path from "node:path";
import test, { after, before } from "node:test";
import { chromium } from "playwright";
import { createApp } from "../src/app.js";
import { loadCatalog } from "../src/catalog-data.js";

let server, browser, base, repository;
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const legacyScripts = new Map([
  ["https://ajax.googleapis.com/ajax/libs/jquery/3.6.4/jquery.min.js", "jquery.min.js"],
  ["https://cdn.jsdelivr.net/npm/bootstrap@5.0.0/dist/js/bootstrap.bundle.min.js", "bootstrap.bundle.min.js"]
]);
before(async () => {
  repository = await loadCatalog();
  server = createApp({ repository, mode: "demo" }).listen(0, "127.0.0.1");
  await once(server, "listening");
  base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
});

async function open(t, pagePath, viewport, origin = base) {
  const page = await browser.newPage({ viewport });
  t.after(() => page.close());
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (!legacyScripts.has(url)) return route.abort();
    const cache = process.env.OVERCLOCK_TEST_ASSETS;
    return cache ? route.fulfill({ path: path.join(cache, legacyScripts.get(url)), contentType: "application/javascript" }) : route.continue();
  });
  await page.goto(origin + pagePath);
  await page.waitForFunction(() => Boolean(window.jQuery && window.bootstrap), undefined, { timeout: 10000 });
  return page;
}

async function submit(page, query, variant) {
  const input = page.locator("#hardware-query-" + variant);
  await input.fill(query);
  await input.press("Enter");
  await page.locator('#hardware-search-results[aria-busy="false"]').waitFor({ state: "attached" });
}

test("desktop home search shows loading, exact kit, historical price and demo mode; Shop navigation works", async t => {
  const page = await open(t, "/", desktop);
  await page.getByText("Mod demonstrativ · interpretare locală").first().waitFor();
  let finishRequest;
  const paused = new Promise(resolve => { finishRequest = resolve; });
  await page.route("**/api/ai/search", async route => { await paused; await route.continue(); });
  await page.locator("#hardware-query-desktop").fill("32 GB RAM DDR5");
  await page.locator("#hardware-query-desktop").press("Enter");
  await page.getByText("Se caută în catalog…").waitFor();
  finishRequest();
  const results = page.locator("#hardware-search-results");
  await results.getByRole("heading", { name: "Corsair Vengeance RGB 32 GB", exact: true }).first().waitFor();
  assert.equal(await results.locator("article").count(), 8);
  assert.match(await results.innerText(), /Preț istoric:.*USD/);
  assert.match(await results.innerText(), /DDR5/);
  await page.locator('#navbarCollapse a[href="shop.html"]').click();
  assert.equal(new URL(page.url()).pathname, "/shop.html");
});

test("mobile shop recognizes build and incompatible budget and retains the Bootstrap menu", async t => {
  const page = await open(t, "/shop.html", mobile);
  await submit(page, "Vreau un PC de gaming de maximum 5000 lei, pentru 1440p, prefer AMD.", "mobile");
  const results = page.locator("#hardware-search-results");
  assert.match(await results.innerText(), /5000 RON/); assert.match(await results.innerText(), /1440p/);
  assert.match(await results.innerText(), /Socketul/); assert.equal(await results.locator("article").count(), 0);
  await submit(page, "GPU NVIDIA de maximum 500 lei", "mobile");
  assert.match(await results.innerText(), /nu poate fi comparat/); assert.equal(await results.locator("article").count(), 0);
  await page.locator('button[data-bs-target="#navbarCollapse"]').click();
  await page.locator("#navbarCollapse.show").waitFor();
});

test("catalog markup stays text, unknown price is hidden and an outage is visible", async t => {
  const page = await open(t, "/shop.html", desktop);
  const api = "**/api/ai/search";
  await page.route(api, async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.products = [{ ...body.products[0], name: "<em data-untrusted>Catalog</em>", price: { amount: 12345, currency: null } }];
    await route.fulfill({ response, json: body });
  });
  await submit(page, "GPU NVIDIA", "desktop");
  const results = page.locator("#hardware-search-results");
  assert.match(await results.innerText(), /<em data-untrusted>Catalog<\/em>/);
  assert.equal(await results.locator("[data-untrusted]").count(), 0); assert.doesNotMatch(await results.innerText(), /12345|Preț istoric/);
  await page.unroute(api);
  await page.route(api, route => route.abort());
  await submit(page, "GPU AMD", "desktop");
  await page.getByRole("status").getByText(/Serviciul de căutare nu răspunde/).waitFor();
  assert.equal(await results.locator("article").count(), 0);
});

test("the original cart quantity controls still increment and decrement", async t => {
  const page = await open(t, "/cart.html", desktop);
  const quantity = page.locator(".quantity").first();
  const value = quantity.locator("input");
  const original = Number(await value.inputValue());
  await quantity.locator(".btn-plus").click(); assert.equal(Number(await value.inputValue()), original + 1);
  await quantity.locator(".btn-minus").click(); assert.equal(Number(await value.inputValue()), original);
  assert.equal(await page.locator("form[data-hardware-search]").count(), 0);
});

test("shop explains exclusions and hardware ceilings and clears previous product cards", async t => {
  const page = await open(t, "/shop.html", desktop);
  const results = page.locator("#hardware-search-results");
  await submit(page, "GPU NVIDIA", "desktop");
  assert.ok(await results.locator("article").count() > 0);
  for (const [query, message] of [["GPU fără NVIDIA", /excluderi/], ["GPU cu cel mult 8 GB", /Limita cerută/],
    ["GPU AMD sau NVIDIA", /mai multe mărci/]]) {
    await submit(page, query, "desktop");
    assert.match(await results.innerText(), message); assert.equal(await results.locator("article").count(), 0);
  }
});

test("mobile shows local validation in OpenAI mode, actual API errors and recovery", async t => {
  const api = createApp({ repository, mode: "openai", key: "" }).listen(0, "127.0.0.1");
  await once(api, "listening");
  t.after(() => new Promise(resolve => { api.close(resolve); api.closeAllConnections(); }));
  const page = await open(t, "/", mobile, "http://127.0.0.1:" + api.address().port);
  await submit(page, "GPU cu maximum 900 lei", "mobile");
  const results = page.locator("#hardware-search-results");
  assert.match(await results.innerText(), /fără apel OpenAI/);
  assert.match(await results.innerText(), /nu poate fi comparat/);
  await submit(page, "GPU NVIDIA", "mobile");
  assert.match(await page.locator("#hardware-search-status").innerText(), /cheie configurată pe server/);
  assert.equal(await results.locator("article").count(), 0);
  await submit(page, "Vreau un PC de gaming cu buget de 5000 lei", "mobile");
  assert.match(await results.innerText(), /5000 RON/); assert.match(await results.innerText(), /verific|valida/i);
  assert.equal(await results.locator("article").count(), 0);
});

test("the UI displays Retry-After from the real cost limiter", async t => {
  const client = { responses: { parse: () => assert.fail("Daily limit is zero") } };
  const api = createApp({ repository, mode: "openai", client, dailyLimit: 0 }).listen(0, "127.0.0.1");
  await once(api, "listening");
  t.after(() => new Promise(resolve => { api.close(resolve); api.closeAllConnections(); }));
  const page = await open(t, "/shop.html", desktop, "http://127.0.0.1:" + api.address().port);
  await submit(page, "GPU NVIDIA", "desktop");
  const message = await page.locator("#hardware-search-status").innerText();
  assert.match(message, /Limita zilnică/); assert.match(message, /Timp de așteptare: \d+ (?:s|min)/);
  assert.equal(await page.locator("#hardware-search-results article").count(), 0);
});
