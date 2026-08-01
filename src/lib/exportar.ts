import type { Prediccion } from './tipos';
import { ETIQUETA_RESULTADO, etiquetaVentana } from './formato';

const COLUMNAS = [
  'id',
  'creada_en',
  'pregunta',
  'condicion',
  'significado_si',
  'ventana_minutos',
  'vence_en',
  'confianza',
  'importancia',
  'dominio',
  'resultado',
  'resuelta_en',
  'nota_posterior',
] as const;

export function aCSV(filas: Prediccion[]): string {
  const lineas = [COLUMNAS.join(',')];
  for (const f of filas) {
    const fila = f as unknown as Record<string, unknown>;
    lineas.push(COLUMNAS.map((c) => celdaCSV(fila[c])).join(','));
  }
  return lineas.join('\n') + '\n';
}

function celdaCSV(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aMarkdown(filas: Prediccion[]): string {
  const cabecera = [
    '# antes — registro de predicciones',
    '',
    `Exportado el ${new Date().toLocaleString()}.`,
    `${filas.length} ${filas.length === 1 ? 'predicción' : 'predicciones'}.`,
    '',
    'Un acierto significa que la condición declarada se cumplió dentro de su ventana.',
    'Las ambiguas no entran en la tasa de acierto.',
    '',
    '| Declarada | Pregunta | Condición | Si se cumple | Ventana | Conf. | Imp. | Dominio | Resultado | Resuelta | Nota |',
    '| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |',
  ];

  const cuerpo = filas.map((f) =>
    [
      f.creada_en,
      celdaMD(f.pregunta),
      celdaMD(f.condicion),
      celdaMD(f.significado_si),
      etiquetaVentana(f.ventana_minutos),
      String(f.confianza),
      String(f.importancia),
      celdaMD(f.dominio),
      f.resultado ? ETIQUETA_RESULTADO[f.resultado] : 'Abierta',
      f.resuelta_en ?? '',
      celdaMD(f.nota_posterior ?? ''),
    ].join(' | ')
  );

  return `${cabecera.join('\n')}\n| ${cuerpo.join(' |\n| ')} |\n`;
}

function celdaMD(texto: string): string {
  return texto.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function descargar(nombre: string, contenido: string, tipo: string): void {
  const blob = new Blob([contenido], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function nombreArchivo(extension: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `antes-${hoy}.${extension}`;
}
