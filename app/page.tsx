import { cookies } from "next/headers";
import ClientWrapper from "./components/ClientWrapper";

export default async function Home() {
  const cookieStore = await cookies();
  const role = (cookieStore.get("nlec_role")?.value ?? "viewer") as "admin" | "viewer" | "guest";
  return <ClientWrapper role={role} />;
}
