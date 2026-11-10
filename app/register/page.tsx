"use client";

import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

import { saveRecord } from "@/lib/db";

const registerSchema = z.object({
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
  pupWebmail: z
    .string()
    .trim()
    .email("Please enter a valid PUP Webmail")
    .refine((value) => value.split("@")[1]?.toLowerCase() === "iskolarngbayan.pup.edu.ph", {
      message: "PUP Webmail must end with @iskolarngbayan.pup.edu.ph",
    }),
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
    }, "Please provide a valid Google Drive link for your COR"),
  collegeCampus: z.string().trim().min(1, "College or campus is required"),
  membershipType: z.string().trim().min(1, "Department is required"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const COOKIE_PREFIX = "registration_";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PERSONAL_INFO_RATE_LIMIT_WINDOW_MS = 15 * 1000;
const PERSONAL_INFO_RATE_LIMIT_STORAGE_KEY = "registration_personal_info_last_submit_at";

type PersonalInfoRecord = {
  first_name: string;
  last_name: string;
  email: string;
  facebook_link: string;
  facebook_shared_post: string;
  discord_username: string;
  linkedin_link: string | null;
  pup_webmail: string;
  phone: string;
  course_year_section: string;
  certificate_link: string;
  college_campus: string;
  membership_type: string;
};

const toPersonalInfoRecord = (values: RegisterFormValues): PersonalInfoRecord => ({
  first_name: values.firstName,
  last_name: values.lastName,
  email: values.email,
  facebook_link: values.facebookLink,
  facebook_shared_post: values.facebookSharedPost,
  discord_username: values.discordUsername,
  linkedin_link: values.linkedinLink === "" ? null : values.linkedinLink,
  pup_webmail: values.pupWebmail,
  phone: values.phone,
  course_year_section: values.courseYearSection,
  certificate_link: values.certificateLink,
  college_campus: values.collegeCampus,
  membership_type: values.membershipType,
});

const registerFieldNames: Array<keyof RegisterFormValues> = [
  "firstName",
  "lastName",
  "email",
  "facebookLink",
  "facebookSharedPost",
  "discordUsername",
  "linkedinLink",
  "pupWebmail",
  "phone",
  "courseYearSection",
  "certificateLink",
  "collegeCampus",
  "membershipType",
];

const getSavedValuesFromCookies = (): Partial<Record<keyof RegisterFormValues, string>> => {
  if (typeof document === "undefined") {
    return {};
  }

  const cookieMap = new Map(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((cookieItem) => {
        const [rawName, ...rawValue] = cookieItem.split("=");
        return [decodeURIComponent(rawName), decodeURIComponent(rawValue.join("="))] as const;
      }),
  );

  return registerFieldNames.reduce(
    (accumulator, field) => {
      accumulator[field] = cookieMap.get(`${COOKIE_PREFIX}${field}`) ?? "";
      return accumulator;
    },
    {} as Partial<Record<keyof RegisterFormValues, string>>,
  );
};

function RegisterFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormValues, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialValues] = useState<Partial<Record<keyof RegisterFormValues, string>>>(() => getSavedValuesFromCookies());

  const saveFieldToCookie = (field: keyof RegisterFormValues, value: string) => {
    document.cookie = `${encodeURIComponent(`${COOKIE_PREFIX}${field}`)}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  };

  const getDefaultValue = (field: keyof RegisterFormValues) => initialValues[field] ?? "";

  const validateField = (field: keyof RegisterFormValues, value: string) => {
    const result = registerSchema.shape[field].safeParse(value);

    setErrors((previous) => ({
      ...previous,
      [field]: result.success ? undefined : result.error.issues[0]?.message,
    }));
  };

  const handleFieldBlur = (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const field = event.currentTarget.name as keyof RegisterFormValues;
    validateField(field, event.currentTarget.value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const values = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      facebookLink: String(formData.get("facebookLink") ?? ""),
      facebookSharedPost: String(formData.get("facebookSharedPost") ?? ""),
      discordUsername: String(formData.get("discordUsername") ?? ""),
      linkedinLink: String(formData.get("linkedinLink") ?? ""),
      pupWebmail: String(formData.get("pupWebmail") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      courseYearSection: String(formData.get("courseYearSection") ?? ""),
      certificateLink: String(formData.get("certificateLink") ?? ""),
      collegeCampus: String(formData.get("collegeCampus") ?? ""),
      membershipType: String(formData.get("membershipType") ?? ""),
    };

    const result = registerSchema.safeParse(values);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        firstName: fieldErrors.firstName?.[0],
        lastName: fieldErrors.lastName?.[0],
        email: fieldErrors.email?.[0],
        facebookLink: fieldErrors.facebookLink?.[0],
        facebookSharedPost: fieldErrors.facebookSharedPost?.[0],
        discordUsername: fieldErrors.discordUsername?.[0],
        linkedinLink: fieldErrors.linkedinLink?.[0],
        pupWebmail: fieldErrors.pupWebmail?.[0],
        phone: fieldErrors.phone?.[0],
        courseYearSection: fieldErrors.courseYearSection?.[0],
        certificateLink: fieldErrors.certificateLink?.[0],
        collegeCampus: fieldErrors.collegeCampus?.[0],
        membershipType: fieldErrors.membershipType?.[0],
      });
      return;
    }

    setSubmitError(null);
    setErrors({});
    registerFieldNames.forEach((field) => {
      saveFieldToCookie(field, result.data[field]);
    });

    const now = Date.now();
    const lastSubmittedAt = Number(window.localStorage.getItem(PERSONAL_INFO_RATE_LIMIT_STORAGE_KEY) ?? "0");
    const msSinceLastSubmit = now - lastSubmittedAt;

    if (Number.isFinite(lastSubmittedAt) && msSinceLastSubmit < PERSONAL_INFO_RATE_LIMIT_WINDOW_MS) {
      const secondsRemaining = Math.ceil((PERSONAL_INFO_RATE_LIMIT_WINDOW_MS - msSinceLastSubmit) / 1000);
      setSubmitError(`Please wait ${secondsRemaining} second${secondsRemaining === 1 ? "" : "s"} before submitting again.`);
      return;
    }

    setIsSubmitting(true);

    const personalInfoPayload = toPersonalInfoRecord(result.data);

    // shortcut: old name-match update/dedupe needed a DB query; redo it in Neon.
    const { error: saveError } = await saveRecord("registration_personal_info", personalInfoPayload);

    if (saveError) {
      setIsSubmitting(false);
      setSubmitError(saveError.message);
      return;
    }

    window.localStorage.setItem(PERSONAL_INFO_RATE_LIMIT_STORAGE_KEY, String(Date.now()));

    setIsSubmitting(false);

    if (result.data.membershipType === "Technology Department") {
      router.push("/register/technology-department");
      return;
    }

    if (result.data.membershipType === "Operations Department") {
      router.push("/register/operations-department");
      return;
    }

    if (result.data.membershipType === "Creatives Department") {
      router.push("/register/creatives-department");
      return;
    }

    if (result.data.membershipType === "Marketing Department") {
      router.push("/register/marketing-department");
      return;
    }

    if (result.data.membershipType === "Relations Department") {
      router.push("/register/relations-department");
      return;
    }

    if (result.data.membershipType === "Administrative Department") {
      router.push("/register/administrative-department");
      return;
    }

    if (result.data.membershipType === "Executive Department") {
      router.push("/register/executive-department");
      return;
    }

    setErrors({
      membershipType: "This department page is not available yet. Please select Technology, Operations, Creatives, Marketing, Relations, Administrative, or Executive Department for now.",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Registration - Personal Information</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please complete this personal information section of the registration.
        </p>

        {searchParams.get("redirect") && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Before continuing to another page, please fill in all required fields here first.
          </p>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">First Name <span className="text-red-600">*</span></span>
              <input
                type="text"
                name="firstName"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                defaultValue={getDefaultValue("firstName")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.firstName && <p className="text-xs text-red-600">{errors.firstName}</p>}
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">Last Name <span className="text-red-600">*</span></span>
              <input
                type="text"
                name="lastName"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                defaultValue={getDefaultValue("lastName")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.lastName && <p className="text-xs text-red-600">{errors.lastName}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Email Address <span className="text-red-600">*</span></span>
              <input
                type="email"
                name="email"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                defaultValue={getDefaultValue("email")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Facebook Link <span className="text-red-600">*</span></span>
              <input
                type="url"
                name="facebookLink"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                placeholder="https://www.facebook.com/..."
                defaultValue={getDefaultValue("facebookLink")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.facebookLink && <p className="text-xs text-red-600">{errors.facebookLink}</p>}
            </label>

            <div className="space-y-2 text-sm sm:col-span-2">
              <div className="flex items-center gap-1.5 font-medium">
                <span>
                  Facebook Shared Post <span className="text-red-600">*</span>
                </span>
                <details className="relative inline">
                  <summary className="inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600 hover:bg-slate-300 [&::-webkit-details-marker]:hidden">
                    ?
                  </summary>
                  <span className="absolute left-0 top-5 z-10 w-64 rounded-md border border-slate-200 bg-white p-2 text-xs font-normal text-slate-600 shadow-lg">
                    The link to your shared post of CNCP&apos;s Recruitment
                  </span>
                </details>
              </div>
              <input
                type="url"
                name="facebookSharedPost"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                placeholder="https://www.facebook.com/..."
                defaultValue={getDefaultValue("facebookSharedPost")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.facebookSharedPost && <p className="text-xs text-red-600">{errors.facebookSharedPost}</p>}
            </div>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Discord Username <span className="text-red-600">*</span></span>
              <input
                type="text"
                name="discordUsername"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                defaultValue={getDefaultValue("discordUsername")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.discordUsername && <p className="text-xs text-red-600">{errors.discordUsername}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">LinkedIn Link</span>
              <input
                type="url"
                name="linkedinLink"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                placeholder="https://www.linkedin.com/in/..."
                defaultValue={getDefaultValue("linkedinLink")}
                onBlur={handleFieldBlur}
              />
              {errors.linkedinLink && <p className="text-xs text-red-600">{errors.linkedinLink}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">PUP Webmail <span className="text-red-600">*</span></span>
              <input
                type="email"
                name="pupWebmail"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                defaultValue={getDefaultValue("pupWebmail")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.pupWebmail && <p className="text-xs text-red-600">{errors.pupWebmail}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Phone Number <span className="text-red-600">*</span></span>
              <input
                type="tel"
                name="phone"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                inputMode="numeric"
                pattern="09[0-9]{9}"
                minLength={11}
                maxLength={11}
                placeholder="09xxxxxxxxx"
                title="Phone number must be in the format 09xxxxxxxxx"
                defaultValue={getDefaultValue("phone")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Course, Year, and Section <span className="text-red-600">*</span></span>
              <input
                type="text"
                name="courseYearSection"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                placeholder="e.g. BSCpE 2-5"
                defaultValue={getDefaultValue("courseYearSection")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.courseYearSection && <p className="text-xs text-red-600">{errors.courseYearSection}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Certificate of Registration/Enrollment <span className="text-red-600">*</span></span>
              <input
                type="url"
                name="certificateLink"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                placeholder="https://drive.google.com/..."
                defaultValue={getDefaultValue("certificateLink")}
                onBlur={handleFieldBlur}
                required
              />
              {errors.certificateLink && <p className="text-xs text-red-600">{errors.certificateLink}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Which PUP college/campus do you belong to? <span className="text-red-600">*</span></span>
              <select
                name="collegeCampus"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                required
                defaultValue={getDefaultValue("collegeCampus")}
                onBlur={handleFieldBlur}
              >
                <option value="" disabled>
                  Select college/campus
                </option>
                <option value="College of Accountancy and Finance (CAF)">College of Accountancy and Finance (CAF)</option>
                <option value="College of Architecture, Design and the Built Environment (CADBE)">College of Architecture, Design and the Built Environment (CADBE)</option>
                <option value="College of Arts and Letters (CAL)">College of Arts and Letters (CAL)</option>
                <option value="College of Business Administration (CBA)">College of Business Administration (CBA)</option>
                <option value="College of Communication (COC)">College of Communication (COC)</option>
                <option value="College of Computer and Information Sciences (CCIS)">College of Computer and Information Sciences (CCIS)</option>
                <option value="College of Education (COED)">College of Education (COED)</option>
                <option value="College of Engineering (CE)">College of Engineering (CE)</option>
                <option value="College of Human Kinetics (CHK)">College of Human Kinetics (CHK)</option>
                <option value="College of Law (COL)">College of Law (COL)</option>
                <option value="College of Political Science and Public Administration (CPSPA)">College of Political Science and Public Administration (CPSPA)</option>
                <option value="College of Social Sciences and Development (CSSD)">College of Social Sciences and Development (CSSD)</option>
                <option value="College of Science (CS)">College of Science (CS)</option>
                <option value="College of Tourism, Hospitality and Transportation Management (CTHTM)">College of Tourism, Hospitality and Transportation Management (CTHTM)</option>
                <option value="Institute of Technology (ITECH)">Institute of Technology (ITECH)</option>
                <option value="Open University System (OU)">Open University System (OU)</option>
                <option value="Laboratory High School">Laboratory High School</option>
                <option value="Senior High School">Senior High School</option>
                <option value="Alfonso, Cavite">Alfonso, Cavite</option>
                <option value="Bansud, Oriental Mindoro">Bansud, Oriental Mindoro</option>
                <option value="Bataan">Bataan</option>
                <option value="Biñan, Laguna">Biñan, Laguna</option>
                <option value="Cabiao, Nueva Ecija">Cabiao, Nueva Ecija</option>
                <option value="Calauan, Laguna">Calauan, Laguna</option>
                <option value="General Luna, Quezon">General Luna, Quezon</option>
                <option value="Leyte">Leyte</option>
                <option value="Lopez, Quezon">Lopez, Quezon</option>
                <option value="Maragondon, Cavite">Maragondon, Cavite</option>
                <option value="Mulanay, Quezon">Mulanay, Quezon</option>
                <option value="Parañaque City">Parañaque City</option>
                <option value="Pulilan, Bulacan">Pulilan, Bulacan</option>
                <option value="Quezon City">Quezon City</option>
                <option value="Ragay, Camarines Sur">Ragay, Camarines Sur</option>
                <option value="Sablayan, Occidental Mindoro">Sablayan, Occidental Mindoro</option>
                <option value="San Juan City">San Juan City</option>
                <option value="San Pedro, Laguna">San Pedro, Laguna</option>
                <option value="Sta. Maria, Bulacan">Sta. Maria, Bulacan</option>
                <option value="Sta. Rosa, Laguna">Sta. Rosa, Laguna</option>
                <option value="Sto. Tomas, Batangas">Sto. Tomas, Batangas</option>
                <option value="Taguig City">Taguig City</option>
                <option value="Unisan, Quezon">Unisan, Quezon</option>
              </select>
              {errors.collegeCampus && <p className="text-xs text-red-600">{errors.collegeCampus}</p>}
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="font-medium">Which department would you like to apply to as a executive/lead? <span className="text-red-600">*</span></span>
              <select
                name="membershipType"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                required
                defaultValue={getDefaultValue("membershipType")}
                onBlur={handleFieldBlur}
              >
                <option value="" disabled>
                  Select department
                </option>
                <option value="Technology Department" disabled>
                  Technology Department (closed)
                </option>
                <option value="Operations Department" disabled>
                  Operations Department (closed)
                </option>
                <option value="Creatives Department" disabled>
                  Creatives Department (closed)
                </option>
                <option value="Marketing Department">Marketing Department</option>
                <option value="Relations Department" disabled>
                  Relations Department (closed)
                </option>
                <option value="Administrative Department" disabled>
                  Administrative Department (closed)
                </option>
                <option value="Executive Department">Executive Department</option>
              </select>
              {errors.membershipType && <p className="text-xs text-red-600">{errors.membershipType}</p>}
            </label>
          </div>

          {submitError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100" />}>
      <RegisterFormPage />
    </Suspense>
  );
}
