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
  phone text,
  course_year_section text, -- no longer asked; kept for older applicants
  certificate_link text, -- optional Google Drive link to a valid ID (older rows: COR)
  college_campus text NOT NULL
);

-- Existing databases: the form stopped asking for PUP Webmail.
ALTER TABLE registration_personal_info ALTER COLUMN pup_webmail DROP NOT NULL;
-- Existing databases: the form stopped asking for course, year, and section.
ALTER TABLE registration_personal_info ALTER COLUMN course_year_section DROP NOT NULL;
-- Existing databases: phone and valid ID became optional.
ALTER TABLE registration_personal_info ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE registration_personal_info ALTER COLUMN certificate_link DROP NOT NULL;

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
-- The group a role is listed under. NULL hides the role (retired) but keeps its applications.
ALTER TABLE department_roles ADD COLUMN IF NOT EXISTS category text
  CHECK (category IN ('Executive', 'Lead', 'Committee Member', 'Member'));
-- Teams an applicant picks from after choosing this role; NULL or empty means no team question.
-- "Group / Team" entries are shown grouped under "Group".
ALTER TABLE department_roles ADD COLUMN IF NOT EXISTS teams text[];
-- false: applicants for this role skip the interview scheduler.
ALTER TABLE department_roles ADD COLUMN IF NOT EXISTS interview boolean NOT NULL DEFAULT true;

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
-- Start of the booked 20-minute interview slot; NULL for members and departments with no windows.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS team text; -- one of the role's teams, if it has any
-- Secret in the applicant's cookie that lets them move their interview for 5 hours after applying.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reschedule_token text;

-- Interview availability, added by the admin. The form offers 20-minute slots inside each window,
-- one applicant per slot per department. A department with no windows skips the scheduler.
CREATE TABLE IF NOT EXISTS interview_windows (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id bigint NOT NULL REFERENCES departments (id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at)
);

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
       d.id AS department_id, d.name AS department, r.name AS role, q.id AS question_id, q.prompt AS question, x.answer,
       a.interview_at, a.team
FROM department_answers x
JOIN applications a ON a.id = x.application_id
JOIN registration_personal_info p ON p.id = a.user_id
JOIN department_roles r ON r.id = a.role_id
JOIN departments d ON d.id = r.department_id
JOIN department_questions q ON q.id = x.question_id;

-- Seed: each insert only runs while its table is empty, so re-running never overwrites admin edits.
INSERT INTO departments (slug, name) VALUES
  ('member', 'General Member'),
  ('administrative-department', 'Administration'),
  ('people-and-culture-department', 'Community Development'),
  ('business-development-department', 'Business Development'),
  ('creatives-department', 'Creatives'),
  ('marketing-department', 'Marketing'),
  ('operations-department', 'Operations'),
  ('strategic-planning-department', 'Strategic Planning'),
  ('technology-department', 'Technology')
ON CONFLICT (slug) DO NOTHING;

CREATE TEMP TABLE seed (slug text, role_position int, role text, category text, position int, prompt text);
INSERT INTO seed VALUES
('member', 1, 'Member', 'Member', NULL, NULL),
  ('administrative-department', 1, 'Meeting & Documentation Officer', 'Committee Member', 1, 'Why do you want to join Administration as a Meeting & Documentation Officer?'),
  ('administrative-department', 1, 'Meeting & Documentation Officer', 'Committee Member', 2, 'Describe a time you took notes, kept records, or organized files for a group. How did you keep them accurate and easy to find?'),
  ('administrative-department', 1, 'Meeting & Documentation Officer', 'Committee Member', 3, 'You''re taking minutes and the discussion moves fast, with several people talking at once. How would you make sure the key decisions and action items are captured?'),
  ('administrative-department', 1, 'Meeting & Documentation Officer', 'Committee Member', 4, 'What tools have you used for documents and files (e.g., Google Docs, Google Drive, Notion)? How would you keep a shared drive organized?'),
  ('administrative-department', 2, 'Liaison Officer', 'Committee Member', 1, 'Why do you want to join Administration as a Liaison Officer?'),
  ('administrative-department', 2, 'Liaison Officer', 'Committee Member', 2, 'Describe a time you were the go-between for two people or groups. What did you do, and how did it turn out?'),
  ('administrative-department', 2, 'Liaison Officer', 'Committee Member', 3, 'Two departments are waiting on each other and a deadline is close. How would you get them talking and moving again?'),
  ('administrative-department', 2, 'Liaison Officer', 'Committee Member', 4, 'How would you make sure an update from the officers reaches every department clearly and on time?'),
  ('administrative-department', 3, 'Compliance Officer', 'Committee Member', 1, 'Why do you want to join Administration as a Compliance Officer?'),
  ('administrative-department', 3, 'Compliance Officer', 'Committee Member', 2, 'Describe any experience you have with policies, forms, permits, or requirements for an organization or event.'),
  ('administrative-department', 3, 'Compliance Officer', 'Committee Member', 3, 'An event is two weeks away and still needs a venue permit and school approval. How would you track what''s needed and get it done in time?'),
  ('administrative-department', 3, 'Compliance Officer', 'Committee Member', 4, 'An officer wants to skip a rule because it slows things down. How would you handle it?'),
  ('people-and-culture-department', 1, 'Associate Vice President for Community Development', 'Executive', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('people-and-culture-department', 1, 'Associate Vice President for Community Development', 'Executive', 2, 'How do you understand the relationship between Talent Development, Human Resource, and Community Expansion? How would you ensure that these functions work together toward a shared organizational direction?'),
  ('people-and-culture-department', 1, 'Associate Vice President for Community Development', 'Executive', 3, 'If you were tasked to assess the current state of Community Development, what information would you gather, what areas would you prioritize, and how would you determine which initiatives need improvement?'),
  ('people-and-culture-department', 1, 'Associate Vice President for Community Development', 'Executive', 4, 'Suppose the three teams are individually performing well, but their initiatives aren''t contributing to the overall objectives of Community Development. How would you address this situation?'),
  ('people-and-culture-department', 2, 'Talent Development Team Lead / Co-Lead', 'Lead', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('people-and-culture-department', 2, 'Talent Development Team Lead / Co-Lead', 'Lead', 2, 'How would you identify the skills and competency gaps of our members, and how would you translate those findings into a structured development program?'),
  ('people-and-culture-department', 2, 'Talent Development Team Lead / Co-Lead', 'Lead', 3, 'How would you approach developing members with different levels of experience, learning preferences, and career aspirations?'),
  ('people-and-culture-department', 2, 'Talent Development Team Lead / Co-Lead', 'Lead', 4, 'If members attend learning sessions but demonstrate little improvement in actual performance, how would you evaluate and improve the development approach?'),
  ('people-and-culture-department', 3, 'Human Resource Team Lead / Co-Lead', 'Lead', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('people-and-culture-department', 3, 'Human Resource Team Lead / Co-Lead', 'Lead', 2, 'How would you create an environment where members feel valued, supported, and motivated to contribute to the organization?'),
  ('people-and-culture-department', 3, 'Human Resource Team Lead / Co-Lead', 'Lead', 3, 'How would you handle situations involving interpersonal conflicts, disengagement, or underperforming members while maintaining fairness and accountability?'),
  ('people-and-culture-department', 3, 'Human Resource Team Lead / Co-Lead', 'Lead', 4, 'What factors do you think influence a member''s decision to stay, become actively involved, or eventually leave an organization? How would you use these insights to improve retention?'),
  ('people-and-culture-department', 4, 'Community Expansion Team Lead / Co-Lead', 'Lead', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('people-and-culture-department', 4, 'Community Expansion Team Lead / Co-Lead', 'Lead', 2, 'How would you identify potential communities, institutions, or individuals that could help expand our organization''s reach and impact?'),
  ('people-and-culture-department', 4, 'Community Expansion Team Lead / Co-Lead', 'Lead', 3, 'How would you establish and sustain relationships with regional chapters, student advocates, and industry representatives beyond one-time collaborations?'),
  ('people-and-culture-department', 4, 'Community Expansion Team Lead / Co-Lead', 'Lead', 4, 'How would you ensure that community expansion translates into meaningful engagement and opportunities rather than simply increasing our membership or network size?'),
  ('people-and-culture-department', 5, 'Talent Development Team Member (Community Relations Committee)', 'Committee Member', 1, 'Why do you want to join the Talent Development Team, and what skill would you most like to help members build?'),
  ('people-and-culture-department', 5, 'Talent Development Team Member (Community Relations Committee)', 'Committee Member', 2, 'What kind of learning session, workshop, or activity would you want to help run for members?'),
  ('people-and-culture-department', 5, 'Talent Development Team Member (Community Relations Committee)', 'Committee Member', 3, 'How would you help officers who barely know each other bond and work well together?'),
  ('people-and-culture-department', 5, 'Talent Development Team Member (Community Relations Committee)', 'Committee Member', 4, 'Describe a time you taught, mentored, or helped someone learn something. What worked?'),
  ('people-and-culture-department', 6, 'Human Resource Team Member (Community Relations Committee)', 'Committee Member', 1, 'Why do you want to join the Human Resource Team?'),
  ('people-and-culture-department', 6, 'Human Resource Team Member (Community Relations Committee)', 'Committee Member', 2, 'A new member joins and doesn''t know anyone or where to start. How would you help them settle in?'),
  ('people-and-culture-department', 6, 'Human Resource Team Member (Community Relations Committee)', 'Committee Member', 3, 'Members trust us with personal information. How would you handle their records carefully?'),
  ('people-and-culture-department', 6, 'Human Resource Team Member (Community Relations Committee)', 'Committee Member', 4, 'A member has gone quiet and stopped joining activities. How would you check in on them?'),
  ('business-development-department', 1, 'Associate Vice President for Business Development', 'Executive', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('business-development-department', 1, 'Associate Vice President for Business Development', 'Executive', 2, 'Business Development runs three committees: Partnerships, Finance, and Merchandise. How would you keep them working toward the same goals instead of competing for time and budget?'),
  ('business-development-department', 1, 'Associate Vice President for Business Development', 'Executive', 3, 'A sponsor deliverable, a budget review, and a merchandise supplier deadline all land in the same week. How would you decide what comes first and who handles each?'),
  ('business-development-department', 1, 'Associate Vice President for Business Development', 'Executive', 4, 'How would you make sure every promise made to a partner or sponsor is tracked and delivered on time?'),
  ('business-development-department', 2, 'Partnership Lead', 'Lead', 1, 'Have you ever been involved in outreach, sponsorships, or public relations for an organization or project? Please describe your role and what you accomplished.'),
  ('business-development-department', 2, 'Partnership Lead', 'Lead', 2, 'What prior experience do you have in building and maintaining professional relationships, whether with sponsors, partners, or external stakeholders?'),
  ('business-development-department', 2, 'Partnership Lead', 'Lead', 3, 'Describe any past experience you have with managing deliverables, tracking commitments, or ensuring that promised perks are provided to partners on time.'),
  ('business-development-department', 2, 'Partnership Lead', 'Lead', 4, 'What specific tools, software, or platforms do you have experience using to track contacts, manage email outreach, or organize deliverables (e.g., Google Workspace, or spreadsheets)?'),
  ('business-development-department', 3, 'Sponsorship Lead', 'Lead', 1, 'Have you ever been involved in outreach, sponsorships, or public relations for an organization or project? Please describe your role and what you accomplished.'),
  ('business-development-department', 3, 'Sponsorship Lead', 'Lead', 2, 'What prior experience do you have in building and maintaining professional relationships, whether with sponsors, partners, or external stakeholders?'),
  ('business-development-department', 3, 'Sponsorship Lead', 'Lead', 3, 'Describe any past experience you have with managing deliverables, tracking commitments, or ensuring that promised perks are provided to partners on time.'),
  ('business-development-department', 3, 'Sponsorship Lead', 'Lead', 4, 'What specific tools, software, or platforms do you have experience using to track contacts, manage email outreach, or organize deliverables (e.g., Google Workspace, or spreadsheets)?'),
  ('creatives-department', 1, 'Associate Vice President for Creatives', 'Executive', 1, 'Why do you want to join CyberPH''s Creatives department, and which area interests you most right now (e.g., graphic design, video editing/reels, event photography, or on-site decor)?'),
  ('creatives-department', 1, 'Associate Vice President for Creatives', 'Executive', 2, 'What is one creative idea, content series, or visual touch you''d love to see CyberPH try out this term?'),
  ('creatives-department', 1, 'Associate Vice President for Creatives', 'Executive', 3, 'Creatives work picks up around major events and campaign launches. Roughly how many hours a week can you realistically dedicate to org tasks, and are you available for occasional on-site events?'),
  ('creatives-department', 1, 'Associate Vice President for Creatives', 'Executive', 4, 'What creative tools or software are you familiar with? (Feel free to drop a link to any sample works, portfolio, or creative page.)'),
  ('creatives-department', 2, 'Floor Committee Lead (Documentation)', 'Lead', 1, 'Why do you want to join CyberPH''s Creatives department, and which area interests you most right now (e.g., graphic design, video editing/reels, event photography, or on-site decor)?'),
  ('creatives-department', 2, 'Floor Committee Lead (Documentation)', 'Lead', 2, 'What is one creative idea, content series, or visual touch you''d love to see CyberPH try out this term?'),
  ('creatives-department', 2, 'Floor Committee Lead (Documentation)', 'Lead', 3, 'Creatives work picks up around major events and campaign launches. Roughly how many hours a week can you realistically dedicate to org tasks, and are you available for occasional on-site events?'),
  ('creatives-department', 2, 'Floor Committee Lead (Documentation)', 'Lead', 4, 'What creative tools or software are you familiar with? (Feel free to drop a link to any sample works, portfolio, or creative page.)'),
  ('creatives-department', 3, 'Floor Committee Lead (On-site Decor)', 'Lead', 1, 'Why do you want to join CyberPH''s Creatives department, and which area interests you most right now (e.g., graphic design, video editing/reels, event photography, or on-site decor)?'),
  ('creatives-department', 3, 'Floor Committee Lead (On-site Decor)', 'Lead', 2, 'What is one creative idea, content series, or visual touch you''d love to see CyberPH try out this term?'),
  ('creatives-department', 3, 'Floor Committee Lead (On-site Decor)', 'Lead', 3, 'Creatives work picks up around major events and campaign launches. Roughly how many hours a week can you realistically dedicate to org tasks, and are you available for occasional on-site events?'),
  ('creatives-department', 3, 'Floor Committee Lead (On-site Decor)', 'Lead', 4, 'What creative tools or software are you familiar with? (Feel free to drop a link to any sample works, portfolio, or creative page.)'),
  ('creatives-department', 4, 'Creation Committee Lead (Visual Production)', 'Lead', 1, 'Why do you want to join CyberPH''s Creatives department, and which area interests you most right now (e.g., graphic design, video editing/reels, event photography, or on-site decor)?'),
  ('creatives-department', 4, 'Creation Committee Lead (Visual Production)', 'Lead', 2, 'What is one creative idea, content series, or visual touch you''d love to see CyberPH try out this term?'),
  ('creatives-department', 4, 'Creation Committee Lead (Visual Production)', 'Lead', 3, 'Creatives work picks up around major events and campaign launches. Roughly how many hours a week can you realistically dedicate to org tasks, and are you available for occasional on-site events?'),
  ('creatives-department', 4, 'Creation Committee Lead (Visual Production)', 'Lead', 4, 'What creative tools or software are you familiar with? (Feel free to drop a link to any sample works, portfolio, or creative page.)'),
  ('creatives-department', 5, 'Creation Committee Lead (Media Production)', 'Lead', 1, 'Why do you want to join CyberPH''s Creatives department, and which area interests you most right now (e.g., graphic design, video editing/reels, event photography, or on-site decor)?'),
  ('creatives-department', 5, 'Creation Committee Lead (Media Production)', 'Lead', 2, 'What is one creative idea, content series, or visual touch you''d love to see CyberPH try out this term?'),
  ('creatives-department', 5, 'Creation Committee Lead (Media Production)', 'Lead', 3, 'Creatives work picks up around major events and campaign launches. Roughly how many hours a week can you realistically dedicate to org tasks, and are you available for occasional on-site events?'),
  ('creatives-department', 5, 'Creation Committee Lead (Media Production)', 'Lead', 4, 'What creative tools or software are you familiar with? (Feel free to drop a link to any sample works, portfolio, or creative page.)'),
  ('marketing-department', 1, 'Associate Vice President for Marketing', 'Executive', 1, 'What draws you to Marketing, and what do you hope to learn or build while you''re here?'),
  ('marketing-department', 1, 'Associate Vice President for Marketing', 'Executive', 2, 'Tell us about something you''ve created or helped run, such as posts, captions, edits, or volunteer work. What was your role, and what did you take away from it? (New to this? Tell us what you''d want to try first.)'),
  ('marketing-department', 1, 'Associate Vice President for Marketing', 'Executive', 3, 'Walk us through how you handle your time during a busy school stretch, and what that would look like with Marketing work added.'),
  ('marketing-department', 1, 'Associate Vice President for Marketing', 'Executive', 4, 'Describe a time you had to learn something from scratch to get a job done. What did you do first?'),
  ('marketing-department', 2, 'Marketing Operations Lead', 'Lead', 1, 'What draws you to Marketing, and what do you hope to learn or build while you''re here?'),
  ('marketing-department', 2, 'Marketing Operations Lead', 'Lead', 2, 'Tell us about something you''ve created or helped run, such as posts, captions, edits, or volunteer work. What was your role, and what did you take away from it? (New to this? Tell us what you''d want to try first.)'),
  ('marketing-department', 2, 'Marketing Operations Lead', 'Lead', 3, 'Walk us through how you handle your time during a busy school stretch, and what that would look like with Marketing work added.'),
  ('marketing-department', 2, 'Marketing Operations Lead', 'Lead', 4, 'Describe a time you had to learn something from scratch to get a job done. What did you do first?'),
  ('marketing-department', 2, 'Marketing Operations Lead', 'Lead', 5, 'A member tells us they''re lost about an event or how to join. How would you help them, and what would you want them to feel afterward?'),
  ('marketing-department', 2, 'Marketing Operations Lead', 'Lead', 6, 'Someone leaves a rude or negative comment on our page. How would you think through your response?'),
  ('marketing-department', 2, 'Marketing Operations Lead', 'Lead', 7, 'When there''s nothing big to announce, how would you keep our page feeling alive and worth following?'),
  ('marketing-department', 3, 'Marketing Strategy Lead', 'Lead', 1, 'What draws you to Marketing, and what do you hope to learn or build while you''re here?'),
  ('marketing-department', 3, 'Marketing Strategy Lead', 'Lead', 2, 'Tell us about something you''ve created or helped run, such as posts, captions, edits, or volunteer work. What was your role, and what did you take away from it? (New to this? Tell us what you''d want to try first.)'),
  ('marketing-department', 3, 'Marketing Strategy Lead', 'Lead', 3, 'Walk us through how you handle your time during a busy school stretch, and what that would look like with Marketing work added.'),
  ('marketing-department', 3, 'Marketing Strategy Lead', 'Lead', 4, 'Describe a time you had to learn something from scratch to get a job done. What did you do first?'),
  ('marketing-department', 3, 'Marketing Strategy Lead', 'Lead', 5, 'Imagine you''re leading the look and feel of one of our events. What would you create, and what would you want attendees to feel?'),
  ('marketing-department', 3, 'Marketing Strategy Lead', 'Lead', 6, 'Think of a post you''ve seen do really well. What made it work, and how would you apply that to us?'),
  ('marketing-department', 3, 'Marketing Strategy Lead', 'Lead', 7, 'A post we expected to do well barely got seen. How would you investigate, and what would you try next?'),
  ('operations-department', 1, 'Associate Vice President for Operations', 'Executive', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('operations-department', 1, 'Associate Vice President for Operations', 'Executive', 2, 'Operations runs Event Operations, Event Planning, and the Product and Development Committee. How would you keep all three in sync before and during an event?'),
  ('operations-department', 1, 'Associate Vice President for Operations', 'Executive', 3, 'Two hours before an event, a speaker is running late, the livestream won''t connect, and guests are already arriving. How would you split these problems across the team?'),
  ('operations-department', 1, 'Associate Vice President for Operations', 'Executive', 4, 'After an event, how would you find out what went wrong and make sure the next one runs better?'),
  ('operations-department', 2, 'Event Operations Lead', 'Lead', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('operations-department', 2, 'Event Operations Lead', 'Lead', 2, 'Event Operations covers guest relations (hosts, ushers, programs) and technical operations (sound, lights, slides, livestreaming). Which side are you stronger in, and how would you lead the side you know less?'),
  ('operations-department', 2, 'Event Operations Lead', 'Lead', 3, 'The mic dies mid-talk and the livestream drops at the same time. Walk us through what your team does in the next five minutes.'),
  ('operations-department', 2, 'Event Operations Lead', 'Lead', 4, 'How would you brief hosts, ushers, and technical volunteers so everyone knows their role before the doors open?'),
  ('operations-department', 3, 'Event Planning Lead', 'Lead', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('operations-department', 3, 'Event Planning Lead', 'Lead', 2, 'Walk us through how you would build an event timeline, from the first planning meeting to event day. What has to be locked in first?'),
  ('operations-department', 3, 'Event Planning Lead', 'Lead', 3, 'A confirmed speaker cancels a week before the event. How would you handle it?'),
  ('operations-department', 3, 'Event Planning Lead', 'Lead', 4, 'How would you track supplies, equipment, and transport so nothing is missing on event day?'),
  ('operations-department', 4, 'Product and Development Committee Lead', 'Lead', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('operations-department', 4, 'Product and Development Committee Lead', 'Lead', 2, 'Members report tech issues through our Digital Helpdesk. How would you log, sort, and answer them so nothing gets lost?'),
  ('operations-department', 4, 'Product and Development Committee Lead', 'Lead', 3, 'When an issue can''t be fixed at the helpdesk, how would you escalate it, follow up, and close the loop with the member?'),
  ('operations-department', 4, 'Product and Development Committee Lead', 'Lead', 4, 'The same complaint keeps coming back. How would you find the root cause and stop it from repeating?'),
  ('strategic-planning-department', 1, 'Associate Vice President for Strategic Planning', 'Executive', 1, 'Strategic Initiatives works closely with Marketing under the Growth and Branding cluster. How would you ensure insights and programs directly fuel member acquisition and community growth? (150 words max)'),
  ('strategic-planning-department', 1, 'Associate Vice President for Strategic Planning', 'Executive', 2, 'Tell us about a time you had to build a project, framework, or initiative from scratch with minimal initial direction. What was your approach? (150 words max)'),
  ('strategic-planning-department', 1, 'Associate Vice President for Strategic Planning', 'Executive', 3, 'If you were to map out a 6-to-12-month strategic roadmap for community initiatives, what is the first major bottleneck or opportunity you would target? (150 words max)'),
  ('strategic-planning-department', 1, 'Associate Vice President for Strategic Planning', 'Executive', 4, 'How would you direct your team to identify emerging tech trends early so our community stays ahead of the curve? (150 words max)'),
  ('strategic-planning-department', 1, 'Associate Vice President for Strategic Planning', 'Executive', 5, 'How would you design a multi-part program (such as a technical training track or bootcamp) to ensure participants stay engaged from Day 1 to completion? (150 words max)'),
  ('strategic-planning-department', 2, 'Strategic Insights Lead / Co-Lead', 'Lead', 1, 'Strategic Initiatives works closely with Marketing under the Growth and Branding cluster. How would you ensure insights and programs directly fuel member acquisition and community growth? (150 words max)'),
  ('strategic-planning-department', 2, 'Strategic Insights Lead / Co-Lead', 'Lead', 2, 'Tell us about a time you had to build a project, framework, or initiative from scratch with minimal initial direction. What was your approach? (150 words max)'),
  ('strategic-planning-department', 2, 'Strategic Insights Lead / Co-Lead', 'Lead', 3, 'If you were to map out a 6-to-12-month strategic roadmap for community initiatives, what is the first major bottleneck or opportunity you would target? (150 words max)'),
  ('strategic-planning-department', 2, 'Strategic Insights Lead / Co-Lead', 'Lead', 4, 'How would you direct your team to identify emerging tech trends early so our community stays ahead of the curve? (150 words max)'),
  ('strategic-planning-department', 2, 'Strategic Insights Lead / Co-Lead', 'Lead', 5, 'How would you design a multi-part program (such as a technical training track or bootcamp) to ensure participants stay engaged from Day 1 to completion? (150 words max)'),
  ('strategic-planning-department', 3, 'Program Development Lead / Co-Lead', 'Lead', 1, 'Strategic Initiatives works closely with Marketing under the Growth and Branding cluster. How would you ensure insights and programs directly fuel member acquisition and community growth? (150 words max)'),
  ('strategic-planning-department', 3, 'Program Development Lead / Co-Lead', 'Lead', 2, 'Tell us about a time you had to build a project, framework, or initiative from scratch with minimal initial direction. What was your approach? (150 words max)'),
  ('strategic-planning-department', 3, 'Program Development Lead / Co-Lead', 'Lead', 3, 'If you were to map out a 6-to-12-month strategic roadmap for community initiatives, what is the first major bottleneck or opportunity you would target? (150 words max)'),
  ('strategic-planning-department', 3, 'Program Development Lead / Co-Lead', 'Lead', 4, 'How would you direct your team to identify emerging tech trends early so our community stays ahead of the curve? (150 words max)'),
  ('strategic-planning-department', 3, 'Program Development Lead / Co-Lead', 'Lead', 5, 'How would you design a multi-part program (such as a technical training track or bootcamp) to ensure participants stay engaged from Day 1 to completion? (150 words max)'),
  ('technology-department', 1, 'Associate Vice President for Technology', 'Executive', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, leadership experiences, and relevant competencies that qualify you for the role.'),
  ('technology-department', 1, 'Associate Vice President for Technology', 'Executive', 2, 'Technology has two committees: Technology and Engineering (apps, infrastructure, security) and Research and Innovation (tech research, new tools and product ideas). How would you get build work and research work to feed each other?'),
  ('technology-department', 1, 'Associate Vice President for Technology', 'Executive', 3, 'Research and Innovation pitches a promising tool, but Technology and Engineering is busy keeping CyberPH''s sites and accounts running. How would you decide whether and when to build it?'),
  ('technology-department', 1, 'Associate Vice President for Technology', 'Executive', 4, 'How would you help members with different skill levels grow and contribute in the department?'),
  ('technology-department', 2, 'Technology and Engineering Lead', 'Lead', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, technical projects, and relevant competencies that qualify you for the role. (Feel free to drop a link to your GitHub or portfolio.)'),
  ('technology-department', 2, 'Technology and Engineering Lead', 'Lead', 2, 'Walk us through how you would plan, build, and ship a small web app or tool for CyberPH, from the first requirement to keeping it running after launch.'),
  ('technology-department', 2, 'Technology and Engineering Lead', 'Lead', 3, 'How would you split work, review code, and keep a team of developers with mixed experience shipping on time?'),
  ('technology-department', 2, 'Technology and Engineering Lead', 'Lead', 4, 'CyberPH has shared accounts, servers, and tools used by many officers. How would you manage access so the right people have it and members who leave lose it?'),
  ('technology-department', 2, 'Technology and Engineering Lead', 'Lead', 5, 'You find out a CyberPH system may have exposed member data. What do you do in the first hour, and what do you change afterward?'),
  ('business-development-department', 4, 'Partnerships Committee', 'Committee Member', 1, 'Have you ever been involved in outreach, sponsorships, or public relations for an organization or project? Please describe your role and what you accomplished.'),
  ('business-development-department', 4, 'Partnerships Committee', 'Committee Member', 2, 'What prior experience do you have in building and maintaining professional relationships, whether with sponsors, partners, or external stakeholders?'),
  ('business-development-department', 4, 'Partnerships Committee', 'Committee Member', 3, 'Describe any past experience you have with managing deliverables, tracking commitments, or ensuring that promised perks are provided to partners on time.'),
  ('business-development-department', 4, 'Partnerships Committee', 'Committee Member', 4, 'What specific tools, software, or platforms do you have experience using to track contacts, manage email outreach, or organize deliverables (e.g., Google Workspace, or spreadsheets)?'),
  ('business-development-department', 5, 'Finance Committee', 'Committee Member', 1, 'Do you have prior experience managing budgets, tracking expenses, or organizing financial records? Please elaborate on the tools or methods you used.'),
  ('business-development-department', 5, 'Finance Committee', 'Committee Member', 2, 'Have you ever been involved in sales, product marketing, or promoting merchandise? Briefly describe your approach and the outcome.'),
  ('business-development-department', 5, 'Finance Committee', 'Committee Member', 3, 'Describe your comfort level and experience with auditing data, catching discrepancies, or ensuring accuracy in financial tracking.'),
  ('business-development-department', 5, 'Finance Committee', 'Committee Member', 4, 'Which applications or software are you most proficient in using for financial tracking, auditing, or marketing (e.g., Microsoft Excel, Google Sheets, Canva, social media analytics tools, or any accounting software)?'),
  ('business-development-department', 6, 'Merchandise Committee', 'Committee Member', 1, 'Have you ever been responsible for canvassing, requesting price quotes, or negotiating with suppliers? Please share your experience.'),
  ('business-development-department', 6, 'Merchandise Committee', 'Committee Member', 2, 'Describe any background you have in logistics, such as coordinating equipment rentals, managing physical inventory, or handling booth setups for events.'),
  ('business-development-department', 6, 'Merchandise Committee', 'Committee Member', 3, 'What experience do you have with quality control, comparing product samples, or evaluating different vendors before making an organizational purchase?'),
  ('technology-department', 3, 'Technology and Engineering Committee', 'Committee Member', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, technical projects, and relevant competencies that qualify you for the role. (Feel free to drop a link to your GitHub or portfolio.)'),
  ('technology-department', 3, 'Technology and Engineering Committee', 'Committee Member', 2, 'Which team did you pick, and what have you built, run, or secured that relates to it?'),
  ('technology-department', 3, 'Technology and Engineering Committee', 'Committee Member', 3, 'Walk us through how you would plan, build, and ship a small web app or tool for CyberPH, from the first requirement to keeping it running after launch.'),
  ('technology-department', 3, 'Technology and Engineering Committee', 'Committee Member', 4, 'CyberPH has shared accounts, servers, and tools used by many officers. How would you manage access so the right people have it and members who leave lose it?'),
  ('technology-department', 3, 'Technology and Engineering Committee', 'Committee Member', 5, 'You find out a CyberPH system may have exposed member data. What do you do in the first hour, and what do you change afterward?'),
  ('technology-department', 4, 'Research & Innovation Committee', 'Committee Member', 1, 'Relevant background and experience: discuss your academic background, previous organizational involvements, technical projects, and relevant competencies that qualify you for the role. (Feel free to drop a link to your GitHub or portfolio.)'),
  ('technology-department', 4, 'Research & Innovation Committee', 'Committee Member', 2, 'What tech topic have you been learning or researching lately, and how would you explain it to a member who is new to it?'),
  ('technology-department', 4, 'Research & Innovation Committee', 'Committee Member', 3, 'How do you check whether a source, tool, or trend is worth trusting before you share it with others?'),
  ('technology-department', 4, 'Research & Innovation Committee', 'Committee Member', 4, 'Pitch one tool or product idea that could help CyberPH or its members. Who is it for, and how would you test it?'),
  ('operations-department', 5, 'Event Operations Committee', 'Committee Member', 1, 'Why did you pick this team, and what experience do you have hosting, ushering, or handling sound, lights, or devices at events?'),
  ('operations-department', 5, 'Event Operations Committee', 'Committee Member', 2, 'A guest arrives late, can''t find their seat, and the program has already started. What do you do?'),
  ('operations-department', 5, 'Event Operations Committee', 'Committee Member', 3, 'The mic dies in the middle of a talk. What would you check first, and how would you keep the program going?'),
  ('operations-department', 5, 'Event Operations Committee', 'Committee Member', 4, 'Events can start early and run long. Are you available for on-site events, and roughly how many hours a week can you give?'),
  ('operations-department', 6, 'Event Planning Committee', 'Committee Member', 1, 'Why did you pick this team, and what have you planned or coordinated before?'),
  ('operations-department', 6, 'Event Planning Committee', 'Committee Member', 2, 'Walk us through how you would build an event timeline, from the first planning meeting to event day. What has to be locked in first?'),
  ('operations-department', 6, 'Event Planning Committee', 'Committee Member', 3, 'A confirmed speaker cancels a week before the event. How would you handle it?'),
  ('operations-department', 6, 'Event Planning Committee', 'Committee Member', 4, 'How would you track supplies, equipment, and transport so nothing is missing on event day?'),
  ('operations-department', 7, 'Product and Development Committee', 'Committee Member', 1, 'Why did you pick this team, and what experience do you have helping people with tech problems?'),
  ('operations-department', 7, 'Product and Development Committee', 'Committee Member', 2, 'Members report tech issues through our Digital Helpdesk. How would you log, sort, and answer them so nothing gets lost?'),
  ('operations-department', 7, 'Product and Development Committee', 'Committee Member', 3, 'When an issue can''t be fixed at the helpdesk, how would you escalate it, follow up, and close the loop with the member?'),
  ('operations-department', 7, 'Product and Development Committee', 'Committee Member', 4, 'The same complaint keeps coming back. How would you find the root cause and stop it from repeating?'),
  ('marketing-department', 4, 'Marketing Operations Committee', 'Committee Member', 1, 'What draws you to Marketing, and what do you hope to learn or build while you''re here?'),
  ('marketing-department', 4, 'Marketing Operations Committee', 'Committee Member', 2, 'Tell us about something you''ve created or helped run, such as posts, captions, edits, or volunteer work. What was your role, and what did you take away from it? (New to this? Tell us what you''d want to try first.)'),
  ('marketing-department', 4, 'Marketing Operations Committee', 'Committee Member', 3, 'Walk us through how you handle your time during a busy school stretch, and what that would look like with Marketing work added.'),
  ('marketing-department', 4, 'Marketing Operations Committee', 'Committee Member', 4, 'Describe a time you had to learn something from scratch to get a job done. What did you do first?'),
  ('marketing-department', 4, 'Marketing Operations Committee', 'Committee Member', 5, 'A member tells us they''re lost about an event or how to join. How would you help them, and what would you want them to feel afterward?'),
  ('marketing-department', 4, 'Marketing Operations Committee', 'Committee Member', 6, 'Someone leaves a rude or negative comment on our page. How would you think through your response?'),
  ('marketing-department', 4, 'Marketing Operations Committee', 'Committee Member', 7, 'When there''s nothing big to announce, how would you keep our page feeling alive and worth following?'),
  ('marketing-department', 5, 'Marketing Strategy Committee', 'Committee Member', 1, 'What draws you to Marketing, and what do you hope to learn or build while you''re here?'),
  ('marketing-department', 5, 'Marketing Strategy Committee', 'Committee Member', 2, 'Tell us about something you''ve created or helped run, such as posts, captions, edits, or volunteer work. What was your role, and what did you take away from it? (New to this? Tell us what you''d want to try first.)'),
  ('marketing-department', 5, 'Marketing Strategy Committee', 'Committee Member', 3, 'Walk us through how you handle your time during a busy school stretch, and what that would look like with Marketing work added.'),
  ('marketing-department', 5, 'Marketing Strategy Committee', 'Committee Member', 4, 'Describe a time you had to learn something from scratch to get a job done. What did you do first?'),
  ('marketing-department', 5, 'Marketing Strategy Committee', 'Committee Member', 5, 'Imagine you''re leading the look and feel of one of our events. What would you create, and what would you want attendees to feel?'),
  ('marketing-department', 5, 'Marketing Strategy Committee', 'Committee Member', 6, 'Think of a post you''ve seen do really well. What made it work, and how would you apply that to us?'),
  ('marketing-department', 5, 'Marketing Strategy Committee', 'Committee Member', 7, 'A post we expected to do well barely got seen. How would you investigate, and what would you try next?'),
  ('strategic-planning-department', 4, 'Strategic Insights Committee', 'Committee Member', 1, 'Strategic Initiatives works closely with Marketing under the Growth and Branding cluster. How would you ensure insights and programs directly fuel member acquisition and community growth? (150 words max)'),
  ('strategic-planning-department', 4, 'Strategic Insights Committee', 'Committee Member', 2, 'Tell us about a time you had to build a project, framework, or initiative from scratch with minimal initial direction. What was your approach? (150 words max)'),
  ('strategic-planning-department', 4, 'Strategic Insights Committee', 'Committee Member', 3, 'If you were to map out a 6-to-12-month strategic roadmap for community initiatives, what is the first major bottleneck or opportunity you would target? (150 words max)'),
  ('strategic-planning-department', 4, 'Strategic Insights Committee', 'Committee Member', 4, 'How would you direct your team to identify emerging tech trends early so our community stays ahead of the curve? (150 words max)'),
  ('strategic-planning-department', 4, 'Strategic Insights Committee', 'Committee Member', 5, 'How would you design a multi-part program (such as a technical training track or bootcamp) to ensure participants stay engaged from Day 1 to completion? (150 words max)'),
  ('strategic-planning-department', 5, 'Program Development Committee', 'Committee Member', 1, 'Strategic Initiatives works closely with Marketing under the Growth and Branding cluster. How would you ensure insights and programs directly fuel member acquisition and community growth? (150 words max)'),
  ('strategic-planning-department', 5, 'Program Development Committee', 'Committee Member', 2, 'Tell us about a time you had to build a project, framework, or initiative from scratch with minimal initial direction. What was your approach? (150 words max)'),
  ('strategic-planning-department', 5, 'Program Development Committee', 'Committee Member', 3, 'If you were to map out a 6-to-12-month strategic roadmap for community initiatives, what is the first major bottleneck or opportunity you would target? (150 words max)'),
  ('strategic-planning-department', 5, 'Program Development Committee', 'Committee Member', 4, 'How would you direct your team to identify emerging tech trends early so our community stays ahead of the curve? (150 words max)'),
  ('strategic-planning-department', 5, 'Program Development Committee', 'Committee Member', 5, 'How would you design a multi-part program (such as a technical training track or bootcamp) to ensure participants stay engaged from Day 1 to completion? (150 words max)'),
  ('creatives-department', 6, 'Floor Committee', 'Committee Member', 1, 'Why do you want to join CyberPH''s Creatives department, and which area interests you most right now (e.g., graphic design, video editing/reels, event photography, or on-site decor)?'),
  ('creatives-department', 6, 'Floor Committee', 'Committee Member', 2, 'What is one creative idea, content series, or visual touch you''d love to see CyberPH try out this term?'),
  ('creatives-department', 6, 'Floor Committee', 'Committee Member', 3, 'Creatives work picks up around major events and campaign launches. Roughly how many hours a week can you realistically dedicate to org tasks, and are you available for occasional on-site events?'),
  ('creatives-department', 6, 'Floor Committee', 'Committee Member', 4, 'What creative tools or software are you familiar with? (Feel free to drop a link to any sample works, portfolio, or creative page.)'),
  ('creatives-department', 7, 'Creation Committee', 'Committee Member', 1, 'Why do you want to join CyberPH''s Creatives department, and which area interests you most right now (e.g., graphic design, video editing/reels, event photography, or on-site decor)?'),
  ('creatives-department', 7, 'Creation Committee', 'Committee Member', 2, 'What is one creative idea, content series, or visual touch you''d love to see CyberPH try out this term?'),
  ('creatives-department', 7, 'Creation Committee', 'Committee Member', 3, 'Creatives work picks up around major events and campaign launches. Roughly how many hours a week can you realistically dedicate to org tasks, and are you available for occasional on-site events?'),
  ('creatives-department', 7, 'Creation Committee', 'Committee Member', 4, 'What creative tools or software are you familiar with? (Feel free to drop a link to any sample works, portfolio, or creative page.)');

CREATE TEMP TABLE seed_roles (slug text, role text, teams text[], interview boolean);
INSERT INTO seed_roles VALUES
('business-development-department', 'Partnerships Committee', ARRAY['Partnership / Partner Management', 'Partnership / Deliverables & Perks Officers', 'Sponsorship / Sponsorship Handlers', 'Sponsorship / Deliverables & Perks Officers'], true),
  ('business-development-department', 'Finance Committee', ARRAY['Finance and Audit', 'Sales and Product Marketing'], true),
  ('business-development-department', 'Merchandise Committee', ARRAY['Acquisition Team', 'Rentals Team', 'Canvassing Team'], true),
  ('technology-department', 'Technology and Engineering Committee', ARRAY['Software Development & Engineering', 'IT Operations & Infrastructure', 'Security & Compliance'], true),
  ('technology-department', 'Research & Innovation Committee', ARRAY['Knowledge & Discovery', 'Technology & Product Innovation'], true),
  ('operations-department', 'Event Operations Committee', ARRAY['Guest Relations / Event Hosts', 'Guest Relations / Event Ushers', 'Technical Operations / Event Technical Support'], true),
  ('operations-department', 'Event Planning Committee', ARRAY['Program Coordinator', 'Speaker Coordinator', 'Supply Chain & Logistics'], true),
  ('operations-department', 'Product and Development Committee', ARRAY['Digital Helpdesk Team', 'Resolution Hub Team'], true),
  ('marketing-department', 'Marketing Operations Committee', ARRAY['Community Engagement & Support', 'Social Media Managers'], true),
  ('marketing-department', 'Marketing Strategy Committee', ARRAY['Brand Identity & Content Research', 'Growth Analytics & Insights'], true),
  ('strategic-planning-department', 'Strategic Insights Committee', ARRAY['Member Insights Team', 'Industry Research Team', 'Data & Impact Team'], true),
  ('strategic-planning-department', 'Program Development Committee', ARRAY['Events Delivery Team', 'Academy & Certifications Team'], true),
  ('creatives-department', 'Floor Committee', ARRAY['Photographers & Videographers', 'On-site Decor'], false),
  ('creatives-department', 'Creation Committee', ARRAY['Visual Production', 'Media Production'], true),
  ('member', 'Member', NULL, false);

INSERT INTO department_roles (department_id, position, name, category, teams, interview)
SELECT DISTINCT d.id, s.role_position, s.role, s.category, t.teams, coalesce(t.interview, true)
FROM seed s JOIN departments d USING (slug) LEFT JOIN seed_roles t USING (slug, role)
WHERE NOT EXISTS (SELECT 1 FROM department_roles);

INSERT INTO department_questions (role_id, position, prompt)
SELECT r.id, s.position, s.prompt FROM seed s JOIN departments d USING (slug) JOIN department_roles r ON r.department_id = d.id AND r.name = s.role
WHERE s.prompt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM department_questions);

DROP TABLE seed, seed_roles;

-- Lock every table: RLS on with no policies. Only neondb_owner (BYPASSRLS: the app server and the admin)
-- can read or write; any other role, e.g. Data API's anonymous/authenticated, sees zero rows.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
