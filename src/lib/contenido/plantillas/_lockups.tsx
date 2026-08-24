// Bloques compartidos por todas las plantillas del Estudio de Contenido.
//
// Todo lo de este archivo se renderiza con Satori, que tiene dos reglas que hay que
// respetar sin excepción:
//   1. Todo `div` con más de un hijo lleva `display:'flex'` explícito. Nada de CSS
//      grid, `float` ni `position:sticky`.
//   2. Nada de emoji. Medido en este mismo node_modules: un emoji en el árbol lleva el
//      render de 15 ms a 1741 ms, porque Satori sale a buscar el SVG del emoji a un CDN
//      — y si el CDN falla, falla la pieza. Por eso la concha va dibujada como <path>.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, MARCA, TRACKING_EYEBROW, u } from "../marca";

// ---------------------------------------------------------------------------
// La concha de peregrino: el único isotipo de la marca.
//
// Se dibuja en un viewBox de 100×100: bisagra abajo al centro y abanico hacia arriba,
// con el borde superior ondulado (las valvas) y radios que salen de la bisagra. Se
// genera con trigonometría en vez de escribir un `d` a mano porque así el número de
// valvas y la curvatura son parámetros y no números mágicos.
// ---------------------------------------------------------------------------

// La concha se dibuja como un ABANICO ELÍPTICO: el radio horizontal y el vertical son
// distintos a propósito. Con un radio único la concha o queda achatada o se sale del
// viewBox por los lados (que fue exactamente lo que pasó en el primer intento).
const BISAGRA = { x: 50, y: 88 };
const RADIO_X = 45;
const RADIO_Y = 74;
const VALVAS = 8;
// Ángulos en grados desde la bisagra. En SVG la y crece hacia abajo, así que para abrir
// el abanico hacia arriba hacen falta ángulos negativos.
const ANG_INICIO = -172;
const ANG_FIN = -8;

function punto(angGrados: number, escala: number) {
  const a = (angGrados * Math.PI) / 180;
  return {
    x: BISAGRA.x + RADIO_X * escala * Math.cos(a),
    y: BISAGRA.y + RADIO_Y * escala * Math.sin(a),
  };
}

/** Contorno de la concha: bisagra → borde ondulado (las valvas) → bisagra. */
function contornoConcha(): string {
  const pasos = VALVAS * 14;
  const partes: string[] = [`M ${BISAGRA.x} ${BISAGRA.y}`];
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    const ang = ANG_INICIO + (ANG_FIN - ANG_INICIO) * t;
    // Onda del borde: VALVAS lóbulos. El desfase de media onda hace que los extremos
    // caigan en un valle y no en una cresta, que es como se ve una vieira real.
    const onda = 1 + 0.05 * Math.cos((t * VALVAS - 0.5) * 2 * Math.PI);
    const p = punto(ang, onda);
    partes.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  }
  partes.push("Z");
  return partes.join(" ");
}

/** Los surcos que van de la bisagra al borde, uno por valva. */
function radiosConcha(): Array<{ x: number; y: number }> {
  const radios = [];
  for (let i = 1; i < VALVAS; i++) {
    const t = i / VALVAS;
    const ang = ANG_INICIO + (ANG_FIN - ANG_INICIO) * t;
    const p = punto(ang, 0.86);
    radios.push({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) });
  }
  return radios;
}

const D_CONCHA = contornoConcha();
const RADIOS_CONCHA = radiosConcha();

/**
 * La vieira: único isotipo de la marca. `color` es el cuerpo de la concha y
 * `colorSurcos` los surcos — tiene que CONTRASTAR con `color` o los surcos
 * desaparecen y la concha se lee como una mancha.
 */
export function Concha({
  size,
  color,
  colorSurcos = PALETA.dorado,
}: {
  size: number;
  color: string;
  colorSurcos?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path d={D_CONCHA} fill={color} />
      {RADIOS_CONCHA.map((r, i) => (
        <line
          key={i}
          x1={BISAGRA.x}
          y1={BISAGRA.y - 2}
          x2={r.x}
          y2={r.y}
          stroke={colorSurcos}
          strokeWidth={2.6}
          strokeOpacity={0.5}
          strokeLinecap="round"
        />
      ))}
      {/* Bisagra: el taloncito plano de donde sale el abanico. */}
      <circle cx={BISAGRA.x} cy={BISAGRA.y - 1} r={5.5} fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Firma de marca. No existe archivo de logo: la marca es la concha + tipografía.
// ---------------------------------------------------------------------------

export function Cabecera({ w, sobreOscuro = true }: { w: number; sobreOscuro?: boolean }) {
  const d = MEDIDAS.conchaCirculo;
  const colorNombre = sobreOscuro ? PALETA.blanco : PALETA.bosque;
  const colorBajada = PALETA.dorado;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: u(18, w) }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: u(d, w),
          height: u(d, w),
          borderRadius: u(d, w) / 2,
          backgroundColor: PALETA.dorado,
        }}
      >
        <Concha size={u(d * 0.7, w)} color={PALETA.bosque} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontFamily: TIPO.display,
            fontWeight: 700,
            fontSize: u(ESCALA.marca, w),
            color: colorNombre,
            lineHeight: 1.05,
          }}
        >
          {MARCA.nombre}
        </span>
        <span
          style={{
            fontFamily: TIPO.cuerpo,
            fontSize: u(ESCALA.marcaSub, w),
            color: colorBajada,
            textTransform: "uppercase",
            letterSpacing: TRACKING_EYEBROW,
            marginTop: u(4, w),
          }}
        >
          {MARCA.bajada}
        </span>
      </div>
    </div>
  );
}

export function Pie({ w, sobreOscuro = true }: { w: number; sobreOscuro?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: u(14, w) }}>
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontSize: u(ESCALA.pie, w),
          color: sobreOscuro ? BLANCO.medio : PALETA.muted,
        }}
      >
        {MARCA.web}
      </span>
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontSize: u(ESCALA.pie, w),
          color: PALETA.dorado,
        }}
      >
        ·
      </span>
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontSize: u(ESCALA.pie, w),
          color: sobreOscuro ? BLANCO.medio : PALETA.muted,
        }}
      >
        {MARCA.handle}
      </span>
    </div>
  );
}

export function Eyebrow({
  children,
  w,
  color = PALETA.dorado,
}: {
  children: string;
  w: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: TIPO.cuerpo,
        fontSize: u(ESCALA.eyebrow, w),
        color,
        textTransform: "uppercase",
        letterSpacing: TRACKING_EYEBROW,
      }}
    >
      {children}
    </span>
  );
}

export function Pill({ children, w }: { children: string; w: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        paddingLeft: u(30, w),
        paddingRight: u(30, w),
        paddingTop: u(14, w),
        paddingBottom: u(14, w),
        borderRadius: u(MEDIDAS.radioPill, w),
        backgroundColor: PALETA.dorado,
      }}
    >
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontWeight: 700,
          fontSize: u(30, w),
          color: PALETA.bosque,
        }}
      >
        {children}
      </span>
    </div>
  );
}

/** Filete corto blanco: el separador de la portada del PDF de cotización. */
export function Filete({ w, ancho = 150, color = BLANCO.filete }: { w: number; ancho?: number; color?: string }) {
  return (
    <div
      style={{
        width: u(ancho, w),
        height: u(MEDIDAS.filete, w),
        backgroundColor: color,
      }}
    />
  );
}
