import { declarar } from '../../lib/datos';
import { agregarDominio, dominios } from '../../lib/dominios';
import { esc } from '../../lib/formato';
import { mensaje, recargar } from '../estado';

const VENTANA_POR_DEFECTO = 5;

let ventanaElegida: number | null = VENTANA_POR_DEFECTO;
let confianza: number | null = null;
let importancia: number | null = null;
let dominio: string | null = null;

export function montarDeclarar(irA: (vista: string) => void): void {
  const form = document.querySelector<HTMLFormElement>('#form-declarar')!;
  const grupoVentana = document.querySelector<HTMLElement>('#grupo-ventana')!;
  const campoPersonalizada = document.querySelector<HTMLElement>('#campo-ventana-personalizada')!;
  const inputPersonalizada = document.querySelector<HTMLInputElement>('#ventana_personalizada')!;
  const grupoConfianza = document.querySelector<HTMLElement>('#grupo-confianza')!;
  const grupoImportancia = document.querySelector<HTMLElement>('#grupo-importancia')!;
  const grupoDominio = document.querySelector<HTMLElement>('#grupo-dominio')!;
  const btnNuevoDominio = document.querySelector<HTMLButtonElement>('#btn-nuevo-dominio')!;
  const btnDeclarar = document.querySelector<HTMLButtonElement>('#btn-declarar')!;
  const estadoTexto = document.querySelector<HTMLElement>('#estado-declarar')!;

  pintarDominios(grupoDominio);

  grupoVentana.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-ventana]');
    if (!boton) return;
    const valor = boton.dataset.ventana!;
    marcarUnico(grupoVentana, boton);
    if (valor === 'personalizado') {
      ventanaElegida = null;
      campoPersonalizada.hidden = false;
      inputPersonalizada.focus();
    } else {
      ventanaElegida = Number(valor);
      campoPersonalizada.hidden = true;
    }
  });

  grupoConfianza.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-valor]');
    if (!boton) return;
    marcarUnico(grupoConfianza, boton);
    confianza = Number(boton.dataset.valor);
  });

  grupoImportancia.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-valor]');
    if (!boton) return;
    marcarUnico(grupoImportancia, boton);
    importancia = Number(boton.dataset.valor);
  });

  grupoDominio.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-dominio]');
    if (!boton) return;
    marcarUnico(grupoDominio, boton);
    dominio = boton.dataset.dominio!;
  });

  btnNuevoDominio.addEventListener('click', () => {
    const nombre = prompt('Nombre del dominio nuevo');
    if (!nombre || !nombre.trim()) return;
    agregarDominio(nombre);
    dominio = nombre.trim();
    pintarDominios(grupoDominio);
    document.dispatchEvent(new CustomEvent('antes:dominios'));
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const pregunta = valor('#pregunta');
    const condicion = valor('#condicion');
    const significado_si = valor('#significado_si') || 'sí';
    const minutos = ventanaElegida ?? Number(inputPersonalizada.value);

    const falta = validar({ pregunta, condicion, minutos, confianza, importancia, dominio });
    if (falta) {
      estadoTexto.className = 'pequeno';
      estadoTexto.style.color = 'var(--alerta)';
      estadoTexto.textContent = falta;
      return;
    }

    btnDeclarar.disabled = true;
    estadoTexto.style.color = 'var(--tenue)';
    estadoTexto.textContent = 'Guardando…';

    try {
      const fila = await declarar({
        pregunta,
        condicion,
        significado_si,
        ventana_minutos: minutos,
        confianza: confianza!,
        importancia: importancia!,
        dominio: dominio!,
      });

      reiniciar(form, grupoVentana, grupoConfianza, grupoImportancia, grupoDominio, campoPersonalizada, inputPersonalizada);
      estadoTexto.textContent = fila.pendiente
        ? 'Declarada sin red. Guardada en este dispositivo; se sube sola al reconectar.'
        : 'Declarada. El plazo corre.';
      void recargar();
      irA('abiertas');
    } catch (error) {
      estadoTexto.style.color = 'var(--alerta)';
      estadoTexto.textContent = `No se pudo guardar: ${mensaje(error)}`;
    } finally {
      btnDeclarar.disabled = false;
    }
  });

  document.addEventListener('antes:dominios', () => pintarDominios(grupoDominio));
}

function validar(d: {
  pregunta: string;
  condicion: string;
  minutos: number;
  confianza: number | null;
  importancia: number | null;
  dominio: string | null;
}): string | null {
  if (!d.pregunta) return 'Falta la pregunta.';
  if (!d.condicion) return 'Falta la condición.';
  if (!Number.isFinite(d.minutos) || d.minutos < 1) return 'Falta la ventana temporal.';
  if (d.minutos > 525600) return 'La ventana no puede pasar de un año.';
  if (!d.confianza) return 'Falta la confianza.';
  if (!d.importancia) return 'Falta la importancia.';
  if (!d.dominio) return 'Falta el dominio.';
  return null;
}

function valor(selector: string): string {
  return document.querySelector<HTMLInputElement>(selector)!.value.trim();
}

function marcarUnico(grupo: HTMLElement, elegido: HTMLElement): void {
  for (const b of grupo.querySelectorAll('[aria-pressed]')) {
    b.setAttribute('aria-pressed', String(b === elegido));
  }
}

function pintarDominios(grupo: HTMLElement): void {
  grupo.innerHTML = dominios()
    .map(
      (d) =>
        `<button type="button" class="opcion" data-dominio="${esc(d)}" aria-pressed="${
          d === dominio ? 'true' : 'false'
        }">${esc(d)}</button>`
    )
    .join('');
}

function reiniciar(
  form: HTMLFormElement,
  grupoVentana: HTMLElement,
  grupoConfianza: HTMLElement,
  grupoImportancia: HTMLElement,
  grupoDominio: HTMLElement,
  campoPersonalizada: HTMLElement,
  inputPersonalizada: HTMLInputElement
): void {
  form.reset();
  document.querySelector<HTMLInputElement>('#significado_si')!.value = 'sí';
  inputPersonalizada.value = '';
  campoPersonalizada.hidden = true;

  confianza = null;
  importancia = null;
  dominio = null;
  ventanaElegida = VENTANA_POR_DEFECTO;

  for (const b of grupoConfianza.querySelectorAll('[aria-pressed]'))
    b.setAttribute('aria-pressed', 'false');
  for (const b of grupoImportancia.querySelectorAll('[aria-pressed]'))
    b.setAttribute('aria-pressed', 'false');

  const porDefecto = grupoVentana.querySelector<HTMLElement>(
    `[data-ventana="${VENTANA_POR_DEFECTO}"]`
  );
  if (porDefecto) marcarUnico(grupoVentana, porDefecto);
  pintarDominios(grupoDominio);
}
