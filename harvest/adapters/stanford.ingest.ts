import "dotenv/config";
import { load } from "cheerio";
import { emitNDJSON } from "../utils/emitter.js";
import { getText } from "../utils/httpHtml.js";
import type { CourseRow, SectionRow, InstructorRow, TeachRow } from "../adapter.types.js";

const BASE = "https://explorecourses.stanford.edu";
const OUTDIR = "./data/stanford";

const ENV_SUBJECTS = (process.env.STANFORD_SUBJECTS ?? "").split(",").map(s=>s.trim()).filter(Boolean);
const ENV_TERMS = (process.env.STANFORD_TERMS ?? "").split(",").map(s=>s.trim()).filter(Boolean);
const TERMS = ENV_TERMS.length ? ENV_TERMS : ["Autumn","Winter","Spring","Summer"];
const SUBJECT_FILTER: string[] | null = ENV_SUBJECTS.length ? ENV_SUBJECTS : null;

function courseKey(subject:string, number:string){ return `${subject}-${number}`; }
function sectionKey(term:string, classNbr:string|number|null){ return `${term}:${classNbr ?? "NA"}`; }

function splitNames(raw: string): string[] {
  return raw
    .split(/;|,|\/|&| and |\s{2,}/i)
    .map(s => s.replace(/[(].*?[)]/g,"").trim())
    .filter(s => s && /[A-Za-z]/.test(s));
}

async function getSubjects(): Promise<{code:string; href:string}[]> {
  const html = await getText(`${BASE}/`);
  const $ = load(html);
  const out: {code:string; href:string}[] = [];
  $("a").each((_i, a) => {
    const txt = $(a).text().trim();
    const m = txt.match(/\(([^)]+)\)\s*$/);
    const href = $(a).attr("href") || "";
    if (m && m[1] && href.includes("search")) {
      const code = m[1].trim();
      if (!SUBJECT_FILTER || SUBJECT_FILTER.includes(code)) {
        out.push({ code, href: new URL(href, BASE).toString() });
      }
    }
  });
  const seen = new Set<string>();
  return out.filter(x => !seen.has(x.code) && seen.add(x.code));
}

function buildSearchUrl(subjectCode:string, term:string, page:number){
  const params = new URLSearchParams({
    "filter-coursestatus-Active":"on",
    [`filter-departmentcode-${subjectCode}`]:"on",
    [`filter-term-${term}`]:"on",
    page: String(page),
    q: subjectCode,
    view: "catalog"
  });
  return `${BASE}/search?${params.toString()}`;
}

function parseHeaderRange(text:string){
  const m = text.match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/i);
  if(!m) return {start:0,end:0,total:0};
  return { start: Number(m[1]), end: Number(m[2]), total: Number(m[3]) };
}

export async function ingestStanford(){
  const courses: CourseRow[] = [];
  const sections: SectionRow[] = [];
  const instructors: Record<string, InstructorRow> = {};
  const teach: TeachRow[] = [];

  const subjects = await getSubjects();

  for(const term of TERMS){
    for(const subj of subjects){
      let page = 0;
      let total = Infinity;

      while(page*10 < total){
        const url = buildSearchUrl(subj.code, term, page);
        const html = await getText(url);
        const $ = load(html);

        if(page===0){
          const whole = $("body").text();
          total = parseHeaderRange(whole).total || 0;
          if(total === 0) break;
        }

        $("h2, h3").each((_i, h) => {
          const header = $(h).text().replace(/\s+/g, " ").trim();
          const mh = header.match(/^([A-Z& ]+)\s+([0-9A-Z.]+):\s*(.+)$/);
          if(!mh) return;

          const subject = mh[1].replace(/\s+/g,"");
          const number = mh[2];
          const title = mh[3];
          const ckey = courseKey(subject, number);

          // Description
          let desc = "";
          let node = $(h).next();
          const chunks: string[] = [];
          for(let k=0;k<6 && node.length;k++){
            const tag = (node.get(0).tagName || "").toLowerCase();
            if(tag === "p") chunks.push(node.text().trim());
            if(tag === "h2" || tag === "h3") break;
            node = node.next();
          }
          desc = chunks.join("\n");

          courses.push({ school_id: "stanford", subject_code: subject, catalog_number: number, title: title || null, description: desc || null });

          // Nearby block for term-specific schedule
          let scan = $(h).next();
          while(scan.length){
            const tag = (scan.get(0).tagName || "").toLowerCase();
            if(tag === "h2" || tag === "h3") break;
            const txt = scan.text().replace(/\s+/g, " ").trim();

            if (new RegExp(term, "i").test(txt)) {
              const classNbrs = Array.from(txt.matchAll(/Class\s*#\s*(\d+)/gi)).map(m => m[1]);
              const comp = (txt.match(/\b(LEC|LAB|DIS|SEM|ACT|ISF)\b/i)?.[1] ?? null)?.toUpperCase() || null;

              // Instructors (primary: "Instructors:" line)
              const instrsSet = new Set<string>();
              const instrLine = txt.match(/Instructors?:\s*([^.;\n]+)/i);
              if (instrLine) splitNames(instrLine[1]).forEach(n => instrsSet.add(n));

              // Fallback 1: look for "Instructor:" (singular)
              const instrLineSing = txt.match(/Instructor:\s*([^.;\n]+)/i);
              if (instrLineSing) splitNames(instrLineSing[1]).forEach(n => instrsSet.add(n));

              // Fallback 2: harvest plausible <a> texts within the same block
              scan.find("a").each((_k, a) => {
                const linkText = $(a).text().trim();
                const linkTitle = $(a).attr("title") || "";
                const candidate = linkText || linkTitle;
                if (candidate && /\b[A-Z][a-z]+ [A-Z][a-zA-Za-z.'-]+/.test(candidate)) {
                  instrsSet.add(candidate);
                }
              });

              // Finalize
              const instrs = Array.from(instrsSet);

              const classes = classNbrs.length ? classNbrs : [null];
              for(const cn of classes){
                const skey = sectionKey(term, cn ? Number(cn) : null);
                sections.push({ course_key: ckey, term, class_number: cn ? Number(cn) : null, section: null, component: comp });

                for(const nm of instrs){
                  const ikey = `name:${nm.toLowerCase()}`;
                  if(!instructors[ikey]) {
                    instructors[ikey] = { school_id: "stanford", name: nm, email: null, netid: null };
                  }
                  teach.push({ section_key: skey, instructor_key: ikey });
                }
              }
            }
            scan = scan.next();
          }
        });

        page += 1;
      }
    }
  }

  emitNDJSON(OUTDIR, "courses", courses);
  emitNDJSON(OUTDIR, "sections", sections);
  emitNDJSON(OUTDIR, "instructors", Object.values(instructors));
  emitNDJSON(OUTDIR, "teach", teach);
  console.log(`Stanford ingest complete. Wrote NDJSON to ${OUTDIR}`);
}



