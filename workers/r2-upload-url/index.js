export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Endpoint 1: GET /upload-url - Generate presigned URL
    if (url.pathname === '/upload-url' && request.method === 'GET') {
      const filename = url.searchParams.get('filename') || 'upload.jpg';
      const contentType = url.searchParams.get('content_type') || 'application/octet-stream';
      
      try {
        const endpoint = env.R2_ENDPOINT;
        const bucket = env.R2_BUCKET;
        const accessKey = env.R2_ACCESS_KEY_ID;
        const secretKey = env.R2_SECRET_ACCESS_KEY;
        
        // Generate presigned URL
        const amzDate = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const dateStamp = amzDate.slice(0, 8);
        const payloadHash = 'UNSIGNED-PAYLOAD';
        
        const method = 'PUT';
        const canonicalUri = `/${bucket}/${filename}`;
        const canonicalHeaders = `content-type:${contentType}\nhost:${new URL(endpoint).host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
        
        const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
        const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`;
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
        
        const kSecret = `AWS4${secretKey}`;
        const kDate = await hmac(kSecret, dateStamp);
        const kRegion = await hmac(kDate, 'us-east-1');
        const kService = await hmac(kRegion, 's3');
        const kSigning = await hmac(kService, 'aws4_request');
        const signature = await hmac(kSigning, stringToSign);
        
        const presignedUrl = `${endpoint}/${bucket}/${filename}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${encodeURIComponent(`${accessKey}/${credentialScope}`)}&X-Amz-Date=${amzDate}&X-Amz-Expires=3600&X-Amz-SignedHeaders=${encodeURIComponent(signedHeaders)}&X-Amz-Signature=${signature}&Content-Type=${encodeURIComponent(contentType)}`;
        
        return new Response(JSON.stringify({ upload_url: presignedUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Endpoint 2: GET /download-url - Get download URL (public)
    if (url.pathname === '/download-url' && request.method === 'GET') {
      const filename = url.searchParams.get('filename');
      if (!filename) {
        return new Response(JSON.stringify({ error: 'filename required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const publicUrl = `${env.R2_PUBLIC_ENDPOINT || env.R2_ENDPOINT}/${env.R2_BUCKET}/${filename}`;
      return new Response(JSON.stringify({ download_url: publicUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Endpoint 3: GET /health - Health check
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

async function hmac(key, data) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Buffer.from(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data)))).toString('hex');
}

async function sha256(data) {
  const encoder = new TextEncoder();
  return Buffer.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(data)))).toString('hex');
}
