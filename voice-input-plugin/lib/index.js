// voice-input-plugin —— 宿主半边
// 职责：在 harness 的 Web 服务器上注册 /voice-input-assets/* 前缀路由，
// 把本包 assets/ 下的 WASM 运行时与中文模型作为静态资源提供给浏览器（同一源，无 CORS 问题）。
// 大文件（60MB 模型 / 11MB wasm）用流式读取 + 长缓存，避免每次刷新重新下载。
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const name = 'voice-input-plugin';
export const inject = ['webServer'];

const ASSETS_DIR = fileURLToPath(new URL('../assets', import.meta.url));
const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.model': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
};

export function apply(ctx) {
  const register = () =>
    ctx.webServer.register({
      kind: 'prefix',
      path: '/voice-input-assets',
      handler: async (req, res) => {
        try {
          // 把 /voice-input-assets/<rel> 映射到 assets/<rel>，防目录穿越
          const url = new URL(req.url, 'http://x');
          const rel = decodeURIComponent(url.pathname.replace(/^\/voice-input-assets\/?/, ''));
          const file = path.resolve(ASSETS_DIR, rel);
          if (!file.startsWith(ASSETS_DIR) || rel.includes('..')) {
            res.writeHead(403); res.end('forbidden'); return;
          }
          const st = await stat(file);
          if (!st.isFile()) { res.writeHead(404); res.end('not found'); return; }
          const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': st.size,
            // 资产不可变：浏览器长缓存，刷新页面不再重下 60MB 模型
            'Cache-Control': 'public, max-age=31536000, immutable',
          });
          createReadStream(file).pipe(res);
        } catch (e) {
          if (e && e.code === 'ENOENT') { res.writeHead(404); res.end('not found'); }
          else { res.writeHead(500); res.end(String(e)); }
        }
      },
    });

  const service = ctx.get('webServer');
  if (service) {
    ctx.effect(register);
    return;
  }
  // webServer 尚未就绪：等待注入（inject 声明了硬依赖，正常不会走到这里）
  ctx.on('ready', () => { ctx.effect(register); });
}
