import { cookies } from "next/headers";
import ClientWrapper from "./components/ClientWrapper";

export default async function Home() {
  const cookieStore = await cookies();
  const roleCookie = cookieStore.get("nlec_role")?.value;
  const role = (roleCookie ?? "viewer") as "admin" | "viewer" | "guest";
  return <ClientWrapper role={role} isAuthenticated={true} />;
}
