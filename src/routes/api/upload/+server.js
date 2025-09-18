import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Save uploads to the project's static/uploads directory so they can be served at /uploads/<filename>
const UPLOAD_DIR = path.resolve('static', 'uploads');

export const POST = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'Invalid content type. Expected multipart/form-data.' }), { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No file provided under field name "file".' }), { status: 400 });
    }

    // Derive a safe filename: <random>-<timestamp><ext>
    const origName = file.name || 'upload';
    const ext = path.extname(origName).toLowerCase();
    const safeExt = [ '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif' ].includes(ext) ? ext : '';
    const random = crypto.randomBytes(8).toString('hex');
    const ts = Date.now();
    const filename = `${random}-${ts}${safeExt}`;

    await mkdir(UPLOAD_DIR, { recursive: true });
    const destPath = path.join(UPLOAD_DIR, filename);

    // file is a Blob in Web Fetch API; convert to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await writeFile(destPath, buffer);

    return new Response(JSON.stringify({ ok: true, filename, url: `/uploads/${filename}` }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 });
  }
};
