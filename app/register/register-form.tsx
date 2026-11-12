"use client";

import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DEPARTMENTS } from "@/app/register/departments";
import { COOKIE_PREFIX, registerFieldNames, registerSchema, type RegisterFormValues } from "@/app/register/personal-info";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

function RegisterFormPage({ closed }: { closed: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormValues, string>>>({});
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
        phone: fieldErrors.phone?.[0],
        courseYearSection: fieldErrors.courseYearSection?.[0],
        certificateLink: fieldErrors.certificateLink?.[0],
        collegeCampus: fieldErrors.collegeCampus?.[0],
        membershipType: fieldErrors.membershipType?.[0],
      });
      return;
    }

    setErrors({});
    registerFieldNames.forEach((field) => {
      saveFieldToCookie(field, result.data[field]);
    });

    // Nothing is saved to the database yet: the cookies above carry these answers until the
    // department form is submitted.
    const department = DEPARTMENTS.find((d) => d.name === result.data.membershipType && !closed.includes(d.slug));
    if (department) {
      router.push(`/register/${department.slug}`);
      return;
    }

    setErrors({ membershipType: "Please select an open department." });
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
                    The link to your shared post of CyberPH&apos;s Recruitment
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
              <span className="font-medium">Valid ID (school or government ID) <span className="text-red-600">*</span></span>
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
              <span className="font-medium">Which college/campus do you belong to? <span className="text-red-600">*</span></span>
              <input
                type="text"
                name="collegeCampus"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                placeholder="e.g. College of Engineering (CE)"
                defaultValue={getDefaultValue("collegeCampus")}
                onBlur={handleFieldBlur}
                required
              />
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
                {DEPARTMENTS.map((d) => (
                  <option key={d.slug} value={d.name} disabled={closed.includes(d.slug)}>
                    {d.name}
                    {closed.includes(d.slug) ? " (closed)" : ""}
                  </option>
                ))}
              </select>
              {errors.membershipType && <p className="text-xs text-red-600">{errors.membershipType}</p>}
            </label>
          </div>

          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Continue
          </button>
        </form>
      </main>
    </div>
  );
}

// `closed` comes from the server page (departments.closed in the database).
export default function RegisterForm({ closed }: { closed: string[] }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100" />}>
      <RegisterFormPage closed={closed} />
    </Suspense>
  );
}
