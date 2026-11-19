"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { submitApplication } from "@/lib/db";

export default function MemberForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleJoin = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    const { error } = await submitApplication("member", "Member", {}, null, null);
    setIsSubmitting(false);
    if (error) {
      setSubmitError(error);
      return;
    }
    router.push("/register/member/submit?role=Member");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Join CyberPH as a member?</h1>

        <p className="mt-4 text-sm leading-6 text-slate-700">
          General members are part of CyberPH without an officer or committee role. There are no screening questions
          and no interview.
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-700">
          What members get, and how to take part, will be announced at the general onboarding. Join our Discord after
          signing up so you don&apos;t miss it.
        </p>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => router.push("/register")}
          >
            Previous
          </button>

          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={handleJoin}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Yes, I want to join"}
          </button>
        </div>

        {submitError && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
        )}
      </main>
    </div>
  );
}
