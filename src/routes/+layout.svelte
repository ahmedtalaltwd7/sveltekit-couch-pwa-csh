<script>
    import favicon from '$lib/assets/favicon.svg';
    import { auth } from '$lib/stores/auth.js';
    import { onMount } from 'svelte';
    import { startLiveSync } from '$lib/db/pouch.js';

    let { children } = $props();
    let cancelSync = null;
    let online = $state(true);

    // Theme (dark/light) persisted in localStorage
    let theme = $state('dark');
    function applyTheme(t) {
        try { document.documentElement.dataset.theme = t; } catch {}
    }
    function setTheme(t) {
        theme = t === 'light' ? 'light' : 'dark';
        applyTheme(theme);
        try { localStorage.setItem('theme', theme); } catch {}
    }
    function toggleTheme() {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    }

    onMount(async () => {
        // Always register our custom service worker (static/sw.js)
        try {
            if ('serviceWorker' in navigator) {
                await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            }
        } catch {}

        // track online/offline status
        online = typeof navigator !== 'undefined' ? navigator.onLine : true;
        const onOnline = () => { online = true; };
        const onOffline = () => (online = false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        // initialize theme from storage or system preference
        try {
            let t = localStorage.getItem('theme');
            if (!t) {
                const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                t = prefersDark ? 'dark' : 'light';
            }
            setTheme(t);
            // keep in sync across tabs
            window.addEventListener('storage', (e) => {
                if (e.key === 'theme' && e.newValue) applyTheme(e.newValue);
            });
        } catch {}

        cancelSync = startLiveSync();
        // No automatic exporter trigger; attachments stay in CouchDB
        return () => {
            cancelSync && cancelSync();
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    });

    function logout() {
        auth.logout();
        // client-side redirect
        window.location.href = '/login';
    }
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<header class="header">
    <div class="container">
        <a class="brand" href="/">SvelteSync</a>
        <nav class="nav">
            <a href="/form">Form</a>
            <a href="/dashboard">Dashboard</a>
            {@html ''}
        </nav>
        <div class="theme">
            <button class="btn ghost theme-btn" onclick={(e) => { e.preventDefault(); toggleTheme(); }} aria-label="Toggle theme">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
        </div>
        <div class="auth">
            {#if $auth.loggedIn}
                <span class="role">{$auth.role}</span>
                <button class="btn" onclick={(e) => { e.preventDefault(); logout(); }}>Logout</button>
            {:else}
                <a class="btn" href="/login">Login</a>
            {/if}
        </div>
    </div>
    <div class="note">
        Offline-first: data {online ? 'will' : 'will'} sync when back online ·
        <strong style="color: {online ? '#86efac' : '#fca5a5'}">{online ? 'Online' : 'Offline'}</strong>
    </div>
    <style>
        .header { position: sticky; top: 0; z-index: 10; background: #0f172a; color: #fff; }
        .header > .container { max-width: 1100px; margin: 0 auto; padding: 0.6rem 0.75rem; display:flex; align-items:center; justify-content:space-between; gap: var(--space-2, 0.5rem); flex-wrap: wrap; }
        .brand { font-weight: 700; color: #fff; text-decoration: none; font-size: 1.05rem; }
        .nav { display:flex; gap: 0.5rem; flex-wrap: wrap; }
        .nav a { color:#cbd5e1; text-decoration:none; padding: 0.3rem 0.55rem; border-radius:6px; }
        .nav a:hover { background:#1f2937; color:#fff; }
        .auth { display:flex; align-items:center; gap:0.5rem; flex-wrap: wrap; }
        .role { font-size: 0.85rem; color: #a3e635; text-transform: capitalize; }
        .btn { background:#2563eb; color:#fff; border:none; border-radius:6px; padding:0.5rem 0.8rem; cursor:pointer; text-decoration:none; }
        .btn:hover { background:#1d4ed8; }
        .note { font-size: 0.75rem; text-align:center; color:#cbd5e1; padding: 0 0 0.5rem; background:#0f172a; }
        @media (min-width: 768px) {
            .header > .container { padding: 0.75rem 1rem; gap: 0.75rem; }
            .brand { font-size: 1.125rem; }
        }
        @media (max-width: 640px) {
            .nav { width: 100%; justify-content: center; }
            .auth { width: 100%; justify-content: center; }
        }
        @media (max-width: 380px) {
            .btn { width: 100%; text-align: center; }
            .nav { justify-content: center; }
        }
    </style>
</header>

<main class="main">
    <div class="container">
        {@render children?.()}
    </div>
</main>

<style>
    :root {
        --bg: #0b1220;
        --panel: #0b1220;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --border: #334155;
        --primary: #2563eb;
        --accent: #0ea5e9;
        --danger: #ef4444;
        --radius: 10px;
        --space-1: 0.25rem;
        --space-2: 0.5rem;
        --space-3: 0.75rem;
        --space-4: 1rem;
        --shadow-1: 0 1px 2px rgba(0,0,0,0.2);
        --shadow-2: 0 10px 30px rgba(0,0,0,0.5);
    }
    :root[data-theme='light'] {
        --bg: #f8fafc;
        --panel: #ffffff;
        --text: #0b1220;
        --muted: #475569;
        --border: #e2e8f0;
        --primary: #2563eb;
        --accent: #0ea5e9;
        --danger: #dc2626;
    }
    :global(html), :global(body) {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        background: var(--bg);
        color: var(--text);
    }
    .main { min-height: 100vh; }
    .main .container { max-width: 1100px; margin: 0 auto; padding: 1rem; }

    /* Light-mode header overrides */
    :global([data-theme='light']) .header { background: #ffffff; color: #0b1220; }
    :global([data-theme='light']) .nav a { color: #334155; }
    :global([data-theme='light']) .nav a:hover { background: #e2e8f0; color: #0b1220; }
    :global([data-theme='light']) .note { background: #ffffff; color: #334155; }

    /* Utility */
    .btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
</style>
