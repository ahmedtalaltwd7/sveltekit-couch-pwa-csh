<script>
  import favicon from "$lib/assets/favicon.svg";
  import { auth } from "$lib/stores/auth.js";
  import { onMount } from "svelte";
  import { startLiveSync } from "$lib/db/pouch.js";

  let { children } = $props();
  let cancelSync = null;
  let online = $state(true);

  onMount(async () => {
    // Always register our custom service worker (static/sw.js)
    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
    } catch {}

    // track online/offline status
    online = typeof navigator !== "undefined" ? navigator.onLine : true;
    const onOnline = () => {
      online = true;
    };
    const onOffline = () => (online = false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    cancelSync = startLiveSync();
    // No automatic exporter trigger; attachments stay in CouchDB
    return () => {
      cancelSync && cancelSync();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  });

  function logout() {
    auth.logout();
    // client-side redirect
    window.location.href = "/login";
  }
</script>

<svelte:head>
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" href={favicon} />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<header class="header">
  <div class="container">
    <a class="brand" href="/">SvelteSync</a>
    <nav class="nav">
      <a href="/form">Form</a>
      <a href="/dashboard">Dashboard</a>
      {@html ""}
    </nav>
    <div class="auth">
      {#if $auth.loggedIn}
        <span class="role">{$auth.role}</span>
        <button class="btn" onclick={logout}>Logout</button>
      {:else}
        <a class="btn" href="/login">Login</a>
      {/if}
    </div>
  </div>
  <div class="note">
    Offline-first: data {online ? "will" : "will"} sync when back online ·
    <strong style="color: {online ? '#86efac' : '#fca5a5'}"
      >{online ? "Online" : "Offline"}</strong
    >
  </div>
  <style>
    .header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #0f172a;
      color: #fff;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .brand {
      font-weight: 700;
      color: #fff;
      text-decoration: none;
    }
    .nav {
      display: flex;
      gap: 0.75rem;
    }
    .nav a {
      color: #cbd5e1;
      text-decoration: none;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
    }
    .nav a:hover {
      background: #1f2937;
      color: #fff;
    }
    .auth {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .role {
      font-size: 0.85rem;
      color: #a3e635;
      text-transform: capitalize;
    }
    .btn {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.4rem 0.7rem;
      cursor: pointer;
      text-decoration: none;
    }
    .btn:hover {
      background: #1d4ed8;
    }
    .note {
      font-size: 0.75rem;
      text-align: center;
      color: #cbd5e1;
      padding: 0 0 0.5rem;
      background: #0f172a;
    }
    @media (max-width: 640px) {
      .container {
        flex-wrap: wrap;
      }
      .nav {
        width: 100%;
        justify-content: center;
      }
      .auth {
        width: 100%;
        justify-content: center;
      }
    }
  </style>
</header>

<main class="main">
  <div class="container">
    {@render children?.()}
  </div>
</main>

<style>
  .main .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 1rem;
  }
</style>
