export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.searchParams.get('path');

    if (!path) {
      return new Response('Missing path parameter', { status: 400 });
    }

    const gcsUrl = `https://storage.googleapis.com/storage/v1/b/higgfails_media/o?${path}`;

    try {
      const response = await fetch(gcsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return new Response(`GCS error: ${response.status}`, { status: response.status });
      }

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (error) {
      return new Response(`Proxy error: ${error.message}`, { status: 500 });
    }
  },
};
