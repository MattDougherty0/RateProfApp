import "dotenv/config";
import fetch from "node-fetch";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const RATE_MS = Number(process.env.RATE_MS ?? 900);

export async function getJson<T>(url: string, q?: Record<string, string | string[]>, retries = 3): Promise<T> {
  const qs = q
    ? "?" + new URLSearchParams(
        Object.entries(q).flatMap(([k, v]) => Array.isArray(v) ? v.map(x => [k, x]) : [[k, v]])
      ).toString()
    : "";
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url + qs, { headers: { "Accept": "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as T;
      await delay(RATE_MS);
      return data;
    }
    if (i === retries) throw new Error(`GET ${url}${qs} -> ${res.status}`);
    await delay(500 * (i + 1));
  }
  // Unreachable
  throw new Error("getJson failed");
}


