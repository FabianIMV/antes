import { supabase } from '../lib/supabase';
import { BUSQUEDA_INICIAL, HASH_INICIAL } from '../lib/url-inicial';
import { mensaje } from './estado';

export const LARGO_MINIMO = 8;

/**
 * Acceso con correo y contraseña. Se eligió sobre el magic link porque el
 * enlace obliga a un salto entre el cliente de correo y el navegador que en
 * iOS acaba abriendo la app en un contexto sin sesión.
 *
 * La recuperación sigue siendo por enlace: es el único camino de vuelta si se
 * pierde la contraseña, y las predicciones no se pueden borrar ni mover a otra
 * cuenta.
 */

export interface OpcionesSesion {
  /** Se llama cuando el usuario abre el enlace de recuperación. */
  alRecuperar: () => void;
  /** Se llama tras fijar la contraseña nueva. */
  alTerminarRecuperacion: () => void;
}

export function urlDeVuelta(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

/**
 * Detecta el enlace de recuperación en la propia URL. Supabase emite
 * `PASSWORD_RECOVERY`, pero solo después de resolver el enlace y con distinto
 * orden según el flujo (implícito por hash, PKCE por `?code=`). Mirar el hash
 * cubre el caso implícito sin depender de ese detalle.
 */
export function urlPideRecuperacion(): boolean {
  const hash = new URLSearchParams(HASH_INICIAL.replace(/^#/, ''));
  if (hash.get('type') === 'recovery') return true;
  return new URLSearchParams(BUSQUEDA_INICIAL).get('type') === 'recovery';
}

/**
 * Abre la sesión que viene dentro del enlace de recuperación.
 *
 * Supabase manda esos enlaces en dos formatos según cómo esté configurado el
 * proyecto: `?code=` (PKCE) o `#access_token=…` (implícito). El cliente solo
 * resuelve automáticamente el que corresponde a su `flowType`, así que el
 * segundo se atiende aquí a mano. Sin esto, quien llegue por un enlace del
 * formato «equivocado» ve el formulario de contraseña nueva pero no puede
 * guardarla: no hay sesión detrás.
 */
export async function abrirSesionDeRecuperacion(): Promise<void> {
  if (!supabase) return;

  const hash = new URLSearchParams(HASH_INICIAL.replace(/^#/, ''));
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (!access_token || !refresh_token) return;

  const { data } = await supabase.auth.getSession();
  if (data.session) return;

  await supabase.auth.setSession({ access_token, refresh_token });
}

export function montarSesion({ alRecuperar, alTerminarRecuperacion }: OpcionesSesion): void {
  const form = document.querySelector<HTMLFormElement>('#form-sesion')!;
  const email = document.querySelector<HTMLInputElement>('#email')!;
  const password = document.querySelector<HTMLInputElement>('#password')!;
  const btnEntrar = document.querySelector<HTMLButtonElement>('#btn-entrar')!;
  const btnCrear = document.querySelector<HTMLButtonElement>('#btn-crear-cuenta')!;
  const btnOlvide = document.querySelector<HTMLButtonElement>('#btn-olvide')!;
  const estadoTexto = document.querySelector<HTMLElement>('#estado-sesion')!;

  const formRecuperacion = document.querySelector<HTMLFormElement>('#form-recuperacion')!;
  const passwordNueva = document.querySelector<HTMLInputElement>('#password-nueva')!;
  const btnGuardar = document.querySelector<HTMLButtonElement>('#btn-guardar-password')!;
  const estadoRecuperacion = document.querySelector<HTMLElement>('#estado-recuperacion')!;

  function decir(texto: string, error = false): void {
    estadoTexto.textContent = texto;
    estadoTexto.style.color = error ? 'var(--alerta)' : 'var(--tenue)';
  }

  function ocupado(valor: boolean): void {
    btnEntrar.disabled = valor;
    btnCrear.disabled = valor;
    btnOlvide.disabled = valor;
  }

  function credenciales(): { correo: string; clave: string } | null {
    const correo = email.value.trim();
    const clave = password.value;
    if (!correo) {
      decir('Falta el correo.', true);
      return null;
    }
    if (clave.length < LARGO_MINIMO) {
      decir(`La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`, true);
      return null;
    }
    return { correo, clave };
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!supabase) return;

    const datos = credenciales();
    if (!datos) return;

    ocupado(true);
    decir('Entrando…');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: datos.correo,
        password: datos.clave,
      });
      if (error) throw error;
      password.value = '';
      // El cambio de pantalla lo dispara onAuthStateChange.
    } catch (error) {
      decir(traducir(error), true);
    } finally {
      ocupado(false);
    }
  });

  btnCrear.addEventListener('click', async () => {
    if (!supabase) return;

    const datos = credenciales();
    if (!datos) return;

    ocupado(true);
    decir('Creando cuenta…');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: datos.correo,
        password: datos.clave,
        options: { emailRedirectTo: urlDeVuelta() },
      });
      if (error) throw error;

      if (data.session) {
        password.value = '';
        return;
      }
      // El proyecto tiene activada la confirmación por correo.
      decir(
        `Cuenta creada. Hay que confirmar ${datos.correo} desde el enlace del correo antes de ` +
          'entrar. Si prefieres evitar ese paso, desactiva «Confirm email» en Supabase.'
      );
    } catch (error) {
      decir(traducir(error), true);
    } finally {
      ocupado(false);
    }
  });

  btnOlvide.addEventListener('click', async () => {
    if (!supabase) return;

    const correo = email.value.trim();
    if (!correo) {
      decir('Escribe el correo primero y vuelve a pulsar.', true);
      email.focus();
      return;
    }

    ocupado(true);
    decir('Enviando…');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: urlDeVuelta(),
      });
      if (error) throw error;
      decir(`Enlace de recuperación enviado a ${correo}. Ábrelo en este mismo navegador.`);
    } catch (error) {
      decir(traducir(error), true);
    } finally {
      ocupado(false);
    }
  });

  formRecuperacion.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!supabase) return;

    if (passwordNueva.value.length < LARGO_MINIMO) {
      estadoRecuperacion.style.color = 'var(--alerta)';
      estadoRecuperacion.textContent = `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`;
      return;
    }

    btnGuardar.disabled = true;
    estadoRecuperacion.style.color = 'var(--tenue)';
    estadoRecuperacion.textContent = 'Guardando…';
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordNueva.value });
      if (error) throw error;
      passwordNueva.value = '';
      alTerminarRecuperacion();
    } catch (error) {
      estadoRecuperacion.style.color = 'var(--alerta)';
      estadoRecuperacion.textContent = traducir(error);
    } finally {
      btnGuardar.disabled = false;
    }
  });

  document.querySelector('#btn-salir')!.addEventListener('click', async () => {
    // Si la petición de cierre falla no se puede dejar la sesión abierta ni al
    // usuario esperando: se borra al menos la sesión local y se recarga igual.
    try {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;
    } catch {
      try {
        await supabase?.auth.signOut({ scope: 'local' });
      } catch {
        /* último recurso: la recarga parte de un almacenamiento ya limpio */
      }
    } finally {
      location.reload();
    }
  });

  // Supabase emite PASSWORD_RECOVERY al detectar el enlace en la URL.
  supabase?.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') alRecuperar();
  });
}

const TRADUCCIONES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [
    /email not confirmed/i,
    'Falta confirmar el correo. Abre el enlace que te llegó, o desactiva «Confirm email» en Supabase.',
  ],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese correo. Pulsa «Entrar», que no envía ningún correo.'],
  [/password should be at least (\d+)/i, 'La contraseña es demasiado corta para lo que exige el proyecto.'],
  [/should be different from the old password/i, 'La contraseña nueva debe ser distinta de la anterior.'],
  [/unable to validate email|invalid email/i, 'El correo no parece válido.'],
  // La cuota de correos del SMTP incluido en Supabase se cuenta por hora y es
  // muy baja. Confundirla con «demasiado rápido» manda a esperar un minuto que
  // no sirve de nada, así que el mensaje dice de dónde viene y cómo salir.
  [
    /email rate limit|over_email_send_rate_limit|email_send_rate_limit|quota|exceeded/i,
    'Se agotó la cuota de correos de Supabase, que en el plan gratuito es de unos pocos por hora. ' +
      'No falta nada por configurar en la app: si ya creaste y confirmaste la cuenta, pulsa «Entrar» — ' +
      'entrar con contraseña no envía ningún correo. Para levantar el límite, configura un SMTP propio ' +
      'en Project Settings → Authentication → SMTP Settings.',
  ],
  [
    /for security purposes, you can only request this after (\d+) seconds?/i,
    'Supabase obliga a esperar unos segundos entre envíos. Prueba de nuevo en un momento.',
  ],
  [/too many requests|rate limit/i, 'Demasiadas peticiones seguidas. Espera un momento.'],
  [/signups not allowed|signup is disabled/i, 'El registro está desactivado en Supabase (Authentication → Providers → Email).'],
  [/failed to fetch|network/i, 'Sin conexión con Supabase.'],
];

export function traducir(error: unknown): string {
  const texto = mensaje(error);
  for (const [patron, traduccion] of TRADUCCIONES) {
    if (patron.test(texto)) return traduccion;
  }
  return texto;
}
