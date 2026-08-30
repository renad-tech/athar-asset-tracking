# ATHAR | أثَر

A digital handover and custody documentation system for university assets and facilities. ATHAR replaces paper-based, unverifiable handover processes with QR-based identity verification and an on-device computer vision layer that captures and compares an asset's condition over time — so both parties leave with a verified, comparable record instead of relying on memory or a signed slip of paper.

Built for the Smart University Hackathon.

**عربي:** الوصف بالعربي متوفر في [README.ar.md](README.ar.md).

## Why ATHAR

- **Two verified parties, not one inspector.** Every handover or custody session requires both the sender and the receiver to be identified and to sign off — not a single person documenting their own observation.
- **Identity from a real database, not free text.** Both parties are identified by scanning a QR badge tied to an actual employee record, not a typed name.
- **A condition history per asset, not a folder of loose photos.** Every session is saved to that asset's own custody chain, so anyone can open an item later and see every past handover in order.
- **Change detection, not manual photo comparison.** A reference snapshot is compared against the live camera frame using pixel-level luminance diffing to flag genuine displacement, separately from ordinary motion (see [Computer Vision](#computer-vision)).

## Features

- **Secure supervisor login** by employee ID, checked against a real `supervisors` table.
- **Two session types:**
  - **Custody (العهدة)** — issue a new custody assignment or review an existing custody chain for one long-held asset.
  - **Handover (التسليم والاستلام)** — transfer responsibility for an asset between two parties at a single point in time.
- **QR-based identity for both parties** (sender and receiver), scanned live from the camera, with manual entry as a fallback.
- **Per-item condition documentation** — a photo, a condition tag (e.g. sound / damaged / needs maintenance), and free-text notes for each item in a session.
- **Auto-generated legal declaration text** naming both parties, the asset, and the date, plus a re-inspection due date set by the receiver, sealed with a digital signature.
- **Instant digital report (محضر)** — location, sender, employee ID, serial number, condition photo, notes, and signature, linked permanently to that asset.
- **Custody chain view** — the full timestamped history of every session tied to one asset.
- **QR badge generation** for employees, exportable as a printable PDF badge sheet.
- **Offline-first** — sessions are stored locally and the app works without an internet connection; data syncs once connectivity returns.
- **Supabase-backed persistence** for employees, supervisors, sessions, and custody records.

## Computer Vision

ATHAR ships with two independent vision layers (see [`src/vision.ts`](src/vision.ts)):

1. **Core engine (pure JavaScript, works offline from the first second, no download required)**
   - QR badge scanning
   - A reference snapshot of the "normal" state of a scene
   - Frame-to-frame motion detection
   - Displacement detection — comparing the live frame against the reference to flag an object that was actually moved or is missing, distinct from a person simply walking past
2. **Optional object/person detector (TensorFlow.js + COCO-SSD)** — recognizes people and common objects (laptop, phone, chair, etc.) by name. It only activates once the model is downloaded locally (see below); everything above keeps working without it.

## Tech Stack

| Layer | Tools |
|---|---|
| Build tooling | Node 22, pnpm, Vite 8, TypeScript 5.7 |
| Frontend | React 19, Tailwind CSS v4 |
| Backend | Supabase (`@supabase/supabase-js`) |
| Computer vision | Custom JS motion/displacement engine, TensorFlow.js + COCO-SSD (optional) |
| Identity / QR | `jsQR` (scanning), `qrcode` (badge generation) |
| Export | `jsPDF`, `html2canvas` (PDF reports and badge sheets) |
| Formatting | `oxfmt` |

## Getting Started

### Prerequisites
- Node.js 22+ and pnpm (see `.mise.toml`)
- A [Supabase](https://supabase.com) project

### 1. Install dependencies
```bash
npm install
```

### 2. Set up the database
Open your Supabase project → SQL Editor → paste the full contents of `supabase_schema.sql` → Run.
This creates the `employees`, `supervisors`, and session/custody tables. The script is safe to re-run.

### 3. Configure environment variables
```bash
cp .env.example .env
```
Fill in `.env` with your Supabase project URL and anon key (from Supabase → Project Settings → API). The `VITE_AI_API_KEY` variable is optional — leave it empty to keep AI detection simulated.

### 4. (Optional) Download the object detection model
```bash
npm run download-model
```
Enables the COCO-SSD person/object recognition layer. The app works fully without this step, using motion + QR detection only.

### 5. Run the dev server
```bash
npm run dev
```
Open **http://localhost:8443** — the port is fixed in `vite.config.ts`.

> The camera requires a secure context: `localhost` or `https://` only. It will not work over `file://` or a raw LAN IP like `http://192.168.x.x`.

### 6. Build for production
```bash
npm run build
```

## How to Use the App

1. **Log in** with your employee ID.
2. **Choose a session type** — Custody or Handover.
3. **Identify the parties** by scanning the sender's and receiver's QR badges.
4. **Document each item's condition** — take a photo, tag its condition, add notes if needed.
5. **Review and sign the declaration** — the app generates the legal text automatically; set a re-inspection date and sign.
6. **Get the digital report** — a report is generated instantly and saved to that asset's custody chain for future reference.

## Project Structure

```
src/
  App.tsx              # App shell / routing
  ScreenHome.tsx        # Session type selection
  ScreenHandover.tsx    # Handover flow (parties → capture → declaration)
  ScreenCustody.tsx     # Custody flow
  ScreenChain.tsx       # Custody chain / history view
  ScreenReport.tsx      # Digital report
  Badges.tsx            # QR badge generation
  BadgeScanner.tsx      # QR scanning
  vision.ts             # Computer vision engine (motion, displacement, COCO-SSD)
  services/
    api.ts               # Supabase-backed data layer
    custody.ts
supabase_schema.sql     # Database schema
```

## Team

Built by team **ATHAR** for the Smart University Hackathon.
