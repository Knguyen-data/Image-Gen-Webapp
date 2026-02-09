/**
 * R2 Media Upload Worker
 * Handles file uploads (base64 + URL fetch), serving, and deletion for image-gen-media bucket.
 */

export interface Env {
  MEDIA_BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string;
  UPLOAD_KEY?: string; // optional API key auth via secret
}

// Map common MIME types to file extensions
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'application/pdf': 'pdf',
  };
  return map[mime] || 'bin';
}

// Guess MIME from extension
function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  const useOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': useOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status: number, origin: string | null, env: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env) },
  });
}

function checkAuth(request: Request, env: Env): boolean {
  if (!env.UPLOAD_KEY) return true; // no key configured = open
  return request.headers.get('X-Upload-Key') === env.UPLOAD_KEY;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    // --- POST /upload --- base64 upload
    if (request.method === 'POST' && url.pathname === '/upload') {
      if (!checkAuth(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401, origin, env);
      }

      try {
        const body = await request.json() as { data: string; mimeType: string; filename?: string };
        if (!body.data || !body.mimeType) {
          return jsonResponse({ error: 'Missing data or mimeType' }, 400, origin, env);
        }

        // Strip data URL prefix if present
        const raw = body.data.includes(',') ? body.data.split(',')[1] : body.data;
        
        // Validate base64 and size
        if (raw.length > 100 * 1024 * 1024) { // 100MB base64 limit (Cloudflare max)
          return jsonResponse({ error: 'File too large (max 100MB)' }, 413, origin, env);
        }
        
        let bytes: Uint8Array;
        try {
          bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
        } catch (decodeErr) {
          return jsonResponse({ error: 'Invalid base64 encoding' }, 400, origin, env);
        }

        const ext = extFromMime(body.mimeType);
        const key = body.filename || `${crypto.randomUUID()}.${ext}`;

        await env.MEDIA_BUCKET.put(key, bytes, {
          httpMetadata: { contentType: body.mimeType },
        });

        const publicUrl = `${url.origin}/${key}`;
        return jsonResponse({ url: publicUrl, key }, 200, origin, env);
      } catch (e: any) {
        console.error('[R2Upload] Error:', e.message, e.stack);
        return jsonResponse({ 
          error: e.message || 'Upload failed',
          details: e.stack?.split('\n')[0] || 'Unknown error'
        }, 500, origin, env);
      }
    }

    // --- POST /upload-url --- fetch URL and store in R2
    if (request.method === 'POST' && url.pathname === '/upload-url') {
      if (!checkAuth(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401, origin, env);
      }

      try {
        const body = await request.json() as { url: string; filename?: string };
        if (!body.url) {
          return jsonResponse({ error: 'Missing url' }, 400, origin, env);
        }

        const res = await fetch(body.url);
        if (!res.ok) {
          return jsonResponse({ error: `Fetch failed: ${res.status}` }, 502, origin, env);
        }

        const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
        const ext = extFromMime(contentType);
        const key = body.filename || `${crypto.randomUUID()}.${ext}`;
        const data = await res.arrayBuffer();

        await env.MEDIA_BUCKET.put(key, data, {
          httpMetadata: { contentType },
        });

        const publicUrl = `${url.origin}/${key}`;
        return jsonResponse({ url: publicUrl, key }, 200, origin, env);
      } catch (e: any) {
        return jsonResponse({ error: e.message || 'Upload-url failed' }, 500, origin, env);
      }
    }

    // --- DELETE /delete/:key ---
    if (request.method === 'DELETE' && url.pathname.startsWith('/delete/')) {
      if (!checkAuth(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401, origin, env);
      }

      const key = decodeURIComponent(url.pathname.replace('/delete/', ''));
      await env.MEDIA_BUCKET.delete(key);
      return jsonResponse({ deleted: key }, 200, origin, env);
    }

    // --- GET /:key --- Serve file from R2
    if (request.method === 'GET' && url.pathname.length > 1) {
      const key = decodeURIComponent(url.pathname.slice(1));
      const object = await env.MEDIA_BUCKET.get(key);

      if (!object) {
        return new Response('Not Found', { status: 404, headers: corsHeaders(origin, env) });
      }

      const ext = key.split('.').pop() || '';
      const contentType = object.httpMetadata?.contentType || mimeFromExt(ext);

      return new Response(object.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          ...corsHeaders(origin, env),
        },
      });
    }

    return jsonResponse({ error: 'Not found' }, 404, origin, env);
  },
};
