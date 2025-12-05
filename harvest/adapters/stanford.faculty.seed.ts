import { ingestFaculty } from "./faculty.template.js";

(async () => {
  await ingestFaculty({
    id: "stanford",
    outdir: "./data/stanford",
    deptUrls: [
      "https://cs.stanford.edu/people",
      "https://economics.stanford.edu/people",
      "https://cs.stanford.edu/people/faculty",
      "https://economics.stanford.edu/people/faculty"
    ],
    selectors: {
      person: ".person, .profile, .views-row, .faculty, .faculty-member, .person-card, .bio, article",
      name: "h3, h2, h4, .name, .field--name-title, .person-name, .faculty-name, a[href*='/people/'], a[href*='/profiles/']",
      email: "a[href^='mailto:'], .email, .field--name-field-email"
    },
    transforms: {
      fixName: (s) => s.replace(/\s+/g, " ").trim().replace(/^(Faculty|Emeritus|Affiliated|Lecturers|Postdoctoral|Graduate|Administration|Visitors|Alumni).*$/i, "").trim()
    },
    scanMailtoFallback: true
  });
})();
