import PouchDB from 'pouchdb-browser';
import pouchdbFind from 'pouchdb-find';

PouchDB.plugin(pouchdbFind);

// Environment variables (Vite exposes only VITE_*)
const COUCHDB_URL = (import.meta as any).env?.VITE_COUCHDB_URL || 'http://31.97.118.200:5984';
const COUCHDB_DBNAME = (import.meta as any).env?.VITE_COUCHDB_DBNAME || 'sveltesync';
const COUCHDB_USERNAME = (import.meta as any).env?.VITE_COUCHDB_USERNAME || 'admin';
const COUCHDB_PASSWORD = (import.meta as any).env?.VITE_COUCHDB_PASSWORD || 'password';

const LOCAL_DB_NAME = 'sveltesync_local';

// Create local DB instance
export const db = new PouchDB(LOCAL_DB_NAME);

// Build remote DB URL with basic auth (note: exposes creds on client; for production, proxy via server)
function remoteUrl() {
  const url = new URL(`${COUCHDB_URL.replace(/\/$/, '')}/${COUCHDB_DBNAME}`);
  if (COUCHDB_USERNAME && COUCHDB_PASSWORD) {
    url.username = COUCHDB_USERNAME;
    url.password = COUCHDB_PASSWORD;
  }
  return url.toString();
}

export const remoteDb = new PouchDB(remoteUrl(), {
  skip_setup: false
});

// Ensure basic indexes for queries
export async function ensureIndexes() {
  try {
    await db.createIndex({
      index: { fields: ['type', 'status', 'createdAt'] }
    });
  } catch (e) {
    console.warn('Index creation failed or exists', e);
  }
}

// Start live sync with retry. Returns a cancel function.
export function startLiveSync(onChange?: (info: any) => void, onError?: (err: any) => void) {
  const sync = db.sync(remoteDb, {
    live: true,
    retry: true
  })
    .on('change', (info: any) => {
      onChange?.(info);
    })
    .on('paused', (err: any) => {
      // replication paused (e.g. user went offline)
      if (err) onError?.(err);
    })
    .on('active', () => {
      // replicate resumed (e.g. back online)
    })
    .on('denied', (err: any) => {
      console.error('Sync denied', err);
      onError?.(err);
    })
    .on('complete', (info: any) => {
      onChange?.(info);
    })
    .on('error', (err: any) => {
      console.error('Sync error', err);
      onError?.(err);
    });

  return () => sync.cancel();
}

export type Submission = {
  _id?: string;
  _rev?: string;
  type: 'submission';
  status: 'pending' | 'approved';
  fields: Record<string, any>;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export async function saveSubmission(fields: Record<string, any>) {
  const now = new Date().toISOString();
  const doc: Submission = {
    type: 'submission',
    status: 'pending',
    fields,
    createdAt: now,
    updatedAt: now
  };
  const res = await db.post(doc as any);
  return res;
}

export async function listSubmissions() {
  await ensureIndexes();
  const result = await db.find({
    selector: { type: 'submission' },
    sort: [{ createdAt: 'desc' as any }]
  });
  // PouchDB Find may not sort unless index includes field; we can sort client-side fallback
  const docs = result.docs as Submission[];
  return docs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function updateSubmission(doc: Submission) {
  doc.updatedAt = new Date().toISOString();
  return db.put(doc as any);
}

export async function deleteSubmission(doc: Submission) {
  return db.remove(doc as any);
}
