import { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { IncomingMessage, ServerResponse } from 'http';

const SAVE_DIR = path.resolve(__dirname, '../../generated-videos');

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function fileSystemPlugin(): Plugin {
  return {
    name: 'vite-file-system-plugin',
    apply: 'serve', // dev only

    configureServer(server) {
      // Ensure save directory exists
      if (!fs.existsSync(SAVE_DIR)) {
        fs.mkdirSync(SAVE_DIR, { recursive: true });
      }

      // POST /api/save-video - saves raw video body to disk
      server.middlewares.use('/api/save-video', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await collectBody(req);
          const filename = `video-${Date.now()}.mp4`;
          const filepath = path.join(SAVE_DIR, filename);

          // Validate no path traversal
          const resolved = path.resolve(filepath);
          if (!resolved.startsWith(path.resolve(SAVE_DIR))) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Path traversal rejected' }));
            return;
          }

          fs.writeFileSync(filepath, body);

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ filepath: resolved, filename }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // POST /api/reveal-file - opens Windows Explorer with file selected
      server.middlewares.use('/api/reveal-file', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await collectBody(req);
          const { filepath } = JSON.parse(body.toString());

          // Validate filepath starts with SAVE_DIR
          const resolved = path.resolve(filepath);
          if (!resolved.startsWith(path.resolve(SAVE_DIR))) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Path traversal rejected' }));
            return;
          }

          // Validate file exists
          if (!fs.existsSync(resolved)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }

          // Use execFile (not exec) to prevent shell injection
          execFile('explorer.exe', ['/select,', resolved], (err) => {
            if (err) {
              // Explorer returns exit code 1 even on success, ignore it
              console.log('[vite-file-system] Explorer opened for:', resolved);
            }
          });

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // GET /api/serve-video/:filename - serve generated videos
      server.middlewares.use('/api/serve-video', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const filename = (req.url || '').replace(/^\//, '').split('?')[0];
          if (!filename) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Filename required' }));
            return;
          }

          const filepath = path.join(SAVE_DIR, filename);
          const resolved = path.resolve(filepath);
          if (!resolved.startsWith(path.resolve(SAVE_DIR))) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Path traversal rejected' }));
            return;
          }

          if (!fs.existsSync(resolved)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }

          const stat = fs.statSync(resolved);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.statusCode = 200;
          fs.createReadStream(resolved).pipe(res);
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    }
  };
}
