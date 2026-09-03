# Auditoría de la Plataforma Comercial — tablero

Revisión completa de la plataforma tras crecer por tandas: 34.552 líneas, 33 migraciones,
15 endpoints y **cero tests**. **Criticar cada cosa hecha.** No es una revisión de cortesía:
lo que se busca es lo que está mal.

Fuera de alcance: el **Estudio de Contenido** (`contenido/**`, `lib/contenido/**`). Ya tiene
su propia auditoría en `AUDITORIA_CONTENIDO.md` y es marketing, no el CRM de viajes.

---

## CONTRATO — leer entero antes de tocar nada

El límite de gasto de esta cuenta **se agota sin avisar** y ya mató a cuatro agentes a mitad
de tarea en la auditoría anterior. Este tablero existe para que, al reiniciar, sepas
exactamente dónde ibas.

1. **Tu primera acción es leer este archivo entero**, y luego **solo** tu archivo de bloque.
   No leas los demás bloques: con este límite, leer de más es no terminar.
2. Dentro de tu bloque, ve a la primera tarea cuyo `Estado:` no sea `hecho`.
3. **Antes de empezar una tarea**, escribe en su `Estado:` la palabra `en curso` y qué vas a
   hacer. Commitea ese cambio solo. Cuesta diez segundos y es lo que te salva si mueres.
4. **Una tarea = un commit.** `npx tsc --noEmit` antes de cada commit que toque código.
5. Al terminar una tarea: `Estado: hecho` + una línea de qué encontraste (o `sin hallazgos`)
   + el detalle en la sección **Hallazgos**. Commitea.
6. Si mueres a mitad, tu `en curso` con la nota le dice al siguiente por dónde ibas.
7. **No hagas push.** Solo commits.
8. **Nunca `git commit -a` ni `git add -A`.** En el árbol de trabajo hay trabajo ajeno sin
   commitear —«Pídelo tú» del Estudio de Contenido: `contenido/PedidoCaja.tsx`,
   `contenido/pedidoActions.ts`, `lib/contenido/{pedido,pedidoOpciones,propuesta}.ts`,
   `supabase/migrations/0029_contenido_pedidos.sql` y los archivos que ya modificó—.
   Añade tus archivos **por nombre**, uno a uno.
9. **Arregla solo lo pequeño y reversible**: un `catch` mudo, un estado vacío sin mensaje, un
   texto que miente, un `any` evitable, una consulta sin índice obvio. Lo que toque **dinero,
   estados de venta o migraciones se anota, NO se toca** — se decide con Nico.
10. Escribe los hallazgos **según los encuentras**, nunca al final. Un informe que solo existe
    en tu contexto es un informe perdido.

Mensajes de commit en español, en indicativo, describiendo el efecto. Termina cada uno con:
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CHwWQTsmXTETu3sn9ALcLD
```

## Cómo se anota un hallazgo

En la sección **Hallazgos** de tu bloque, uno por línea de encabezado:

```
### [GRAVE|MEDIO|MENOR] Título corto — `archivo.ts:123`
Qué pasa, con el caso concreto que lo dispara. Qué se rompe para quien usa esto.
**Arreglado:** qué se cambió.  ·  **Propuesta:** qué habría que hacer (si no se tocó).
```

- **GRAVE** — se pierde dinero, se corrompen datos, se filtra información o se cae algo que
  el cliente ve.
- **MEDIO** — funciona pero engaña, se rompe en un caso realista, o cuesta el triple de lo que debería.
- **MENOR** — ruido, incoherencia, deuda que hoy no muerde.

No infles la lista. Un hallazgo inventado le hace perder el tiempo a todo el mundo y le quita
credibilidad a los de verdad. Si un bloque está bien, dilo.

## Contexto imprescindible
- `GUIA.md` — convenciones, Storage, migraciones, despliegue. **Léelo antes de proponer nada.**
- `AUDITORIA_CONTENIDO.md` — el contrato original y las trampas ya documentadas.
- Trampas caras ya conocidas, no las redescubras:
  - `total_eur` y `cost_eur` son **derivados**: los calcula `comercial.recompute_quote_money()`.
    Nunca se escriben a mano.
  - En un archivo `"use server"` solo pueden exportarse **funciones**. Un `export type`
    reexportado tumba el chunk entero de actions en producción.
  - `@react-pdf/renderer` y los componentes de PDF deben resolverse por el **mismo** camino
    de importación, o el render revienta con "Font family not registered".
  - El correo tiene un **emisor único**: `lib/email/webhook.ts` → workflow de n8n → Brevo.
  - Las rutas públicas por token (`/contrato`, `/documentacion`, `/correo`) están en
    `PUBLIC_PATHS` de `src/proxy.ts`.
- Verificación estándar: `npx tsc --noEmit` y `npm run build`.

---

## Estado de los bloques

Orden deliberado: primero el recorrido de la venta, que es por donde pasa cada peso que entra.

| # | Bloque | Archivo | Auditoría | Crítica | Revisión |
|---|---|---|---|---|---|
| B1 | Cotizador y alta | `B1-cotizador.md` | `hecho` | `hecho` | `hecho` |
| B2 | Expediente y estados | `B2-expediente.md` | `hecho` | `hecho` | `hecho` |
| B3 | Contratos y documentos | `B3-contratos-documentos.md` | `hecho` | `hecho` | `en curso` |
| B4 | Correo | `B4-correo.md` | `hecho` | `hecho` | `hecho` |
| B5 | Catálogo, precios y hoteles | `B5-catalogo.md` | `hecho` | `hecho` | `hecho` |
| B6 | Datos y plataforma | `B6-datos-plataforma.md` | `hecho` | `hecho` | `hecho` |
| B7 | Diseño y experiencia | `B7-diseno.md` | `hecho` | `hecho` | `hecho` |
| B8 | Síntesis | `SINTESIS.md` | `pendiente` | `—` | `—` |

Valores: `pendiente` · `en curso` · `hecho`. En Revisión, además: `—` (no hizo falta).

> **Estado a 2-sep-2026 (noche):** **las cinco críticas de B3 a B7 están cerradas**, las cinco
> con veredicto `revisar` y con los huecos escritos al final de cada bloque. Lanzadas **en
> paralelo las cinco rondas de revisión**; las de B4 y B6 se retoman desde el plan que dejaron
> escrito los agentes que mató el límite (la de B6 ya corrigió lo urgente: la falsedad de las
> copias diarias en `GUIA.md`). Cuando las cinco cierren, y solo entonces, se escribe **B8**.
>
> **Aviso para B8:** tres críticos llegaron por caminos distintos al mismo sitio —el correo del
> contrato no deja rastro y `/api/wp/lead` no persiste nada—, y varios números de los informes
> caducaron en 48 h. La síntesis debe **fechar los números** y no contar dos veces lo que dos
> bloques miraron desde ángulos distintos (ver la nota de B7.6 y la de los tests en B6).

> **Estado a 2-sep-2026 (tarde):** lanzados **en paralelo los cinco críticos de B3 a B7**.
> B3, B4 y B5 se retoman desde la nota `en curso` que dejaron los agentes que murieron por el
> límite; B6 y B7 arrancan de cero. Cada crítico toca **solo su archivo de bloque**: el tablero
> lo mueve quien orquesta. Cuando los cinco cierren con veredicto, van las revisiones que hagan
> falta y después B8.

> **Estado anterior:** los **siete bloques de auditoría están cerrados**. B1 y B2 tienen
> además su crítica y su revisión. Las críticas de **B3 a B7 están pendientes a propósito**:
> las auditorías de esos cinco bloques las escribió el mismo agente en una sola sesión, y
> criticarse a uno mismo no tiene independencia — cada archivo deja anotado, en su sección de
> Crítica, qué conviene que le miren. **B8 (Síntesis) no debería escribirse antes que esas
> críticas**, porque cinco de los siete bloques podrían cambiar de etiqueta.

**Quien orquesta marca la fila antes de lanzar cada agente y la cierra al recibir el informe.**
Si la sesión muere entre medias, la fila en `en curso` dice qué estaba corriendo.

---

## Para retomar

Nico dice **«sigue con la auditoría»**. Entonces:

1. Lee este tablero.
2. Ve a la primera fila que no esté cerrada, en orden B1 → B8.
3. Si su Auditoría está `en curso`, abre ese archivo de bloque y mira la nota del `en curso`
   de la tarea: ahí está por dónde iba el que murió.
4. Lanza el agente que toque (auditor, crítico o revisor) y sigue.

No hace falta recordar nada más. Un subagente no se puede resucitar entre sesiones —su
memoria muere con ella—, pero su trabajo vive aquí y cualquier agente nuevo lo continúa.
