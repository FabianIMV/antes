import {
  LINEA_BASE,
  ambiguas,
  abiertas,
  pct,
  porDominio,
  porNivel,
  resumir,
  significancia,
  type Grupo,
} from '../../lib/estadistica';
import { esc } from '../../lib/formato';
import { alCambiar, estado } from '../estado';

export function montarCalibracion(): void {
  const contenedor = document.querySelector<HTMLElement>('#contenido-calibracion')!;
  alCambiar(() => {
    contenedor.innerHTML = render();
  });
}

function render(): string {
  const filas = estado.filas;
  const global = resumir('global', filas);
  const sig = significancia(global.aciertos, global.n);
  const nAmbiguas = ambiguas(filas).length;
  const nAbiertas = abiertas(filas).length;
  const totalCerradas = global.n + nAmbiguas;

  if (filas.length === 0) {
    return `<p class="vacio">Sin datos todavía. La calibración necesita predicciones resueltas,
      y las predicciones necesitan haberse declarado antes.</p>`;
  }

  return `
    ${bloqueGlobal(global, sig.texto)}
    ${bloqueNivel('Curva de calibración por confianza', porNivel(filas, 'confianza'),
      `Qué porcentaje se cumplió en cada nivel de confianza declarado. Es la única pantalla que
       enseña algo aplicable en el momento de la impresión: si el 5 acierta muy por encima del 3,
       la sensación fuerte lleva información. Si todos los niveles se parecen entre sí y al 50%,
       la sensación no distingue nada.`)}
    ${bloqueNivel('Acierto por importancia', porNivel(filas, 'importancia'),
      `La prueba directa de si la precisión cae donde hay deseo. Si el nivel 5 de importancia
       acierta menos que el 1, el resultado se está contaminando con lo que se quiere que pase.`)}
    ${bloqueDominio(porDominio(filas))}
    ${bloqueAmbiguas(nAmbiguas, totalCerradas, nAbiertas)}
  `;
}

function bloqueGlobal(global: Grupo, textoSignificancia: string): string {
  return `
    <section>
      <div class="cifra">${pct(global.tasa, 1)}</div>
      <p class="tenue pequeno" style="margin-top:0.35rem">
        ${global.aciertos} de ${global.n} predicciones resueltas se cumplieron.
        Línea base del azar en una binaria: <strong>50%</strong>.
      </p>
      <div class="aviso" style="margin-top:0.75rem">${esc(textoSignificancia)}</div>
      <p class="pequeno muy-tenue">
        «Acierto» significa que la condición declarada se cumplió dentro de su ventana.
        Las ambiguas no entran en esta tasa.
      </p>
    </section>`;
}

function bloqueNivel(titulo: string, grupos: Grupo[], nota: string): string {
  return `
    <section class="bloque">
      <h2>${esc(titulo)}</h2>
      <p class="bloque__nota">${nota}</p>
      ${grupos.map((g) => filaBarra(g.clave, g)).join('')}
      ${leyenda()}
    </section>`;
}

function bloqueDominio(grupos: Grupo[]): string {
  if (!grupos.length) return '';
  return `
    <section class="bloque">
      <h2>Acierto por dominio</h2>
      <p class="bloque__nota">Dónde el registro es fiable y dónde no.</p>
      ${grupos.map((g) => filaBarra(g.clave, g)).join('')}
      ${leyenda()}
    </section>`;
}

function bloqueAmbiguas(nAmbiguas: number, totalCerradas: number, nAbiertas: number): string {
  const proporcion = totalCerradas ? nAmbiguas / totalCerradas : 0;
  const advertencia =
    proporcion > 0.2 && nAmbiguas >= 3
      ? `<p class="aviso aviso--alerta" style="margin-top:0.75rem">
           Más de una de cada cinco resoluciones es ambigua. Eso no habla del azar, habla de la
           redacción: las condiciones se están formulando de un modo que no permite fallar.
         </p>`
      : '';

  return `
    <section class="bloque">
      <h2>Ambiguas y abiertas</h2>
      <p class="bloque__nota">
        Las ambiguas no se descartan ni se reparten: son su propia categoría, y su número es un
        diagnóstico de las condiciones.
      </p>
      <div class="barra-fila">
        <span class="barra-fila__clave">ambiguas</span>
        <div class="barra">
          <div class="barra__relleno" style="width:${(proporcion * 100).toFixed(1)}%"></div>
        </div>
        <span class="barra-fila__valor">${nAmbiguas} / ${totalCerradas}</span>
      </div>
      <p class="pequeno muy-tenue" style="margin-top:0.5rem">
        ${nAbiertas} ${nAbiertas === 1 ? 'predicción abierta' : 'predicciones abiertas'} sin resolver.
      </p>
      ${advertencia}
    </section>`;
}

function filaBarra(clave: string, g: Grupo): string {
  const ancho = g.tasa === null ? 0 : g.tasa * 100;
  const intervalo =
    g.intervalo && g.n > 0
      ? `<div class="barra__intervalo" style="left:${(g.intervalo[0] * 100).toFixed(1)}%;width:${(
          (g.intervalo[1] - g.intervalo[0]) * 100
        ).toFixed(1)}%"></div>`
      : '';

  return `
    <div class="barra-fila">
      <span class="barra-fila__clave" title="${esc(clave)}">${esc(clave)}</span>
      <div class="barra" role="img" aria-label="${esc(clave)}: ${pct(g.tasa)} de ${g.n}">
        <div class="barra__relleno" style="width:${ancho.toFixed(1)}%"></div>
        ${intervalo}
        <div class="barra__azar" style="left:${LINEA_BASE * 100}%"></div>
      </div>
      <span class="barra-fila__valor">${pct(g.tasa)} · n=${g.n}</span>
    </div>`;
}

function leyenda(): string {
  return `
    <div class="leyenda">
      <span>barra: tasa de acierto</span>
      <span>línea vertical: 50% (azar)</span>
      <span>línea horizontal: IC 95%</span>
      <span>n: resueltas, sin ambiguas</span>
    </div>`;
}
