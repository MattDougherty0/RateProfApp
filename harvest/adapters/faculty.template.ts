import "dotenv/config";
import { load, CheerioAPI } from "cheerio";
import { emitNDJSON } from "../utils/emitter.js";
import { getText } from "../utils/httpHtml.js";

type FacultyConfig = {
  id: string;
  outdir: string;
  deptUrls: string[];
  selectors: {
    person: string;       // card/container (or tag per person)
    name: string;         // within person
    email?: string;       // within person (optional)
    profileHref?: string; // within person: selector for <a href="..."> to follow
  };
  profile?: {
    emailSelectors?: string[]; // selectors to find email(s) on profile page
    maxFollow?: number;        // safety cap per run (default 200)
  };
  transforms?: {
    fixName?: (raw: string) => string;
    fixEmail?: (raw: string) => string;
  };
  scanMailtoFallback?: boolean; // scan person/profile for any mailto: links
};

function deobfuscateEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^mailto:/i, "");
  s = s.replace(/\s*\[\s*at\s*\]\s*|\s+at\s+/gi, "@")
       .replace(/\s*\[\s*dot\s*\]\s*|\s+dot\s+/gi, ".")
       .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
       .replace(/\s*\(\s*dot\s*\)\s*/gi, ".");
  s = s.replace(/[<>\[\]();]/g, "").replace(/\s+/g, "");
  return /\S+@\S+\.\S+/.test(s) ? s : null;
}

function findAnyEmailLike($: CheerioAPI, root: any): string | null {
  // 1) mailto:
  const a = $(root).find("a[href^='mailto:']").first();
  if (a.length) return deobfuscateEmail(a.attr("href") || a.text());

  // 2) common class
  const e = $(root).find(".email, .field--name-field-email").first();
  if (e.length) return deobfuscateEmail(e.text());

  // 3) text scan for obfuscated "name [at] domain [dot] edu"
  const txt = $(root).text();
  const m = txt.match(/[A-Za-z0-9._%+-]+\s*(?:\(|\[)?\s*at\s*(?:\)|\])?\s*[A-Za-z0-9.-]+\s*(?:\(|\[)?\s*dot\s*(?:\)|\])?\s*[A-Za-z]{2,}/i);
  return deobfuscateEmail(m ? m[0] : null);
}

export async function ingestFaculty(cfg: FacultyConfig) {
  const profs = new Map<string, { school_id: string; name: string; email: string | null }>();
  const followTasks: Promise<void>[] = [];
  const maxFollow = cfg.profile?.maxFollow ?? 200;

  for (const url of cfg.deptUrls) {
    try {
      const html = await getText(url);
      const $ = load(html);

      $(cfg.selectors.person).each((_i, el) => {
        let name = $(el).find(cfg.selectors.name).first().text().trim();
        if (cfg.transforms?.fixName) name = cfg.transforms.fixName(name);
        if (!name) return;

        // Direct email on card
        let email: string | null = null;
        if (cfg.selectors.email) {
          const node = $(el).find(cfg.selectors.email).first();
          email = deobfuscateEmail(node.attr("href") || node.text());
        }
        if (!email && cfg.scanMailtoFallback) {
          email = findAnyEmailLike($, el);
        }

        // Follow profile link if needed
        if (!email && cfg.selectors.profileHref) {
          const a = $(el).find(cfg.selectors.profileHref).first();
          const href = a.attr("href");
          if (href && followTasks.length < maxFollow) {
            const profileUrl = new URL(href, url).toString();
            followTasks.push((async () => {
              try {
                const phtml = await getText(profileUrl);
                const $p = load(phtml);
                let pEmail: string | null = null;
                for (const sel of cfg.profile?.emailSelectors ?? []) {
                  const node = $p(sel).first();
                  if (node.length) {
                    pEmail = deobfuscateEmail(node.attr("href") || node.text());
                    if (pEmail) break;
                  }
                }
                if (!pEmail && cfg.scanMailtoFallback) {
                  pEmail = findAnyEmailLike($p, $p.root().get(0) as any);
                }
                if (cfg.transforms?.fixEmail && pEmail) pEmail = cfg.transforms.fixEmail(pEmail);
                const key = `${cfg.id}:${name.toLowerCase()}`;
                const existing = profs.get(key);
                if (!existing || (!existing.email && pEmail)) {
                  profs.set(key, { school_id: cfg.id, name, email: pEmail });
                }
              } catch {}
            })());
          }
        }

        // Save immediate result (may be overwritten later by profile task)
        const key = `${cfg.id}:${name.toLowerCase()}`;
        if (!profs.has(key)) profs.set(key, { school_id: cfg.id, name, email });
      });
    } catch (e) {
      console.warn(`WARN faculty fetch failed for ${url}: ${(e as Error).message}`);
    }
  }

  await Promise.allSettled(followTasks);

  const arr = Array.from(profs.values());
  emitNDJSON(cfg.outdir, "professors_from_directory", arr);
  console.log(`Faculty ingest complete (${arr.length}) -> ${cfg.outdir}`);
}



