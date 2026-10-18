import { Sidebar } from "@/components/shell/Sidebar";
import { BarraInferior } from "@/components/shell/BarraInferior";
import { Topbar } from "@/components/shell/Topbar";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createPublicSchemaClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex bg-crema text-fg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar email={user.email ?? ""} />
        {/* En el celular: márgenes laterales más cortos y espacio abajo para la barra de pestañas. */}
        <main className="flex-1 min-w-0 px-4 md:px-6 lg:px-10 py-6 md:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">{children}</main>
      </div>
      <BarraInferior email={user.email ?? ""} />
    </div>
  );
}
