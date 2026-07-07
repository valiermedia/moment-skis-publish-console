import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { checkAccess } from "@/lib/github-access";

/**
 * Full (node-runtime) auth. Identity = GitHub OAuth. Authorization = GitHub org
 * access, checked with the user's own token at sign-in inside the jwt callback.
 * We DO NOT persist the user's GitHub token — it's used once to compute the
 * allowed/isOrgMember/hasRepoWrite flags, which are all we keep. Actual repo
 * writes go through the GitHub App, gated by `allowed`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // account.access_token is only present on initial sign-in.
      if (account?.access_token) {
        const access = await checkAccess(account.access_token);
        token.login = access.login || (profile?.login as string) || "";
        token.allowed = access.allowed;
        token.isOrgMember = access.isOrgMember;
        token.hasRepoWrite = access.hasRepoWrite;
        token.isAdmin = access.isAdmin;
        token.accessReason = access.reason ?? null;
        // deliberately NOT storing account.access_token
      }
      return token;
    },
  },
});
