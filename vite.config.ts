import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/civ5replay/
export default defineConfig({
	base: './',
	plugins: [react()],
	test: {
		include: ['src/**/*.test.ts'],
	},
})
