/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/*
 * Minimal static frontend server for packaged desktop installs.
 * - Serves ./dist (Vite production build + merged public/).
 * - Proxies /uploads/* to API (NEXT_PUBLIC_API_URL / VITE_API_URL / localhost ports).
 * - SPA fallback: unknown paths → index.html
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

function resolveApiBaseUrl() {
  const explicit = (process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL || '')
    .replace(/\/+$/, '');
  if (explicit) return explicit;

  const apiPort = Number(process.env.API_SERVER_PORT);
  if (Number.isInteger(apiPort) && apiPort > 0) {
    return `http://127.0.0.1:${apiPort}`;
  }

  const frontendPort = Number(process.env.FRONTEND_PORT);
  if (Number.isInteger(frontendPort) && frontendPort > 0) {
    return `http://127.0.0.1:${frontendPort + 1}`;
  }

  return 'http://127.0.0.1:3004';
}

const uploadsBase = resolveApiBaseUrl().replace(/\/+$/, '');
const distDir = path.join(__dirname, 'dist');
const port = parseInt(process.env.PORT || '3003', 10);
const hostname = process.env.HOSTNAME || '127.0.0.1';

process.env.NODE_ENV = 'production';
process.chdir(__dirname);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

function baseHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

function safeResolveUrlPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  const candidate = path.normalize(path.join(distDir, relative));
  const root = path.normalize(distDir + path.sep);
  if (!candidate.startsWith(root) && candidate !== path.normalize(distDir)) {
    return null;
  }
  return candidate;
}

function serveFile(res, filePath, status, extraHeaders) {
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', ...baseHeaders() });
    res.end('Internal Server Error');
  });
  res.writeHead(status, {
    'Content-Type': contentType(filePath),
    ...baseHeaders(),
    ...extraHeaders,
  });
  stream.pipe(res);
}

function proxyUploads(req, res) {
  let target;
  try {
    target = new URL(req.url, uploadsBase + '/');
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', ...baseHeaders() });
    res.end('Bad gateway');
    return;
  }

  const lib = target.protocol === 'https:' ? https : http;
  const opts = {
    method: req.method,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    headers: { ...req.headers, host: target.host },
  };

  const pReq = lib.request(opts, (pRes) => {
    const outHeaders = { ...baseHeaders() };
    for (const [k, v] of Object.entries(pRes.headers)) {
      if (v === undefined) continue;
      outHeaders[k] = v;
    }
    res.writeHead(pRes.statusCode || 502, outHeaders);
    pRes.pipe(res);
  });
  pReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', ...baseHeaders() });
    res.end(String(err && err.message ? err.message : err));
  });
  req.pipe(pReq);
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, baseHeaders());
    res.end();
    return;
  }

  if (req.url === '/_next/webpack-hmr' || req.url.startsWith('/_next/')) {
    res.writeHead(404, baseHeaders());
    res.end();
    return;
  }

  if (req.url.startsWith('/uploads')) {
    proxyUploads(req, res);
    return;
  }

  const urlPath = req.url.split('?')[0];
  let filePath = urlPath === '/' ? path.join(distDir, 'index.html') : safeResolveUrlPath(urlPath);

  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const cache =
      path.extname(filePath) && !urlPath.endsWith('index.html')
        ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
        : {};
    serveFile(res, filePath, 200, cache);
    return;
  }

  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    serveFile(res, indexHtml, 200, {});
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...baseHeaders() });
  res.end('Not found');
});

server.listen(port, hostname, () => {
  // eslint-disable-next-line no-console
  console.log(`web static server listening on http://${hostname}:${port}`);
});
