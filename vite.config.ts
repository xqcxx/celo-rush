import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom', 'three'],
    },
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'react-dom/client',
            'three',
            'zustand',
            '@react-three/fiber',
            '@react-three/drei',
            '@react-three/postprocessing',
            'wagmi',
            'viem',
            '@tanstack/react-query',
        ],
    },
    preview: {
        port: 8090,
        host: true,
    },
    build: {
        minify: 'terser',
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three'],
                    r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
                    wagmi: ['wagmi', 'viem'],
                },
            },
        },
    },
    server: {
        port: 8080,
        host: true,
    },
});
