"use server";

import { redirect } from "next/navigation";

import { logoutCurrentSession } from "@platform/core/auth";

/** Ordinary logout: revokes the current session row and clears the cookie. */
export async function logoutAction(): Promise<void> {
  await logoutCurrentSession();
  redirect("/login");
}
