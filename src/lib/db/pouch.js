// Environment variables (Vite exposes only VITE_*)
const COUCHDB_URL = import.meta.env?.VITE_COUCHDB_URL || 'https://couch.ahmedtalal.online/';
const COUCHDB_DBNAME = import.meta.env?.VITE_COUCHDB_DBNAME || 'sveltesync';
const COUCHDB_USERNAME = import.meta.env?.VITE_COUCHDB_USERNAME || 'admin';
const COUCHDB_PASSWORD = import.meta.env?.VITE_COUCHDB_PASSWORD || 'password';

const LOCAL_DB_NAME = 'sveltesync_local';
const isBrowser = typeof window !== 'undefined';

let _PouchDB = null;
let db = null;
let remoteDb = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = (err) => reject(err);
    document.head.appendChild(s);
  });
}

// Build remote DB URL with basic auth (note: exposes creds on client; for production, proxy via server)
function remoteUrl() {
  const base = (COUCHDB_URL || '').replace(/\/$/, '');
  const url = new URL(`${base}/${COUCHDB_DBNAME}`);
  if (COUCHDB_USERNAME && COUCHDB_PASSWORD) {
    url.username = COUCHDB_USERNAME;
    url.password = COUCHDB_PASSWORD;
  }
  return url.toString();
}

// Initialize lazily in the browser only
async function init() {
  if (!isBrowser) return null;
  if (db && remoteDb) return { db, remoteDb };

  let PouchDB;
  try {
    const PouchDBMod = await import('pouchdb-browser');
    PouchDB = PouchDBMod.default || PouchDBMod;
  } catch (e1) {
    try {
      // 1) Try local vendor copy first
      await loadScript('/vendor/pouchdb.min.js');
      PouchDB = window.PouchDB;
    } catch (eLocal) {
      try {
        // 2) ESM CDN fallback
        const PouchDBMod = await import('https://esm.sh/pouchdb-browser@9.0.0');
        PouchDB = PouchDBMod.default || PouchDBMod;
      } catch (e2) {
        // 3) UMD CDN fallback
        await loadScript('https://cdn.jsdelivr.net/npm/pouchdb-browser@9.0.0/dist/pouchdb.min.js');
        PouchDB = window.PouchDB;
      }
    }
  }
  _PouchDB = PouchDB;

  db = new PouchDB(LOCAL_DB_NAME);
  remoteDb = new PouchDB(remoteUrl(), { skip_setup: false });
  return { db, remoteDb };
}

// Ensure basic indexes for queries
export async function ensureIndexes() {
  // No-op: not using pouchdb-find to avoid interop issues
  await init();
}

// Start live sync with retry. Returns a cancel function.
export function startLiveSync(onChange, onError) {
  // Start only in browser; otherwise return no-op cancel
  if (!isBrowser) return () => {};
  // Fire and forget init
  let cancel = () => {};
  init().then(() => {
    const sync = db
      .sync(remoteDb, { live: true, retry: true, attachments: true })
      .on('change', (info) => { onChange && onChange(info); })
      .on('paused', (err) => { if (err && onError) onError(err); })
      .on('active', () => {})
      .on('denied', (err) => { console.error('Sync denied', err); onError && onError(err); })
      .on('complete', (info) => { onChange && onChange(info); })
      .on('error', (err) => { console.error('Sync error', err); onError && onError(err); });
    cancel = () => sync.cancel();
  });
  return () => cancel();
}

export async function saveSubmission(fields) {
  const inited = await init();
  if (!inited) throw new Error('DB not available in SSR');
  const now = new Date().toISOString();
  const doc = { type: 'submission', status: 'pending', fields, createdAt: now, updatedAt: now };
  return db.post(doc);
}

// Save a submission with an inline attachment (Blob) for offline support.
// The attachment is named 'photo' and stored directly in PouchDB, syncing to CouchDB later.
export async function saveSubmissionWithAttachment(fields, file) {
  const inited = await init();
  if (!inited) throw new Error('DB not available in SSR');
  const now = new Date().toISOString();
  const idSuffix = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const _id = `submission:${Date.now()}:${idSuffix}`;
  const contentType = (file && file.type) || 'application/octet-stream';
  const doc = {
    _id,
    type: 'submission',
    status: 'pending',
    fields,
    createdAt: now,
    updatedAt: now,
    _attachments: file ? {
      photo: {
        content_type: contentType,
        data: file // PouchDB accepts Blob in browser; it will base64 encode as needed
      }
    } : undefined
  };
  return db.put(doc);
}

export async function listSubmissions() {
  const inited = await init();
  if (!inited) return [];
  // Use allDocs to avoid pouchdb-find. Filter client-side.
  const result = await db.allDocs({ include_docs: true });
  const docs = (result.rows || []).map((r) => r.doc).filter((d) => d && d.type === 'submission');
  return docs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function updateSubmission(doc) {
  const inited = await init();
  if (!inited) throw new Error('DB not available in SSR');
  doc.updatedAt = new Date().toISOString();
  return db.put(doc);
}

export async function deleteSubmission(doc) {
  const inited = await init();
  if (!inited) throw new Error('DB not available in SSR');
  return db.remove(doc);
}

// Try to get a local attachment Blob by doc id and attachment name (default 'photo').
// Returns a Blob or null if not found locally.
export async function tryGetLocalAttachment(docId, name = 'photo') {
  const inited = await init();
  if (!inited) return null;
  try {
    const blob = await db.getAttachment(docId, name);
    return blob || null;
  } catch {
    return null;
  }
}
