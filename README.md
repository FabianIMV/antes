# antes

Registro y calibración de intuición. Se declara una predicción **antes** del
hecho —qué tiene que pasar, en qué plazo, con cuánta confianza y cuánto
importa— y después solo se anota lo que pasó. El registro no se puede editar.

Nace de un problema concreto: llevar años haciendo predicciones informales
(«si pasa un auto blanco en los próximos dos minutos, la respuesta es sí») y
recordar solo los aciertos. Sin registro previo y sin plazo cerrado, la
práctica produce una sensación de eficacia que ningún dato respalda.

La app es un instrumento, no un espejo. No hay rachas, ni felicitaciones, ni
insignias. Hay números crudos y, junto a ellos, la línea base del azar.

---

## Por qué no se pueden editar las predicciones

Es la decisión central del diseño, y no es una restricción de la interfaz: es
una regla del motor de base de datos.

Una predicción que puede reescribirse después del hecho no mide nada. Basta
con ajustar levemente la condición («bueno, en realidad valía cualquier auto
claro»), alargar el plazo («todavía puede pasar») o bajar la confianza que se
declaró («tampoco es que estuviera tan seguro») para que cualquier serie de
resultados acabe pareciendo buena. Ese ajuste no se siente como trampa
mientras se hace; se siente como precisar. Por eso no puede quedar disponible.

En concreto:

1. **Lo declarado se congela en el INSERT.** Condición, asunto, significado,
   ventana, confianza, importancia y dominio son inmutables a partir de ahí.
   Un trigger `BEFORE UPDATE` rechaza cualquier cambio en esos campos, venga de
   la app, del editor SQL de Supabase o de `curl`. La interfaz ni siquiera
   ofrece la opción, pero aunque la ofreciera, el servidor diría que no.
2. **El plazo lo fija el servidor.** `vence_en` se calcula como
   `creada_en + ventana_minutos`, ignorando lo que mande el cliente. No se
   puede alargar una ventana en curso ni al declarar ni al sincronizar algo
   declarado sin red.
3. **Al vencer el plazo sin que la condición se cumpla, el resultado es «no».**
   Automáticamente. Sin esto se espera hasta que el augurio se cumpla y todo
   sale «sí».
4. **El resultado se escribe una sola vez.** La única excepción es corregir a
   «sí» un cierre automático, y solo dentro de los 10 minutos siguientes al
   vencimiento — existe para el caso real de haber estado sin teléfono, y para
   nada más. Pasados esos 10 minutos, el servidor rechaza la corrección.
5. **No se puede borrar nada.** No hay política de `DELETE` y el privilegio
   está revocado. Borrar una predicción abierta es la forma más limpia de
   abandonarla, y abandonarlas es justo lo que esta herramienta existe para
   impedir. Lo que no se puede resolver se marca «ambiguo», y las ambiguas
   cuentan como categoría propia en las estadísticas: no desaparecen.

## Qué se declara

Lo único obligatorio es **qué tiene que pasar**: algo observable que pueda
cumplirse o fallar dentro de un plazo cerrado. Sin eso no hay nada que medir.

El **asunto** —la pregunta o el tema al que apunta— es opcional, igual que
**qué significaría** su cumplimiento. Muchas impresiones no llegan en forma de
pregunta: a veces solo se sabe que algo va a pasar, sin que responda a nada.
Obligar a inventarle una pregunta deforma justo aquello que se quería registrar
sin adornos, así que la app no la pide. Cuando sí hay una consulta detrás
—«si pasa un auto blanco, la respuesta es sí»—, los dos campos están ahí.

## Qué mide

Un **acierto** es que la condición declarada se haya cumplido dentro de su
ventana. La línea base a batir es el 50% de una binaria, y aparece siempre
junto a la cifra global; sin ese contraste el número no significa nada.

La pantalla de calibración muestra:

- **Tasa global de acierto** con el total de predicciones resueltas.
- **Significancia estadística**: intervalo de confianza binomial de Wilson al
  95%, y una lectura honesta del tipo «con 34 predicciones, este resultado
  todavía es compatible con el azar». Cincuenta tiradas con 60% de acierto
  parecen prueba de algo y no lo son.
- **Curva de calibración por nivel de confianza** (1–5). El gráfico más útil
  de la app: enseña a distinguir, en el momento de la impresión, cuáles llevan
  información. Si el nivel 5 acierta muy por encima del 3, se ha aprendido algo
  real; si todos los niveles se parecen entre sí y al 50%, la sensación no
  distingue nada.
- **Acierto cruzado por importancia** (1–5). La prueba directa de si la
  precisión cae donde hay deseo. Es el campo que casi ninguna herramienta de
  este tipo registra, y sin él esa correlación es invisible.
- **Acierto por dominio.** Dónde el registro es fiable y dónde no.
- **Contador de ambiguas.** Si sube mucho, no habla del azar: habla de que las
  condiciones se están formulando de un modo que no permite fallar.

## Stack

Astro (sitio estático) · Supabase (Postgres + Auth con correo y contraseña) ·
sin frameworks de UI · desplegado en GitHub Pages con GitHub Actions.

Mobile-first y usable con una mano. Si falla la escritura, la declaración se
encola en `localStorage` con su hora real y se sincroniza al reconectar: nunca
se pierde una declaración por falta de red.

### Acceso

Correo y contraseña, no magic link. El enlace obliga a un salto entre el
cliente de correo y el navegador; en iOS el correo suele abrirlo en una vista
web incrustada, que no comparte el almacenamiento del navegador, así que la
app se carga sin la sesión que el enlace acababa de crear. Con contraseña no
hay salto, y el llavero del teléfono la rellena.

La recuperación sí va por enlace (**olvidé la contraseña**): es el único camino
de vuelta, porque las predicciones no se pueden borrar ni transferir a otra
cuenta. Ábrelo en el navegador, no dentro del cliente de correo.

---

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (el plan gratuito
   sobra para uso personal).
2. Abre **SQL Editor → New query**, pega el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) y ejecútalo. Crea la tabla, los
   índices, los triggers de inmutabilidad y las políticas de Row Level
   Security. El script es idempotente: puedes volver a ejecutarlo.

   Si ya tenías el esquema de una versión anterior, ejecuta además las
   migraciones de [`supabase/`](supabase/) que aún no hayas aplicado, en orden.
   Ninguna toca las filas existentes.
3. En **Authentication → Providers → Email**, deja habilitado *Email* y
   **desactiva «Confirm email»**. La app entra con correo y contraseña; con la
   confirmación activada, crear la cuenta obliga a abrir un enlace desde el
   móvil, que es justo lo que este esquema evita. Si prefieres dejarla
   activada, la app lo detecta y te dice que confirmes antes de entrar.
4. En **Authentication → URL Configuration**, añade a *Redirect URLs* la
   dirección donde vaya a vivir la app:
   - `http://localhost:4321/` para desarrollo,
   - `https://<usuario>.github.io/<repo>/` para producción.

   Solo hace falta para la recuperación de contraseña, pero sin ellas ese
   enlace rebota.
5. En **Project Settings → API**, copia *Project URL* y la clave **anon /
   public**.
6. La primera vez, abre la app y pulsa **Crear cuenta**. Es una herramienta
   personal: si quieres cerrar el registro después, desactiva *Allow new users
   to sign up* en **Authentication → Providers → Email**.

> La clave `anon` viaja al navegador y eso es correcto: la autorización la
> impone Row Level Security en el servidor, no el secreto de la clave. La
> clave `service_role` **nunca** debe aparecer en el cliente ni en este
> repositorio.

### 2. Variables de entorno

| Variable                   | Dónde se usa  | Qué es                                              |
| -------------------------- | ------------- | --------------------------------------------------- |
| `PUBLIC_SUPABASE_URL`      | build/cliente | *Project URL* del proyecto Supabase.                 |
| `PUBLIC_SUPABASE_ANON_KEY` | build/cliente | Clave **anon / public**. Nunca la `service_role`.    |
| `BASE_PATH`                | build         | Ruta base del sitio. En Pages, `/<nombre-del-repo>`. |
| `SITE_URL`                 | build         | Origen público del sitio. Opcional.                  |

En local:

```bash
cp .env.example .env   # y rellena los dos valores
npm install
npm run dev            # http://localhost:4321
```

Si faltan las variables, la app arranca igual en modo local: todo se guarda en
el dispositivo y se sube en cuanto configures Supabase.

### 3. Deploy a GitHub Pages

1. En **Settings → Pages**, elige *Source: GitHub Actions*.
2. En **Settings → Secrets and variables → Actions**, añade
   `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. Puedes ponerlas en la
   pestaña *Variables* (son públicas por diseño) o en *Secrets*; el workflow
   lee primero las variables y, si no están, los secrets.
3. Empuja a `main`. El workflow
   [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) construye con
   `BASE_PATH=/<nombre-del-repo>` y publica.

## Comandos

```bash
npm run dev      # servidor de desarrollo
npm run build    # build estático en dist/
npm run preview  # sirve dist/
npm run check    # comprobación de tipos
```

## Estructura

```
src/
  lib/                 lógica pura: datos, estadística, exportación, formato
    datos.ts             lectura/escritura, vencimientos y cola offline
    estadistica.ts       Wilson, agrupaciones y lectura de significancia
    almacen.ts           cola en localStorage (nunca perder una declaración)
  scripts/             capa de interfaz
    estado.ts            estado compartido y ciclo de recarga
    vistas/              declarar · abiertas · calibración · historial
  pages/index.astro    marcado de las cuatro pantallas
supabase/schema.sql    tabla, índices, triggers de inmutabilidad y RLS
```

## Exportación

Desde *Historial* se exporta a **Markdown** y **CSV**, respetando el filtro
activo. El registro sirve fuera de la app y es auditable: la exportación
incluye `creada_en`, `vence_en` y `resuelta_en` en crudo, de modo que cualquier
resolución fuera de plazo quedaría a la vista.

## Lo que la app no garantiza

Los triggers impiden reescribir el pasado en la base de datos. Lo que no puede
impedir ningún esquema es declarar una condición vaga a propósito («algo bueno
pasará hoy»). Contra eso solo hay dos defensas, y las dos están en la app: la
ventana temporal obligatoria y el contador de ambiguas. Si el contador sube, el
problema no está en el azar sino en la redacción.

Con la cola offline hay una asimetría que conviene conocer: una declaración
hecha sin red conserva su hora real, pero si el plazo vence mientras el
dispositivo sigue desconectado, la resolución que se registre localmente llega
al servidor con una marca de tiempo que el servidor no puede verificar. Los
tres instantes quedan en el registro y en la exportación, de modo que la
inconsistencia es visible aunque no sea rechazable.
