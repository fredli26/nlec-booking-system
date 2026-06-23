import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const role = cookieStore.get("nlec_role")?.value;
  if (role !== "admin") redirect("/");
  return <AdminClient />;
}
