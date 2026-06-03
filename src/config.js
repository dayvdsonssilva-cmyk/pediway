// src/config.js
export const state = {
  currentUser: null,
  currentStoreSlug: null,
  cart: [],
  orders: [],
  selectedPlan: 'basico',
};

export const LS = {
  get: (key) => {
    try {
      return JSON.parse(localStorage.getItem('pediway_' + key));
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem('pediway_' + key, JSON.stringify(value));
    } catch {}
  }
};

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
