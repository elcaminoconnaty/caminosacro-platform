import { createClient } from "@supabase/supabase-js";

export function createAdminClient(schema: "comercial" | "public" = "comercial") {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema },
  });
}
