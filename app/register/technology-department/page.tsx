"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveRecord } from "@/lib/db";

const COOKIE_PREFIX = "registration_";

type TechnologyRole =
  | "Enterprise Networking Lead"
  | "Enterprise Networking Co-Lead"
  | "CyberOps Lead"
  | "CyberOps Co-Lead"
  | "DevNet Lead"
  | "DevNet Co-Lead";

const TECHNOLOGY_ROLES: readonly TechnologyRole[] = [
  "Enterprise Networking Lead",
  "Enterprise Networking Co-Lead",
  "CyberOps Lead",
  "CyberOps Co-Lead",
  "DevNet Lead",
  "DevNet Co-Lead",
];

const DISABLED_ROLES: ReadonlySet<TechnologyRole> = new Set([
  "Enterprise Networking Lead",
  "Enterprise Networking Co-Lead",
  "CyberOps Lead",
  "CyberOps Co-Lead",
  "DevNet Lead",
  "DevNet Co-Lead",
]);

const ROLE_DESCRIPTIONS: Record<TechnologyRole, string> = {
  "Enterprise Networking Lead":
    "Mentors members through a curriculum aligned with the Cisco Certified Network Associate (CCNA), covering network fundamentals, design, configuration, security, and troubleshooting. Organizes hands-on laboratories and oversees projects that develop practical skills in managing reliable enterprise networks.",
  "Enterprise Networking Co-Lead":
    "Supports the Enterprise Networking Lead in mentoring members through a CCNA-aligned curriculum covering network fundamentals, design, configuration, security, and troubleshooting. Assists in organizing hands-on laboratories, coordinating networking activities, and guiding projects that build practical skills in designing, managing, and troubleshooting reliable enterprise networks.",
  "CyberOps Lead":
    "Mentors members through a curriculum aligned with Cisco CCNA Cybersecurity, covering threat monitoring, host and network analysis, vulnerability assessment, and incident response. Organizes security laboratories, CTF training, and projects that strengthen the team's defensive cybersecurity skills.",
  "CyberOps Co-Lead":
    "Supports the CyberOps Lead in mentoring members through a curriculum aligned with Cisco CCNA Cybersecurity, covering threat monitoring, host and network analysis, vulnerability assessment, and incident response. Assists in organizing security laboratories, CTF training, and hands-on projects that strengthen members' practical skills in defensive cybersecurity and security operations.",
  "DevNet Lead":
    "Mentors members through a curriculum aligned with Cisco CCNA Automation, formerly known as DevNet Associate, covering programming, APIs, application development, and infrastructure automation. Oversees DevNet projects and develops tools that support networking, cybersecurity, and other organizational initiatives.",
  "DevNet Co-Lead":
    "Supports the DevNet Lead in mentoring members through a curriculum aligned with Cisco CCNA Automation, formerly known as DevNet Associate, covering programming, APIs, application development, and infrastructure automation. Assists in overseeing DevNet projects and developing automation tools that support networking, cybersecurity, and other organizational initiatives.",
};

const TRACK_BY_ROLE: Record<TechnologyRole, string> = {
  "Enterprise Networking Lead": "Enterprise Networking",
  "Enterprise Networking Co-Lead": "Enterprise Networking",
  "CyberOps Lead": "CyberOps",
  "CyberOps Co-Lead": "CyberOps",
  "DevNet Lead": "DevNet",
  "DevNet Co-Lead": "DevNet",
};

const QUESTIONS_BY_TRACK: Record<string, readonly string[]> = {
  "Enterprise Networking": [
    "What experience do you have with networking concepts (e.g., OSI/TCP-IP, configuration, or troubleshooting), and how would you help members learn them?",
    "How would you design a hands-on laboratory or activity that helps members understand how a real enterprise network works?",
  ],
  CyberOps: [
    "What experience do you have with cybersecurity (e.g., CTFs, threat monitoring, or security tools), and how would you guide members in learning them?",
    "How would you prepare the team for a security challenge or incident-response exercise?",
  ],
  DevNet: [
    "What experience do you have with programming, APIs, or automation, and how would you help members build those skills?",
    "What kind of automation tool or project would you want the team to build, and how would you guide it?",
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

export default function TechnologyDepartmentPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<TechnologyRole | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const track = selectedRole ? TRACK_BY_ROLE[selectedRole] : "";

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

    const formData = new FormData(event.currentTarget);
    const questions = QUESTIONS_BY_TRACK[track];

    setIsSubmitting(true);

    const { error } = await saveRecord("registration_technology_lead_colead", {
      first_name: firstName,
      last_name: lastName,
      email,
      technology_department: track,
      applying_as: selectedRole.endsWith("Co-Lead") ? "colead" : "lead",
      expectation_answer: String(formData.get("technologyQuestion1") ?? ""),
      certifications_answer: String(formData.get("technologyQuestion2") ?? ""),
      extra_answers: { questions },
    });

    if (error) {
      setIsSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    const { error: interviewError } = await saveRecord("to_be_interviewed", {
      name: fullName,
      email,
      department: "Technology",
      team: track,
      role: selectedRole.endsWith("Co-Lead") ? "Co-Lead" : "Lead",
      status: "pending",
    });

    if (interviewError) {
      setIsSubmitting(false);
      setSubmitError(interviewError.message);
      return;
    }

    setIsSubmitting(false);

    router.push(`/register/technology-department/submit?role=${encodeURIComponent(selectedRole)}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Registration - Technology Department</h1>

        <p className="mt-4 text-sm leading-6 text-slate-700">
          The Technology Department is responsible for driving technical excellence and innovation within CNCP.
          It consists of three areas: Enterprise Networking, CyberOps, and DevNet. The department focuses on
          providing mentorship, managing projects, and organizing hands-on learning experiences.
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

            {TECHNOLOGY_ROLES.map((role) => (
              <label
                key={role}
                className={`flex items-start gap-3 text-sm ${DISABLED_ROLES.has(role) ? "text-slate-400" : ""}`}
              >
                <input
                  type="radio"
                  name="technologyRole"
                  value={role}
                  className="mt-1"
                  checked={selectedRole === role}
                  onChange={() => setSelectedRole(role)}
                  disabled={DISABLED_ROLES.has(role)}
                  required
                />
                <span>{role}</span>
                {DISABLED_ROLES.has(role) && <span className="text-xs font-medium text-slate-400">(closed)</span>}
              </label>
            ))}
          </fieldset>

          {selectedRole && (
            <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <h2 className="text-base font-semibold text-slate-900">{selectedRole}</h2>
              <p>{ROLE_DESCRIPTIONS[selectedRole]}</p>
            </section>
          )}

          {selectedRole && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <p className="text-sm font-medium text-slate-900">
                These questions are intended to give us a general sense of your interest and experience. For
                applicants who qualify, a follow-up interview will be scheduled to get to know you even better.
              </p>

              {QUESTIONS_BY_TRACK[track].map((question, index) => (
                <label key={index} className="block space-y-2 text-sm">
                  <span className="font-medium">
                    {question} <span className="text-red-600">*</span>
                  </span>
                  <textarea
                    name={`technologyQuestion${index + 1}`}
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
