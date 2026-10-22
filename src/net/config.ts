// Supabase project for online rooms (Realtime broadcast only: no tables, no auth).
// Create a free project, then put its URL and publishable/anon key in a `.env`
// file at the repo root (see .env.example). The publishable key is safe to ship.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY ?? '';
