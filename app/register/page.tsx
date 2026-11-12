import { getClosedSlugs } from "@/lib/questions";

import RegisterForm from "./register-form";

export const dynamic = "force-dynamic"; // departments are opened and closed live from cph-admin

export default async function RegisterPage() {
  return <RegisterForm closed={await getClosedSlugs()} />;
}
