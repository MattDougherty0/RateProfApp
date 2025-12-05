export type CornellRoster = { slug: string; descr: string; };
export type CornellRostersResp = { data: { rosters: CornellRoster[] } };

export type CornellSubject = { value: string; descr: string; acadGroup?: string };
export type CornellSubjectsResp = { data: { subjects: CornellSubject[] } };

export type CornellClassesResp = {
  data: {
    classes: Array<{
      subject: string;
      catalogNbr: string;
      titleShort?: string;
      titleLong?: string;
      description?: string;             // legacy rosters
      enrollGroups?: Array<{
        classSections?: Array<{
          classNbr?: number;
          section?: string;
          component?: string;           // LEC, DIS, LAB
          meetings?: Array<{
            timeStart?: string; timeEnd?: string; pattern?: string;
            bldg?: string; room?: string;
            instructors?: Array<{ firstName?: string; lastName?: string; netid?: string; role?: string }>;
          }>;
        }>;
      }>;
    }>
  }
}


