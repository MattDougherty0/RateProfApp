import "dotenv/config";
import { load } from "cheerio";
import { emitNDJSON } from "../utils/emitter.js";
import { getText } from "../utils/httpHtml.js";

const URL = "https://legacy.cs.stanford.edu/directory/faculty";

function deobfuscateEmail(raw: string): string | null {
  let s = raw.trim();
  // normalize bracketed "at"/"dot"
  s = s.replace(/\[\s*at\s*\]/gi, "@").replace(/\[\s*dot\s*\]/gi, ".");
  // collapse spaced letters in local-part ("m a n n i n g")
  s = s.replace(/([a-z])\s(?=[a-z])/gi, "$1");
  s = s.replace(/\s+/g, "");
  return /\S+@\S+\.\S+/.test(s) ? s : null;
}
function likelyName(t: string) {
  return /\b[A-Z][a-z]+(?: [A-Z][a-zA-Z.'-]+)+/.test(t.trim());
}

(async () => {
  const html = await getText(URL);
  const $ = load(html);

  // Collect names from anchor text
  const names = new Set<string>();
  $("a").each((_i, a) => {
    const txt = $(a).text().replace(/\s+/g, " ").trim();
    if (likelyName(txt)) names.add(txt);
  });

  // Collect and deobfuscate any cs.stanford.edu emails in the page text
  const emails = new Set<string>();
  const body = $("body").text();
  const re = /([A-Za-z0-9._\s-]+)\s*\[\s*at\s*\]\s*(?:cs\.)?stanford\.\s*edu/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const e = deobfuscateEmail(`${m[1]} [at] cs.stanford.edu`);
    if (e) emails.add(e);
  }

  // Heuristic map: unique last-name match only
  const arrNames = Array.from(names).map(n => ({ raw:n, last:n.split(/\s+/).slice(-1)[0].toLowerCase() }));
  const byLast = new Map<string,string[]>();
  for (const e of emails) {
    const user = e.split("@")[0].toLowerCase();
    for (const n of arrNames) {
      if (user.includes(n.last)) {
        const list = byLast.get(n.last) ?? [];
        list.push(e);
        byLast.set(n.last, list);
      }
    }
  }

  const profs = arrNames.map(n => {
    const hits = byLast.get(n.last) ?? [];
    const email = hits.length === 1 ? hits[0] : null; // accept only unique hits
    return { school_id: "stanford", name: n.raw, email };
  });

  emitNDJSON("./data/stanford", "professors_from_directory_cs", profs);
  console.log(`CS faculty parsed: names=${arrNames.length}, emails=${emails.size}, saved=${profs.length}`);
})();



