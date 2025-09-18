// Streams an attachment named 'photo' from CouchDB for the given document id.
// This avoids exposing CouchDB credentials to the browser.

export const GET = async ({ params, url, setHeaders }) => {
  const id = params.id;
  let name = url.searchParams.get('name') || '';

  const COUCHDB_URL = process.env.VITE_COUCHDB_URL || 'http://31.97.118.200:5984';
  const COUCHDB_DBNAME = process.env.VITE_COUCHDB_DBNAME || 'sveltesync';
  const COUCHDB_USERNAME = process.env.VITE_COUCHDB_USERNAME || 'admin';
  const COUCHDB_PASSWORD = process.env.VITE_COUCHDB_PASSWORD || 'password';

  const base = (COUCHDB_URL || '').replace(/\/$/, '');
  const auth = COUCHDB_USERNAME && COUCHDB_PASSWORD
    ? 'Basic ' + Buffer.from(`${COUCHDB_USERNAME}:${COUCHDB_PASSWORD}`).toString('base64')
    : undefined;

  // helper to stream a given attachment name
  async function streamAttachment(attName) {
    const target = `${base}/${encodeURIComponent(COUCHDB_DBNAME)}/${encodeURIComponent(id)}/${encodeURIComponent(attName)}`;
    const res = await fetch(target, { headers: auth ? { authorization: auth } : {} });
    if (!res.ok) return { ok: false, res };
    const ct = res.headers.get('content-type') || 'application/octet-stream';
    setHeaders({ 'content-type': ct, 'cache-control': 'public, max-age=300' });
    return { ok: true, response: new Response(res.body, { status: 200 }) };
  }

  try {
    // If name provided, try it first
    if (name) {
      const attempt = await streamAttachment(name);
      if (attempt.ok) return attempt.response;
    }

    // Discover attachments by reading the doc metadata
    const docUrl = `${base}/${encodeURIComponent(COUCHDB_DBNAME)}/${encodeURIComponent(id)}`;
    const docRes = await fetch(docUrl, { headers: auth ? { authorization: auth } : {} });
    if (docRes.status === 404) return new Response('Not found', { status: 404 });
    if (!docRes.ok) {
      const text = await docRes.text().catch(() => '');
      return new Response(`Upstream error: ${text}`, { status: 502 });
    }
    const doc = await docRes.json();
    const atts = (doc && doc._attachments) ? Object.keys(doc._attachments) : [];
    // Prefer common names
    const preferred = ['photo', 'image', 'file'];
    let pick = preferred.find((n) => atts.includes(n)) || atts[0];
    if (!pick) return new Response('No attachment', { status: 404 });

    const attempt = await streamAttachment(pick);
    if (attempt.ok) return attempt.response;
    return new Response('Attachment not found', { status: 404 });
  } catch (e) {
    return new Response('Proxy failed', { status: 500 });
  }
};
