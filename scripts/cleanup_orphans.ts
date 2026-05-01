import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.storage.from("comercial-quotes").remove(["CS-2026-002.pdf"]);
  console.log({ data, error });
}
main().catch(console.error);
