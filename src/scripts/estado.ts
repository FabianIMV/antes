import { aplicarVencimientos, cargarTodo, sincronizar } from '../lib/datos';
import { totalEnCola } from '../lib/almacen';
import type { Prediccion } from '../lib/tipos';

type Escucha = () => void;

const escuchas = new Set<Escucha>();

export const estado = {
  filas: [] as Prediccion[],
  cargando: false,
  error: null as string | null,
  enCola: 0,
  /** Predicciones que el vencimiento acaba de cerrar en 'no'. Se avisa una vez. */
  cerradasPorVencimiento: [] as Prediccion[],
};

export function alCambiar(fn: Escucha): void {
  escuchas.add(fn);
}

export function notificar(): void {
  for (const fn of escuchas) fn();
}

let recargando: Promise<void> | null = null;

/**
 * Trae los datos, sube lo que quedó pendiente y cierra lo que venció.
 * Se serializa: varias llamadas simultáneas comparten la misma pasada.
 */
export function recargar(): Promise<void> {
  if (recargando) return recargando;
  recargando = ejecutarRecarga().finally(() => {
    recargando = null;
  });
  return recargando;
}

async function ejecutarRecarga(): Promise<void> {
  estado.cargando = true;
  estado.error = null;
  notificar();

  try {
    await sincronizar();
    let filas = await cargarTodo();

    const cerradas = await aplicarVencimientos(filas);
    if (cerradas.length) {
      filas = await cargarTodo();
      estado.cerradasPorVencimiento = cerradas;
      avisarVencimiento(cerradas);
    }

    estado.filas = filas;
  } catch (error) {
    estado.error = mensaje(error);
  } finally {
    estado.enCola = totalEnCola();
    estado.cargando = false;
    notificar();
  }
}

export function limpiarAvisoVencimiento(): void {
  estado.cerradasPorVencimiento = [];
  notificar();
}

export function mensaje(error: unknown): string {
  if (!error) return 'Error desconocido.';
  const m = (error as { message?: string }).message;
  return typeof m === 'string' && m ? m : String(error);
}

function avisarVencimiento(cerradas: Prediccion[]): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const cuerpo =
    cerradas.length === 1
      ? cerradas[0]!.condicion
      : `${cerradas.length} predicciones vencieron sin cumplirse.`;
  try {
    new Notification('Venció el plazo — quedó en «no»', { body: cuerpo, tag: 'antes-vencimiento' });
  } catch {
    /* algunos navegadores exigen service worker; el aviso en pantalla ya está */
  }
}
