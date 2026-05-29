# ROrbit — Deploy Guide

Everything you need to get ROrbit running on your phone, independently of Claude.

---

## What you'll end up with
- ROrbit at your own URL (e.g. `rorbit.vercel.app`)
- Add it to your iPhone home screen — opens full-screen like a native app
- Data persists on-device through restarts, app close, wifi changes
- GitHub Gist cloud backup built into the app
- Code version-controlled on GitHub — update by editing one file

---

## Step 1 — Install Node.js (one-time)

Download the **LTS** version from https://nodejs.org and install it.
Verify it worked by opening Terminal (Mac) or Command Prompt (Windows) and running:
```
node --version
```
You should see something like `v20.x.x`.

---

## Step 2 — Set up the project locally

Unzip the `rorbit` folder you downloaded. Open Terminal, navigate into it:
```
cd path/to/rorbit
npm install
```
This downloads the dependencies (takes ~30 seconds). Then test it locally:
```
npm run dev
```
Open http://localhost:5173 in your browser. ROrbit should be running.

---

## Step 3 — Create a GitHub repository

1. Go to https://github.com and create a free account if you don't have one
2. Click **New repository** (top right, + icon)
3. Name it `rorbit`, set to **Public** (required for free GitHub Pages), click **Create repository**
4. Follow the instructions to push your existing code, or use GitHub Desktop (https://desktop.github.com) to upload the folder

With Terminal (if you're comfortable):
```
git init
git add .
git commit -m "Initial ROrbit"
git remote add origin https://github.com/YOUR_USERNAME/rorbit.git
git push -u origin main
```

---

## Step 4 — Deploy to Vercel (free, takes 2 minutes)

1. Go to https://vercel.com and sign up with your GitHub account
2. Click **Add New → Project**
3. Select your `rorbit` repository
4. Leave all settings as default — Vercel detects Vite automatically
5. Click **Deploy**

In ~30 seconds you'll have a live URL like `rorbit-username.vercel.app`.

---

## Step 5 — Add to iPhone home screen

1. Open your Vercel URL in **Safari** on your iPhone
2. Tap the **Share** button (square with arrow pointing up)
3. Scroll down and tap **Add to Home Screen**
4. Name it `ROrbit`, tap **Add**

It now lives on your home screen, opens full-screen with no browser bar,
and behaves like a native app. Your data persists locally on your phone.

---

## Step 6 — Set up GitHub Gist cloud backup (optional but recommended)

This lets you back up your knowledge base to GitHub with one tap.

### Get a GitHub token:
1. Go to https://github.com/settings/tokens/new
2. Give it a name (e.g. "ROrbit backup")
3. Select **only** the `gist` scope (checkbox)
4. Click **Generate token**
5. Copy the token (starts with `ghp_`) — you only see it once

### Use it in the app:
1. Open ROrbit → **Library** tab → scroll to **Cloud Backup** → tap **▼ SETUP**
2. Paste your token into the **GitHub Token** field
3. Tap **↑ BACKUP** — this creates a private Gist and saves your nodes to it
4. The Gist ID is saved automatically for future backups

Next time you tap **↑ BACKUP** it updates the same Gist. **↓ RESTORE** pulls the data back.

---

## Making updates (vibe coding workflow)

When you want to change something:

1. Describe the change to Claude in the chat
2. Claude gives you an updated `ROrbit.jsx`
3. Replace `src/ROrbit.jsx` in your project folder with the new file
4. Run `git add . && git commit -m "update" && git push`
5. Vercel detects the push and redeploys automatically (~30 seconds)
6. Your live URL has the update

That's the complete loop. The only file that ever changes is `src/ROrbit.jsx`.

---

## Troubleshooting

**`npm install` fails** — make sure Node.js is installed (Step 1)

**White screen on Vercel** — check the Vercel deployment logs; usually a missing dependency

**App not installing as PWA on iPhone** — must use Safari (not Chrome) and must be on HTTPS (Vercel URLs are HTTPS by default)

**Backup fails** — check your GitHub token has the `gist` scope and hasn't expired

**Data disappeared** — if you cleared browser/Safari data, localStorage was wiped. This is why cloud backup matters — restore from your Gist.
