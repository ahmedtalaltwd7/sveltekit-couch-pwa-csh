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
  .card { display: grid; gap: 0.75rem; background: var(--panel); color: var(--text); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius); box-shadow: var(--shadow-1); }
  label { display:grid; gap:0.25rem; }
  input { padding:0.6rem 0.75rem; border-radius:8px; border:1px solid var(--border); background: var(--bg); color: var(--text); }
  input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgb(18 142 106 / 15%); }
  .btn { padding:0.6rem 0.75rem; background:var(--primary); color:#fff; border:none; border-radius:8px; cursor:pointer; transition: filter .2s ease, transform .1s ease; }
  .btn:hover { filter: brightness(0.95); transform: translateY(-1px); }
  .error { color: #fca5a5; font-size: 0.9rem; }
  .hint { text-align:center; color: var(--muted); font-size:0.9rem; margin-top:0.75rem; }
</style>
