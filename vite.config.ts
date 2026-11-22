import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' : chemins relatifs pour un hébergement statique (y compris en sous-dossier)
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // Le projet est sur un disque exFAT : la surveillance native de Windows y émet
    // de faux événements (boucle de rechargements). Le polling est fiable.
    watch: { usePolling: true, interval: 300 },
  },
})
