import { ApiError } from "./errors.js";

const dayMs = 24 * 60 * 60 * 1000;

// Count provider attempts before dispatch, including attempts that later time out.
export function createQuota({ dailyLimit = 100, maxConcurrent = 2, now = Date.now } = {}) {
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) throw new Error("OPENAI_DAILY_REQUEST_LIMIT invalid");
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) throw new Error("OPENAI_MAX_CONCURRENT invalid");
  let currentDay = null;
  let attempts = 0;
  let active = 0;
  return async function run(operation) {
    const time = now();
    const day = Math.floor(time / dayMs);
    if (day !== currentDay) {
      currentDay = day;
      attempts = 0;
    }
    if (attempts >= dailyLimit) {
      const retry = Math.ceil(((day + 1) * dayMs - time) / 1000);
      throw new ApiError(429, "llm_daily_limit", "Limita zilnică de apeluri OpenAI a fost atinsă.", retry);
    }
    if (active >= maxConcurrent) throw new ApiError(429, "llm_busy", "Serviciul OpenAI procesează alte căutări. Reîncearcă în câteva secunde.", 2);
    active++;
    attempts++;
    try {
      return await operation();
    } finally {
      active--;
    }
  };
}
