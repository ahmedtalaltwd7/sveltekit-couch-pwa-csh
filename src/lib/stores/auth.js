import { writable } from 'svelte/store';

const initial = {
  role: null,
  loggedIn: false
};

function createAuthStore() {
  let start = initial;
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('auth');
      if (stored) start = JSON.parse(stored);
    } catch {}
  }

  const { subscribe, set, update } = writable(start);

  subscribe((val) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auth', JSON.stringify(val));
    }
  });

  function login(password) {
    if (password === '11') {
      set({ role: 'admin', loggedIn: true });
      return { ok: true, role: 'admin' };
    }
    if (password === '22') {
      set({ role: 'user', loggedIn: true });
      return { ok: true, role: 'user' };
    }
    return { ok: false };
  }

  function logout() {
    set(initial);
  }

  return { subscribe, set, update, login, logout };
}

export const auth = createAuthStore();
