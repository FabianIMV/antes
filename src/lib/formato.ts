import type { Prediccion, Resultado } from './tipos';

export const VENTANAS_RAPIDAS = [
  { minutos: 2, etiqueta: '2 min' },
  { minutos: 5, etiqueta: '5 min' },
  { minutos: 15, etiqueta: '15 min' },
  { minutos: 60, etiqueta: '1 h' },
  { minutos: 1440, etiqueta: '24 h' },
];

export function etiquetaVentana(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 1440) {
    const h = minutos / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
  }
  const d = minutos / 1440;
  return `${Number.isInteger(d) ? d : d.toFixed(1)} d`;
}

/** Cuenta regresiva en formato corto. Negativa cuando ya venció. */
export function cuentaRegresiva(vence_en: string, ahora = Date.now()): string {
  const restante = new Date(vence_en).getTime() - ahora;
  const signo = restante < 0 ? '−' : '';
  let s = Math.floor(Math.abs(restante) / 1000);

  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;

  if (d > 0) return `${signo}${d}d ${dos(h)}h`;
  if (h > 0) return `${signo}${h}:${dos(m)}:${dos(s)}`;
  return `${signo}${dos(m)}:${dos(s)}`;
}

function dos(n: number): string {
  return String(n).padStart(2, '0');
}

export function fechaLegible(iso: string): string {
  const f = new Date(iso);
  return f.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ETIQUETA_RESULTADO: Record<Resultado, string> = {
  si: 'Se cumplió',
  no: 'No se cumplió',
  ambiguo: 'Ambiguo',
};

export function estado(p: Prediccion): string {
  return p.resultado ? ETIQUETA_RESULTADO[p.resultado] : 'Abierta';
}

/** Clase de color para un nivel declarado del 1 al 5. */
export function claseNivel(n: number): string {
  return `nivel-${Math.min(5, Math.max(1, Math.round(n)))}`;
}

/**
 * Convierte una tasa de acierto en un nivel de la misma escala 1–5.
 *
 * Los cortes están anclados en el 50%, no repartidos por igual: el azar es el
 * centro amarillo, y de ahí se sube o se baja. Un 50% no es «medio bueno», es
 * exactamente nada, y la escala tiene que decir eso.
 */
export function nivelDeTasa(tasa: number | null): number | null {
  if (tasa === null || Number.isNaN(tasa)) return null;
  if (tasa < 0.35) return 1;
  if (tasa < 0.45) return 2;
  if (tasa <= 0.55) return 3;
  if (tasa <= 0.7) return 4;
  return 5;
}

/** Clase de color para una tasa, o cadena vacía si no hay datos. */
export function claseTasa(tasa: number | null): string {
  const nivel = nivelDeTasa(tasa);
  return nivel === null ? '' : claseNivel(nivel);
}

/**
 * Titular de una tarjeta. Cuando hay asunto, manda el asunto y la condición
 * pasa al detalle. Cuando no lo hay, la condición es la declaración entera y
 * ocupa el titular: nada de rellenar el hueco con una pregunta inventada.
 */
export function titularTarjeta(p: Prediccion): string {
  return esc(p.pregunta ?? p.condicion);
}

/** Línea bajo el titular. Cadena vacía cuando no hay nada más que decir. */
export function detalleTarjeta(p: Prediccion): string {
  if (p.pregunta) {
    const condicion = `Si <em>${esc(p.condicion)}</em>`;
    return p.significado_si ? `${condicion} → ${esc(p.significado_si)}` : condicion;
  }
  return p.significado_si ? `Significaría: ${esc(p.significado_si)}` : '';
}

/** Escapa texto antes de meterlo en el DOM por innerHTML. */
export function esc(texto: unknown): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
