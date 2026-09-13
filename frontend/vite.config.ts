import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build and `vite preview` use the GitHub Pages path;
// `npm run dev` serves from / as usual.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === 'build' || isPreview ? '/nexus_editor/' : '/',
}));
