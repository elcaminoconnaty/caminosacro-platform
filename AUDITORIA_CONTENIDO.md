# Auditoría del Estudio de Contenido — tablero de trabajo

Auditoría completa del módulo tras construirlo en tres tandas. **Criticar cada cosa hecha y
arreglarla.** No es una revisión de cortesía: lo que se busca es lo que está mal.

---

## CONTRATO — leer entero antes de tocar nada

El límite de gasto de esta cuenta **se agota sin avisar** y ya ha matado a cuatro agentes a
mitad de tarea. Este tablero existe para que, al reiniciar, sepas exactamente dónde ibas.

1. **Tu primera acción es leer este archivo entero.**
2. Busca tu bloque (A, B o C). Dentro, ve a la primera tarea cuyo `Estado:` no sea `hecho`.
3. **Antes de empezar una tarea**, escribe en su `Estado:` la palabra `en curso` y qué vas a
   hacer. Commitea ese cambio solo. Cuesta diez segundos y es lo que te salva si mueres.
4. **Una tarea = un commit.** Verifica (`npx tsc --noEmit`) antes de cada uno.
5. Al terminar una tarea: `Estado: hecho` + una línea de qué encontraste (o `sin hallazgos`)
   + tus arreglos en la sección **Hallazgos**. Commitea.
6. Si mueres a mitad: el `Estado: en curso` con tu nota le dice al siguiente por dónde ibas.
7. **No hagas push.** Solo commits.

Mensajes de commit en español, en indicativo, describiendo el efecto. Termina cada uno con:
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TiYzFSjqmPMebgT5ehSo4o
```

## Contexto imprescindible
- `PLAN_CONTENIDO.md` tiene la historia completa, las decisiones y las trampas ya conocidas.
  **Léelo**: te ahorra repetir errores que ya costaron horas.
- Trampas de Satori ya documentadas: revienta si `transform`/`backgroundImage` existen con
  valor `undefined` (hay que omitir la propiedad); no apila hijos de un `Fragment` dentro de
  un `flex-column`; todo `div` con más de un hijo necesita `display:'flex'`.
- **Regla dura aprendida hoy:** ninguna decisión de maqueta puede depender de un número de
  píxeles — el preview dibuja a 0.35 y cualquier umbral absoluto miente. Solo proporciones.
- ⚠️ Nunca insertar en `public.fotos` ni escribir en el bucket `fotos-instagram`.
- Verificación estándar:
  ```bash
  npx tsc --noEmit
  CONTENIDO_FOTO_PRUEBA="https://yvytzquewjsjsmgiwmaa.supabase.co/storage/v1/object/public/fotos-instagram/camino-sacro/2026/06/DDC_3232.jpg" npx tsx scripts/contenido_smoke.tsx
  npm run build
  ```

---

## BLOQUE A — Render, plantillas y marca
Archivos: `src/lib/contenido/plantillas/**`, `graficos/**`, `marca.ts`, `ajustes.ts`,
`formatos.ts`, `render.tsx`, `fuentes.ts`, `fotoCache.ts`.

- **A1. Coherencia visual entre las 14 plantillas.** ¿Mismos márgenes, mismos tamaños para
  el mismo papel, la cabecera y el pie siempre en el mismo sitio? Renderiza una hoja de
  contactos y compáralas de verdad.
  `Estado: en curso` — hoja de contactos de las 14 en 4x5 (con y sin foto), midiendo
  píxeles de fondo con Python en vez de opinar a ojo.
- **A2. Texto largo en todas las plantillas.** Prueba cada campo con el texto más largo que
  permite su `maxLargo`. Busca desbordes y solapamientos.
  `Estado: pendiente`
- **A3. Contraste medido, no opinado.** Todo texto sobre todo fondo (claro, oscuro, foto
  clara, foto oscura). Mínimo 4.5:1. Ya se corrigió el oro sobre crema (daba 1.55:1);
  busca los que queden.
  `Estado: pendiente`
- **A4. Los cinco formatos.** Cada plantilla en cada formato que declara, con y sin foto.
  Zona segura respetada en 9:16 y reel.
  `Estado: pendiente`
- **A5. Las perillas de ajuste en sus extremos.** `escalaTexto` a 0.75 y a 1.5, `altoBloque`
  a 0 y a 0.75, `zoomFoto` a 1.6, `velo` a 0 y a 0.85. Que nada se rompa ni se salga.
  `Estado: pendiente`

## BLOQUE B — Editor, bandeja y experiencia de uso
Archivos: `src/app/(dashboard)/contenido/**`.

- **B1. Estados de error y de vacío.** ¿Qué se ve si falla el guardado, si la foto ya no
  existe, si la pieza no tiene slides, si el catálogo no responde? Que nunca haya una
  pantalla muda ni un error críptico.
  `Estado: en curso — revisando actions.ts, Editor.tsx, PanelCampos.tsx, SelectorFoto.tsx,
  Exportar.tsx, PiezasGrid.tsx y los page.tsx del bloque B en busca de catch mudos, estados
  vacíos sin mensaje y pantallas en blanco.`
- **B2. Carreras del autoguardado.** Editar y cambiar de slide, editar y exportar, editar y
  salir, dos pestañas abiertas. Busca pérdidas de datos.
  `Estado: pendiente`
- **B3. Coherencia preview ↔ exportación.** Ya se arreglaron dos divergencias (decisiones
  por píxeles, y la caché envenenada al exportar). Busca las que queden: cualquier cosa que
  el preview enseñe distinto del archivo final.
  `Estado: pendiente`
- **B4. Recorrido completo de uso.** Crear desde cada uno de los 6 arranques, editar, poner
  foto, ajustar, exportar. Anota cada fricción: clics de más, cosas que no se entienden,
  esperas sin aviso.
  `Estado: pendiente`
- **B5. Accesibilidad y teclado.** Foco visible, Escape cierra el modal, botones con nombre
  legible, nada que solo se pueda hacer con el ratón.
  `Estado: pendiente`

## BLOQUE C — Datos, cola, puente y guiones
Archivos: `src/lib/contenido/{cola,ideas,copy,claude,vozLint,datos,fotos,export,tipos,encargo,hashSlide,miniatura}.ts`,
`scripts/**`, `supabase/migrations/0023–0027`.

- **C1. Fallos silenciosos.** Busca todo `catch` que se trague un error, todo `?? []` que
  convierta un fallo en "no hay datos", toda consulta cuyo error no se muestre. Un módulo
  que miente en silencio es peor que uno que se cae.
  `Estado: en curso — recorriendo cola.ts, ideas.ts, copy.ts, claude.ts, vozLint.ts, datos.ts,
  fotos.ts, export.ts, tipos.ts, encargo.ts, hashSlide.ts, miniatura.ts en busca de catch
  mudos, ?? [] / ?? null que oculten fallos y consultas sin chequear error.`
- **C2. La cola y el puente.** ¿Qué pasa si el worker muere a mitad, si hay dos trabajos a
  la vez, si el trabajo tarda más de 5 minutos, si el JSON de vuelta viene mal? Verifica el
  rescate de trabajos colgados.
  `Estado: pendiente`
- **C3. `vozLint` contra la estrategia.** ¿Cubre TODAS las reglas duras del bloque `TONO` de
  `estrategia.ts`? Lista las que falten y añádelas. Prueba con copys reales.
  `Estado: pendiente`
- **C4. Integridad de datos.** Piezas con `ruta_id` de rutas desactivadas, `export_paths`
  apuntando a archivos que ya no existen, fotos en `contenido_fotos` sin archivo detrás,
  trabajos viejos acumulándose. Limpia lo que sobre.
  `Estado: pendiente`
- **C5. Los guiones sembradores.** ¿Siguen siendo idempotentes? Córrelos dos veces y
  comprueba que no duplican ni ensucian.
  `Estado: pendiente`

---

## Hallazgos

*(Cada agente añade aquí lo que encuentra: qué estaba mal, cómo se destapó, qué se arregló y
qué se decidió dejar y por qué. Si una tarea no dio hallazgos, dilo — un informe donde todo
está bien es sospechoso.)*
