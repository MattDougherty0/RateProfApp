import "dotenv/config";
import fetch from "node-fetch";
import { load } from "cheerio";
import { emitNDJSON } from "../utils/emitter.js";
import type { CourseRow, SectionRow, InstructorRow, TeachRow } from "../adapter.types.js";

type CatalogConfig = {
  id: string;
  outdir: string;
  startUrls: string[];
  selectors: {
    course: string;
    title: string;
    code: string;
    description?: string;
    // Optional fine-grained selectors (if page includes section/instructor info)
    section?: string;
    instructor?: string;
  };
  transforms: {
    parseCode: (raw: string) => { subject_code: string; catalog_number: string };
    title?: (raw: string) => string;
    description?: (raw: string) => string;
    instructorName?: (raw: string) => string;
  };
  term: string; // fallback fixed term like "FA25"
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const RATE_MS = Number(process.env.RATE_MS ?? 900);

export async function ingestCatalogHtml(cfg: CatalogConfig) {
  const courses: Record<string, CourseRow> = {};
  const sections: SectionRow[] = [];
  const instructors: Record<string, InstructorRow> = {};
  const teach: TeachRow[] = [];

  for (const url of cfg.startUrls) {
    const res = await fetch(url, { headers: { "Accept": "text/html" } });
    if (!res.ok) {
      await delay(RATE_MS);
      continue;
    }
    const html = await res.text();
    const $ = load(html);

    $(cfg.selectors.course).each((_i, el) => {
      const rawTitle = $(el).find(cfg.selectors.title).text().trim();
      const rawCode = $(el).find(cfg.selectors.code).text().trim();
      const rawDesc = cfg.selectors.description ? $(el).find(cfg.selectors.description).text().trim() : "";

      if (!rawCode) return;
      const { subject_code, catalog_number } = cfg.transforms.parseCode(rawCode);
      const key = `${subject_code}-${catalog_number}`;

      const title = cfg.transforms.title ? cfg.transforms.title(rawTitle) : rawTitle || null;
      const description = cfg.transforms.description ? cfg.transforms.description(rawDesc) : (rawDesc || null);

      if (!courses[key]) {
        courses[key] = {
          school_id: cfg.id,
          subject_code,
          catalog_number,
          title,
          description,
        };
      }

      // Optional sections/instructors parsing if given
      if (cfg.selectors.section && cfg.selectors.instructor) {
        const secEls = $(el).find(cfg.selectors.section);
        secEls.each((_j, sel) => {
          const instrTxt = $(sel).find(cfg.selectors.instructor).text().trim();
          const instructorName = cfg.transforms.instructorName ? cfg.transforms.instructorName(instrTxt) : instrTxt;

          const sectionKey = `${cfg.term}:${key}:${_j}`;
          sections.push({
            course_key: key,
            term: cfg.term,
            class_number: null,
            section: null,
            component: null,
          });

          if (instructorName) {
            const ikey = `${cfg.id}:name:${instructorName.toLowerCase()}`;
            if (!instructors[ikey]) {
              instructors[ikey] = { school_id: cfg.id, name: instructorName, email: null, netid: null };
            }
            teach.push({ section_key: sectionKey, instructor_key: ikey });
          }
        });
      }
    });

    await delay(RATE_MS);
  }

  emitNDJSON(cfg.outdir, "courses", Object.values(courses));
  emitNDJSON(cfg.outdir, "sections", sections);
  emitNDJSON(cfg.outdir, "instructors", Object.values(instructors));
  emitNDJSON(cfg.outdir, "teach", teach);

  console.log(`${cfg.id} HTML catalog ingest complete. Wrote NDJSON files to ${cfg.outdir}`);
}


