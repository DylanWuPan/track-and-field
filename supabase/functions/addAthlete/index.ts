import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import z from "https://esm.sh/zod@3.23.2";

const AddAthleteSchema = z.object({
  name: z.string().min(1),
});

type AddAthleteInput = z.infer<typeof AddAthleteSchema>;

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const parsedBody = AddAthleteSchema.safeParse(body);

    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsedBody.error.format() }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { name } = parsedBody.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from("athletes")
      .insert({ name})
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, season: data }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -X POST "https://yswwvmzncodhxafkzswz.supabase.co/functions/v1/addAthlete" \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzd3d2bXpuY29kaHhhZmt6c3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzODMwNDcsImV4cCI6MjA4MDk1OTA0N30.PbXFC1FLzN8oEiUCIuL7u662SteIEcsxuGff9icHZ9A' \
  -H "Content-Type: application/json" \
  -d '{"name": "Dylan Pan"}'    
*/
