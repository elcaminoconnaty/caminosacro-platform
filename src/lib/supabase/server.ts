import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function makeClient(schema?: "comercial" | "public") {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies; the proxy refreshes them.
          }
        },
      },
      db: schema ? { schema } : undefined,
    },
  );
}

export const createCommercialClient = () => makeClient("comercial");
export const createPublicSchemaClient = () => makeClient("public");
