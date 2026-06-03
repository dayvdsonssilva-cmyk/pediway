import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'index.html'),
        cliente:  resolve(__dirname, 'cliente.html'),
        admin:    resolve(__dirname, 'mandaadmin.html'),
        checkout: resolve(__dirname, 'checkout.html'),
        garcom:   resolve(__dirname, 'garcom.html'),
        lojas:    resolve(__dirname, 'lojas.html'),
        kds:      resolve(__dirname, 'kds.html'),
        quiz:     resolve(__dirname, 'quiz.html'),
      },
    },
  },
  esbuild: {
    target: 'es2020',
  },
});
