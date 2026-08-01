import { aCSV, aMarkdown, descargar, nombreArchivo } from '../../lib/exportar';
import {
  ETIQUETA_RESULTADO,
  detalleTarjeta,
  esc,
  etiquetaVentana,
  fechaLegible,
  titularTarjeta,
} from '../../lib/formato';
import { cerradaAutomaticamente } from '../../lib/datos';
import type { Prediccion } from '../../lib/tipos';
import { alCambiar, estado } from '../estado';

export function montarHistorial(): void {
  const lista = document.querySelector<HTMLElement>('#lista-historial')!;
  const resumen = document.querySelector<HTMLElement>('#resumen-historial')!;
  const filtroResultado = document.querySelector<HTMLSelectElement>('#filtro-resultado')!;
  const filtroDominio = document.querySelector<HTMLSelectElement>('#filtro-dominio')!;

  filtroResultado.addEventListener('change', pintar);
  filtroDominio.addEventListener('change', pintar);

  document.querySelector('#btn-md')!.addEventListener('click', () => {
    descargar(nombreArchivo('md'), aMarkdown(filtrar()), 'text/markdown');
  });
  document.querySelector('#btn-csv')!.addEventListener('click', () => {
    descargar(nombreArchivo('csv'), aCSV(filtrar()), 'text/csv');
  });

  alCambiar(pintar);

  function filtrar(): Prediccion[] {
    const r = filtroResultado.value;
    const d = filtroDominio.value;
    return estado.filas.filter((f) => {
      if (d && f.dominio !== d) return false;
      if (!r) return true;
      if (r === 'abierta') return f.resultado === null;
      return f.resultado === r;
    });
  }

  function pintar(): void {
    sincronizarDominios(filtroDominio);

    const filas = filtrar();
    resumen.textContent = `${filas.length} de ${estado.filas.length} ${
      estado.filas.length === 1 ? 'predicción' : 'predicciones'
    }. La exportación respeta el filtro activo.`;

    lista.innerHTML = filas.length
      ? filas.map(tarjeta).join('')
      : '<p class="vacio">Nada que mostrar con este filtro.</p>';
  }
}

function sincronizarDominios(select: HTMLSelectElement): void {
  const presentes = [...new Set(estado.filas.map((f) => f.dominio))].sort();
  const actual = select.value;
  const opciones = ['<option value="">Todos los dominios</option>'].concat(
    presentes.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`)
  );
  const nuevo = opciones.join('');
  if (select.innerHTML !== nuevo) {
    select.innerHTML = nuevo;
    select.value = presentes.includes(actual) ? actual : '';
  }
}

function tarjeta(p: Prediccion): string {
  const clase = p.resultado ?? 'abierta';
  const etiqueta = p.resultado ? ETIQUETA_RESULTADO[p.resultado] : 'Abierta';
  const automatica = cerradaAutomaticamente(p);

  return `
    <article class="tarjeta">
      <div class="tarjeta__cabeza">
        <div class="tarjeta__pregunta">${titularTarjeta(p)}</div>
        <span class="marca-resultado marca-resultado--${clase}">${esc(etiqueta)}</span>
      </div>
      ${detalleTarjeta(p) ? `<div class="tarjeta__condicion">${detalleTarjeta(p)}</div>` : ''}
      <div class="tarjeta__meta">
        <span>${fechaLegible(p.creada_en)}</span>
        <span>conf ${p.confianza}</span>
        <span>imp ${p.importancia}</span>
        <span>${esc(p.dominio)}</span>
        <span>${etiquetaVentana(p.ventana_minutos)}</span>
        ${automatica ? '<span>cerrada al vencer</span>' : ''}
        ${p.pendiente ? '<span style="color:var(--acento)">sin sincronizar</span>' : ''}
      </div>
      ${p.nota_posterior ? `<p class="nota">${esc(p.nota_posterior)}</p>` : ''}
    </article>`;
}
