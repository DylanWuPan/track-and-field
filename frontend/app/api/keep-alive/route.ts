import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  // Verify this is actually being called by Vercel Cron, not a random visitor
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // or anon key, either works for this
  );

  try {
    // Any lightweight read against a real table works.
    // Swap 'events' for a table you know exists.
    const { error } = await supabase.from("event_types").select("id").limit(1);

    if (error) throw error;

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Keep-alive ping failed:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
