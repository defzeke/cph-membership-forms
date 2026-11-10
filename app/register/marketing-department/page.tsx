"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveRecord } from "@/lib/db";

const COOKIE_PREFIX = "registration_";

const MARKETING_OFFICER_ROLES = [
  "Chief Marketing Officer",
  "Vice Chief Marketing Officer",
] as const;

const MARKETING_QUESTIONS_BY_ROLE: Record<(typeof MARKETING_OFFICER_ROLES)[number], readonly string[]> = {
  "Chief Marketing Officer": [
    "What does leading a marketing team look like to you, and how would you set the direction for CNCP's brand?",
    "Tell us about a time you led or took charge of a project or activity from start to finish.",
  ],
  "Vice Chief Marketing Officer": [
    "How would you help the Chief Marketing Officer plan and pace the team's content and campaigns?",
    "If two team members had different ideas for a campaign, how would you help them move forward?",
  ],
};

const getRegistrationCookieValue = (key: string) => {
  if (typeof document === "undefined") {
    return "";
  }

  const cookies = new Map(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((cookieItem) => {
        const [rawName, ...rawValue] = cookieItem.split("=");
        return [decodeURIComponent(rawName), decodeURIComponent(rawValue.join("="))] as const;
      }),
  );

  return cookies.get(`${COOKIE_PREFIX}${key}`) ?? "";
};

export default function MarketingDepartmentPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!event.currentTarget.reportValidity()) {
      return;
    }

    setSubmitError(null);

    const firstName = getRegistrationCookieValue("firstName");
    const lastName = getRegistrationCookieValue("lastName");
    const email = getRegistrationCookieValue("email");
    const fullName = `${firstName} ${lastName}`.trim();

    if (!firstName || !lastName || !email) {
      setSubmitError("Missing personal information. Please complete the Personal Information page first.");
      return;
    }

    if (!selectedRole) {
      setSubmitError("Please select a role before submitting.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const questionAnswers = {
      leadershipQuestion1: String(formData.get("marketingQuestion1") ?? ""),
      leadershipQuestion2: String(formData.get("marketingQuestion2") ?? ""),
    };

    const { error } = await saveRecord("registration_marketing_department", {
      first_name: firstName,
      last_name: lastName,
      email,
      team: "",
      application_role: selectedRole,
      question_answers: questionAnswers,
    });

    if (error) {
      setIsSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    const { error: interviewError } = await saveRecord("to_be_interviewed", {
      name: fullName,
      email,
      department: "Marketing",
      team: "",
      role: selectedRole,
      status: "pending",
    });

    if (interviewError) {
      setIsSubmitting(false);
      setSubmitError(interviewError.message);
      return;
    }

    setIsSubmitting(false);

    router.push(`/register/marketing-department/submit?role=${encodeURIComponent(selectedRole)}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Registration - Marketing Department</h1>

        <p className="mt-4 text-sm leading-6 text-slate-700">
          The Marketing Department is responsible for strategizing and executing initiatives that drive brand
          awareness, customer engagement, and market growth. They ensure that CNCP&apos;s brand message is
          consistent, engaging, and effectively targeted to our audiences.
        </p>

        <p className="mt-4 text-sm leading-6 text-slate-700">
          For detailed information on each department role, you can refer to{" "}
          <a
            className="font-medium text-brand-700 underline"
            href="https://docs.google.com/document/d/1dU6wpyFiGRfjeYCiymvxjvigK2m3VN2BdRBaZOwL8ww/edit?tab=t.0#heading=h.vixkji6185jn"
            target="_blank"
            rel="noopener noreferrer"
          >
            this primer
          </a>.
        </p>

        <form className="mt-6 space-y-4 text-sm" onSubmit={handleSubmit}>
          <fieldset className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/70 p-4 sm:col-span-2">
            <legend className="px-2 text-sm font-semibold">
              What position would you like to apply for? <span className="text-red-600">*</span>
            </legend>

            {MARKETING_OFFICER_ROLES.map((role) => (
              <label key={role} className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="marketingRole"
                  value={role}
                  className="mt-1"
                  checked={selectedRole === role}
                  onChange={() => setSelectedRole(role)}
                  required
                />
                <span>{role}</span>
              </label>
            ))}
          </fieldset>

          {selectedRole && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <p className="text-sm font-medium text-slate-900">
                These questions are intended to give us a general sense of your interest and experience. For
                applicants who qualify, a follow-up interview will be scheduled to get to know you even better.
              </p>

              {MARKETING_QUESTIONS_BY_ROLE[selectedRole as (typeof MARKETING_OFFICER_ROLES)[number]].map(
                (question, index) => (
                  <label key={index} className="block space-y-2 text-sm">
                    <span className="font-medium">
                      {question} <span className="text-red-600">*</span>
                    </span>
                    <textarea
                      name={`marketingQuestion${index + 1}`}
                      className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                      required
                    />
                  </label>
                ),
              )}
            </section>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => router.push("/register")}
            >
              Previous
            </button>

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Submit"}
            </button>
          </div>

          {submitError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
