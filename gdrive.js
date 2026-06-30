// gdrive.js
// Read and write the portfolio cache JSON to a specific Google Drive file.
// Auth: service account key supplied via GOOGLE_SERVICE_ACCOUNT_KEY env var
// (the full JSON content of the downloaded key file, or base64-encoded).
//
// The Drive file must be shared with the service account's email address
// (at least "Editor" access).

import { google } from "googleapis";
import { Readable } from "stream";

const FILE_ID = process.env.GDRIVE_FILE_ID || "1DlNUOrRTMMLxk6XJ90okYY7-FOEK6UQf";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    // Accept raw JSON or base64-encoded JSON
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const key = JSON.parse(json);
    return new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
  } catch (e) {
    console.error("[gdrive] Failed to parse service account key:", e.message);
    return null;
  }
}

// Download the cache file from Drive. Returns parsed JSON or null.
export async function loadFromDrive() {
  const auth = getAuth();
  if (!auth) return null;
  try {
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get(
      { fileId: FILE_ID, alt: "media" },
      { responseType: "text" }
    );
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    console.log("[gdrive] Loaded cache from Drive");
    return data;
  } catch (e) {
    console.error("[gdrive] Load failed:", e.message);
    return null;
  }
}

// Upload the cache JSON to Drive (overwrites the existing file).
export async function saveToDrive(data) {
  const auth = getAuth();
  if (!auth) return;
  try {
    const drive = google.drive({ version: "v3", auth });
    const body = JSON.stringify(data, null, 2);
    const stream = Readable.from([body]);
    await drive.files.update({
      fileId: FILE_ID,
      media: { mimeType: "application/json", body: stream },
    });
    console.log("[gdrive] Cache saved to Drive");
  } catch (e) {
    console.error("[gdrive] Save failed:", e.message);
  }
}
