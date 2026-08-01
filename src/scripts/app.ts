import { configurado, supabase } from '../lib/supabase';
import { alCambiar, estado, recargar } from './estado';
import {
  abrirSesionDeRecuperacion,
  montarSesion,
  traducir,
  urlPideRecuperacion,
} from './sesion';
import { montarDeclarar } from './vistas/declarar';
import { montarAbiertas } from './vistas/abiertas';
import { montarCalibracion } from './vistas/calibracion';
import { montarHistorial } from './vistas/historial';

const VISTAS = ['declarar', 'abiertas', 'calibracion', 'historial'] as const;
type Vista = (typeof VISTAS)[number];

const app = document.querySelector<HTMLElement>('#app')!;
const pantallaSesion = document.querySelector<HTMLElement>('#pantalla-sesion')!;
const pantallaRecuperacion = document.querySelector<HTMLElement>('#pantalla-recuperacion')!;
const avisoConfig = document.querySelector<HTMLElement>('#sin-configurar')!;

/** Mientras se fija una contraseña nueva no se entra a la app. */
let recuperandoPassword = false;

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

function mostrarApp(hayCuenta: boolean, email?: string): void {
  const enRecuperacion = recuperandoPassword;
  pantallaRecuperacion.hidden = !enRecuperacion;
  app.hidden = enRecuperacion || !hayCuenta;
  pantallaSesion.hidden = enRecuperacion || hayCuenta;
  const cuenta = document.querySelector<HTMLElement>('#cuenta-actual');
  if (cuenta) cuenta.textContent = email ? ` — sesión de ${email}` : '';
}

async function arrancar(): Promise<void> {
  montarNavegacion();
  montarSesion({
    alRecuperar: () => {
      recuperandoPassword = true;
      mostrarApp(false);
      document.querySelector<HTMLInputElement>('#password-nueva')?.focus();
    },
    alTerminarRecuperacion: async () => {
      recuperandoPassword = false;
      const { data } = await supabase!.auth.getSession();
      mostrarApp(Boolean(data.session), data.session?.user.email ?? undefined);
      if (data.session) {
        irA(location.hash.slice(1) || 'declarar');
        await recargar();
      }
    },
  });
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

  // El enlace de recuperación crea una sesión válida, pero no debe abrir la
  // app: primero hay que fijar la contraseña nueva.
  if (urlPideRecuperacion()) {
    recuperandoPassword = true;
    await abrirSesionDeRecuperacion();
  }

  supabase!.auth.onAuthStateChange((_evento, nueva) => {
    mostrarApp(Boolean(nueva), nueva?.user.email ?? undefined);
    if (nueva && !recuperandoPassword) {
      irA(location.hash.slice(1) || 'declarar');
      void recargar();
    }
  });

  const { data } = await supabase!.auth.getSession();
  const sesion = data.session;
  mostrarApp(Boolean(sesion), sesion?.user.email ?? undefined);

  if (recuperandoPassword) {
    document.querySelector<HTMLInputElement>('#password-nueva')?.focus();
    return;
  }

  if (sesion) {
    irA(location.hash.slice(1) || 'declarar');
    await recargar();
  }
}

/**
 * Si el arranque falla —red caída al recuperar la sesión, almacenamiento
 * bloqueado— la pantalla no puede quedarse en blanco: se muestra el acceso con
 * el motivo, que al menos deja intentar de nuevo.
 */
void arrancar().catch((error) => {
  console.error('antes: fallo al arrancar', error);
  recuperandoPassword = false;
  mostrarApp(false);
  const estadoTexto = document.querySelector<HTMLElement>('#estado-sesion');
  if (estadoTexto) {
    estadoTexto.style.color = 'var(--alerta)';
    estadoTexto.textContent = `No se pudo arrancar: ${traducir(error)}`;
  }
});
