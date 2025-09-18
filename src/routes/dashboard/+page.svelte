<script>
  import { auth } from '$lib/stores/auth.js';
  import { onMount } from 'svelte';
  import { listSubmissions, updateSubmission, deleteSubmission, tryGetLocalAttachment } from '$lib/db/pouch.js';

  let loading = true;
  let items = [];
  let error = '';
  async function imageError(e) {
    const el = e.currentTarget;
    if (!el) return;
    // Try to switch to local attachment if possible
    const id = el.getAttribute('data-id');
    try {
      const blob = await tryGetLocalAttachment(id, 'photo');
      if (blob) {
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        el.src = url;
        el.setAttribute('data-source', 'local');
        // Also update the parent anchor href if present
        const parentLink = el.closest('a');
        if (parentLink) parentLink.href = url;
        el.style.display = '';
        return;
      }
    } catch {}
    // Hide if nothing works
    const parent = el && el.parentElement;
    if (parent) parent.style.display = 'none';
  }

  async function onThumbClick(e, item) {
    // Handle click ourselves and open a lightbox overlay
    try { e.preventDefault(); } catch {}
    let url = item._imgSrc;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const blob = await tryGetLocalAttachment(item._id, 'photo');
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          blobUrls.push(blobUrl);
          url = blobUrl;
        }
      } catch {}
    }
    lightboxSrc = url;
    lightboxAlt = item.fields.fullName || 'attachment';
    lightboxOpen = true;
    resetZoom();
    return false;
  }

  // Track generated object URLs so we can revoke them on cleanup
  let blobUrls = [];

  // Lightbox state
  let lightboxOpen = false;
  let lightboxSrc = '';
  let lightboxAlt = '';
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  function resetZoom() {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
  }

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  function zoomIn() { zoom = clamp(zoom + 0.25, 1, 5); }
  function zoomOut() { zoom = clamp(zoom - 0.25, 1, 5); if (zoom === 1) { offsetX = 0; offsetY = 0; } }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    const prev = zoom;
    zoom = clamp(zoom + delta, 1, 5);
    // Optional: adjust offsets to zoom towards cursor center
    if (prev !== zoom && prev > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      offsetX = clamp(offsetX + (cx / prev) * (prev - zoom), -1000, 1000);
      offsetY = clamp(offsetY + (cy / prev) * (prev - zoom), -1000, 1000);
    }
    if (zoom === 1) { offsetX = 0; offsetY = 0; }
  }

  function onPointerDown(e) {
    if (zoom <= 1) return;
    isPanning = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!isPanning) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
  }

  function onPointerUp(e) {
    isPanning = false;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
  }

  function closeLightbox() {
    lightboxOpen = false;
    lightboxSrc = '';
    lightboxAlt = '';
    resetZoom();
  }

  function revokeAllBlobUrls() {
    for (const url of blobUrls) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    blobUrls = [];
  }

  async function resolveImageSrcs(list) {
    // For each item, prefer local attachment when available (offline), else CouchDB proxy
    for (const it of list) {
      it._imgSrc = '';
      try {
        const blob = await tryGetLocalAttachment(it._id, 'photo');
        if (blob) {
          const url = URL.createObjectURL(blob);
          blobUrls.push(url);
          it._imgSrc = url;
          continue;
        }
      } catch {}
      // Fallback to proxy (online)
      it._imgSrc = `/api/attachment/${it._id}?name=photo`;
    }
  }

  async function load() {
    loading = true;
    error = '';
    try {
      revokeAllBlobUrls();
      items = await listSubmissions();
      await resolveImageSrcs(items);
    } catch (e) {
      console.error(e);
      error = 'Failed to load submissions';
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    if (!$auth.loggedIn) {
      window.location.href = '/login';
      return;
    }
    // If offline, wait for SW to be ready so it can serve cached vendor scripts
    if (typeof navigator !== 'undefined' && !navigator.onLine && 'serviceWorker' in navigator) {
      try { await navigator.serviceWorker.ready; } catch {}
    }
    load();
  });

  const canEdit = () => $auth.role === 'admin';

  async function toggleApprove(item) {
    if (!canEdit()) return;
    item.status = item.status === 'approved' ? 'pending' : 'approved';
    await updateSubmission(item);
    await load();
  }

  async function saveEdits(item) {
    if (!canEdit()) return;
    await updateSubmission(item);
    await load();
  }

  async function remove(item) {
    if (!canEdit()) return;
    if (!confirm('Delete this record?')) return;
    await deleteSubmission(item);
    await load();
  }
</script>

<section class="wrap">
  <h1>Dashboard</h1>
  {#if loading}
    <p>Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if items.length === 0}
    <p>No submissions yet.</p>
  {:else}
    <div class="list">
      {#each items as item (item._id)}
        <article class="card">
          <header class="card-h">
            <div class="meta">
              <strong>{item.fields.fullName || 'No name'}</strong>
              <span class="status {item.status}">{item.status}</span>
              <span class="date">{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            {#if canEdit()}
              <div class="actions">
                <button class="btn alt" onclick={() => toggleApprove(item)}>
                  {item.status === 'approved' ? 'Mark Pending' : 'Approve'}
                </button>
                <button class="btn danger" onclick={() => remove(item)}>Delete</button>
              </div>
            {/if}
          </header>

          <div class="grid">
            <label>
              <span>Email</span>
              <input bind:value={item.fields.email} disabled={!canEdit()} />
            </label>
            <label>
              <span>Phone</span>
              <input bind:value={item.fields.phone} disabled={!canEdit()} />
            </label>
            <label>
              <span>Address</span>
              <input bind:value={item.fields.address} disabled={!canEdit()} />
            </label>
            <label>
              <span>City</span>
              <input bind:value={item.fields.city} disabled={!canEdit()} />
            </label>
            <label>
              <span>State</span>
              <input bind:value={item.fields.state} disabled={!canEdit()} />
            </label>
            <label>
              <span>ZIP</span>
              <input bind:value={item.fields.zip} disabled={!canEdit()} />
            </label>
          </div>

          <label>
            <span>Notes</span>
            <textarea rows="2" bind:value={item.fields.notes} disabled={!canEdit()}></textarea>
          </label>

          <div class="media">
            <span>Image</span>
            <div class="thumb">
              <button type="button" class="img-btn" onclick={(e) => onThumbClick(e, item)} aria-label="Open image preview">
                <img alt={item.fields.fullName || 'attachment'} src={item._imgSrc} data-id={item._id} data-source={item._imgSrc.startsWith('blob:') ? 'local' : 'remote'} onerror={imageError} />
              </button>
              <small class="src">{item._imgSrc.startsWith('blob:') ? 'Local' : 'Remote'}</small>
            </div>
          </div>

          {#if canEdit()}
            <div class="row">
              <button class="btn" onclick={() => saveEdits(item)}>Save changes</button>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .wrap { max-width: 960px; margin: 1rem auto; padding: 0 1rem; }
  .list { display: grid; gap: 1rem; }
  .card { background:#0b1220; color:#e5e7eb; border:1px solid #1f2937; padding:1rem; border-radius:10px; display:grid; gap:0.75rem; }
  .card-h { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap: wrap; }
  .meta { display:flex; gap:0.5rem; align-items:center; flex-wrap: wrap; }
  .status { font-size:0.75rem; padding:0.15rem 0.5rem; border-radius:999px; background:#334155; text-transform:capitalize; }
  .status.approved { background:#064e3b; color:#a7f3d0; }
  .date { color:#94a3b8; font-size:0.85rem; }
  .actions { display:flex; gap:0.5rem; }
  .grid { display:grid; gap: 0.75rem; grid-template-columns: repeat(3,1fr); }
  label { display:grid; gap:0.25rem; }
  input, textarea { padding:0.6rem 0.75rem; border-radius:8px; border:1px solid #334155; background:#111827; color:#e5e7eb; }
  .row { display:flex; justify-content:flex-end; }
  .btn { padding:0.5rem 0.7rem; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; }
  .btn.alt { background:#0ea5e9; }
  .btn.danger { background:#ef4444; }
  .btn:hover { filter: brightness(0.95); }
  .error { color:#fca5a5; }
  .media { display:grid; gap:0.25rem; }
  .thumb { width: fit-content; display: inline-block; border: 1px solid #334155; border-radius: 8px; overflow: hidden; background: #0b1220; padding: 4px; }
  .thumb .img-btn { background: transparent; border: none; padding: 0; margin: 0; display: inline-block; cursor: zoom-in; line-height: 0; }
  .thumb img { display:block; width: 200px; height: 150px; object-fit: cover; border-radius: 4px; }
  .thumb .src { display:block; text-align:center; color:#94a3b8; font-size: 0.75rem; margin-top: 4px; }
  /* Lightbox */
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index: 1000; padding: 1rem; }
  .lightbox .inner { position: relative; max-width: 90vw; max-height: 90vh; }
  .lightbox img { max-width: 90vw; max-height: 90vh; display:block; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
  .lightbox .close { position:absolute; top: -10px; right: -10px; background:#111827; color:#e5e7eb; border:1px solid #334155; border-radius: 999px; width: 36px; height: 36px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
  @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
</style>

<svelte:window on:unload={revokeAllBlobUrls} on:keydown={(e) => { if (e.key === 'Escape' && lightboxOpen) closeLightbox(); }} />

{#if lightboxOpen}
  <div
    class="lightbox"
    role="dialog"
    aria-modal="true"
    aria-label="Image preview"
    tabindex="0"
    onclick={closeLightbox}
    onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') closeLightbox(); }}
  >
    <div class="inner" role="group" aria-label="Image container" onclick={(e) => e.stopPropagation()}>
      <button class="close" onclick={closeLightbox} aria-label="Close" type="button">×</button>
      <div class="viewport">
        <img
          alt={lightboxAlt}
          src={lightboxSrc}
          style={`transform: translate(${offsetX}px, ${offsetY}px) scale(${zoom}); cursor: ${zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'zoom-in'};`}
          onwheel={onWheel}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
        />
      </div>
      <div class="controls" aria-label="Zoom controls">
        <button type="button" class="btn small" onclick={() => { zoomOut(); }} aria-label="Zoom out">−</button>
        <button type="button" class="btn small" onclick={() => { resetZoom(); }} aria-label="Reset zoom">Reset</button>
        <button type="button" class="btn small" onclick={() => { zoomIn(); }} aria-label="Zoom in">+</button>
      </div>
    </div>
  </div>
{/if}
