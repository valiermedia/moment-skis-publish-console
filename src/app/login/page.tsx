import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";
import { C } from "@/lib/ui";
import { Globe } from "lucide-react";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.allowed) redirect("/");
  if (session?.user && !session.user.allowed) redirect("/request-access");

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
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
        }}
      >
        <span
          className="inline-flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 11, background: C.ink, marginBottom: 16 }}
        >
          <Globe size={22} color="#fff" />
        </span>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: C.accent,
            fontWeight: 600,
          }}
        >
          Publish
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: "4px 0 8px" }}>Sign in to publish</h1>
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, margin: "0 0 24px" }}>
          Move your theme changes up to staging and out to the live site. Sign in with the GitHub
          account that has access to the store&apos;s theme.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 font-medium"
            style={{
              width: "100%",
              background: C.ink,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Sign in with GitHub
          </button>
        </form>
      </div>
    </div>
  );
}
