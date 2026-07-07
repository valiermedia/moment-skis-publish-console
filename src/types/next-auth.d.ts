import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      login: string;
      allowed: boolean;
      isOrgMember: boolean;
      hasRepoWrite: boolean;
      isAdmin: boolean;
      accessReason: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    login?: string;
    allowed?: boolean;
    isOrgMember?: boolean;
    hasRepoWrite?: boolean;
    isAdmin?: boolean;
    accessReason?: string | null;
  }
}
