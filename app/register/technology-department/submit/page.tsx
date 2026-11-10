import SubmissionConfirmation from "@/app/register/submission-confirmation";

export default function TechnologyDepartmentSubmitPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 px-4 py-6 font-sans text-zinc-900">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100 bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Reach for the Sky!</h1>

        <p className="mt-4 text-sm leading-7 text-slate-700">
          To help your application soar, follow us on our socials and share our recruitment announcement on
          Facebook using this link: <a className="font-medium text-brand-700 underline" href="https://tinyurl.com/37n79rdn" target="_blank" rel="noopener noreferrer">https://tinyurl.com/37n79rdn</a>. Make sure your post is set to public so our community can spot you.
        </p>

        <section className="mt-6 text-sm leading-7 text-slate-700">
          <p className="font-medium text-slate-900">Stay connected with us here:</p>
          <p className="mt-3">Instagram: <a className="text-brand-700 underline" href="https://www.instagram.com/cncp_mnl/" target="_blank" rel="noopener noreferrer">https://www.instagram.com/cncp_mnl/</a></p>
          <p>Twitter/X: <a className="text-brand-700 underline" href="https://x.com/cncp_mnl" target="_blank" rel="noopener noreferrer">https://x.com/cncp_mnl</a></p>
          <p>LinkedIn: <a className="text-brand-700 underline" href="https://www.linkedin.com/company/cncp-mnl" target="_blank" rel="noopener noreferrer">https://www.linkedin.com/company/cncp-mnl</a></p>
          <p>YouTube: <a className="text-brand-700 underline" href="https://youtube.com/@cncp_mnl" target="_blank" rel="noopener noreferrer">https://youtube.com/@cncp_mnl</a></p>
        </section>

        <SubmissionConfirmation />
      </main>
    </div>
  );
}