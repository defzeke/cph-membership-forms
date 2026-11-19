import { notFound, redirect } from "next/navigation";

import { getDepartment } from "@/app/register/departments";
import { getClosedSlugs, getOpenSlots, getRolesAndQuestions } from "@/lib/questions";

import DepartmentForm from "./department-form";
import MemberForm from "./member-form";

export const dynamic = "force-dynamic"; // roles and questions are edited live in the database

export default async function DepartmentPage({ params }: { params: Promise<{ department: string }> }) {
  const { department } = await params;
  if (!getDepartment(department)) notFound();
  if ((await getClosedSlugs()).includes(department)) redirect("/register"); // closed in cph-admin
  if (department === "member") return <MemberForm />;
  const [{ roles, questions }, slots] = await Promise.all([getRolesAndQuestions(department), getOpenSlots(department)]);
  return <DepartmentForm slug={department} roles={roles} questions={questions} slots={slots} />;
}
