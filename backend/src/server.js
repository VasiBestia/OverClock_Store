import { createApp } from "./app.js";
import { loadCatalog } from "./catalog-data.js";

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT invalid");
const origins = (process.env.FRONTEND_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
for (const origin of origins) {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) throw new Error("FRONTEND_ORIGINS necesită origini HTTP(S) exacte");
}
const mode = process.env.SEARCH_MODE || "demo";
const deepseek = mode === "deepseek";
const app = createApp({ repository: await loadCatalog(), mode,
  key: deepseek ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY,
  model: deepseek ? (process.env.DEEPSEEK_MODEL || "deepseek-flash") : (process.env.OPENAI_MODEL || "gpt-5.4-mini"),
  origins,
  dailyLimit: (deepseek ? process.env.DEEPSEEK_DAILY_REQUEST_LIMIT : process.env.OPENAI_DAILY_REQUEST_LIMIT)
    ? Number(deepseek ? process.env.DEEPSEEK_DAILY_REQUEST_LIMIT : process.env.OPENAI_DAILY_REQUEST_LIMIT) : undefined,
  maxConcurrent: (deepseek ? process.env.DEEPSEEK_MAX_CONCURRENT : process.env.OPENAI_MAX_CONCURRENT)
    ? Number(deepseek ? process.env.DEEPSEEK_MAX_CONCURRENT : process.env.OPENAI_MAX_CONCURRENT) : undefined });
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () => console.log("OverClock Store | " + mode + " | http://" + host + ":" + port));
server.headersTimeout = 10000;
server.requestTimeout = 20000;
