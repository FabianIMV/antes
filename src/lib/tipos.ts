export type Resultado = 'si' | 'no' | 'ambiguo';

export interface Prediccion {
  id: string;
  creada_en: string;
  pregunta: string;
  condicion: string;
  significado_si: string;
  ventana_minutos: number;
  vence_en: string;
  confianza: number;
  importancia: number;
  dominio: string;
  resultado: Resultado | null;
  resuelta_en: string | null;
  nota_posterior: string | null;
  user_id?: string;
  /** true si la fila vive solo en localStorage y aún no se sincronizó. */
  pendiente?: boolean;
}

export interface Declaracion {
  pregunta: string;
  condicion: string;
  significado_si: string;
  ventana_minutos: number;
  confianza: number;
  importancia: number;
  dominio: string;
}
