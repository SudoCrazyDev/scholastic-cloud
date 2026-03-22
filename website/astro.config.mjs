// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
	integrations: [tailwind(), react()],
	vite: {
		// detect-gpu ships CJS + ESM; Vite sometimes picks UMD and breaks `import { getGPUTier }`.
		resolve: {
			alias: {
				'detect-gpu': path.resolve(__dirname, 'node_modules/detect-gpu/dist/detect-gpu.esm.js'),
			},
		},
		ssr: {
			noExternal: ['three', '@react-three/fiber', '@react-three/drei', 'detect-gpu'],
		},
	},
});
