// 演示页本地静态服务器（含 COOP/COEP 头，浏览器沙箱隔离所需）。
// 用法: node server.mjs [port]   默认 8099
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || 8099);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.onnx': 'application/octet-stream',
  '.model': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = normalize(join(ROOT, pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

    const mime = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); res.end('not found'); }
    else { res.writeHead(500); res.end(String(e)); }
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`demo server: http://127.0.0.1:${PORT}/`);
});
