import type { Prediccion, Resultado } from './tipos';

/**
 * Persistencia local. Existe por una sola razón: una declaración nunca puede
 * perderse por falta de red. Lo que no llega a Supabase se queda aquí y se
 * sincroniza después, conservando la hora original de declaración.
 */

const CLAVE_PENDIENTES = 'antes.pendientes';
const CLAVE_RESOLUCIONES = 'antes.resoluciones';

export interface ResolucionEnCola {
  id: string;
  resultado: Resultado;
  resuelta_en: string;
  nota_posterior: string | null;
}

function leer<T>(clave: string): T[] {
  try {
    const crudo = localStorage.getItem(clave);
    if (!crudo) return [];
    const valor = JSON.parse(crudo);
    return Array.isArray(valor) ? (valor as T[]) : [];
  } catch {
    return [];
  }
}

function escribir<T>(clave: string, valor: T[]): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o bloqueado: nada que hacer salvo no romper */
  }
}

// --- Declaraciones aún no subidas ------------------------------------------

export function pendientes(): Prediccion[] {
  return leer<Prediccion>(CLAVE_PENDIENTES).map((p) => ({ ...p, pendiente: true }));
}

export function guardarPendiente(p: Prediccion): void {
  const lista = leer<Prediccion>(CLAVE_PENDIENTES);
  const i = lista.findIndex((x) => x.id === p.id);
  if (i >= 0) lista[i] = p;
  else lista.push(p);
  escribir(CLAVE_PENDIENTES, lista);
}

export function borrarPendiente(id: string): void {
  escribir(
    CLAVE_PENDIENTES,
    leer<Prediccion>(CLAVE_PENDIENTES).filter((p) => p.id !== id)
  );
}

// --- Resoluciones de filas que ya existen en el servidor --------------------

export function resolucionesEnCola(): ResolucionEnCola[] {
  return leer<ResolucionEnCola>(CLAVE_RESOLUCIONES);
}

export function encolarResolucion(r: ResolucionEnCola): void {
  const lista = leer<ResolucionEnCola>(CLAVE_RESOLUCIONES);
  const i = lista.findIndex((x) => x.id === r.id);
  if (i >= 0) lista[i] = r;
  else lista.push(r);
  escribir(CLAVE_RESOLUCIONES, lista);
}

export function quitarResolucion(id: string): void {
  escribir(
    CLAVE_RESOLUCIONES,
    leer<ResolucionEnCola>(CLAVE_RESOLUCIONES).filter((r) => r.id !== id)
  );
}

export function totalEnCola(): number {
  return leer(CLAVE_PENDIENTES).length + leer(CLAVE_RESOLUCIONES).length;
}

export function esLocal(id: string): boolean {
  return id.startsWith('local:');
}

export function nuevoIdLocal(): string {
  const aleatorio =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local:${aleatorio}`;
}
