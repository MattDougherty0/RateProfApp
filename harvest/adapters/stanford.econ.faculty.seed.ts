import { ingestFaculty } from "./faculty.template.js";

(async () => {
  await ingestFaculty({
    id: "stanford",
    outdir: "./data/stanford",
    deptUrls: [
      "https://economics.stanford.edu/people/faculty",
      "https://economics.stanford.edu/people/lecturers"
    ],
    selectors: {
      // Faculty page renders each person with an <h2><a>Full Name</a></h2>
      person: "h2:has(a)",
      name: "a",
      profileHref: "a",
      // Lecturers page also includes direct mailto links we can catch via fallback
      email: "a[href^='mailto:'], .email"
    },
    profile: {
      emailSelectors: [
        "a[href^='mailto:']",
        ".email",
        ".field--name-field-email a[href^='mailto:']",
        ".su-contact a[href^='mailto:']"
      ],
      maxFollow: 200
    },
    transforms: {
      fixName: (s) => s.replace(/\s+/g, " ").trim()
    },
    scanMailtoFallback: true
  });
})();



