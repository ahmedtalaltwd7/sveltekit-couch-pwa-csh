import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Read CouchDB config. Keep in sync with client defaults in $lib/db/pouch.js
const COUCHDB_URL = process.env.VITE_COUCHDB_URL || 'http://31.97.118.200:5984';
const COUCHDB_DBNAME = process.env.VITE_COUCHDB_DBNAME || 'sveltesync';
const COUCHDB_USERNAME = process.env.VITE_COUCHDB_USERNAME || 'admin';
const COUCHDB_PASSWORD = process.env.VITE_COUCHDB_PASSWORD || 'password';

const BASE = COUCHDB_URL.replace(/\/$/, '');
const DB_URL = `${BASE}/${COUCHDB_DBNAME}`;
const AUTH = COUCHDB_USERNAME && COUCHDB_PASSWORD
  ? 'Basic ' + Buffer.from(`${COUCHDB_USERNAME}:${COUCHDB_PASSWORD}`).toString('base64')
  : undefined;

const UPLOAD_DIR = path.resolve('static', 'uploads');

function extFromContentType(ct) {
  if (!ct) return '';
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif'
  };
  return map[ct] || '';
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(AUTH ? { authorization: AUTH } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function fetchBuffer(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(AUTH ? { authorization: AUTH } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  return { buf, contentType: ct };
}

export const POST = async () => {
  try {
    // 1) Load all docs and filter candidates
    const all = await fetchJSON(`${DB_URL}/_all_docs?include_docs=true`);
    const rows = all.rows || [];
    const candidates = rows
      .map((r) => r.doc)
      .filter((d) => d && d.type === 'submission')
      .filter((d) => !d.fields?.imageName)
      .filter((d) => d._attachments && d._attachments.photo);

    if (!candidates.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    let processed = 0;
    for (const doc of candidates) {
      try {
        // 2) Download attachment bytes
        const { buf, contentType } = await fetchBuffer(`${DB_URL}/${encodeURIComponent(doc._id)}/photo`);
        const ext = extFromContentType(contentType) || '.bin';
        const filename = `${Math.random().toString(16).slice(2)}-${Date.now()}${ext}`;
        const dest = path.join(UPLOAD_DIR, filename);
        await writeFile(dest, buf);

        // 3) Update doc with imageName
        const updated = { ...doc, fields: { ...(doc.fields || {}), imageName: filename }, updatedAt: new Date().toISOString() };
        const putRes = await fetchJSON(`${DB_URL}/${encodeURIComponent(doc._id)}`, {
          method: 'PUT',
          body: JSON.stringify(updated)
        });

        // 4) Optionally delete the attachment to slim CouchDB
        try {
          const delUrl = `${DB_URL}/${encodeURIComponent(doc._id)}/photo?rev=${encodeURIComponent(putRes.rev)}`;
          await fetch(delUrl, { method: 'DELETE', headers: AUTH ? { authorization: AUTH } : {} });
        } catch {}

        processed++;
      } catch (e) {
        // continue with next doc
        console.error('Export attachment failed for doc', doc && doc._id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    console.error('Exporter error:', err);
    return new Response(JSON.stringify({ error: 'Exporter failed' }), { status: 500 });
  }
};
