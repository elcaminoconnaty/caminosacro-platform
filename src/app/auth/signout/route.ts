import { NextResponse } from "next/server";
import { createPublicSchemaClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createPublicSchemaClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
