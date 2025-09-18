import { writable } from 'svelte/store';

export type Role = 'admin' | 'user' | null;

export type AuthState = {
  role: Role;
  loggedIn: boolean;
};

const initial: AuthState = {
  role: null,
  loggedIn: false
};

function createAuthStore() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('auth') : null;
  const start: AuthState = stored ? JSON.parse(stored) : initial;

  const { subscribe, set, update } = writable<AuthState>(start);

  subscribe((val) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auth', JSON.stringify(val));
    }
  });

  function login(password: string) {
    if (password === '11') {
      set({ role: 'admin', loggedIn: true });
      return { ok: true, role: 'admin' as const };
    }
    if (password === '22') {
      set({ role: 'user', loggedIn: true });
      return { ok: true, role: 'user' as const };
    }
    return { ok: false };
  }

  function logout() {
    set(initial);
  }

  return { subscribe, set, update, login, logout };
}

export const auth = createAuthStore();
