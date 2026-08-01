import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && anonKey);

/**
 * Cliente Supabase. Es `null` si faltan las variables de entorno, para que el
 * sitio siga construyendo y la app pueda mostrar un aviso claro en vez de
 * romperse en blanco.
 *
 * La anon key viaja al navegador a propósito: la autorización la impone Row
 * Level Security en el servidor. La service_role key no aparece nunca aquí.
 */
export const supabase: SupabaseClient | null = configurado
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;

export function clienteObligatorio(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado: faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}
