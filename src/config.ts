// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ATHAR CONFIG FILE — edit this file to customise the whole app      ║
// ║  No deep coding needed. Change values, save, and the UI updates.    ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// TIP: install the "Prettier" extension in VS Code so this file
// stays neatly formatted when you save it.

// ─── Supervisor / Officer Profile ────────────────────────────────────────────
// These values appear on every screen (header, report, print modal, etc.)
// Replace with your actual supervisor's details.
export const OFFICER = {
  name: 'سالم السالم',                 // Fallback only — the real name comes from Supabase
  id:   '1234',                        // Fallback badge — the real one comes from Supabase
  role: 'مشرف المرافق والعهد',
  clearance: 'صلاحية: الأصول والمرافق',
  unit: 'وحدة المستودع والعهد',
  shift: '0700 – 1900',
}

// ─── App-wide Settings ────────────────────────────────────────────────────────
export const APP = {
  name:        'ATHAR',
  nameAr:      'أثر',
  university:  'الجامعة',
  offlineMode: true,   // flip to false once backend is wired

  // Camera — 'environment' = back/room camera, 'user' = front/selfie camera
  camera: {
    facingMode: 'environment' as 'environment' | 'user',
    width:  { ideal: 1920 },
    height: { ideal: 1080 },
  },
}

// ─── AI Integration ───────────────────────────────────────────────────────────
// Set AI_ENABLED = true and add your key once you have API access.
// All AI calls in src/services/api.ts read these values.
export const AI = {
  enabled:             Boolean(import.meta.env.VITE_AI_API_KEY),
  provider:            'anthropic' as 'anthropic' | 'openai' | 'custom',
  apiKey:              import.meta.env.VITE_AI_API_KEY   ?? '',        // set in .env
  model:               'claude-sonnet-5',                               // or 'gpt-4o', etc.
  detectionThreshold:  0.85,   // minimum confidence to show an AI alert (0–1)
  frameIntervalMs:     3000,   // how often to analyse a camera frame
}

// ─── Backend (Supabase) ───────────────────────────────────────────────────────
// How to get these values:
//   1. Go to https://supabase.com and create a free project.
//   2. Project Settings → API → copy "URL" and "anon public" key.
//   3. Paste them into a .env file at the project root (see .env.example).
export const BACKEND = {
  // Turns itself on automatically once .env has your Supabase keys.
  enabled:      Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
  supabaseUrl:  import.meta.env.VITE_SUPABASE_URL      ?? '',
  supabaseKey:  import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',

  // Database table names — change if yours are named differently
  tables: {
    supervisors: 'supervisors',
    employees:   'employees',
    reports:     'reports',
  },

  // Supabase Storage bucket name for uploaded files / photos
  storageBucket: 'athar-reports',
}
