// gdrive.js
// Read: direct public download URL (no auth needed for public files)
// Write: Google Apps Script web app URL (deployed as "anyone can access")
//
// Set these env vars:
//   GDRIVE_FILE_ID      — file ID from your Drive share link
//   GDRIVE_WRITE_URL    — your deployed Apps Script web app URL

const FILE_ID   = process.env.GDRIVE_FILE_ID    || "1DlNUOrRTMMLxk6XJ90okYY7-FOEK6UQf";
const WRITE_URL = process.env.GDRIVE_WRITE_URL  || "";

// Download the JSON cache from Google Drive (public file, no auth).
export async function loadFromDrive() {
  try {
    const url = `https://drive.google.com/uc?export=download&id=${FILE_ID}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    // Google sometimes returns an HTML virus-scan warning for large files;
    // detect it and bail gracefully.
    if (text.trimStart().startsWith("<")) {
      console.warn("[gdrive] Got HTML instead of JSON — file may need a direct download confirmation");
      return null;
    }
    const data = JSON.parse(text);
    console.log("[gdrive] Cache loaded from Drive ✓");
    return data;
  } catch (e) {
    console.error("[gdrive] Load failed:", e.message);
    return null;
  }
}

// Push the cache JSON to Drive via a Google Apps Script web app.
export async function saveToDrive(data) {
  if (!WRITE_URL) return; // write URL not configured — skip silently
  try {
    const r = await fetch(WRITE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log("[gdrive] Cache saved to Drive ✓");
  } catch (e) {
    console.error("[gdrive] Save failed:", e.message);
  }
}
