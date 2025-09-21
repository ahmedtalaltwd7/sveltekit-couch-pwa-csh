<script>
  import { auth } from '$lib/stores/auth.js';
  import { saveSubmission, saveSubmissionWithAttachment } from '$lib/db/pouch.js';
  import { onMount, onDestroy, tick } from 'svelte';

  let submitting = false;
  let message = '';
  let uploadError = '';

  // 8 input fields
  let form = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
    imageName: '' // store only the uploaded image filename
  };

  // local-only UI state for selected file and preview
  let file = null;
  let previewUrl = '';

  // Camera capture state
  let cameraOpen = false;
  let cameraError = '';
  let videoEl = null;
  let mediaStream = null;

  // Simple client-side image compression using canvas
  async function compressImage(inputFile, options = {}) {
    const maxWidth = options.maxWidth ?? 800;
    const maxHeight = options.maxHeight ?? 800;
    const quality = options.quality ?? 0.6; // 0..1
    const outputType = options.outputType ?? 'image/jpeg'; // or 'image/webp'

    // If not an image or very small (<200KB), skip compression
    if (!inputFile || !inputFile.type.startsWith('image/')) return inputFile;
    if (inputFile.size < 200 * 1024) return inputFile;

    // Load image
    const img = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(inputFile);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      image.src = url;
    });

    // Calculate target size
    let { width, height } = img;
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    const targetW = Math.round(width * ratio);
    const targetH = Math.round(height * ratio);

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Export as Blob
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, quality));
    if (!blob) return inputFile;

    // Preserve original name with new extension if changed
    const ext = outputType === 'image/webp' ? '.webp' : '.jpg';
    const base = (inputFile.name || 'upload').replace(/\.[^.]+$/, '');
    const compressedFile = new File([blob], `${base}${ext}`, { type: outputType, lastModified: Date.now() });
    return compressedFile;
  }

  // Open device camera using getUserMedia (rear camera when possible)
  async function openCamera() {
    cameraError = '';
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        cameraError = 'Camera not supported on this device/browser.';
        return;
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      cameraOpen = true;
      await tick();
      if (videoEl) {
        videoEl.srcObject = mediaStream;
        try { await videoEl.play(); } catch {}
      }
    } catch (err) {
      console.error(err);
      cameraError = 'Unable to access camera. Please allow permissions or try another browser.';
    }
  }

  function stopCamera() {
    if (mediaStream) {
      try { mediaStream.getTracks().forEach(t => t.stop()); } catch {}
    }
    mediaStream = null;
  }

  function closeCamera() {
    stopCamera();
    cameraOpen = false;
  }

  async function capturePhoto() {
    if (!videoEl) return;
    const w = videoEl.videoWidth || 1280;
    const h = videoEl.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return;
    const capturedFile = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    // Update form state just like a selected file
    if (previewUrl) { URL.revokeObjectURL(previewUrl); }
    previewUrl = URL.createObjectURL(capturedFile);
    file = capturedFile;
    closeCamera();
  }

  onDestroy(() => {
    stopCamera();
  });

  onMount(() => {
    if (!$auth.loggedIn) {
      window.location.href = '/login';
    }
  });

  function onFileChange(e) {
    const f = e.target.files?.[0];
    file = f || null;
    uploadError = '';
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = '';
    }
    if (file) {
      // Only preview images
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      } else {
        uploadError = 'Selected file is not an image.';
      }
    }
  }

  async function submit(e) {
    e.preventDefault();
    submitting = true;
    message = '';
    uploadError = '';
    try {
      if (file) {
        // Compress before saving as attachment to minimize size
        const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.6, outputType: 'image/jpeg' });
        // Save doc with inline attachment to PouchDB (works offline).
        // imageName will be set later by the server exporter after writing to /uploads/.
        await saveSubmissionWithAttachment({ ...form, imageName: '' }, compressed);
      } else {
        form.imageName = '';
        await saveSubmission(form);
      }
      message = 'Saved locally. Will sync when online.';
      // reset
      form = { fullName: '', email: '', phone: '', address: '', city: '', state: '', zip: '', notes: '', imageName: '' };
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      file = null;
    } catch (e) {
      console.error(e);
      message = 'Failed to save';
      uploadError = e?.message || '';
    } finally {
      submitting = false;
    }
  }
</script>

<section class="wrap">
  <h1>User Form</h1>
  <form class="card" onsubmit={submit}>
    <label>
      <span>Full name</span>
      <input required bind:value={form.fullName} placeholder="John Doe" />
    </label>
    <label>
      <span>Email</span>
      <input type="email" required bind:value={form.email} placeholder="john@example.com" />
    </label>
    <label>
      <span>Phone</span>
      <input required bind:value={form.phone} placeholder="+123456789" />
    </label>
    <label>
      <span>Address</span>
      <input required bind:value={form.address} placeholder="123 Main St" />
    </label>
    <div class="grid">
      <label>
        <span>City</span>
        <input required bind:value={form.city} />
      </label>
      <label>
        <span>State</span>
        <input required bind:value={form.state} />
      </label>
      <label>
        <span>ZIP</span>
        <input required bind:value={form.zip} />
      </label>
    </div>
    <label>
      <span>Notes</span>
      <textarea rows="3" bind:value={form.notes} placeholder="Optional notes"></textarea>
    </label>

    <label>
      <span>Image (optional)</span>
      <input type="file" accept="image/*" capture="environment" onchange={onFileChange} />
      <div class="row gap">
        <button class="btn alt" type="button" onclick={(e) => { e.preventDefault(); openCamera(); }}>Use Camera</button>
        {#if cameraError}
          <span class="error">{cameraError}</span>
        {/if}
      </div>
      {#if previewUrl}
        <div class="preview">
          <img alt="preview" src={previewUrl} />
          {#if form.imageName}
            <small>Saved as: {form.imageName}</small>
          {/if}
        </div>
      {/if}
      {#if uploadError}
        <div class="error">{uploadError}</div>
      {/if}
    </label>

    <button class="btn" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
    {#if message}
      <div class="msg">{message}</div>
    {/if}
  </form>
</section>

<style>
  .wrap { width: 100%; margin: 0; padding: 1rem; }
  h1 { margin-bottom: 0.5rem; }
  .card { display:grid; gap:0.75rem; background: var(--panel); color: var(--text); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius); box-shadow: var(--shadow-1); }
  label { display:grid; gap:0.25rem; }
  input, textarea { padding:0.6rem 0.75rem; border-radius:8px; border:1px solid var(--border); background: var(--bg); color: var(--text); transition: border-color 0.2s ease, box-shadow 0.2s ease; }
  input:focus, textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgb(18 142 106 / 15%); }
  .btn { padding:0.6rem 0.75rem; background: var(--primary); color:#fff; border:none; border-radius:8px; cursor:pointer; width:fit-content; transition: filter .2s ease, transform .1s ease; }
  .btn:hover { filter: brightness(0.95); transform: translateY(-1px); }
  .btn.alt { background: var(--accent); color: #0b1220; }
  .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
  .msg { color: #0b4b39; }
  .grid { display:grid; gap:0.75rem; grid-template-columns: repeat(3, 1fr); }
  .preview { margin-top: 0.5rem; display: grid; gap: 0.25rem; }
  .preview img { max-width: 200px; max-height: 150px; border-radius: 6px; border: 1px solid var(--border); object-fit: cover; }
  .error { color: #fca5a5; font-size: 0.9rem; }
  .row.gap { display:flex; align-items:center; gap: 0.5rem; margin-top: 0.25rem; }
  /* Camera overlay */
  .cam-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index: 1100; padding: 1rem; }
  .cam-box { background: var(--panel); border:1px solid var(--border); border-radius: var(--radius); padding: 0.75rem; display:grid; gap:0.5rem; max-width: 95vw; }
  .cam-box video { width: 80vw; max-width: 480px; height: auto; border-radius: 8px; }
  .cam-controls { display:flex; gap:0.5rem; justify-content:center; }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
  }
</style>
