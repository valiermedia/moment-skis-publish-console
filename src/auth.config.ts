import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Edge-safe base config: NO node-only imports (no fs/path). Used directly by
 * middleware.ts and spread into the full config in auth.ts. The session callback
 * (which only reads token fields) lives here so middleware can populate req.auth;
 * the jwt callback that performs the GitHub membership check (node-only) lives in
 * auth.ts.
 */
export const authConfig = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:user user:email read:org repo" } },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.login = (token.login as string) ?? "";
        session.user.allowed = Boolean(token.allowed);
        session.user.isOrgMember = Boolean(token.isOrgMember);
        session.user.hasRepoWrite = Boolean(token.hasRepoWrite);
        session.user.isAdmin = Boolean(token.isAdmin);
        session.user.accessReason = (token.accessReason as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
