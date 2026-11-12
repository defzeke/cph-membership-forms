import SubmissionConfirmation from "@/app/register/submission-confirmation";
import { DEPARTMENTS } from "@/app/register/departments";

export const dynamicParams = false;

export const generateStaticParams = () => DEPARTMENTS.map((d) => ({ department: d.slug }));

export default function DepartmentSubmitPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Reach for the Sky!</h1>

        <section className="mt-4 text-sm leading-7 text-slate-700">
          <p className="font-medium text-slate-900">Stay connected with us here:</p>
          <p className="mt-3">Facebook: <a className="text-brand-700 underline" href="https://www.facebook.com/LearnCyberPH" target="_blank" rel="noopener noreferrer">https://www.facebook.com/LearnCyberPH</a></p>
          <p>LinkedIn: <a className="text-brand-700 underline" href="https://www.linkedin.com/company/cyberphilippines/posts/?feedView=all" target="_blank" rel="noopener noreferrer">https://www.linkedin.com/company/cyberphilippines/posts/?feedView=all</a></p>
          <p>Discord: our server is on the way. Stay tuned!</p>
        </section>

        <SubmissionConfirmation />
      </main>
    </div>
  );
}