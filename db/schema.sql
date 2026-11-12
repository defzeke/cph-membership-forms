-- Applied by `npm run db:migrate` (direct connection). Idempotent: safe to re-run.
--
-- registration_personal_info  the applicant ("user"); written only on the final Submit, with the application
-- departments                 one row per department (slug matches app/register/departments.ts)
-- department_roles            positions per department
-- department_questions        screening questions per role (admin edits these rows)
-- applications                one row per applicant applying for a role (status tracks the interview)
-- department_answers          one row per answered question, keyed by application + question
-- application_answers (view)  everything joined, for reading answers in the Neon console

CREATE TABLE IF NOT EXISTS registration_personal_info (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  facebook_link text NOT NULL,
  facebook_shared_post text NOT NULL,
  discord_username text NOT NULL,
  linkedin_link text,
  pup_webmail text, -- no longer asked; kept for older applicants
  phone text NOT NULL,
  course_year_section text, -- no longer asked; kept for older applicants
  certificate_link text NOT NULL, -- Google Drive link to a valid ID (older rows: COR)
  college_campus text NOT NULL
);

-- Existing databases: the form stopped asking for PUP Webmail.
ALTER TABLE registration_personal_info ALTER COLUMN pup_webmail DROP NOT NULL;
-- Existing databases: the form stopped asking for course, year, and section.
ALTER TABLE registration_personal_info ALTER COLUMN course_year_section DROP NOT NULL;

-- One application per email (case-insensitive), to stop spam. Fails if duplicates already exist.
CREATE UNIQUE INDEX IF NOT EXISTS registration_personal_info_email_key ON registration_personal_info (lower(email));

CREATE TABLE IF NOT EXISTS departments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  closed boolean NOT NULL DEFAULT false -- toggled in cph-admin; closed departments take no applications
);

-- Existing databases: add `closed` once, carrying over the flags that used to live in departments.ts.
-- Runs only when the column is missing, so re-running never undoes an admin's open/close.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'closed') THEN
    ALTER TABLE departments ADD COLUMN closed boolean NOT NULL DEFAULT false;
    UPDATE departments SET closed = true
    WHERE slug IN ('administrative-department', 'creatives-department', 'operations-department', 'technology-department');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS department_roles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id bigint NOT NULL REFERENCES departments (id),
  position int NOT NULL DEFAULT 1, -- display order
  name text NOT NULL,
  UNIQUE (department_id, name)
);

-- Admin edits these rows directly (Neon console > Tables); the form reads them on every page load.
-- To change a question's meaning, set active = false and add a new row, so old answers keep the
-- question they answered. Questions with answers can't be deleted.
CREATE TABLE IF NOT EXISTS department_questions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id bigint NOT NULL REFERENCES department_roles (id),
  position int NOT NULL DEFAULT 1, -- display order within the role
  prompt text NOT NULL CHECK (prompt <> ''),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (role_id, id) -- target of the answers FK (also indexes role_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id bigint NOT NULL REFERENCES registration_personal_info (id) ON DELETE CASCADE,
  role_id bigint NOT NULL REFERENCES department_roles (id), -- the role implies the department
  status text NOT NULL DEFAULT 'pending',
  UNIQUE (role_id, id) -- target of the answers FK
);
CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications (user_id);

-- role_id is in both FKs, so an answer's question must belong to the role (and department) applied for.
CREATE TABLE IF NOT EXISTS department_answers (
  application_id bigint NOT NULL,
  role_id bigint NOT NULL,
  question_id bigint NOT NULL,
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 5000),
  PRIMARY KEY (application_id, question_id),
  FOREIGN KEY (role_id, application_id) REFERENCES applications (role_id, id) ON DELETE CASCADE,
  FOREIGN KEY (role_id, question_id) REFERENCES department_questions (role_id, id)
);

-- Read-only view for the admin. security_invoker: callers still hit the tables' RLS, so the view
-- can't become a back door for non-owner roles.
CREATE OR REPLACE VIEW application_answers WITH (security_invoker = true) AS
SELECT a.id AS application_id, a.created_at, a.status, p.id AS user_id, p.first_name, p.last_name, p.email,
       d.id AS department_id, d.name AS department, r.name AS role, q.id AS question_id, q.prompt AS question, x.answer
FROM department_answers x
JOIN applications a ON a.id = x.application_id
JOIN registration_personal_info p ON p.id = a.user_id
JOIN department_roles r ON r.id = a.role_id
JOIN departments d ON d.id = r.department_id
JOIN department_questions q ON q.id = x.question_id;

-- Seed: each insert only runs while its table is empty, so re-running never overwrites admin edits.
INSERT INTO departments (slug, name) VALUES
  ('administrative-department', 'Administration'),
  ('people-and-culture-department', 'People and Culture'),
  ('business-development-department', 'Business Development'),
  ('creatives-department', 'Creatives'),
  ('marketing-department', 'Marketing'),
  ('operations-department', 'Operations'),
  ('strategic-planning-department', 'Strategic Planning'),
  ('technology-department', 'Technology')
ON CONFLICT (slug) DO NOTHING;

CREATE TEMP TABLE seed (slug text, role_position int, role text, position int, prompt text);
INSERT INTO seed VALUES
  ('administrative-department', 1, 'Secretary', 1, 'How would you lead the team in keeping the organization''s records, minutes, and documents reliable?'),
  ('administrative-department', 1, 'Secretary', 2, 'Describe a time you managed something carefully, like documents, schedules, or records. How did you stay organized?'),
  ('administrative-department', 2, 'Treasurer & Auditor', 1, 'How would you keep the organization''s funds and spending transparent and accountable?'),
  ('administrative-department', 2, 'Treasurer & Auditor', 2, 'How would you handle confidential or sensitive financial information responsibly?'),
  ('people-and-culture-department', 1, 'Vice President for People and Culture', 1, 'How would you build a culture where members and officers feel welcome, valued, and motivated?'),
  ('people-and-culture-department', 1, 'Vice President for People and Culture', 2, 'Describe a time you helped bring a group of people together. What did you do and how did it go?'),
  ('people-and-culture-department', 2, 'Assistant Vice President for People and Culture', 1, 'How would you support the Vice President in running onboarding, socials, and recognition activities?'),
  ('people-and-culture-department', 2, 'Assistant Vice President for People and Culture', 2, 'How would you handle feedback or concerns from members about the organization?'),
  ('business-development-department', 1, 'Vice President for Business Development', 1, 'How would you lead the team in finding, winning, and keeping partners and sponsors?'),
  ('business-development-department', 1, 'Vice President for Business Development', 2, 'Describe a time you represented a group or helped connect people to work together. How did it go?'),
  ('business-development-department', 2, 'Assistant Vice President for Business Development', 1, 'How would you support the Vice President in coordinating partner deliverables and follow-ups?'),
  ('business-development-department', 2, 'Assistant Vice President for Business Development', 2, 'How would you handle a partner or sponsor who is unhappy with what was delivered?'),
  ('creatives-department', 1, 'Vice President for Creatives', 1, 'How would you inspire and lead a team of creatives to produce their best work?'),
  ('creatives-department', 1, 'Vice President for Creatives', 2, 'Describe a time you took the lead on a creative project or task. What did you learn from it?'),
  ('creatives-department', 2, 'Assistant Vice President for Creatives', 1, 'How would you support the Vice President in keeping projects on track and organized?'),
  ('creatives-department', 2, 'Assistant Vice President for Creatives', 2, 'How would you handle it when team members disagree on a design or creative direction?'),
  ('marketing-department', 1, 'Vice President for Marketing', 1, 'What does leading a marketing team look like to you, and how would you set the direction for CyberPH''s brand?'),
  ('marketing-department', 1, 'Vice President for Marketing', 2, 'Tell us about a time you led or took charge of a project or activity from start to finish.'),
  ('marketing-department', 2, 'Assistant Vice President for Marketing', 1, 'How would you help the Vice President plan and pace the team''s content and campaigns?'),
  ('marketing-department', 2, 'Assistant Vice President for Marketing', 2, 'If two team members had different ideas for a campaign, how would you help them move forward?'),
  ('operations-department', 1, 'Vice President for Operations', 1, 'What does leadership mean to you, and how would you guide the Operations team in executing CyberPH events?'),
  ('operations-department', 1, 'Vice President for Operations', 2, 'Share a time you led or organized something (an event, project, or group task). What was your role and how did it go?'),
  ('operations-department', 2, 'Assistant Vice President for Operations', 1, 'How would you support the Vice President in managing and coordinating the team?'),
  ('operations-department', 2, 'Assistant Vice President for Operations', 2, 'How would you handle a disagreement or conflict within the team during an event?'),
  ('strategic-planning-department', 1, 'Vice President for Strategic Planning', 1, 'What program or initiative would you want CyberPH to run, and how would you plan it from idea to launch?'),
  ('strategic-planning-department', 1, 'Vice President for Strategic Planning', 2, 'Describe a time you planned something with several moving parts. How did you keep it on track?'),
  ('strategic-planning-department', 2, 'Assistant Vice President for Strategic Planning', 1, 'How would you support the Vice President in coordinating trainings, hackathons, and CTFs?'),
  ('strategic-planning-department', 2, 'Assistant Vice President for Strategic Planning', 2, 'How would you decide which programs to prioritize when time and resources are limited?'),
  ('technology-department', 1, 'Vice President for Technology', 1, 'How would you lead the Technology department across engineering, infrastructure, security, and research?'),
  ('technology-department', 1, 'Vice President for Technology', 2, 'Describe a technical project you led or contributed to. What was your role and what did you learn?'),
  ('technology-department', 2, 'Assistant Vice President for Technology', 1, 'How would you support the Vice President in keeping technical projects and research on track?'),
  ('technology-department', 2, 'Assistant Vice President for Technology', 2, 'How would you help members with different skill levels grow in the department?');

INSERT INTO department_roles (department_id, position, name)
SELECT DISTINCT d.id, s.role_position, s.role FROM seed s JOIN departments d USING (slug)
WHERE NOT EXISTS (SELECT 1 FROM department_roles);

INSERT INTO department_questions (role_id, position, prompt)
SELECT r.id, s.position, s.prompt FROM seed s JOIN departments d USING (slug) JOIN department_roles r ON r.department_id = d.id AND r.name = s.role
WHERE NOT EXISTS (SELECT 1 FROM department_questions);

DROP TABLE seed;

-- Lock every table: RLS on with no policies. Only neondb_owner (BYPASSRLS: the app server and the admin)
-- can read or write; any other role, e.g. Data API's anonymous/authenticated, sees zero rows.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
