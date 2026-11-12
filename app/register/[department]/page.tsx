import { notFound, redirect } from "next/navigation";

import { getDepartment } from "@/app/register/departments";
import { getClosedSlugs, getRolesAndQuestions } from "@/lib/questions";

import DepartmentForm from "./department-form";

export const dynamic = "force-dynamic"; // roles and questions are edited live in the database

export default async function DepartmentPage({ params }: { params: Promise<{ department: string }> }) {
  const { department } = await params;
  if (!getDepartment(department)) notFound();
  if ((await getClosedSlugs()).includes(department)) redirect("/register"); // closed in cph-admin
  const { roles, questions } = await getRolesAndQuestions(department);
  return <DepartmentForm slug={department} roles={roles} questions={questions} />;
}
