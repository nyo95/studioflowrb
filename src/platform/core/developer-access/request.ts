import { cookies } from "next/headers";

export const DEVELOPER_COOKIE_NAME = "sf_developer";

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/system",
    expires,
  };
}

export async function getDeveloperSessionCookie(): Promise<string | null> {
  const value = (await cookies()).get(DEVELOPER_COOKIE_NAME)?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function setDeveloperSessionCookie(rawToken: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(DEVELOPER_COOKIE_NAME, rawToken, cookieOptions(expiresAt));
}

export async function clearDeveloperSessionCookie(): Promise<void> {
  const expired = new Date(0);
  (await cookies()).set(DEVELOPER_COOKIE_NAME, "", cookieOptions(expired));
}
