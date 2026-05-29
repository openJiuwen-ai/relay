/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/// <reference types="vitest/config" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function buildClientDefine(merged: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (k.startsWith('NEXT_PUBLIC_') || k.startsWith('VITE_')) {
      out[`import.meta.env.${k}`] = JSON.stringify(v ?? '');
    }
  }
  out['import.meta.env.API_CLOWDER_HOST'] = JSON.stringify(merged.API_CLOWDER_HOST ?? '');
  out['import.meta.env.DEFAULT_API_CLIENT_URL'] = JSON.stringify(
    merged.DEFAULT_API_CLIENT_URL ?? 'http://127.0.0.1:3004',
  );
  out['import.meta.env.CAN_CREATE_MODEL'] = JSON.stringify(merged.CAN_CREATE_MODEL ?? '0');
  return out;
}

export default defineConfig(({ mode }) => {
  const merged: Record<string, string | undefined> = {
    ...(process.env as Record<string, string | undefined>),
    ...loadEnv(mode, repoRoot, ''),
  };

  const frontendPort = Number(merged.FRONTEND_PORT) || 3003;
  const apiPort = Number(merged.API_SERVER_PORT) || (Number(merged.FRONTEND_PORT) ? Number(merged.FRONTEND_PORT) + 1 : 3004);
  const uploadsTarget = (
    merged.VITE_API_URL ||
    merged.NEXT_PUBLIC_API_URL ||
    `http://127.0.0.1:${apiPort}`
  ).replace(/\/+$/, '');

  // 未指定 host 时默认 true（0.0.0.0），避免仅监听 ::1 时无法用 http://127.0.0.1:端口 访问。
  // 可通过 VITE_DEV_HOST=127.0.0.1 仅监听 IPv4 环回；=false 则退回 Vite 默认。
  const devHostRaw = merged.VITE_DEV_HOST?.trim();
  const devHost: string | boolean =
    devHostRaw === undefined || devHostRaw === ''
      ? true
      : devHostRaw === 'true'
        ? true
        : devHostRaw === 'false'
          ? false
          : devHostRaw;
  const npmLibraryBuild = mode === 'npm';
  const libraryExternal = [
    '@codemirror/lang-css',
    '@codemirror/lang-html',
    '@codemirror/lang-javascript',
    '@codemirror/lang-json',
    '@codemirror/lang-markdown',
    '@codemirror/lang-python',
    '@codemirror/lang-sql',
    '@codemirror/lang-xml',
    '@codemirror/state',
    '@codemirror/theme-one-dark',
    '@codemirror/view',
    '@dagrejs/dagre',
    '@openjiuwen/relay-shared',
    '@ricky0123/vad-web',
    '@xyflow/react',
    'codemirror',
    'docx-preview',
    'esbuild-wasm',
    'exceljs',
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react-markdown',
    'react-router-dom',
    'remark-breaks',
    'remark-gfm',
    'socket.io-client',
    'zustand',
  ];
  const isLibraryExternal = (id: string) =>
    libraryExternal.some((name) => id === name || id.startsWith(`${name}/`));

  return {
    root: __dirname,
    envDir: repoRoot,
    envPrefix: ['DISABLED_USE_DEFINE_INSTEAD'],
    define: buildClientDefine(merged),
    plugins: [react()],
    server: {
      host: devHost,
      port: frontendPort,
      strictPort: true,
      proxy: {
        '/uploads': {
          target: uploadsTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: devHost,
      port: frontendPort,
      strictPort: true,
      proxy: {
        '/uploads': {
          target: uploadsTarget,
          changeOrigin: true,
        },
      },
    },
    build: npmLibraryBuild
      ? {
          outDir: 'dist',
          emptyOutDir: true,
          sourcemap: true,
          cssCodeSplit: false,
          lib: {
            entry: {
              index: path.resolve(__dirname, 'src/index.tsx'),
              components: path.resolve(__dirname, 'src/public-api/components.ts'),
              config: path.resolve(__dirname, 'src/public-api/config.ts'),
              constants: path.resolve(__dirname, 'src/public-api/constants.ts'),
              hooks: path.resolve(__dirname, 'src/public-api/hooks.ts'),
              lib: path.resolve(__dirname, 'src/public-api/lib.ts'),
              pages: path.resolve(__dirname, 'src/public-api/pages.ts'),
              services: path.resolve(__dirname, 'src/public-api/services.ts'),
              shared: path.resolve(__dirname, 'src/public-api/shared.ts'),
              stores: path.resolve(__dirname, 'src/public-api/stores.ts'),
              utils: path.resolve(__dirname, 'src/public-api/utils.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
          },
          rollupOptions: {
            external: isLibraryExternal,
            output: {
              assetFileNames: (assetInfo) => (assetInfo.name?.endsWith('.css') ? 'styles.css' : 'assets/[name][extname]'),
              manualChunks: undefined,
            },
          },
        }
      : {
          outDir: 'dist',
          sourcemap: true,
          rollupOptions: {
            output: {
              manualChunks: undefined,
            },
          },
        },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@ricky0123/vad-web': path.resolve(__dirname, 'src/__mocks__/vad-web.ts'),
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
      setupFiles: ['src/test-setup.ts'],
    },
  };
});
