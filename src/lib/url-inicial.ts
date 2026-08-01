/**
 * Fotografía de la URL con la que se abrió la página.
 *
 * Existe por una cuestión de orden: el cliente de Supabase, al construirse con
 * `detectSessionInUrl`, consume el hash del enlace y lo borra de la barra de
 * direcciones. Cualquier comprobación posterior llegaría tarde. Este módulo se
 * importa desde `supabase.ts` para garantizar que se evalúa antes de que el
 * cliente exista.
 */
export const HASH_INICIAL = typeof location !== 'undefined' ? location.hash : '';
export const BUSQUEDA_INICIAL = typeof location !== 'undefined' ? location.search : '';
