import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  // Use vitePreprocess to handle TypeScript, PostCSS, etc.
  preprocess: vitePreprocess(),

  compilerOptions: {
    // Enable Svelte 5 runes mode for all components
    runes: true
  }
}
