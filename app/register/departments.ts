// Departments and positions follow the CyberPH org chart (FigJam "CyberPH Organizational Chart").
// Positions and their questions live in the database (department_roles, department_questions).
// Open/closed lives in the database (departments.closed) and is toggled in cph-admin.
export type Department = {
  slug: string; // URL segment under /register
  name: string;
  description: string;
};

export const DEPARTMENTS: readonly Department[] = [
  {
    slug: "member",
    name: "General Member",
    description:
      "Join CyberPH as a general member, without an officer or committee role. There are no screening questions and no interview.",
  },
  {
    slug: "administrative-department",
    name: "Administration",
    description:
      "Administration keeps CyberPH's papers, records, and rules in order. Meeting & Documentation Officers handle minutes, records, and files, Liaison Officers link officers and departments, and Compliance Officers handle policies, permits, and rules.",
  },
  {
    slug: "people-and-culture-department",
    name: "Community Development",
    description:
      "Community Development (formerly People and Culture) looks after CyberPH's members and officers. Talent Development builds members' skills, Human Resource keeps members supported and engaged (both also take committee members under the Community Relations Committee), and Community Expansion grows CyberPH through regional chapters, student advocates, and industry partners.",
  },
  {
    slug: "business-development-department",
    name: "Business Development",
    description:
      "Business Development builds and keeps CyberPH's partnerships and funds. Partnerships handles outreach, sponsors, and partner deliverables, Finance handles budgets and sales, and Merchandise handles suppliers and products.",
  },
  {
    slug: "creatives-department",
    name: "Creatives",
    description:
      "Creatives, under Creatives Communications, shapes how CyberPH looks and sounds. The Floor Committee handles event documentation and on-site decor, while the Creation Committee handles visual and media production such as graphics, reels, and videos.",
  },
  {
    slug: "marketing-department",
    name: "Marketing",
    description:
      "Marketing, under Creatives Communications, drives brand awareness, engagement, and growth. Marketing Operations runs CyberPH's page and member questions day to day, while Marketing Strategy plans campaigns, event branding, and what to try next.",
  },
  {
    slug: "operations-department",
    name: "Operations",
    description:
      "Operations is the backbone of logistics and event execution. Event Operations covers guest relations and technical operations such as livestreaming, Event Planning covers program, speaker, and logistics coordination, and the Product and Development Committee runs the helpdesk that logs and resolves tech issues.",
  },
  {
    slug: "strategic-planning-department",
    name: "Strategic Planning",
    description:
      "Strategic Planning shapes CyberPH's programs and growth. Strategic Insights tracks trends and what members need, while Program Development designs programs such as training tracks and bootcamps.",
  },
  {
    slug: "technology-department",
    name: "Technology",
    description:
      "Technology drives CyberPH's technical work. Technology and Engineering covers software development, IT operations and infrastructure, and security and compliance, while Research and Innovation covers tech research and new tool and product ideas.",
  },
];

export const getDepartment = (slug: string) => DEPARTMENTS.find((d) => d.slug === slug);
