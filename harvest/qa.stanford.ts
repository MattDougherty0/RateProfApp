import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function readNDJSON<T>(p: string): T[] {
  if (!existsSync(p)) return [];
  const txt = readFileSync(p, "utf8");
  const t = txt.trim();
  if (!t) return [];
  return t.split("\n").map(l => JSON.parse(l));
}

const base = "./data/stanford";
const courses = readNDJSON<any>(join(base, "courses.ndjson"));
const sections = readNDJSON<any>(join(base, "sections.ndjson"));
const instructors = readNDJSON<any>(join(base, "instructors.ndjson"));
const teach = readNDJSON<any>(join(base, "teach.ndjson"));

const sectionCount = sections.length;
const sectionWithInstr = new Set(teach.map((t: any) => t.section_key)).size;
const instrCoverage = sectionCount ? (sectionWithInstr / sectionCount) * 100 : 0;
const emailCoverage = instructors.length
  ? (instructors.filter((i: any) => i.email).length / instructors.length) * 100
  : 0;

console.log(JSON.stringify({
  courseCount: courses.length,
  sectionCount,
  instructors: instructors.length,
  teachLinks: teach.length,
  pctSectionsWithInstructor: Number(instrCoverage.toFixed(1)),
  pctInstructorEmailCoverage: Number(emailCoverage.toFixed(1))
}, null, 2));





