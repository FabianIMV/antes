import {
  MINUTOS_CORRECCION,
  corregirACumplida,
  enVentanaDeCorreccion,
  resolver,
} from '../../lib/datos';
import {
  cuentaRegresiva,
  detalleTarjeta,
  esc,
  etiquetaVentana,
  fechaCorta,
  titularTarjeta,
} from '../../lib/formato';
import { abiertas } from '../../lib/estadistica';
import type { Prediccion, Resultado } from '../../lib/tipos';
import { alCambiar, estado, limpiarAvisoVencimiento, mensaje, recargar } from '../estado';

export function montarAbiertas(): void {
  const lista = document.querySelector<HTMLElement>('#lista-abiertas')!;
  const seccionCorreccion = document.querySelector<HTMLElement>('#seccion-correccion')!;
  const listaCorreccion = document.querySelector<HTMLElement>('#lista-correccion')!;
  const aviso = document.querySelector<HTMLElement>('#aviso-vencidas')!;
  const contador = document.querySelector<HTMLElement>('#contador-abiertas')!;

  alCambiar(() => pintar());
  lista.addEventListener('click', alPulsar);
  listaCorreccion.addEventListener('click', alPulsar);
  aviso.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).id === 'btn-cerrar-aviso') limpiarAvisoVencimiento();
    if ((ev.target as HTMLElement).id === 'btn-permitir-avisos') pedirPermiso();
  });

  // Un tick por segundo mueve los relojes sin repintar las tarjetas.
  setInterval(() => {
    const ahora = Date.now();
    for (const el of document.querySelectorAll<HTMLElement>('[data-vence]')) {
      const vence = el.dataset.vence!;
      el.textContent = cuentaRegresiva(vence, ahora);
      const restante = new Date(vence).getTime() - ahora;
      el.classList.toggle('reloj--urgente', restante > 0 && restante < 60_000);
      el.classList.toggle('reloj--vencido', restante <= 0);
    }

    // La ventana de corrección se cierra sola: la tarjeta debe desaparecer
    // sin esperar a la siguiente recarga.
    if (!seccionCorreccion.hidden && !estado.filas.some((f) => enVentanaDeCorreccion(f, ahora))) {
      pintar();
    }
  }, 1000);

  // `null` y no '' porque la lista vacía es una firma legítima que sí debe pintarse.
  let firmaPintada: string | null = null;

  function pintar(): void {
    const vivas = abiertas(estado.filas).sort(
      (a, b) => new Date(a.vence_en).getTime() - new Date(b.vence_en).getTime()
    );
    const corregibles = estado.filas.filter((f) => enVentanaDeCorreccion(f));

    contador.textContent = vivas.length ? String(vivas.length) : '';
    pintarAviso();

    // La app se recarga sola cada minuto. Repintar entonces borraría la nota
    // que se esté escribiendo, así que solo se repinta si el conjunto visible
    // cambió de verdad; y aun así se conservan las notas a medias.
    const firma = [...vivas, ...corregibles].map((f) => `${f.id}:${f.pendiente ? 'p' : ''}`).join('|');
    if (firma === firmaPintada) return;
    firmaPintada = firma;

    const notas = notasEnCurso();

    lista.innerHTML = vivas.length
      ? vivas.map(tarjetaAbierta).join('')
      : `<p class="vacio">Nada abierto. Lo que declares aparece aquí hasta que se resuelva —
         no hay forma de dejarlo a medias.</p>`;

    seccionCorreccion.hidden = corregibles.length === 0;
    listaCorreccion.innerHTML = corregibles.map(tarjetaCorreccion).join('');

    restaurarNotas(notas);
  }

  function pintarAviso(): void {
    const cerradas = estado.cerradasPorVencimiento;
    const pedirAvisos =
      typeof Notification !== 'undefined' && Notification.permission === 'default';

    if (!cerradas.length && !pedirAvisos) {
      aviso.hidden = true;
      aviso.innerHTML = '';
      return;
    }

    aviso.hidden = false;
    const partes: string[] = [];

    if (cerradas.length) {
      partes.push(
        `<div class="aviso aviso--alerta">
           <strong>${cerradas.length === 1 ? 'Venció una predicción' : `Vencieron ${cerradas.length} predicciones`}
           sin que la condición se cumpliera.</strong>
           Quedaron en «no». Puedes corregirlas abajo solo durante ${MINUTOS_CORRECCION} minutos
           desde el vencimiento.
           <button type="button" class="enlace-discreto" id="btn-cerrar-aviso">entendido</button>
         </div>`
      );
    }

    if (pedirAvisos) {
      partes.push(
        `<div class="aviso">
           Los plazos se cierran solos aunque no tengas la app abierta.
           <button type="button" class="enlace-discreto" id="btn-permitir-avisos">
             avisarme en el navegador
           </button>
         </div>`
      );
    }

    aviso.innerHTML = partes.join('');
  }

  async function alPulsar(ev: Event): Promise<void> {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-accion]');
    if (!boton) return;

    const id = boton.dataset.id!;
    const fila = estado.filas.find((f) => f.id === id);
    if (!fila) return;

    const accion = boton.dataset.accion!;
    const tarjeta = boton.closest<HTMLElement>('.tarjeta');
    const nota = tarjeta?.querySelector<HTMLTextAreaElement>('textarea')?.value ?? null;

    if (accion === 'ambiguo' && !confirm(
      'Marcar como ambigua no la borra: cuenta como categoría propia en la calibración. ' +
      'Si se acumulan, es señal de que las condiciones no están bien formuladas. ¿Seguir?'
    )) {
      return;
    }

    deshabilitar(tarjeta, true);
    try {
      if (accion === 'corregir') {
        await corregirACumplida(fila, nota);
      } else {
        await resolver(fila, accion as Resultado, nota);
      }
      await recargar();
    } catch (error) {
      alert(`No se pudo registrar el resultado: ${mensaje(error)}`);
      deshabilitar(tarjeta, false);
    }
  }
}

function notasEnCurso(): { valores: Map<string, string>; enfocada: string | null } {
  const valores = new Map<string, string>();
  for (const t of document.querySelectorAll<HTMLTextAreaElement>(
    '#lista-abiertas textarea, #lista-correccion textarea'
  )) {
    if (t.value) valores.set(t.id, t.value);
  }
  const activo = document.activeElement;
  const enfocada =
    activo instanceof HTMLTextAreaElement && valores.has(activo.id) ? activo.id : null;
  return { valores, enfocada };
}

function restaurarNotas({
  valores,
  enfocada,
}: {
  valores: Map<string, string>;
  enfocada: string | null;
}): void {
  for (const [id, valor] of valores) {
    const t = document.getElementById(id);
    if (t instanceof HTMLTextAreaElement) t.value = valor;
  }
  if (enfocada) {
    const t = document.getElementById(enfocada);
    if (t instanceof HTMLTextAreaElement) {
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    }
  }
}

function deshabilitar(tarjeta: HTMLElement | null | undefined, valor: boolean): void {
  if (!tarjeta) return;
  for (const b of tarjeta.querySelectorAll('button')) b.disabled = valor;
}

function tarjetaAbierta(p: Prediccion): string {
  return `
    <article class="tarjeta">
      <div class="tarjeta__cabeza">
        <div>
          <div class="tarjeta__pregunta">${titularTarjeta(p)}</div>
          ${detalleTarjeta(p) ? `<div class="tarjeta__condicion">${detalleTarjeta(p)}</div>` : ''}
        </div>
        <span class="reloj" data-vence="${esc(p.vence_en)}">${cuentaRegresiva(p.vence_en)}</span>
      </div>
      <div class="tarjeta__meta">
        <span>conf ${p.confianza}</span>
        <span>imp ${p.importancia}</span>
        <span>${esc(p.dominio)}</span>
        <span>${etiquetaVentana(p.ventana_minutos)}</span>
        <span>vence ${fechaCorta(p.vence_en)}</span>
        ${p.pendiente ? '<span style="color:var(--acento)">sin sincronizar</span>' : ''}
      </div>
      <label for="nota-${esc(p.id)}">Qué pasó realmente <span class="muy-tenue">— opcional</span></label>
      <textarea id="nota-${esc(p.id)}"></textarea>
      <div class="fila-botones" style="margin-top:0.5rem">
        <button type="button" class="boton boton--secundario" data-accion="si" data-id="${esc(p.id)}">
          Se cumplió
        </button>
        <button type="button" class="boton boton--secundario" data-accion="no" data-id="${esc(p.id)}">
          No se cumplió
        </button>
      </div>
      <div style="text-align:center">
        <button type="button" class="enlace-discreto" data-accion="ambiguo" data-id="${esc(p.id)}">
          ambiguo
        </button>
      </div>
    </article>`;
}

function tarjetaCorreccion(p: Prediccion): string {
  const limite = new Date(new Date(p.vence_en).getTime() + MINUTOS_CORRECCION * 60_000);
  return `
    <article class="tarjeta">
      <div class="tarjeta__cabeza">
        <div>
          <div class="tarjeta__pregunta">${titularTarjeta(p)}</div>
          ${detalleTarjeta(p) ? `<div class="tarjeta__condicion">${detalleTarjeta(p)}</div>` : ''}
        </div>
        <span class="marca-resultado marca-resultado--no">no</span>
      </div>
      <div class="tarjeta__meta">
        <span>venció ${fechaCorta(p.vence_en)}</span>
        <span>corregible hasta ${fechaCorta(limite.toISOString())}</span>
      </div>
      <label for="nota-corr-${esc(p.id)}">Qué pasó realmente <span class="muy-tenue">— opcional</span></label>
      <textarea id="nota-corr-${esc(p.id)}"></textarea>
      <div style="margin-top:0.5rem">
        <button type="button" class="boton boton--linea" data-accion="corregir" data-id="${esc(p.id)}">
          Sí se cumplió, estaba sin teléfono
        </button>
      </div>
    </article>`;
}

async function pedirPermiso(): Promise<void> {
  if (typeof Notification === 'undefined') return;
  try {
    await Notification.requestPermission();
  } catch {
    /* denegado o no soportado */
  }
  void recargar();
}
