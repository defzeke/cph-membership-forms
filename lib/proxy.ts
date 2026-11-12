import type { NextRequest } from "next/server";

const REQUIRED_REGISTRATION_COOKIES = [
  "registration_firstName",
  "registration_lastName",
  "registration_email",
  "registration_facebookLink",
  "registration_discordUsername",
  "registration_phone",
  "registration_courseYearSection",
  "registration_certificateLink",
  "registration_collegeCampus",
  "registration_membershipType",
] as const;

const hasRequiredCookies = (
  cookies: NextRequest["cookies"],
  requiredKeys: readonly string[] = REQUIRED_REGISTRATION_COOKIES,
): boolean =>
  requiredKeys.every((key) => {
    const value = cookies.get(key)?.value ?? "";
    return value.trim() !== "";
  });

export const registrationGuard = {
  requiredCookies: REQUIRED_REGISTRATION_COOKIES,
  hasRequiredCookies,
};
