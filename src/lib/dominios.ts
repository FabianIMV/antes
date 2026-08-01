const CLAVE = 'antes.dominios';

export const DOMINIOS_POR_DEFECTO = [
  'trivial-cotidiano',
  'trabajo',
  'relaciones',
  'salud',
  'dinero',
  'otros-personas',
  'azar-puro',
] as const;

export function dominios(): string[] {
  try {
    const guardados = localStorage.getItem(CLAVE);
    if (!guardados) return [...DOMINIOS_POR_DEFECTO];
    const lista = JSON.parse(guardados);
    if (Array.isArray(lista) && lista.every((d) => typeof d === 'string') && lista.length) {
      return lista;
    }
  } catch {
    /* localStorage inaccesible o corrupto: se usan los de fábrica */
  }
  return [...DOMINIOS_POR_DEFECTO];
}

export function guardarDominios(lista: string[]): void {
  const limpios = [...new Set(lista.map((d) => d.trim()).filter(Boolean))];
  if (!limpios.length) return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(limpios));
  } catch {
    /* sin persistencia: se pierde la personalización, no los datos */
  }
}

/** Añade un dominio nuevo a la lista local si no existía. */
export function agregarDominio(nombre: string): string[] {
  const lista = dominios();
  const limpio = nombre.trim();
  if (limpio && !lista.includes(limpio)) {
    lista.push(limpio);
    guardarDominios(lista);
  }
  return lista;
}
