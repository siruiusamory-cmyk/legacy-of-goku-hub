import {defineConfig} from 'astro/config';
export default defineConfig({output: 'static', base: process.env.SITE_BASE || '/', trailingSlash: 'always', publicDir: '../.site/input/public', outDir: '../.site/output', build: {format: 'directory'}, vite: {build: {assetsInlineLimit: 0}}, devToolbar: {enabled: false}});
