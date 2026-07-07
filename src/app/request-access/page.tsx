import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { config } from "@/lib/config";
import { C } from "@/lib/ui";
import { Lock } from "lucide-react";

export default async function RequestAccessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.allowed) redirect("/");

  const reason = session.user.accessReason;
  const message =
    reason === "not-org-member"
      ? `Your GitHub account isn't a member of the ${config.org} organization yet.`
      : reason === "no-repo-write"
        ? `You're in the ${config.org} organization, but you don't have write access to the ${config.repo} theme repository yet.`
        : "Your account doesn't have access to the store's theme yet.";

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        color: C.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: C.paper,
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          padding: 32,
          maxWidth: 460,
          width: "100%",
          textAlign: "center",
        }}
      >
        <span
          className="inline-flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 11, background: C.warnBg, marginBottom: 16 }}
        >
          <Lock size={22} color={C.warnFg} />
        </span>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: "0 0 8px" }}>Access needed</h1>
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, margin: "0 0 8px" }}>
          Signed in as <strong>{session.user.login || session.user.name}</strong>. {message}
        </p>
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, margin: "0 0 24px" }}>
          Ask an operator to add you, then reload this page. Access is granted through GitHub — there
          is nothing to set up here.
        </p>
        <div className="flex items-center justify-center gap-2">
          <a
            href="/request-access"
            className="inline-flex items-center justify-center font-medium"
            style={{
              background: C.ink,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 14.5,
              textDecoration: "none",
            }}
          >
            Check again
          </a>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="inline-flex items-center justify-center font-medium"
              style={{
                background: "transparent",
                color: C.muted,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 14.5,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
