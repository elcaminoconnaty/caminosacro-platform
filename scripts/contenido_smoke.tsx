/**
 * Prueba de humo del Estudio de Contenido.
 *
 * Renderiza todas las plantillas del registry en todos sus formatos declarados y
 * escribe los PNG en scripts/out/contenido/. Corre en Node pelado, sin servidor y sin
 * sesión — por eso sirve como criterio de terminado verificable de cada etapa:
 *
 *     npx tsx scripts/contenido_smoke.tsx
 *
 * Sale con código ≠ 0 si alguna combinación lanza, diciendo cuál.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { fuentesDeMarca } from "../src/lib/contenido/fuentes";
import { FORMATOS_LISTA, type Formato } from "../src/lib/contenido/formatos";
import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, MARCA, u } from "../src/lib/contenido/marca";
import { Cabecera, Pie, Eyebrow, Pill, Filete } from "../src/lib/contenido/plantillas/_lockups";

const SALIDA = join(process.cwd(), "scripts", "out", "contenido");

/**
 * Pieza de prueba de la identidad: pinta el lockup completo sobre el bloque verde de
 * marca. No es una plantilla del catálogo (esas llegan en la Etapa 2): existe para
 * comprobar que la concha, Caladea y el eyebrow salen bien en los cinco formatos.
 */
function PruebaDeMarca({ f }: { f: Formato }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const compacto = f.h < 700; // el 1.91:1 no tiene alto para el bloque de abajo

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: f.w,
        height: f.h,
        backgroundColor: PALETA.bosque,
        padding: m,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: u(24, w) }}>
        <Cabecera w={w} />
        <Eyebrow w={w}>{`Prueba de marca · ${f.etiqueta}`}</Eyebrow>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(20, w) }}>
        <Filete w={w} />
        <span
          style={{
            fontFamily: TIPO.display,
            fontWeight: 700,
            fontSize: u(compacto ? ESCALA.subtitulo : ESCALA.titular, w),
            color: PALETA.blanco,
            lineHeight: 1.08,
          }}
        >
          {MARCA.lema}
        </span>
        {!compacto && (
          <span
            style={{
              fontFamily: TIPO.cuerpo,
              fontSize: u(ESCALA.dato, w),
              color: BLANCO.medio,
            }}
          >
            {`${f.w} × ${f.h} · Caladea y Inter · concha dibujada en SVG`}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Pie w={w} />
        <Pill w={w}>desde 505 €</Pill>
      </div>
    </div>
  );
}

type Caso = { nombre: string; formato: Formato; elemento: React.ReactElement };

function casos(): Caso[] {
  // En la Etapa 1 el único caso es la prueba de marca. A partir de la Etapa 2 esta
  // función recorre el registry de plantillas × sus formatos declarados.
  return FORMATOS_LISTA.map((formato) => ({
    nombre: "prueba-de-marca",
    formato,
    elemento: <PruebaDeMarca f={formato} />,
  }));
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const fonts = fuentesDeMarca();
  const filas: Array<{ caso: string; formato: string; ms: number; kb: number }> = [];
  const fallos: Array<{ caso: string; formato: string; error: string }> = [];

  for (const { nombre, formato, elemento } of casos()) {
    const t0 = Date.now();
    try {
      const res = new ImageResponse(elemento, {
        width: formato.w,
        height: formato.h,
        fonts,
        // Sin `emoji:` a propósito: activarlo hace que Satori salga a un CDN por cada
        // emoji y multiplica el tiempo de render por cien.
      });
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) throw new Error("el render devolvió 0 bytes");
      const archivo = join(SALIDA, `${nombre}__${formato.id.replace(/\./g, "_")}.png`);
      writeFileSync(archivo, bytes);
      filas.push({
        caso: nombre,
        formato: formato.id,
        ms: Date.now() - t0,
        kb: Math.round(bytes.length / 1024),
      });
    } catch (e) {
      fallos.push({ caso: nombre, formato: formato.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`\nPiezas en ${SALIDA}\n`);
  console.log("caso".padEnd(20) + "formato".padEnd(10) + "ms".padStart(7) + "KB".padStart(8));
  console.log("-".repeat(45));
  for (const f of filas) {
    console.log(f.caso.padEnd(20) + f.formato.padEnd(10) + String(f.ms).padStart(7) + String(f.kb).padStart(8));
  }

  if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s):`);
    for (const f of fallos) console.error(`  ${f.caso} @ ${f.formato} → ${f.error}`);
    process.exit(1);
  }
  console.log(`\n${filas.length} pieza(s) renderizada(s), 0 fallos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
