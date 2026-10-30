import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/hq-attendance/',
  plugins: [react()],
  server: {
    port: 4022,
    host: true,
    proxy: { '/api': 'http://127.0.0.1:4012' },
  },
});
