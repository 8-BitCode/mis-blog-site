// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  prefetch: {
    // Opt in per link with data-astro-prefetch instead of fetching everything.
    prefetchAll: false,
    defaultStrategy: 'viewport',
  },
});