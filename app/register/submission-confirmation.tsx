"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SubmissionConfirmationContent() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role");

  return (
    <p className="mt-6 text-sm leading-7 text-slate-700">
      {role
        ? `You have successfully submitted your application for the role of ${role}.`
        : "You have successfully submitted your application."}
    </p>
  );
}

export default function SubmissionConfirmation() {
  return (
    <Suspense>
      <SubmissionConfirmationContent />
    </Suspense>
  );
}
