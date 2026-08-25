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
import { PLANTILLAS_LISTA, valoresPorDefecto } from "../src/lib/contenido/plantillas/registry";
import { PortadaRuta as PortadaAjustada } from "../src/lib/contenido/plantillas/portadaRuta";
import { FORMATOS } from "../src/lib/contenido/formatos";
import type { Slide } from "../src/lib/contenido/tipos";
import { HASHTAGS, RUTAS, PILARES } from "../src/lib/contenido/estrategia";

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

// Foto de prueba para las plantillas que llevan imagen. Sale del bucket público
// `fotos-instagram`, que es el banco real del bot: así el smoke también comprueba que
// Satori puede descargar una foto remota y encuadrarla.
const FOTO_PRUEBA =
  process.env.CONTENIDO_FOTO_PRUEBA ?? null;

// Los campos que en la app rellena el catálogo al elegir una ruta. Acá van a mano para
// que el smoke siga corriendo sin base de datos ni sesión.
const MUESTRA_CATALOGO: Record<string, string> = {
  ruta_nombre: "Camino Francés desde Sarria",
  etapas_json: JSON.stringify([
    { dia: 1, desde: "Sarria", hasta: "Portomarín", km: 22.2 },
    { dia: 2, desde: "Portomarín", hasta: "Palas de Rei", km: 24.8 },
    { dia: 3, desde: "Palas de Rei", hasta: "Arzúa", km: 28.5 },
    { dia: 4, desde: "Arzúa", hasta: "O Pedrouzo", km: 19.3 },
    { dia: 5, desde: "O Pedrouzo", hasta: "Santiago", km: 19.4 },
  ]),
};

function casos(): Caso[] {
  const out: Caso[] = [];

  // 1) La prueba de marca, en los cinco formatos: verifica concha, Caladea y eyebrow.
  for (const formato of FORMATOS_LISTA) {
    out.push({ nombre: "prueba-de-marca", formato, elemento: <PruebaDeMarca f={formato} /> });
  }

  // 2) Todo el registry × los formatos que cada plantilla declara soportar.
  for (const { definicion, Componente } of PLANTILLAS_LISTA) {
    for (const formatoId of definicion.formatos) {
      const formato = FORMATOS[formatoId];
      const slide: Slide = {
        plantilla: definicion.id,
        valores: { ...valoresPorDefecto(definicion.id), ...MUESTRA_CATALOGO },
        foto: definicion.usaFoto && FOTO_PRUEBA ? { url: FOTO_PRUEBA, origen: "banco" } : null,
      };
      out.push({ nombre: definicion.id, formato, elemento: <Componente f={formato} slide={slide} /> });
    }
  }

  // Los ajustes de diseño también se prueban: es donde Satori es más quisquilloso —revienta
  // si `transform` o `backgroundImage` existen con valor `undefined` en vez de omitirse— y
  // eso solo se ve renderizando de verdad.
  const conAjustes: Slide = {
    plantilla: "portada-ruta",
    valores: valoresPorDefecto("portada-ruta"),
    foto: FOTO_PRUEBA ? { url: FOTO_PRUEBA, origen: "banco" } : null,
    ajustes: { escalaTexto: 1.3, altoBloque: 0, encuadreFoto: "abajo", zoomFoto: 1.25, velo: 0.5 },
  };
  const sinZoom: Slide = { ...conAjustes, ajustes: { ...conAjustes.ajustes!, zoomFoto: 1, altoBloque: 0.2, velo: null } };
  out.push({ nombre: "ajustes-al-limite", formato: FORMATOS["9x16"], elemento: <PortadaAjustada f={FORMATOS["9x16"]} slide={conAjustes} /> });
  out.push({ nombre: "ajustes-sin-zoom", formato: FORMATOS["4x5"], elemento: <PortadaAjustada f={FORMATOS["4x5"]} slide={sinZoom} /> });

  return out;
}

// La copia de estrategia.ts puede separarse en silencio de la del repo del bot. Este
// chequeo no lo impide, pero grita cuando alguien edita un solo lado — que es el único
// modo en que el feed automático y el estudio empiezan a hablar distinto.
const ESPERADO = { hashtags: 34, rutas: 13, pilares: 7 };

function chequearEstrategia(): string[] {
  const problemas: string[] = [];
  if (HASHTAGS.length !== ESPERADO.hashtags)
    problemas.push(`HASHTAGS: ${HASHTAGS.length}, se esperaban ${ESPERADO.hashtags}`);
  if (RUTAS.length !== ESPERADO.rutas)
    problemas.push(`RUTAS: ${RUTAS.length}, se esperaban ${ESPERADO.rutas}`);
  if (PILARES.length !== ESPERADO.pilares)
    problemas.push(`PILARES: ${PILARES.length}, se esperaban ${ESPERADO.pilares}`);
  return problemas;
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });

  const deriva = chequearEstrategia();
  if (deriva.length) {
    console.warn("\n⚠️  estrategia.ts cambió respecto a lo esperado:");
    for (const d of deriva) console.warn(`     ${d}`);
    console.warn("     Revisa que el cambio esté también en caminosacro-ig-auto/_shared/estrategia.ts");
    console.warn("     y actualiza ESPERADO en este script.\n");
  }

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
