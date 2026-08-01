-- ============================================================================
--  antes — esquema, RLS e índices
-- ============================================================================
--  Ejecutar completo en el SQL Editor de Supabase (es idempotente).
--
--  Nota de diseño: la inmutabilidad de la declaración no es una convención de
--  la interfaz, es una regla del motor. Los triggers de abajo rechazan
--  cualquier intento de editar pregunta, condición, ventana, confianza,
--  importancia o dominio después del INSERT — venga de la app, del SQL editor
--  o de curl. Si el registro pudiera reescribirse, no sería un registro.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tabla
-- ----------------------------------------------------------------------------
create table if not exists public.predicciones (
  id               uuid primary key default gen_random_uuid(),
  creada_en        timestamptz not null default now(),

  -- Lo declarado. Inmutable a partir del INSERT.
  -- `condicion` es lo único obligatorio: es lo que puede fallar, y sin algo que
  -- pueda fallar no hay nada que medir. El asunto y su respuesta son opcionales
  -- porque no toda impresión llega en forma de pregunta.
  pregunta         text        check (pregunta is null or length(btrim(pregunta)) > 0),
  condicion        text        not null check (length(btrim(condicion)) > 0),
  significado_si   text        check (significado_si is null or length(btrim(significado_si)) > 0),
  ventana_minutos  integer     not null check (ventana_minutos > 0 and ventana_minutos <= 525600),
  vence_en         timestamptz not null,
  confianza        smallint    not null check (confianza between 1 and 5),
  dominio          text        not null check (length(btrim(dominio)) > 0),
  importancia      smallint    not null check (importancia between 1 and 5),

  -- Lo observado después. Se escribe una sola vez.
  resultado        text        check (resultado in ('si','no','ambiguo')),
  resuelta_en      timestamptz,
  nota_posterior   text,

  user_id          uuid        not null references auth.users(id) on delete cascade,

  -- Resultado y fecha de resolución van siempre juntos.
  constraint predicciones_resolucion_coherente
    check ((resultado is null) = (resuelta_en is null))
);

comment on table  public.predicciones             is 'Predicciones declaradas antes del hecho. Solo se añade el resultado; lo declarado nunca cambia.';
comment on column public.predicciones.pregunta    is 'El asunto al que apunta, cuando apunta a alguno. Opcional: no toda impresión llega en forma de pregunta.';
comment on column public.predicciones.condicion   is 'Lo declarado: qué tiene que pasar. Único campo obligatorio, falsable y observable dentro de la ventana.';
comment on column public.predicciones.significado_si is 'Qué respondería el cumplimiento. Opcional, solo aplica cuando hay un asunto detrás.';
comment on column public.predicciones.importancia is 'Cuánto importa personalmente el resultado (1-5). Permite cruzar precisión contra deseo.';
comment on column public.predicciones.vence_en    is 'Calculado por el servidor a partir de creada_en + ventana_minutos. No lo fija el cliente.';

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------
-- Predicciones abiertas del usuario, ordenadas por vencimiento (pantalla Abiertas).
create index if not exists predicciones_abiertas_idx
  on public.predicciones (user_id, vence_en)
  where resultado is null;

-- Historial y exportación.
create index if not exists predicciones_historial_idx
  on public.predicciones (user_id, creada_en desc);

-- Agregados de calibración.
create index if not exists predicciones_calibracion_idx
  on public.predicciones (user_id, confianza, importancia)
  where resultado is not null;

create index if not exists predicciones_dominio_idx
  on public.predicciones (user_id, dominio)
  where resultado is not null;

-- ----------------------------------------------------------------------------
-- Trigger de INSERT: el servidor fija el reloj
-- ----------------------------------------------------------------------------
-- `vence_en` se deriva siempre en el servidor. El cliente no puede alargar una
-- ventana, ni al declarar ni al sincronizar algo declarado sin red: `creada_en`
-- se acepta en el pasado (para la cola offline) pero nunca en el futuro.
create or replace function public.predicciones_al_insertar()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.user_id   := coalesce(auth.uid(), new.user_id);
  new.creada_en := least(coalesce(new.creada_en, now()), now());
  new.vence_en  := new.creada_en + make_interval(mins => new.ventana_minutos);

  if new.resultado is null then
    -- Sin resultado no hay nada que anotar todavía.
    new.resuelta_en    := null;
    new.nota_posterior := null;
  else
    new.resuelta_en := greatest(
      least(coalesce(new.resuelta_en, now()), now()),
      new.creada_en
    );
  end if;

  return new;
end;
$$;

drop trigger if exists predicciones_al_insertar on public.predicciones;
create trigger predicciones_al_insertar
  before insert on public.predicciones
  for each row execute function public.predicciones_al_insertar();

-- ----------------------------------------------------------------------------
-- Trigger de UPDATE: la declaración es inmutable, el resultado se escribe una vez
-- ----------------------------------------------------------------------------
-- Única excepción: corregir un 'no' automático (el que puso el vencimiento) a
-- 'si', dentro de los 10 minutos siguientes al vencimiento. Existe para el caso
-- real de haber estado sin teléfono, y para nada más.
create or replace function public.predicciones_al_actualizar()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  ventana_correccion constant interval := interval '10 minutes';
  cierre_automatico  boolean;
begin
  if new.id              is distinct from old.id
  or new.user_id         is distinct from old.user_id
  or new.creada_en       is distinct from old.creada_en
  or new.pregunta        is distinct from old.pregunta
  or new.condicion       is distinct from old.condicion
  or new.significado_si  is distinct from old.significado_si
  or new.ventana_minutos is distinct from old.ventana_minutos
  or new.vence_en        is distinct from old.vence_en
  or new.confianza       is distinct from old.confianza
  or new.dominio         is distinct from old.dominio
  or new.importancia     is distinct from old.importancia then
    raise exception 'La declaración es inmutable: lo que se declaró antes del resultado no se edita.'
      using errcode = 'check_violation';
  end if;

  -- Primera resolución: siempre permitida (la app es quien vigila el plazo; si
  -- el plazo venció, lo que llega aquí es el 'no' automático).
  if old.resultado is null then
    if new.resultado is null then
      if new.nota_posterior is distinct from old.nota_posterior then
        raise exception 'La nota posterior solo se escribe al resolver.'
          using errcode = 'check_violation';
      end if;
      return new;
    end if;

    new.resuelta_en := greatest(
      least(coalesce(new.resuelta_en, now()), now()),
      old.creada_en
    );
    return new;
  end if;

  -- Ya resuelta.
  cierre_automatico := old.resuelta_en > old.vence_en;

  if new.resultado is distinct from old.resultado then
    if not (cierre_automatico
            and old.resultado = 'no'
            and new.resultado = 'si'
            and now() <= old.vence_en + ventana_correccion) then
      raise exception 'El resultado ya está cerrado. Solo puede corregirse un cierre automático, y solo dentro de los 10 minutos posteriores al vencimiento.'
        using errcode = 'check_violation';
    end if;
    new.resuelta_en := now();
    return new;
  end if;

  -- Mismo resultado: la nota admite completarse mientras la ventana de
  -- corrección siga abierta, y después no.
  if new.nota_posterior is distinct from old.nota_posterior
     and now() > greatest(old.resuelta_en, old.vence_en) + ventana_correccion then
    raise exception 'La nota posterior ya está cerrada.'
      using errcode = 'check_violation';
  end if;

  new.resuelta_en := old.resuelta_en;
  return new;
end;
$$;

drop trigger if exists predicciones_al_actualizar on public.predicciones;
create trigger predicciones_al_actualizar
  before update on public.predicciones
  for each row execute function public.predicciones_al_actualizar();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.predicciones enable row level security;

drop policy if exists "leer solo lo propio"       on public.predicciones;
drop policy if exists "insertar solo lo propio"   on public.predicciones;
drop policy if exists "resolver solo lo propio"   on public.predicciones;

create policy "leer solo lo propio"
  on public.predicciones for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insertar solo lo propio"
  on public.predicciones for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "resolver solo lo propio"
  on public.predicciones for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No hay política de DELETE, y el privilegio se revoca explícitamente: borrar
-- una predicción abierta es la forma más limpia de abandonarla, y abandonarlas
-- es justo lo que esta herramienta existe para impedir.
revoke delete on public.predicciones from authenticated, anon;

-- ============================================================================
-- Comprobación rápida (opcional, ejecutar autenticado desde la app o con un JWT):
--
--   insert into predicciones (pregunta, condicion, significado_si,
--                             ventana_minutos, vence_en, confianza,
--                             dominio, importancia, user_id)
--   values ('¿Acepto el trabajo?', 'pasa un auto blanco', 'sí',
--           2, now(), 4, 'trabajo', 5, auth.uid());
--
--   update predicciones set pregunta = 'otra cosa';  -- debe fallar
--   delete from predicciones;                        -- debe fallar
-- ============================================================================
