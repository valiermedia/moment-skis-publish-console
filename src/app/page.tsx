import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Console from "@/components/Console";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.allowed) redirect("/request-access");

  return (
    <Console
      currentLogin={session.user.login || session.user.name || "you"}
      isAdmin={session.user.isAdmin}
    />
  );
}
