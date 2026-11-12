"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getDepartment } from "@/app/register/departments";
import { submitApplication } from "@/lib/db";
import type { Question } from "@/lib/questions";

// Takes the slug, not the config object, so only plain data crosses the server/client boundary.
export default function DepartmentForm({
  slug,
  roles,
  questions,
}: {
  slug: string;
  roles: string[];
  questions: Question[];
}) {
  const department = getDepartment(slug)!;
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const roleQuestions = questions.filter((q) => q.role === selectedRole);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!event.currentTarget.reportValidity()) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const answers = Object.fromEntries(roleQuestions.map((q) => [q.id, String(formData.get(`question-${q.id}`) ?? "")]));
    const { error } = await submitApplication(department.slug, selectedRole, answers);

    setIsSubmitting(false);
    if (error) {
      setSubmitError(error);
      return;
    }

    router.push(`/register/${department.slug}/submit?role=${encodeURIComponent(selectedRole)}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Registration - {department.name}</h1>

        <p className="mt-4 text-sm leading-6 text-slate-700">{department.description}</p>

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

            {roles.map((role) => (
              <label key={role} className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="role"
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

          {roleQuestions.length > 0 && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <p className="text-sm font-medium text-slate-900">
                These questions are intended to give us a general sense of your interest and experience. For
                applicants who qualify, a follow-up interview will be scheduled to get to know you even better.
              </p>

              {roleQuestions.map((question) => (
                <label key={question.id} className="block space-y-2 text-sm">
                  <span className="font-medium">
                    {question.prompt} <span className="text-red-600">*</span>
                  </span>
                  <textarea
                    name={`question-${question.id}`}
                    maxLength={5000}
                    className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500"
                    required
                  />
                </label>
              ))}
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
