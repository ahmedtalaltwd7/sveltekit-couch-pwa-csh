<section class="wrap">
  <h1>SvelteSync</h1>
  <p class="lead">Offline-first SvelteKit app using PouchDB with live sync to CouchDB.</p>
  <nav class="links">
    <a class="btn" href="/login">Login</a>
    <a class="btn" href="/form">Form</a>
    <a class="btn" href="/dashboard">Dashboard</a>
  </nav>
  <p class="hint">User password: 22 (view only). Admin password: 11 (edit/delete/approve).</p>
</section>

<style>
  .wrap { max-width: 720px; margin: 1rem auto; padding: 0 1rem; text-align:center; }
  .lead { color:#94a3b8; }
  .links { display:flex; gap:0.75rem; justify-content:center; margin: 1rem 0; flex-wrap: wrap; }
  .btn { padding:0.6rem 0.75rem; background:var(--primary); color:#fff; border:none; border-radius:8px; text-decoration:none; transition: filter .2s ease, transform .1s ease; }
  .btn:hover { filter: brightness(0.95); transform: translateY(-1px); }
  .hint { color:#94a3b8; font-size:0.9rem; }
</style>
