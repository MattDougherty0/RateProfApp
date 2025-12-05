import "dotenv/config";
import fetch from "node-fetch";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import crypto from "crypto";

const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
const RATE_MS = Number(process.env.RATE_MS_HTML ?? process.env.RATE_MS ?? 1200);
const JITTER_MS = Number(process.env.JITTER_MS ?? 400);
const CACHE_DIR = process.env.CACHE_HTML_DIR ?? "./cache/html";
const TTL_HOURS = Number(process.env.CACHE_TTL_HOURS ?? 24);

const DEFAULT_HEADERS = {
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": process.env.HTTP_USER_AGENT
    ?? "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Referer": "https://explorecourses.stanford.edu/"
};

function cachePath(url: string) {
  const hash = crypto.createHash("sha1").update(url).digest("hex");
  return join(CACHE_DIR, `${hash}.html`);
}

function fresh(p: string): boolean {
  try {
    const st = statSync(p);
    const ageH = (Date.now() - st.mtimeMs) / 3.6e6;
    return ageH < TTL_HOURS && st.size > 0;
  } catch { return false; }
}

export async function getText(url: string, headers: Record<string,string> = {}): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cp = cachePath(url);
  if (fresh(cp)) return readFileSync(cp, "utf8");

  const retries = 3;
  for (let i=0;i<=retries;i++) {
    const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, ...headers } });

    if (res.ok) {
      const text = await res.text();
      writeFileSync(cp, text);
      const jitter = Math.floor(Math.random()*JITTER_MS);
      await sleep(RATE_MS + jitter);
      return text;
    }

    // Handle 429/5xx and be gentler on 403
    if (res.status === 429 || res.status >= 500 || res.status === 403) {
      if (i === retries) throw new Error(`GET ${url} -> ${res.status} (exhausted)`);
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const backoff = retryAfter>0 ? retryAfter*1000 : Math.min(2000*(i+1), 10000);
      await sleep(backoff);
      continue;
    }

    throw new Error(`GET ${url} -> ${res.status}`);
  }

  throw new Error("unreachable");
}



