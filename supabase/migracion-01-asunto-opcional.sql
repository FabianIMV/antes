-- ============================================================================
--  Migración 01 — el asunto y su respuesta pasan a ser opcionales
-- ============================================================================
--  Ejecutar en el SQL Editor de Supabase sobre una base que ya tenga el
--  esquema anterior. Es idempotente y no toca ninguna fila existente.
--
--  Por qué: la tabla obligaba a que toda predicción colgara de una pregunta.
--  No toda impresión llega en forma de pregunta, y obligar a inventarle una
--  deforma justo aquello que se quería registrar sin adornos. A partir de
--  ahora lo único obligatorio es `condicion`: lo que tiene que poder cumplirse
--  o fallar. Sin eso no hay nada que medir; con eso, ya hay bastante.
--
--  Las filas antiguas no cambian: siguen teniendo su pregunta y su 'sí'.
-- ============================================================================

alter table public.predicciones
  alter column pregunta drop not null,
  alter column significado_si drop not null,
  alter column significado_si drop default;

-- Los CHECK originales exigían texto no vacío. Ahora admiten el nulo, pero
-- siguen rechazando la cadena en blanco: o hay algo, o no hay nada.
alter table public.predicciones
  drop constraint if exists predicciones_pregunta_check,
  drop constraint if exists predicciones_significado_si_check;

alter table public.predicciones
  add constraint predicciones_pregunta_check
    check (pregunta is null or length(btrim(pregunta)) > 0),
  add constraint predicciones_significado_si_check
    check (significado_si is null or length(btrim(significado_si)) > 0);

comment on column public.predicciones.pregunta       is 'El asunto al que apunta, cuando apunta a alguno. Opcional: no toda impresión llega en forma de pregunta.';
comment on column public.predicciones.condicion      is 'Lo declarado: qué tiene que pasar. Único campo obligatorio, falsable y observable dentro de la ventana.';
comment on column public.predicciones.significado_si is 'Qué respondería el cumplimiento. Opcional, solo aplica cuando hay un asunto detrás.';

-- ----------------------------------------------------------------------------
-- Comprobación: esto debe pasar sin error (y luego puedes borrar la fila… no,
-- no puedes: borrar está prohibido por diseño. Ejecútalo solo si te sirve una
-- predicción de prueba de verdad).
--
--   insert into predicciones (condicion, ventana_minutos, vence_en,
--                             confianza, dominio, importancia, user_id)
--   values ('suena el teléfono', 2, now(), 3, 'trivial-cotidiano', 1, auth.uid());
-- ----------------------------------------------------------------------------
