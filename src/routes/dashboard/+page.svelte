<script>
  import { auth } from '$lib/stores/auth.js';
  import { onMount } from 'svelte';
  import { listSubmissions, updateSubmission, deleteSubmission, tryGetLocalAttachment, syncStatus } from '$lib/db/pouch.js';

  let loading = true;
  $: showSyncedIcon = $syncStatus?.online && $syncStatus?.upToDate && !$syncStatus?.syncing;
  let items = [];
  let error = '';

  // Search query (client-side filtering)
  let search = '';
  $: q = (search || '').trim().toLowerCase();
  function matchItem(it, q) {
    const f = it?.fields || {};
    const hay = [
      it?._id,
      it?.status,
      f.fullName,
      f.email,
      f.phone,
      f.address,
      f.city,
      f.state,
      f.zip,
      f.notes
    ].map((v) => (v ?? '').toString().toLowerCase()).join(' ');
    return hay.includes(q);
  }
  $: filtered = q ? items.filter((it) => matchItem(it, q)) : items;

  // Pagination state
  let page = 1;
  let pageSize = 10;
  const pageSizeOptions = [10, 20, 50, 100];

  // Derived pagination values
  $: total = filtered.length;
  $: totalPages = Math.max(1, Math.ceil(total / pageSize));
  $: page = Math.min(Math.max(page, 1), totalPages);
  $: startIndex = (page - 1) * pageSize;
  $: endIndex = Math.min(startIndex + pageSize, total);
  $: paged = filtered.slice(startIndex, endIndex);

  // Pagination handlers
  function nextPage() { if (page < totalPages) page += 1; }
  function prevPage() { if (page > 1) page -= 1; }
  function setPageSize(n) { pageSize = +n || 10; page = 1; }

  // Track per-item busy state to prevent double clicks
  let busy = {};
  function setBusy(id, val) {
    busy = { ...busy, [id]: val };
  }
  // Lightweight notification
  let notice = '';
  let noticeKind = 'success';
  let noticeTimer = null;
  function showNotice(msg, kind = 'success') {
    notice = msg;
    noticeKind = kind;
    try { if (noticeTimer) clearTimeout(noticeTimer); } catch {}
    noticeTimer = setTimeout(() => { notice = ''; }, 1800);
  }
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
    const id = item._id;
    if (busy[id]) return;
    setBusy(id, true);
    try {
      item.status = item.status === 'approved' ? 'pending' : 'approved';
      const res = await updateSubmission(item);
      if (res && res.rev) item._rev = res.rev;
      showNotice('Status updated', 'success');
    } catch (e) {
      console.error(e);
      showNotice('Failed to update status', 'error');
    } finally {
      // In case reload did not happen (error), re-enable
      setBusy(id, false);
    }
  }

  async function saveEdits(item) {
    if (!canEdit()) return;
    const id = item._id;
    if (busy[id]) return;
    setBusy(id, true);
    try {
      const res = await updateSubmission(item);
      if (res && res.rev) item._rev = res.rev;
      showNotice('Changes saved', 'success');
    } catch (e) {
      console.error(e);
      showNotice('Failed to save changes', 'error');
    } finally {
      setBusy(id, false);
    }
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
  <div class="toolbar">
    <input
      class="search"
      type="search"
      placeholder="Search by name, email, phone, status..."
      bind:value={search}
      oninput={() => { page = 1; }}
    />
    {#if q}
      <button class="btn alt small" type="button" onclick={(e) => { e.preventDefault(); search = ''; }}>Clear</button>
    {/if}
    {#if showSyncedIcon}
      <span class="sync-ok" title="All data synced to CouchDB" aria-label="All data synced to CouchDB">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#065f46" stroke="#10b981" stroke-width="2"></circle>
          <path d="M7 12.5l3 3 7-7" stroke="#86efac" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
    {/if}
    <div class="pager">
      <button class="btn small" type="button" onclick={(e) => { e.preventDefault(); prevPage(); }} disabled={page <= 1}>Prev</button>
      <span class="info">Page {page} of {totalPages}</span>
      <button class="btn small" type="button" onclick={(e) => { e.preventDefault(); nextPage(); }} disabled={page >= totalPages}>Next</button>
      <label class="psize">
        <span>Per page</span>
        <select bind:value={pageSize} onchange={(e) => setPageSize(e.target.value)}>
          {#each pageSizeOptions as opt}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
      </label>
      <span class="count">Showing {total ? startIndex + 1 : 0}–{endIndex} of {total}</span>
    </div>
  </div>
  {#if notice}
    <div class="toast toast-fixed {noticeKind}" role="status" aria-live="polite">{notice}</div>
  {/if}
  {#if loading}
    <p>Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if items.length === 0}
    <p>No submissions yet.</p>
  {:else}
    <div class="list">
      {#each paged as item (item._id)}
        <article class="card">
          <header class="card-h">
            <div class="meta">
              <strong>{item.fields.fullName || 'No name'}</strong>
              <span class="status {item.status}">{item.status}</span>
              <span class="date">{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            {#if canEdit()}
              <div class="actions">
                <button class="btn alt" type="button" onclick={(e) => { e.preventDefault(); toggleApprove(item); }} disabled={!!busy[item._id]}>
                  {item.status === 'approved' ? 'Mark Pending' : 'Approve'}
                </button>
                <button class="btn danger" type="button" onclick={(e) => { e.preventDefault(); remove(item); }} disabled={!!busy[item._id]}>Delete</button>
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
              <button type="button" class="img-btn" onclick={(e) => { e.preventDefault(); onThumbClick(e, item); }} aria-label="Open image preview">
                <img alt={item.fields.fullName || 'attachment'} src={item._imgSrc} data-id={item._id} data-source={item._imgSrc.startsWith('blob:') ? 'local' : 'remote'} onerror={imageError} />
              </button>
              <small class="src">{item._imgSrc.startsWith('blob:') ? 'Local' : 'Remote'}</small>
            </div>
          </div>

          {#if canEdit()}
            <div class="row">
              <button class="btn" type="button" onclick={(e) => { e.preventDefault(); saveEdits(item); }} disabled={!!busy[item._id]}>Save changes</button>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
/* ===== Layout Components ===== */
.wrap {
    width: 100%;
    margin: 0;
    padding: var(--space-4, 1rem);
}

.toolbar {
    display: flex;
    gap: var(--space-2, 0.5rem);
    align-items: center;
    margin: 0.5rem 0 1rem;
    flex-wrap: wrap;
}

/* ===== Status Indicators ===== */
.sync-ok {
    display: inline-flex;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: #065f46;
    border: 1px solid #10b981;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.25);
    flex-shrink: 0;
}

.sync-ok svg {
    width: 18px;
    height: 18px;
    display: block;
}

/* ===== Pagination ===== */
.pager {
    display: flex;
    gap: var(--space-2, 0.5rem);
    align-items: center;
    flex-wrap: wrap;
}

.pager .info,
.pager .count {
    color: var(--muted);
    font-size: 0.85rem;
}

.pager .psize {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--muted);
}

.pager select {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    min-height: 40px;
    font-size: 0.875rem;
}

/* ===== Search & Inputs ===== */
.toolbar .search {
    flex: 1;
    min-width: 220px;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    min-height: 44px;
    font-size: 1rem;
    transition: border-color 0.2s ease;
}

.toolbar .search:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

/* ===== Buttons ===== */
.btn {
    padding: 0.6rem 0.8rem;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    min-height: 44px;
    font-size: 1rem;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
    text-decoration: none;
}

.btn.small {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    min-height: 36px;
}

.btn.alt {
    background: var(--accent);
}

.btn.danger {
    background: var(--danger);
}

.btn:hover {
    filter: brightness(0.95);
    transform: translateY(-1px);
}

.btn:active {
    transform: translateY(0);
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

/* ===== Lists & Cards ===== */
.list {
    display: grid;
    gap: 1rem;
}

.card {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 1rem;
    border-radius: var(--radius);
    display: grid;
    gap: 0.75rem;
    box-shadow: var(--shadow-1);
    transition: box-shadow 0.2s ease;
}

.card:hover {
    box-shadow: var(--shadow-2);
}

.card-h {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
}

/* ===== Status Tags ===== */
.status {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: #334155;
    color: #e5e7eb;
    text-transform: capitalize;
    font-weight: 500;
    white-space: nowrap;
}

.status.approved {
    background: #064e3b;
    color: #a7f3d0;
}

.date {
    color: var(--muted);
    font-size: 0.85rem;
}

.actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

/* ===== Forms ===== */
.grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: 1fr;
}

label {
    display: grid;
    gap: 0.25rem;
    font-weight: 500;
}

input,
textarea,
select {
    padding: 0.7rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    min-height: 44px;
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 0.2s ease;
}

input:focus,
textarea:focus,
select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

textarea {
    min-height: 120px;
    resize: vertical;
}

.row {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1rem;
}

.error {
    color: #fca5a5;
    font-size: 0.875rem;
    margin-top: 0.25rem;
}

/* ===== Toast Notifications ===== */
.toast {
    margin: 0.5rem 0;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    box-shadow: var(--shadow-1);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
}

.toast.success {
    background: #064e3b;
    border-color: #065f46;
    color: #d1fae5;
}

.toast.error {
    background: #7f1d1d;
    border-color: #b91c1c;
    color: #ffe4e6;
}

.toast-fixed {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2000;
    box-shadow: var(--shadow-2);
    pointer-events: none;
    min-width: 220px;
    text-align: center;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -40%); }
    to { opacity: 1; transform: translate(-50%, -50%); }
}

/* ===== Media Gallery ===== */
.media {
    display: grid;
    gap: 0.25rem;
}

.thumb {
    width: fit-content;
    display: inline-block;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--panel);
    padding: 4px;
    transition: transform 0.2s ease;
}

.thumb:hover {
    transform: scale(1.02);
}

.thumb .img-btn {
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    display: inline-block;
    cursor: zoom-in;
    line-height: 0;
}

.thumb img {
    display: block;
    width: 200px;
    height: 150px;
    object-fit: cover;
    border-radius: 4px;
}

.thumb .src {
    display: block;
    text-align: center;
    color: var(--muted);
    font-size: 0.75rem;
    padding: 0.25rem 0;
}

/* ===== Lightbox ===== */
.lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
}

.lightbox.active {
    opacity: 1;
    pointer-events: all;
}

.lightbox .inner {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
}

.lightbox img {
    max-width: 90vw;
    max-height: 90vh;
    display: block;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.lightbox .close {
    position: absolute;
    top: -10px;
    right: -10px;
    background: #111827;
    color: #e5e7eb;
    border: 1px solid var(--border);
    border-radius: 999px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s ease;
}

.lightbox .close:hover {
    background: #1f2937;
}

/* ===== Responsive Breakpoints ===== */
@media (min-width: 640px) {
    .grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (min-width: 1024px) {
    .grid {
        grid-template-columns: repeat(3, 1fr);
    }
}

@media (max-width: 640px) {
    .toolbar {
        flex-direction: column;
        align-items: stretch;
    }
    
    .toolbar .search {
        width: 100%;
    }
    
    .pager {
        width: 100%;
        justify-content: space-between;
    }
    
    .card-h {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
    }
}

@media (max-width: 380px) {
    .actions {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
    }
    
    .actions .btn {
        width: 100%;
    }
    
    .thumb img {
        width: 160px;
        height: 120px;
    }
}
</style>

<svelte:window onunload={revokeAllBlobUrls} onkeydown={(e) => { if (e.key === 'Escape' && lightboxOpen) closeLightbox(); }} />

{#if lightboxOpen}
  <div
    class="lightbox active"
    role="dialog"
    aria-modal="true"
    aria-label="Image preview"
    tabindex="0"
    onclick={closeLightbox}
    onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') closeLightbox(); }}
  >
    <div class="inner" role="group" aria-label="Image container" onclick={(e) => e.stopPropagation()}>
      <button class="close" onclick={(e) => { e.preventDefault(); closeLightbox(); }} aria-label="Close" type="button">×</button>
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
        <button type="button" class="btn small" onclick={(e) => { e.preventDefault(); zoomOut(); }} aria-label="Zoom out">−</button>
        <button type="button" class="btn small" onclick={(e) => { e.preventDefault(); resetZoom(); }} aria-label="Reset zoom">Reset</button>
        <button type="button" class="btn small" onclick={(e) => { e.preventDefault(); zoomIn(); }} aria-label="Zoom in">+</button>
      </div>
    </div>
  </div>
{/if}
