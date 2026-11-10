"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function Home() {
  const router = useRouter();
  const [privacyConsent, setPrivacyConsent] = useState<"consent" | "decline" | "">("");

  const handleContinue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (privacyConsent === "consent") {
      router.push("/register");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Membership Registration</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please review and acknowledge the data privacy statement before proceeding.
        </p>

        <form className="mt-8 space-y-6" onSubmit={handleContinue}>
          <fieldset className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/70 p-4">
            <legend className="px-2 text-sm font-semibold">Data Privacy Statement</legend>
            <p className="text-sm leading-6 text-slate-700">
              By selecting an option below, you confirm your choice regarding the collection and use of your personal information for membership registration and related processing.
            </p>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="privacyConsent"
                value="consent"
                className="mt-1"
                checked={privacyConsent === "consent"}
                onChange={() => setPrivacyConsent("consent")}
                required
              />
              <span>
                I acknowledge that I understand and consent to the provision of my information.
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="privacyConsent"
                value="decline"
                className="mt-1"
                checked={privacyConsent === "decline"}
                onChange={() => setPrivacyConsent("decline")}
                required
              />
              <span>I do not wish to provide my information.</span>
            </label>
          </fieldset>

          {privacyConsent === "decline" && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              You selected “I do not wish to provide my information.” Registration cannot continue.
            </p>
          )}

          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Continue to Registration Form
          </button>
        </form>
      </main>
    </div>
  );
}
