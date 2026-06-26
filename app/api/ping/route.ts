import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Called daily by Vercel cron (vercel.json) to keep Supabase free tier active
export async function GET() {
  const { error } = await supabase.from("access_codes").select("id").eq("id", 1).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
