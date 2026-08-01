import type { Prediccion } from './tipos';

/**
 * Un acierto es que la condición declarada se haya cumplido dentro de la
 * ventana. Las ambiguas no entran en la tasa: se cuentan aparte, porque una
 * ambigua no es medio acierto, es una condición mal formulada.
 */
export const LINEA_BASE = 0.5;
const Z_95 = 1.959963985;

export interface Grupo {
  clave: string;
  n: number;
  aciertos: number;
  ambiguas: number;
  tasa: number | null;
  intervalo: [number, number] | null;
}

export function resueltas(filas: Prediccion[]): Prediccion[] {
  return filas.filter((f) => f.resultado === 'si' || f.resultado === 'no');
}

export function abiertas(filas: Prediccion[]): Prediccion[] {
  return filas.filter((f) => f.resultado === null);
}

export function ambiguas(filas: Prediccion[]): Prediccion[] {
  return filas.filter((f) => f.resultado === 'ambiguo');
}

/**
 * Intervalo de confianza de Wilson al 95%. Se prefiere al intervalo normal
 * porque no miente con muestras pequeñas, que es exactamente el régimen en el
 * que vive esta app durante sus primeros meses.
 */
export function intervaloWilson(aciertos: number, n: number, z = Z_95): [number, number] | null {
  if (n <= 0) return null;
  const p = aciertos / n;
  const divisor = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / divisor;
  const margen = (z / divisor) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, centro - margen), Math.min(1, centro + margen)];
}

export function agrupar(filas: Prediccion[], clave: (f: Prediccion) => string): Grupo[] {
  const mapa = new Map<string, Prediccion[]>();
  for (const f of filas) {
    const k = clave(f);
    const lista = mapa.get(k);
    if (lista) lista.push(f);
    else mapa.set(k, [f]);
  }

  return [...mapa.entries()].map(([clave, grupo]) => resumir(clave, grupo));
}

export function resumir(clave: string, grupo: Prediccion[]): Grupo {
  const cerradas = resueltas(grupo);
  const aciertos = cerradas.filter((f) => f.resultado === 'si').length;
  const n = cerradas.length;
  return {
    clave,
    n,
    aciertos,
    ambiguas: grupo.filter((f) => f.resultado === 'ambiguo').length,
    tasa: n ? aciertos / n : null,
    intervalo: intervaloWilson(aciertos, n),
  };
}

/** Grupos 1..5 completos, incluidos los vacíos: la ausencia también informa. */
export function porNivel(filas: Prediccion[], campo: 'confianza' | 'importancia'): Grupo[] {
  return [1, 2, 3, 4, 5].map((nivel) =>
    resumir(String(nivel), filas.filter((f) => f[campo] === nivel))
  );
}

export function porDominio(filas: Prediccion[]): Grupo[] {
  return agrupar(filas, (f) => f.dominio).sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave));
}

export type Veredicto = 'sin-datos' | 'insuficiente' | 'compatible-con-azar' | 'se-aleja';

export interface Significancia {
  veredicto: Veredicto;
  texto: string;
}

/**
 * Lectura honesta del resultado global. El objetivo es que un 60% con
 * cincuenta tiradas no se lea como una prueba de nada, porque no lo es.
 */
export function significancia(aciertos: number, n: number): Significancia {
  if (n === 0) {
    return {
      veredicto: 'sin-datos',
      texto: 'Todavía no hay predicciones resueltas que medir.',
    };
  }

  const ic = intervaloWilson(aciertos, n)!;
  const rango = `IC 95%: ${pct(ic[0])} – ${pct(ic[1])}`;
  const contieneAzar = ic[0] <= LINEA_BASE && LINEA_BASE <= ic[1];

  if (n < 20) {
    return {
      veredicto: 'insuficiente',
      texto: `Con ${n} ${n === 1 ? 'predicción resuelta' : 'predicciones resueltas'} no hay base para concluir nada en ninguna dirección (${rango}).`,
    };
  }

  if (contieneAzar) {
    return {
      veredicto: 'compatible-con-azar',
      texto: `Con ${n} predicciones resueltas, este resultado todavía es compatible con el azar (${rango}, y el 50% cae dentro del intervalo).`,
    };
  }

  const direccion = aciertos / n > LINEA_BASE ? 'por encima' : 'por debajo';
  return {
    veredicto: 'se-aleja',
    texto: `Con ${n} predicciones resueltas, este resultado se aleja del azar: queda ${direccion} del 50%, que ya no cae dentro del intervalo (${rango}).`,
  };
}

export function pct(x: number | null, decimales = 0): string {
  if (x === null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(decimales)}%`;
}
