// Point d'entrée Cloudflare Worker (format modules). La logique est dans core.js.
import core from './core.js';

export default {
  async fetch(request, env) {
    const bodyText = request.method === 'POST' ? await request.text() : '';
    const r = await core.handle({
      method: request.method,
      origin: request.headers.get('Origin') || '',
      code: request.headers.get('X-Access-Code') || '',
      contentLength: Number(request.headers.get('Content-Length') || 0),
      bodyText,
    }, env, fetch);
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
  },
};
