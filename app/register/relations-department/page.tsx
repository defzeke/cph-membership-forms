"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveRecord } from "@/lib/db";

const COOKIE_PREFIX = "registration_";

const RELATIONS_OFFICER_ROLES = [
  "Chief Relations Officer",
  "Vice Chief Relations Officer",
] as const;

const RELATIONS_QUESTIONS_BY_ROLE: Record<(typeof RELATIONS_OFFICER_ROLES)[number], readonly string[]> = {
  "Chief Relations Officer": [
    "How would you lead the Relations team in building partnerships and keeping members engaged?",
    "Describe a time you represented a group or helped connect people to work together. How did it go?",
  ],
  "Vice Chief Relations Officer": [
    "How would you support the Chief Relations Officer in coordinating the team's activities?",
    "How would you handle feedback or concerns from members about the organization?",
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

// ponytail: team selection and questions removed for now; will be rebuilt later
export default function RelationsDepartmentPage() {
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
      leadershipQuestion1: String(formData.get("relationsQuestion1") ?? ""),
      leadershipQuestion2: String(formData.get("relationsQuestion2") ?? ""),
    };

    const { error } = await saveRecord("registration_relations_department", {
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
      department: "Relations",
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

    router.push(`/register/relations-department/submit?role=${encodeURIComponent(selectedRole)}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Registration - Relations Department</h1>

        <p className="mt-4 text-sm leading-6 text-slate-700">
          The Relations Department focuses on building and strengthening partnerships and fostering a positive,
          engaged community within the organization.
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

            {RELATIONS_OFFICER_ROLES.map((role) => (
              <label key={role} className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="relationsRole"
                  value={role}
                  className="mt-1"
                  checked={selectedRole === role}
                  onChange={() => setSelectedRole(role)}
                  disabled={role === "Chief Relations Officer"}
                  required
                />
                <span className={role === "Chief Relations Officer" ? "text-slate-400" : undefined}>{role}</span>
              </label>
            ))}
          </fieldset>

          {selectedRole && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <p className="text-sm font-medium text-slate-900">
                These questions are intended to give us a general sense of your interest and experience. For
                applicants who qualify, a follow-up interview will be scheduled to get to know you even better.
              </p>

              {RELATIONS_QUESTIONS_BY_ROLE[selectedRole as (typeof RELATIONS_OFFICER_ROLES)[number]].map(
                (question, index) => (
                  <label key={index} className="block space-y-2 text-sm">
                    <span className="font-medium">
                      {question} <span className="text-red-600">*</span>
                    </span>
                    <textarea
                      name={`relationsQuestion${index + 1}`}
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
