export type Resultado = 'si' | 'no' | 'ambiguo';

export interface Prediccion {
  id: string;
  creada_en: string;
  /**
   * El asunto al que apunta, cuando apunta a alguno. Es opcional a propósito:
   * no toda impresión llega en forma de pregunta, y obligar a inventarle una
   * deforma lo que se estaba declarando.
   */
  pregunta: string | null;
  condicion: string;
  /** Qué respondería el cumplimiento. Solo aplica si hay un asunto detrás. */
  significado_si: string | null;
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
  pregunta: string | null;
  condicion: string;
  significado_si: string | null;
  ventana_minutos: number;
  confianza: number;
  importancia: number;
  dominio: string;
}
