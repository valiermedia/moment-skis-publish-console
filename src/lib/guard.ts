import { NextResponse } from "next/server";
import { auth } from "@/auth";

export interface AuthedUser {
  login: string;
}

/**
 * Gate for every API route that reads or writes. Returns the authorized user, or
 * a NextResponse to return immediately (401 not signed in / 403 not authorized).
 * Authorization = the `allowed` flag computed at sign-in (org member + repo write).
 */
export async function requireAuthorized(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  if (!session.user.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authorized", reason: session.user.accessReason ?? "no-access" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user: { login: session.user.login } };
}

/** Gate for super-admin-only routes (the settings panel). */
export async function requireAdmin(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  if (!session.user.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  }
  return { ok: true, user: { login: session.user.login } };
}

/** Current UTC timestamp as ISO string (single source for audit/QA timestamps). */
export function nowISO(): string {
  return new Date().toISOString();
}
