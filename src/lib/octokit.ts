import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { config, githubAppPrivateKey } from "./config";

/**
 * The GitHub App installation client. ALL repo writes (merges, reverts to
 * staging/live/person-branches) go through this — never a user token. Gated
 * upstream by the org-membership + repo-write check in auth.
 *
 * We also expose a way to build a per-user client from an OAuth token, used ONLY
 * for read checks (membership / permission) during sign-in.
 */

// Built fresh each call (not memoized) so an in-app change to the App id / key /
// installation takes effect immediately without a restart.
export function appOctokit(): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: githubAppPrivateKey(),
      installationId: config.installationId,
    },
  });
}

/** A short-lived installation access token, for git-over-HTTPS pushes. */
export async function installationToken(): Promise<string> {
  const auth = createAppAuth({
    appId: config.appId,
    privateKey: githubAppPrivateKey(),
    installationId: config.installationId,
  });
  const { token } = await auth({ type: "installation" });
  return token;
}

/** Authenticated remote URL the server clone pushes through (App installation). */
export async function authedRemoteUrl(): Promise<string> {
  const token = await installationToken();
  // x-access-token is the documented username for installation tokens.
  return `https://x-access-token:${token}@github.com/${config.owner}/${config.repo}.git`;
}

export function userOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}
