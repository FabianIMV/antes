// @ts-check
import { defineConfig } from 'astro/config';

// El sitio se publica en GitHub Pages bajo la ruta del repositorio.
// `BASE_PATH` lo inyecta el workflow de deploy (`/<nombre-del-repo>`).
const base = process.env.BASE_PATH ?? '/';
const site = process.env.SITE_URL ?? undefined;

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
