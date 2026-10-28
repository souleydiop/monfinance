const { handle, timingSafeEqual, normalizeOrigin } = require('./core.js');

const ORIGIN = 'https://souleydiop.github.io';
const env = { ACCESS_CODE: 'secret123', ANTHROPIC_API_KEY: 'sk-test', MODEL: 'claude-sonnet-5-5' };
const okBody = JSON.stringify({ summary: { depenses_cycle: 150000 } });
const mkReq = (over = {}) => ({ method: 'POST', origin: ORIGIN, code: 'secret123', bodyText: okBody, contentLength: okBody.length, ...over });
const anthropicOk = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Conseil.' }] }) });

describe('proxy Conseiller IA', () => {
  test('requête valide → 200 avec le texte de Claude et en-têtes CORS', async () => {
    const r = await handle(mkReq(), env, anthropicOk);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).text).toBe('Conseil.');
    expect(r.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });

  test('la clé API et le modèle sont transmis à Anthropic, jamais renvoyés au client', async () => {
    let sent;
    const r = await handle(mkReq(), env, (url, opts) => { sent = { url, opts }; return anthropicOk(); });
    expect(sent.url).toBe('https://api.anthropic.com/v1/messages');
    expect(sent.opts.headers['x-api-key']).toBe('sk-test');
    expect(JSON.parse(sent.opts.body).model).toBe('claude-sonnet-5-5');
    expect(r.body).not.toContain('sk-test');
  });

  test('origine non autorisée → 403 sans appel à Anthropic', async () => {
    let called = false;
    const r = await handle(mkReq({ origin: 'https://evil.example' }), env, () => { called = true; return anthropicOk(); });
    expect(r.status).toBe(403);
    expect(called).toBe(false);
    expect(r.headers['Access-Control-Allow-Origin']).toBe(undefined);
  });

  test('code d\'accès faux ou absent → 401 sans appel à Anthropic', async () => {
    let calls = 0;
    const f = () => { calls++; return anthropicOk(); };
    expect((await handle(mkReq({ code: 'nope' }), env, f)).status).toBe(401);
    expect((await handle(mkReq({ code: '' }), env, f)).status).toBe(401);
    expect(calls).toBe(0);
  });

  test('secrets non configurés → 500', async () => {
    expect((await handle(mkReq(), { ALLOWED_ORIGIN: ORIGIN }, anthropicOk)).status).toBe(500);
  });

  test('préflight OPTIONS accepté pour la bonne origine, refusé sinon', async () => {
    expect((await handle(mkReq({ method: 'OPTIONS' }), env, anthropicOk)).status).toBe(204);
    expect((await handle(mkReq({ method: 'OPTIONS', origin: 'https://x.io' }), env, anthropicOk)).status).toBe(403);
  });

  test('méthodes autres que POST/GET/OPTIONS refusées (405)', async () => {
    expect((await handle(mkReq({ method: 'PUT' }), env, anthropicOk)).status).toBe(405);
  });

  test('GET = page de diagnostic : origines et état des secrets, sans jamais les révéler', async () => {
    const r = await handle(mkReq({ method: 'GET', origin: '' }), env, anthropicOk);
    const d = JSON.parse(r.body);
    expect(r.status).toBe(200);
    expect(d.origines_autorisees).toEqual([ORIGIN]);
    expect(d.secrets_configures).toBe(true);
    expect(r.body).not.toContain('sk-test');
    expect(r.body).not.toContain('secret123');
  });

  test('ALLOWED_ORIGIN tolère « / » final, chemin, guillemets et majuscules', async () => {
    for (const v of [ORIGIN + '/', ORIGIN + '/monfinance', '"' + ORIGIN + '"', 'HTTPS://SouleyDiop.github.io', ' ' + ORIGIN + ' ']) {
      const r = await handle(mkReq(), { ...env, ALLOWED_ORIGIN: v }, anthropicOk);
      expect(r.status).toBe(200);
    }
    expect(normalizeOrigin(ORIGIN + '/monfinance/')).toBe(ORIGIN);
  });

  test('corps trop gros → 413 ; JSON invalide ou résumé absent → 400', async () => {
    expect((await handle(mkReq({ bodyText: 'x'.repeat(25000), contentLength: 25000 }), env, anthropicOk)).status).toBe(413);
    expect((await handle(mkReq({ bodyText: '{pas du json' }), env, anthropicOk)).status).toBe(400);
    expect((await handle(mkReq({ bodyText: JSON.stringify({ question: 'x' }) }), env, anthropicOk)).status).toBe(400);
    expect((await handle(mkReq({ bodyText: JSON.stringify({ summary: [] }) }), env, anthropicOk)).status).toBe(400);
  });

  test('la question libre est tronquée à 300 caractères et ajoutée au message', async () => {
    let body;
    const bodyText = JSON.stringify({ summary: {}, question: 'q'.repeat(500) });
    await handle(mkReq({ bodyText, contentLength: bodyText.length }), env, (u, o) => { body = JSON.parse(o.body); return anthropicOk(); });
    const content = body.messages[0].content;
    expect(content).toContain('<donnees>');
    expect(content.split('Question de l\'utilisateur : ')[1].length).toBe(300);
  });

  test('erreur Anthropic → 502 générique, sans fuite de détails', async () => {
    const r = await handle(mkReq(), env, () => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'secret interne' }) }));
    expect(r.status).toBe(502);
    expect(r.body).not.toContain('secret interne');
  });

  test('limite quotidienne : bloque au-delà du quota et incrémente le compteur', async () => {
    const store = {};
    const RATE = { get: async k => store[k], put: async (k, v) => { store[k] = v; } };
    const e = { ...env, RATE, DAILY_LIMIT: '2' };
    expect((await handle(mkReq(), e, anthropicOk)).status).toBe(200);
    expect((await handle(mkReq(), e, anthropicOk)).status).toBe(200);
    expect((await handle(mkReq(), e, anthropicOk)).status).toBe(429);
  });

  test('la limite n\'est pas consommée par une requête non authentifiée', async () => {
    const store = {};
    const RATE = { get: async k => store[k], put: async (k, v) => { store[k] = v; } };
    await handle(mkReq({ code: 'faux' }), { ...env, RATE }, anthropicOk);
    expect(Object.keys(store).length).toBe(0);
  });

  test('timingSafeEqual', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
