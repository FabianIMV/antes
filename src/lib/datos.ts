import { clienteObligatorio, supabase } from './supabase';
import * as almacen from './almacen';
import type { Declaracion, Prediccion, Resultado } from './tipos';

export const MINUTOS_CORRECCION = 10;

const CAMPOS =
  'id, creada_en, pregunta, condicion, significado_si, ventana_minutos, vence_en, confianza, importancia, dominio, resultado, resuelta_en, nota_posterior';

/**
 * Distingue "no hubo red" de "el servidor dijo que no". Solo lo primero se
 * encola: reintentar indefinidamente algo que la base rechazó por regla (una
 * edición prohibida, un cierre fuera de plazo) sería insistir en un error.
 */
function esFalloDeRed(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!error) return false;
  const mensaje = String((error as { message?: string }).message ?? error).toLowerCase();
  return (
    mensaje.includes('failed to fetch') ||
    mensaje.includes('networkerror') ||
    mensaje.includes('network request failed') ||
    mensaje.includes('load failed') ||
    mensaje.includes('timeout') ||
    mensaje.includes('fetch failed')
  );
}

export function vencimiento(creada_en: string, ventana_minutos: number): string {
  return new Date(new Date(creada_en).getTime() + ventana_minutos * 60_000).toISOString();
}

/** Trae todo lo del servidor y le superpone lo que aún vive en localStorage. */
export async function cargarTodo(): Promise<Prediccion[]> {
  const locales = almacen.pendientes();
  let remotas: Prediccion[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from('predicciones')
      .select(CAMPOS)
      .order('creada_en', { ascending: false });
    if (error && !esFalloDeRed(error)) throw error;
    remotas = (data ?? []) as Prediccion[];
  }

  // Una resolución encolada ya es un hecho declarado por el usuario: se refleja
  // en la vista aunque el servidor todavía no la conozca.
  const enCola = new Map(almacen.resolucionesEnCola().map((r) => [r.id, r]));
  for (const fila of remotas) {
    const r = enCola.get(fila.id);
    if (r) {
      fila.resultado = r.resultado;
      fila.resuelta_en = r.resuelta_en;
      fila.nota_posterior = r.nota_posterior;
      fila.pendiente = true;
    }
  }

  return [...locales, ...remotas].sort(
    (a, b) => new Date(b.creada_en).getTime() - new Date(a.creada_en).getTime()
  );
}

/**
 * Declara. Si el servidor no está accesible, la predicción queda guardada en el
 * dispositivo con su hora real de declaración y se sube en cuanto haya red.
 */
export async function declarar(d: Declaracion): Promise<Prediccion> {
  const creada_en = new Date().toISOString();
  const fila: Prediccion = {
    id: almacen.nuevoIdLocal(),
    creada_en,
    pregunta: d.pregunta.trim(),
    condicion: d.condicion.trim(),
    significado_si: d.significado_si.trim() || 'sí',
    ventana_minutos: d.ventana_minutos,
    vence_en: vencimiento(creada_en, d.ventana_minutos),
    confianza: d.confianza,
    importancia: d.importancia,
    dominio: d.dominio,
    resultado: null,
    resuelta_en: null,
    nota_posterior: null,
  };

  if (!supabase) {
    almacen.guardarPendiente(fila);
    return fila;
  }

  try {
    const insertada = await insertar(fila);
    return insertada;
  } catch (error) {
    if (!esFalloDeRed(error)) throw error;
    almacen.guardarPendiente(fila);
    return fila;
  }
}

async function insertar(fila: Prediccion): Promise<Prediccion> {
  const cliente = clienteObligatorio();
  const { data: sesion } = await cliente.auth.getUser();
  const user_id = sesion.user?.id;
  if (!user_id) throw new Error('Sesión no iniciada.');

  const { data, error } = await cliente
    .from('predicciones')
    .insert({
      creada_en: fila.creada_en,
      pregunta: fila.pregunta,
      condicion: fila.condicion,
      significado_si: fila.significado_si,
      ventana_minutos: fila.ventana_minutos,
      // El servidor lo recalcula; se envía porque la columna es not null.
      vence_en: fila.vence_en,
      confianza: fila.confianza,
      importancia: fila.importancia,
      dominio: fila.dominio,
      resultado: fila.resultado,
      resuelta_en: fila.resuelta_en,
      nota_posterior: fila.nota_posterior,
      user_id,
    })
    .select(CAMPOS)
    .single();

  if (error) throw error;
  return data as Prediccion;
}

/**
 * Escribe el resultado. Una sola vez: después de esto la fila queda cerrada,
 * salvo la corrección de un cierre automático dentro de su ventana de 10 min.
 */
export async function resolver(
  fila: Prediccion,
  resultado: Resultado,
  nota: string | null = null
): Promise<void> {
  const resuelta_en = new Date().toISOString();
  const nota_posterior = nota && nota.trim() ? nota.trim() : null;

  if (almacen.esLocal(fila.id)) {
    almacen.guardarPendiente({ ...fila, resultado, resuelta_en, nota_posterior });
    return;
  }

  if (!supabase) {
    almacen.encolarResolucion({ id: fila.id, resultado, resuelta_en, nota_posterior });
    return;
  }

  try {
    const { error } = await supabase
      .from('predicciones')
      .update({ resultado, resuelta_en, nota_posterior })
      .eq('id', fila.id);
    if (error) throw error;
    almacen.quitarResolucion(fila.id);
  } catch (error) {
    if (!esFalloDeRed(error)) throw error;
    almacen.encolarResolucion({ id: fila.id, resultado, resuelta_en, nota_posterior });
  }
}

/**
 * Corrige a 'si' un cierre automático. Solo tiene efecto dentro de los 10
 * minutos posteriores al vencimiento; el servidor rechaza el resto.
 */
export async function corregirACumplida(fila: Prediccion, nota: string | null = null): Promise<void> {
  if (!enVentanaDeCorreccion(fila)) {
    throw new Error('La ventana de corrección ya se cerró.');
  }
  return resolver(fila, 'si', nota);
}

export function cerradaAutomaticamente(fila: Prediccion): boolean {
  if (fila.resultado !== 'no' || !fila.resuelta_en) return false;
  return new Date(fila.resuelta_en).getTime() > new Date(fila.vence_en).getTime();
}

export function enVentanaDeCorreccion(fila: Prediccion, ahora = Date.now()): boolean {
  if (!cerradaAutomaticamente(fila)) return false;
  return ahora <= new Date(fila.vence_en).getTime() + MINUTOS_CORRECCION * 60_000;
}

/**
 * Cierra como 'no' todo lo que venció sin resolverse. Es el mecanismo que
 * impide esperar indefinidamente a que el augurio se cumpla.
 * Devuelve las filas que acaba de cerrar, para poder avisar.
 */
export async function aplicarVencimientos(filas: Prediccion[]): Promise<Prediccion[]> {
  const ahora = Date.now();
  const vencidas = filas.filter(
    (f) => f.resultado === null && new Date(f.vence_en).getTime() <= ahora
  );

  const cerradas: Prediccion[] = [];
  for (const fila of vencidas) {
    try {
      await resolver(fila, 'no');
      cerradas.push(fila);
    } catch {
      // Si el cierre falla por algo que no es red, se reintentará en la
      // siguiente carga. La predicción sigue abierta y visible.
    }
  }
  return cerradas;
}

/** Sube todo lo que quedó en el dispositivo. Devuelve cuántas cosas subió. */
export async function sincronizar(): Promise<{ subidas: number; pendientes: number }> {
  if (!supabase) return { subidas: 0, pendientes: almacen.totalEnCola() };

  const { data: sesion } = await supabase.auth.getSession();
  if (!sesion.session) return { subidas: 0, pendientes: almacen.totalEnCola() };

  let subidas = 0;

  for (const fila of almacen.pendientes()) {
    try {
      await insertar(fila);
      almacen.borrarPendiente(fila.id);
      subidas++;
    } catch (error) {
      if (esFalloDeRed(error)) break; // sin red: se corta y se reintenta luego
      // Rechazo del servidor sobre una fila local: se descarta de la cola para
      // no bloquear el resto, pero se deja rastro en consola.
      console.error('Predicción rechazada por el servidor:', fila, error);
      almacen.borrarPendiente(fila.id);
    }
  }

  for (const r of almacen.resolucionesEnCola()) {
    try {
      const { error } = await supabase
        .from('predicciones')
        .update({
          resultado: r.resultado,
          resuelta_en: r.resuelta_en,
          nota_posterior: r.nota_posterior,
        })
        .eq('id', r.id);
      if (error) throw error;
      almacen.quitarResolucion(r.id);
      subidas++;
    } catch (error) {
      if (esFalloDeRed(error)) break;
      console.error('Resolución rechazada por el servidor:', r, error);
      almacen.quitarResolucion(r.id);
    }
  }

  return { subidas, pendientes: almacen.totalEnCola() };
}
