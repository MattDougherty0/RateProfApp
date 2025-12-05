export type CourseRow = {
  school_id: string;
  subject_code: string;
  catalog_number: string;
  title: string | null;
  description: string | null;
};

export type SectionRow = {
  course_key: string;        // subject+number
  term: string;
  class_number: number | null;
  section: string | null;
  component: string | null;
};

export type InstructorRow = {
  school_id: string;
  name: string;
  email: string | null;
  netid: string | null;
};

export type TeachRow = {
  section_key: string;
  instructor_key: string;
};

export type IngestResult = {
  courses: CourseRow[];
  sections: SectionRow[];
  instructors: InstructorRow[];
  teach: TeachRow[];
};

export interface SchoolAdapter {
  id: string;                                 // e.g. "cornell"
  ingest: (opts?: { terms?: string[] }) => Promise<IngestResult | void>;
}





