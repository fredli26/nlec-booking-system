"use client";

import dynamic from "next/dynamic";

const ResourceScheduler = dynamic(() => import("./ResourceScheduler"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-gray-500">
      Loading scheduler…
    </div>
  ),
});

export default function ClientWrapper({ role }: { role: "admin" | "viewer" | "guest" }) {
  return <ResourceScheduler role={role} />;
}
