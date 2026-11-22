// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ikeshun15.github.io',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
});
