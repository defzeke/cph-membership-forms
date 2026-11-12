// Shared by the personal info page (browser) and submitApplication (server), which re-validates the cookies.
import { z } from "zod";

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Please enter a valid email address"),
  facebookLink: z
    .string()
    .trim()
    .url("Please enter a valid Facebook link")
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.hostname.toLowerCase().includes("facebook.com");
      } catch {
        return false;
      }
    }, "Please provide a valid Facebook link"),
  discordUsername: z.string().trim().min(1, "Discord username is required"),
  facebookSharedPost: z
    .string()
    .trim()
    .url("Please enter a valid Facebook link")
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.hostname.toLowerCase().includes("facebook.com");
      } catch {
        return false;
      }
    }, "Please provide a valid Facebook link to your shared post"),
  linkedinLink: z
    .string()
    .trim()
    .or(z.literal(""))
    .refine((value) => {
      if (value === "") {
        return true;
      }

      try {
        const url = new URL(value);
        return url.hostname.toLowerCase().includes("linkedin.com");
      } catch {
        return false;
      }
    }, "Please enter a valid LinkedIn link"),
  phone: z
    .string()
    .regex(/^09\d{9}$/, "Phone number must be in the format 09xxxxxxxxx"),
  courseYearSection: z
    .string()
    .trim()
    .regex(/^(BS|BA|AB)/i, "Course, year, and section must start with BS, BA, or AB"),
  certificateLink: z
    .string()
    .trim()
    .url("Please enter a valid URL")
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.hostname.toLowerCase().includes("drive.google.com");
      } catch {
        return false;
      }
    }, "Please provide a valid Google Drive link to your valid ID"),
  collegeCampus: z.string().trim().min(1, "College or campus is required"),
  membershipType: z.string().trim().min(1, "Department is required"),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const COOKIE_PREFIX = "registration_";

type PersonalInfoRecord = {
  first_name: string;
  last_name: string;
  email: string;
  facebook_link: string;
  facebook_shared_post: string;
  discord_username: string;
  linkedin_link: string | null;
  phone: string;
  course_year_section: string;
  certificate_link: string;
  college_campus: string;
};

export const toPersonalInfoRecord = (values: RegisterFormValues): PersonalInfoRecord => ({
  first_name: values.firstName,
  last_name: values.lastName,
  email: values.email,
  facebook_link: values.facebookLink,
  facebook_shared_post: values.facebookSharedPost,
  discord_username: values.discordUsername,
  linkedin_link: values.linkedinLink === "" ? null : values.linkedinLink,
  phone: values.phone,
  course_year_section: values.courseYearSection,
  certificate_link: values.certificateLink,
  college_campus: values.collegeCampus,
});

export const registerFieldNames: Array<keyof RegisterFormValues> = [
  "firstName",
  "lastName",
  "email",
  "facebookLink",
  "facebookSharedPost",
  "discordUsername",
  "linkedinLink",
  "phone",
  "courseYearSection",
  "certificateLink",
  "collegeCampus",
  "membershipType",
];
