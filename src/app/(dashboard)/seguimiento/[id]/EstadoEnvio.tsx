// Aviso de si un correo ya salió al cliente o todavía no.
//
// Existe porque el modo prueba creó una ambigüedad real: se mandan tres pruebas mientras
// se ajusta el texto y a los diez minutos ya no se sabe si alguna fue la de verdad. Pasó
// con la documentación de CS-2026-034. Así que el aviso no dice solo "enviado / sin
// enviar": cuando no se ha enviado pero hay pruebas, lo dice explícitamente, porque ese
// es justo el caso en el que uno cree que sí.

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export type EnvioResumen = {
  /** Cuándo salió al cliente de verdad. `null` = nunca. */
  enviadoAt: string | null;
  /** Cuántas pruebas se han mandado, y la última. Solo informativo. */
  pruebas: number;
  ultimaPruebaAt: string | null;
};

export default function EstadoEnvio({ resumen, que }: { resumen: EnvioResumen; que: string }) {
  const { enviadoAt, pruebas, ultimaPruebaAt } = resumen;

  if (enviadoAt) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-bosque/10 text-bosque font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-bosque" />
          Enviado el {fechaHora(enviadoAt)}
        </span>
        {pruebas > 0 && (
          <span className="text-[11px] text-muted">
            {pruebas === 1 ? "1 prueba antes" : `${pruebas} pruebas antes`}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Sin enviar al cliente
      </span>
      {pruebas > 0 && ultimaPruebaAt && (
        <span className="text-[11px] text-amber-700">
          {pruebas === 1 ? "Hay 1 prueba" : `Hay ${pruebas} pruebas`} (la última el{" "}
          {fechaHora(ultimaPruebaAt)}), pero {que} todavía no le ha llegado al cliente.
        </span>
      )}
    </div>
  );
}
