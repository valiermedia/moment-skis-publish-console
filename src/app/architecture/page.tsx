import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readPipeline } from "@/lib/architecture";
import PipelineFlow from "@/components/architecture/PipelineFlow";
import { AC, ARCH_FONT } from "@/lib/arch-ui";

export const dynamic = "force-dynamic";

export default async function ArchitecturePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.allowed) redirect("/request-access");

  const pipeline = readPipeline();

  if (!pipeline) {
    return (
      <div style={{ background: AC.bg, minHeight: "100vh", fontFamily: ARCH_FONT, color: AC.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Architecture map not generated yet</h1>
          <p style={{ color: AC.muted, lineHeight: 1.6, marginTop: 8 }}>
            Run <code>./refresh-architecture.sh</code>, commit <code>data/architecture/*.json</code>, and deploy.
          </p>
          <a href="/" style={{ color: AC.accent }}>← Back to the console</a>
        </div>
      </div>
    );
  }

  return <PipelineFlow pipeline={pipeline} />;
}
