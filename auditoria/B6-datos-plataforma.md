# B6 — Datos y plataforma

**Cubre:** Las 33 migraciones, RLS, Storage, `src/proxy.ts`, auth, `src/lib/supabase/**`, `api/**`

**Por qué importa:** Lo que no se ve y se lleva todo por delante cuando falla.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B6.1 El esquema real contra las migraciones.** Usa el MCP de Supabase: columnas muertas, tablas sin uso, índices que faltan en las consultas que sí se hacen, CHECK que ya no reflejan el código.
  `Estado: pendiente`
- **B6.2 Permisos.** Todas las tablas tienen una policy `auth_all` para cualquier autenticado. Con dos usuarios da igual; di qué se rompería con un tercero. Y dónde se usa `service_role` y si hace falta.
  `Estado: pendiente`
- **B6.3 Rendimiento.** El expediente lanza dieciséis consultas por carga. Listados sin paginar, N+1, imágenes sin optimizar. Mide antes de opinar.
  `Estado: pendiente`
- **B6.4 Secretos y configuración.** Qué claves llegan al navegador, qué hay en `.env`, qué pasa si falta `APP_BASE_URL` en producción.
  `Estado: pendiente`
- **B6.5 Los endpoints públicos.** `/api/wp`, `/api/agente`, `/api/cron`: autenticación, límite de peticiones, validación del cuerpo, y qué devuelven cuando algo va mal.
  `Estado: pendiente`
- **B6.6 Cero tests.** No pidas «más tests». Di **las tres cosas** cuya rotura silenciosa costaría más caro y qué prueba mínima las cubriría.
  `Estado: pendiente`
- **B6.7 Copias y recuperación.** Qué pasa si alguien borra una cotización por error o se pierde un bucket. Qué hay hoy y qué falta.
  `Estado: pendiente`

---

## Hallazgos

_(Vacío. Se escribe según se encuentra, nunca al final.)_

---

## Arreglos aplicados

_(Solo lo pequeño y reversible. Un commit por arreglo.)_

---

## Crítica del experto

`Estado: pendiente`

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
