<script>
  import { auth } from '$lib/stores/auth.js';
  import { onMount } from 'svelte';

  let password = '';
  let error = '';

  onMount(() => {
    if ($auth.loggedIn) {
      window.location.href = '/form';
    }
  });

  function submit(e) {
    e.preventDefault();
    const res = auth.login(password);
    if (res.ok) {
      window.location.href = '/form';
    } else {
      error = 'Invalid password. Use 11 (admin) or 22 (user).';
    }
  }
</script>

<section class="wrap">
  <h1>Login</h1>
  <form onsubmit={submit} class="card">
    <label>
      <span>Password</span>
      <input type="password" bind:value={password} placeholder="11 (admin) or 22 (user)" required />
    </label>
    {#if error}
      <div class="error">{error}</div>
    {/if}
    <button class="btn" type="submit">Login</button>
  </form>
  <p class="hint">Offline-first app. Data will sync when online.</p>
</section>

<style>
  .wrap { max-width: 420px; margin: 2rem auto; padding: 0 1rem; }
  h1 { text-align:center; }
  .card { display: grid; gap: 0.75rem; background:#0b1220; color:#e5e7eb; border:1px solid #1f2937; padding:1rem; border-radius:10px; }
  label { display:grid; gap:0.25rem; }
  input { padding:0.6rem 0.75rem; border-radius:8px; border:1px solid #334155; background:#111827; color:#e5e7eb; }
  .btn { padding:0.6rem 0.75rem; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; }
  .btn:hover { background:#1d4ed8; }
  .error { color: #fca5a5; font-size: 0.9rem; }
  .hint { text-align:center; color:#94a3b8; font-size:0.9rem; margin-top:0.75rem; }
</style>
