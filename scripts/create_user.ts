// Crea (o actualiza la contraseña de) un usuario de acceso en Supabase Auth.
// Uso: npx tsx scripts/create_user.ts <email> <password>
// Lee credenciales de servicio desde .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Uso: tsx scripts/create_user.ts <email> <password>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`✓ Contraseña actualizada para ${email}`);
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`✓ Usuario creado: ${email}`);
  }
}

main().catch((e) => {
  console.error("Error:", e.message ?? e);
  process.exit(1);
});
