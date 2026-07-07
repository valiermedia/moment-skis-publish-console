import { userOctokit } from "./octokit";
import { config } from "./config";
import { isSuperAdmin } from "./admin";

/**
 * Authorization = GitHub org access. On sign-in we verify, using the USER's own
 * OAuth token, that they are:
 *   1. a member of GITHUB_ORG, and
 *   2. have write (push) or higher access to GITHUB_OWNER/GITHUB_REPO.
 * No separate user database, no roles.
 */

export interface AccessResult {
  login: string;
  allowed: boolean;
  isOrgMember: boolean;
  hasRepoWrite: boolean;
  isAdmin: boolean;
  reason?: string;
}

const WRITE_PERMISSIONS = new Set(["admin", "maintain", "write"]);

export async function checkAccess(accessToken: string): Promise<AccessResult> {
  const octo = userOctokit(accessToken);

  let login = "";
  try {
    const { data: me } = await octo.rest.users.getAuthenticated();
    login = me.login;
  } catch {
    return { login: "", allowed: false, isOrgMember: false, hasRepoWrite: false, isAdmin: false, reason: "could-not-identify" };
  }

  // Super-admin (e.g. valiermedia) is always allowed and gets the settings panel,
  // even before repo/App config is filled in — that's how they bootstrap the app.
  if (isSuperAdmin(login)) {
    return { login, allowed: true, isOrgMember: true, hasRepoWrite: true, isAdmin: true };
  }

  // 1. Org membership. Uses the "is the authenticated user a member" endpoint,
  // which works for the user checking their own membership (public or private).
  let isOrgMember = false;
  try {
    const res = await octo.rest.orgs.checkMembershipForUser({ org: config.org, username: login });
    // 204 = member. (Octokit types the success as 302 redirect; compare numerically.)
    isOrgMember = (res.status as number) === 204;
  } catch (e: unknown) {
    // 404 => not a member (or membership not visible). Treat as not a member.
    isOrgMember = false;
  }

  // 2. Repo write access via the collaborator-permission endpoint.
  let hasRepoWrite = false;
  try {
    const { data } = await octo.rest.repos.getCollaboratorPermissionLevel({
      owner: config.owner,
      repo: config.repo,
      username: login,
    });
    hasRepoWrite = WRITE_PERMISSIONS.has(data.permission);
  } catch {
    hasRepoWrite = false;
  }

  const allowed = isOrgMember && hasRepoWrite;
  return {
    login,
    allowed,
    isOrgMember,
    hasRepoWrite,
    isAdmin: false,
    reason: allowed ? undefined : !isOrgMember ? "not-org-member" : "no-repo-write",
  };
}
