import type { Station } from "./types";

const API_BASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function apiConfigured(): boolean {
  return Boolean(API_BASE && ANON_KEY && !ANON_KEY.includes("your_anon"));
}

export async function fetchStations(): Promise<Station[]> {
  if (!apiConfigured()) {
    throw new Error("Podesi VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY u .env.local");
  }
  const res = await fetch(`${API_BASE}/functions/v1/api-stations`, {
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.stations as Station[];
}
