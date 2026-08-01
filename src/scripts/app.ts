import { configurado, supabase } from '../lib/supabase';
import { alCambiar, estado, mensaje, recargar } from './estado';
import { montarDeclarar } from './vistas/declarar';
import { montarAbiertas } from './vistas/abiertas';
import { montarCalibracion } from './vistas/calibracion';
import { montarHistorial } from './vistas/historial';

const VISTAS = ['declarar', 'abiertas', 'calibracion', 'historial'] as const;
type Vista = (typeof VISTAS)[number];

const app = document.querySelector<HTMLElement>('#app')!;
const pantallaSesion = document.querySelector<HTMLElement>('#pantalla-sesion')!;
const avisoConfig = document.querySelector<HTMLElement>('#sin-configurar')!;

function irA(vista: string): void {
  const destino = (VISTAS as readonly string[]).includes(vista) ? (vista as Vista) : 'declarar';
  for (const v of VISTAS) {
    document.querySelector<HTMLElement>(`#vista-${v}`)!.hidden = v !== destino;
  }
  for (const boton of document.querySelectorAll<HTMLElement>('.nav__boton')) {
    if (boton.dataset.vista === destino) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  if (location.hash.slice(1) !== destino) history.replaceState(null, '', `#${destino}`);
  window.scrollTo(0, 0);
}

function montarNavegacion(): void {
  for (const boton of document.querySelectorAll<HTMLElement>('.nav__boton')) {
    boton.addEventListener('click', () => irA(boton.dataset.vista!));
  }
  window.addEventListener('hashchange', () => irA(location.hash.slice(1)));
}

function montarSesion(): void {
  const form = document.querySelector<HTMLFormElement>('#form-sesion')!;
  const estadoTexto = document.querySelector<HTMLElement>('#estado-sesion')!;
  const boton = document.querySelector<HTMLButtonElement>('#btn-enviar-enlace')!;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!supabase) return;

    const email = document.querySelector<HTMLInputElement>('#email')!.value.trim();
    if (!email) {
      estadoTexto.textContent = 'Falta el correo.';
      return;
    }

    boton.disabled = true;
    estadoTexto.textContent = 'Enviando…';
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).href },
      });
      if (error) throw error;
      estadoTexto.textContent = `Enlace enviado a ${email}. Ábrelo en este mismo dispositivo.`;
    } catch (error) {
      estadoTexto.textContent = `No se pudo enviar: ${mensaje(error)}`;
    } finally {
      boton.disabled = false;
    }
  });

  document.querySelector('#btn-salir')!.addEventListener('click', async () => {
    await supabase?.auth.signOut();
    location.reload();
  });
}

function mostrarApp(hayCuenta: boolean, email?: string): void {
  app.hidden = !hayCuenta;
  pantallaSesion.hidden = hayCuenta;
  const cuenta = document.querySelector<HTMLElement>('#cuenta-actual');
  if (cuenta) cuenta.textContent = email ? ` — sesión de ${email}` : '';
}

async function arrancar(): Promise<void> {
  montarNavegacion();
  montarSesion();
  montarDeclarar(irA);
  montarAbiertas();
  montarCalibracion();
  montarHistorial();

  alCambiar(() => {
    if (estado.error) {
      console.warn('antes:', estado.error);
    }
  });

  avisoConfig.hidden = configurado;

  // El plazo corre aunque la pestaña esté cerrada: al volver, se pone al día.
  window.addEventListener('online', () => void recargar());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void recargar();
  });
  setInterval(() => void recargar(), 60_000);

  if (!configurado) {
    // Sin backend la app sigue siendo utilizable: todo queda en el dispositivo
    // y se sube en cuanto se configure Supabase.
    mostrarApp(true);
    irA(location.hash.slice(1) || 'declarar');
    await recargar();
    return;
  }

  const { data } = await supabase!.auth.getSession();
  const sesion = data.session;
  mostrarApp(Boolean(sesion), sesion?.user.email ?? undefined);

  if (sesion) {
    irA(location.hash.slice(1) || 'declarar');
    await recargar();
  }

  supabase!.auth.onAuthStateChange((_evento, nueva) => {
    mostrarApp(Boolean(nueva), nueva?.user.email ?? undefined);
    if (nueva) {
      irA(location.hash.slice(1) || 'declarar');
      void recargar();
    }
  });
}

void arrancar();
