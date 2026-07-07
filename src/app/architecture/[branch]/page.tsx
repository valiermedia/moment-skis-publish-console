import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { readBranch, readPipeline } from "@/lib/architecture";
import ThemeFlow from "@/components/architecture/ThemeFlow";

export const dynamic = "force-dynamic";

export default async function BranchArchitecturePage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.allowed) redirect("/request-access");

  const { branch } = await params;
  const data = readBranch(branch);
  if (!data) notFound();

  const pipeline = readPipeline();
  const label = pipeline?.nodes.find((n) => n.branch === branch)?.label ?? branch;

  return <ThemeFlow data={data} branchLabel={label} />;
}
