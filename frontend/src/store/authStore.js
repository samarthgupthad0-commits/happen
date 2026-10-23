import { create } from 'zustand';

// Migrate stale sessions: if stored user has no role (old broken format), clear it
const storedUser = (() => {
  try {
    const u = JSON.parse(localStorage.getItem('happen_user'));
    // Old bug stored the full { token, user } object — detect and discard
    // Also discard if team_id is an object (should be string)
    if (u && (u.token !== undefined || !u.role || (u.team_id && typeof u.team_id === 'object'))) {
      localStorage.removeItem('happen_user');
      localStorage.removeItem('happen_token');
      return null;
    }
    return u;
  } catch {
    return null;
  }
})();

export const useAuthStore = create((set) => ({
  user: storedUser,
  token: localStorage.getItem('happen_token') || null,
  login: (user, token) => {
    localStorage.setItem('happen_user', JSON.stringify(user));
    localStorage.setItem('happen_token', token);
    set({ user, token });
  },
  updateUser: (nextUser) => {
    set((state) => {
      const updated = { ...(state.user || {}), ...(nextUser || {}) };
      localStorage.setItem('happen_user', JSON.stringify(updated));
      return { user: updated };
    });
  },
  logout: () => {
    localStorage.removeItem('happen_user');
    localStorage.removeItem('happen_token');
    set({ user: null, token: null });
  },
}));
