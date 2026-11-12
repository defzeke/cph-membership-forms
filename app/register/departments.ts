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
    slug: "administrative-department",
    name: "Administration",
    description:
      "Administration manages CyberPH's official papers, records, finances, and governance workflows. The Secretary leads meeting documentation, liaison, and compliance work, while the Treasurer & Auditor oversees finance, audit, and sales and product marketing.",
  },
  {
    slug: "people-and-culture-department",
    name: "People and Culture",
    description:
      "People and Culture looks after CyberPH's members and officers. It covers organization culture (team building, officer socials, appreciation and awards), community engagement (member onboarding, feedback, and community spaces), and growth and expansion (regional chapters and student and industry ambassadors).",
  },
  {
    slug: "business-development-department",
    name: "Business Development",
    description:
      "Business Development builds and keeps CyberPH's partnerships. External Relations handles strategic partnerships and partner management, while Corporate Affairs handles corporate relations and sponsorships, with both delivering the perks and deliverables promised to partners.",
  },
  {
    slug: "creatives-department",
    name: "Creatives",
    description:
      "Creatives, under Creatives Communications, enhances CyberPH's presence and communication to reach and engage internal and external audiences. Its floor and production committees create digital and print materials such as social media graphics, presentations, and advertisements.",
  },
  {
    slug: "marketing-department",
    name: "Marketing",
    description:
      "Marketing, under Creatives Communications, plans and runs initiatives that drive brand awareness, engagement, and growth. Its production committee and social media manager keep CyberPH's message consistent, engaging, and well targeted.",
  },
  {
    slug: "operations-department",
    name: "Operations",
    description:
      "Operations is the backbone of logistics and event execution. It covers event operations (guest relations and technical operations such as livestreaming), supply chain and logistics, and event planning with program and speaker coordination.",
  },
  {
    slug: "strategic-planning-department",
    name: "Strategic Planning",
    description:
      "Strategic Planning shapes CyberPH's programs. Community Initiatives handles program development and coordination, while Technical Initiatives runs technical training, certifications, hackathons, and CTFs.",
  },
  {
    slug: "technology-department",
    name: "Technology",
    description:
      "Technology drives CyberPH's technical work. Technology and Innovation covers software development and engineering, IT operations and infrastructure, and security and compliance, while Research and Development covers knowledge and discovery and technology and product innovation.",
  },
];

export const getDepartment = (slug: string) => DEPARTMENTS.find((d) => d.slug === slug);
