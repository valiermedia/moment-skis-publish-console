import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminSettings from "@/components/AdminSettings";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/");
  return <AdminSettings admin={session.user.login || session.user.name || "admin"} />;
}
