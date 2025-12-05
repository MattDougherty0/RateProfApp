import "dotenv/config";
import { getJson } from "../utils/http.js";
import { emitNDJSON } from "../utils/emitter.js";
import type { CornellRostersResp, CornellSubjectsResp, CornellClassesResp } from "./cornell.types.js";
import type { CourseRow, SectionRow, InstructorRow, TeachRow } from "../adapter.types.js";

const HOST = "https://classes.cornell.edu";
const API = (path: string) => `${HOST}/api/2.0${path}.json`;
const OUTDIR = "./data/cornell";

function courseKey(subject: string, catalogNbr: string) {
  return `${subject.trim()}-${catalogNbr.trim()}`;
}
function sectionKey(term: string, classNbr?: number | null) {
  return `${term}:${classNbr ?? "NA"}`;
}
function instrKey(netid?: string | null, name?: string | null) {
  return netid ? `cornell:${netid.toLowerCase()}` : `name:${(name ?? "").toLowerCase()}`;
}

async function rosters(): Promise<string[]> {
  const r = await getJson<CornellRostersResp>(API("/config/rosters"));
  // Limit to near-current terms on first pass
  return r.data.rosters.map(x => x.slug).filter(s => /^FA25|SP26|SP25|WI25|SU25$/.test(s));
}

async function subjects(roster: string): Promise<string[]> {
  const r = await getJson<CornellSubjectsResp>(API("/config/subjects"), { roster });
  return r.data.subjects.map(s => s.value).sort();
}

export async function ingestCornell() {
  const terms = await rosters();

  const allCourses: CourseRow[] = [];
  const allSections: SectionRow[] = [];
  const allInstructors: Record<string, InstructorRow> = {};
  const allTeach: TeachRow[] = [];

  for (const term of terms) {
    const subs = await subjects(term);

    for (const subject of subs) {
      const data = await getJson<CornellClassesResp>(API("/search/classes"), { roster: term, subject });

      for (const cls of data.data.classes) {
        const ckey = courseKey(cls.subject, cls.catalogNbr);

        allCourses.push({
          school_id: "cornell",
          subject_code: cls.subject,
          catalog_number: cls.catalogNbr,
          title: cls.titleLong ?? cls.titleShort ?? null,
          description: (cls as any).description ?? null,
        });

        for (const eg of cls.enrollGroups ?? []) {
          for (const sec of eg.classSections ?? []) {
            const skey = sectionKey(term, sec.classNbr);
            allSections.push({
              course_key: ckey,
              term,
              class_number: sec.classNbr ?? null,
              section: sec.section ?? null,
              component: sec.component ?? null,
            });

            for (const mtg of sec.meetings ?? []) {
              for (const inst of mtg.instructors ?? []) {
                const name = [inst.firstName, inst.lastName].filter(Boolean).join(" ").trim() || null;
                const netid = inst.netid ?? null;
                const email = netid ? `${netid}@cornell.edu` : null;

                const ikey = instrKey(netid, name);
                if (!allInstructors[ikey]) {
                  allInstructors[ikey] = { school_id: "cornell", name: name ?? (netid ?? "(unknown)"), netid, email };
                }
                allTeach.push({ section_key: skey, instructor_key: ikey });
              }
            }
          }
        }
      }
    }
  }

  emitNDJSON(OUTDIR, "courses", allCourses);
  emitNDJSON(OUTDIR, "sections", allSections);
  emitNDJSON(OUTDIR, "instructors", Object.values(allInstructors));
  emitNDJSON(OUTDIR, "teach", allTeach);

  console.log(`Cornell ingest complete. Wrote NDJSON files to ${OUTDIR}`);
}



