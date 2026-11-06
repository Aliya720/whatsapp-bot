/**
 * wa-sidecar/index.js
 *
 * WhatsApp Web Sidecar Service
 * Manages real WhatsApp Web sessions per organization using whatsapp-web.js.
 * Exposes a simple REST API for the Python backend to:
 *   - Start a session and get a real QR code from WhatsApp's servers
 *   - Poll connection status
 *   - Fetch current QR code
 *   - Send messages
 *   - Disconnect and clear a session
 *
 * Sessions are persisted via LocalAuth to SESSIONS_DIR so that after a container
 * restart the client re-authenticates automatically without rescanning.
 */

"use strict";

// ─── Process crash prevention ────────────────────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  console.error("[wa-sidecar] Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[wa-sidecar] Uncaught Exception:", err);
});

// ─── Monkey patches for Puppeteer / whatsapp-web.js binding errors ────────────
try {
  const { CdpPage } = require("whatsapp-web.js/node_modules/puppeteer-core/lib/cjs/puppeteer/cdp/Page.js");
  const origExpose = CdpPage.prototype.exposeFunction;
  CdpPage.prototype.exposeFunction = async function (name, pptrFunction) {
    try {
      return await origExpose.call(this, name, pptrFunction);
    } catch (err) {
      if (err && err.message && err.message.includes("already exists")) {
        // Safe to ignore duplicate page binding on reload / navigation
        return;
      }
      throw err;
    }
  };
  console.log("[wa-sidecar] Patched CdpPage.prototype.exposeFunction successfully");
} catch (e) {
  console.warn("[wa-sidecar] Notice: CdpPage patch skipped:", e.message);
}

try {
  const puppeteerUtil = require("whatsapp-web.js/src/util/Puppeteer");
  const origExposeIfAbsent = puppeteerUtil.exposeFunctionIfAbsent;
  puppeteerUtil.exposeFunctionIfAbsent = async function (page, name, fn) {
    try {
      return await origExposeIfAbsent(page, name, fn);
    } catch (err) {
      if (err && err.message && err.message.includes("already exists")) {
        return;
      }
      throw err;
    }
  };
  console.log("[wa-sidecar] Patched exposeFunctionIfAbsent successfully");
} catch (e) {
  console.warn("[wa-sidecar] Notice: exposeFunctionIfAbsent patch skipped:", e.message);
}

const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3001;
const SESSIONS_DIR = process.env.SESSIONS_DIR || "/app/sessions";
const API_KEY = process.env.SIDECAR_API_KEY || "change-me-in-production";

// System Chromium installed by the Dockerfile
const CHROMIUM_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  "/usr/bin/chromium" ||
  "/usr/bin/chromium-browser";

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Wipe stale Chromium lock files that survive container crashes.
 * Without this, Chrome refuses to start saying "profile in use by another Chromium process".
 */
function clearChromiumLocks(orgId) {
  const dirsToCheck = [
    path.join(SESSIONS_DIR, `session-${orgId}`),
    path.join(SESSIONS_DIR, ".wwebjs_auth", `session-${orgId}`),
  ];

  const lockFiles = [
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    "DevToolsActivePort",
    "lockfile",
  ];

  for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir)) continue;

    for (const file of lockFiles) {
      const p = path.join(dir, file);
      try {
        fs.rmSync(p, { force: true, recursive: true });
        console.log(`[${orgId}] Cleared stale lock: ${file}`);
      } catch (_) {}
    }

    // Clear LevelDB locks inside Default if any
    const defaultLock = path.join(dir, "Default", "LOCK");
    try {
      fs.rmSync(defaultLock, { force: true });
    } catch (_) {}
  }
}

/**
 * Clean stale locks across all sessions on sidecar service startup.
 */
function cleanAllStaleLocks() {
  try {
    const entries = fs.readdirSync(SESSIONS_DIR);
    for (const entry of entries) {
      if (entry.startsWith("session-")) {
        const orgId = entry.replace("session-", "");
        clearChromiumLocks(orgId);
      }
    }
  } catch (err) {
    console.warn("[wa-sidecar] Could not clean startup locks:", err.message);
  }
}

cleanAllStaleLocks();

const app = express();
app.use(express.json());

// ─── Auth Middleware ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  // Health check does not require auth
  if (req.path === "/health") return next();
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// ─── Session Registry ─────────────────────────────────────────────────────────
const sessions = new Map();

function createClient(orgId) {
  clearChromiumLocks(orgId);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: String(orgId),
      dataPath: SESSIONS_DIR,
    }),
    puppeteer: {
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--mute-audio",
        "--hide-scrollbars",
      ],
    },
  });

  const session = {
    client,
    status: "initializing",
    qr: null,
    phone: null,
    qr_expires_at: null,
    error: null,
  };

  sessions.set(orgId, session);

  client.on("qr", async (rawQr) => {
    console.log(`[${orgId}] QR received from WhatsApp`);
    try {
      const qrDataUri = await QRCode.toDataURL(rawQr, { width: 300, margin: 2 });
      session.qr = qrDataUri;
      session.status = "qr_ready";
      session.qr_expires_at = Date.now() + 20_000;
    } catch (err) {
      console.error(`[${orgId}] QR generation failed:`, err);
    }
  });

  client.on("ready", () => {
    console.log(`[${orgId}] Client ready and authenticated`);
    session.status = "connected";
    session.qr = null;
    session.qr_expires_at = null;
    try {
      session.phone = client.info?.wid?.user ? `+${client.info.wid.user}` : "Unknown";
    } catch (_) {
      session.phone = "Unknown";
    }
  });

  client.on("authenticated", () => {
    console.log(`[${orgId}] Authenticated (session saved)`);
    session.status = "connected";
    session.qr = null;
  });

  client.on("auth_failure", (msg) => {
    console.error(`[${orgId}] Auth failure:`, msg);
    session.status = "auth_failure";
    session.error = msg;
    sessions.delete(orgId);
  });

  client.on("disconnected", (reason) => {
    console.log(`[${orgId}] Disconnected: ${reason}`);
    session.status = "disconnected";
    sessions.delete(orgId);
  });

  client.initialize().catch((err) => {
    console.error(`[${orgId}] client.initialize() failed:`, err.message);
    session.status = "error";
    session.error = err.message;
  });

  return session;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /session/:org_id/connect
 * Starts or resumes a WhatsApp session. Returns QR code or connected status.
 */
app.post("/session/:org_id/connect", (req, res) => {
  const { org_id } = req.params;
  let session = sessions.get(org_id);

  if (session && session.status === "connected") {
    return res.json({ status: "connected", phone: session.phone, qr: null });
  }

  if (!session || ["disconnected", "auth_failure", "error"].includes(session.status)) {
    session = createClient(org_id);
  }

  // Wait briefly for the session to initialize
  const deadline = Date.now() + 6000;
  const poll = () => {
    const s = sessions.get(org_id);
    if (!s) return res.json({ status: "initializing", qr: null });
    if (s.status === "connected") return res.json({ status: "connected", phone: s.phone, qr: null });
    if (s.status === "qr_ready") return res.json({ status: "qr_ready", qr: s.qr });
    if (s.status === "error") return res.status(500).json({ status: "error", error: s.error });
    if (Date.now() < deadline) {
      setTimeout(poll, 400);
    } else {
      res.json({ status: s.status, qr: s.qr });
    }
  };
  setTimeout(poll, 600);
});

/**
 * GET /session/:org_id/status
 * Returns current session status, connection state, and phone number.
 */
app.get("/session/:org_id/status", (req, res) => {
  const { org_id } = req.params;
  const session = sessions.get(org_id);

  if (!session) {
    return res.json({ status: "disconnected", connected: false, phone: null, qr: null });
  }

  // Expire stale QR
  if (session.status === "qr_ready" && session.qr_expires_at && Date.now() > session.qr_expires_at) {
    session.qr = null;
    session.status = "qr_expired";
  }

  return res.json({
    status: session.status,
    connected: session.status === "connected",
    phone: session.phone,
    qr: session.qr || null,
    error: session.error || null,
  });
});

/**
 * GET /session/:org_id/qr
 * Returns current QR code or 404 if not available.
 */
app.get("/session/:org_id/qr", (req, res) => {
  const { org_id } = req.params;
  const session = sessions.get(org_id);

  if (!session || !session.qr || session.status !== "qr_ready") {
    return res.status(404).json({ error: "No QR code available" });
  }

  return res.json({ qr: session.qr, expires_at: session.qr_expires_at });
});

/**
 * POST /session/:org_id/send
 * Sends a text message.
 */
app.post("/session/:org_id/send", async (req, res) => {
  const { org_id } = req.params;
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: "Missing required fields: 'to' and 'message'" });
  }

  const session = sessions.get(org_id);
  if (!session || session.status !== "connected") {
    return res.status(503).json({
      error: "Session not connected",
      status: session ? session.status : "disconnected",
    });
  }

  try {
    const chatId = to.replace(/[^0-9]/g, "") + "@c.us";
    const msg = await session.client.sendMessage(chatId, message);
    return res.json({ success: true, message_id: msg.id ? msg.id.id : null });
  } catch (err) {
    console.error(`[${org_id}] Send error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /session/:org_id/disconnect
 * Destroys the session and removes persisted auth data.
 */
app.post("/session/:org_id/disconnect", async (req, res) => {
  const { org_id } = req.params;
  const session = sessions.get(org_id);

  if (session) {
    try {
      await session.client.destroy();
    } catch (_) {}
    sessions.delete(org_id);
  }

  // Remove persisted LocalAuth data in all possible directories to force fresh QR
  const dirs = [
    path.join(SESSIONS_DIR, `session-${org_id}`),
    path.join(SESSIONS_DIR, ".wwebjs_auth", `session-${org_id}`),
  ];
  for (const d of dirs) {
    if (fs.existsSync(d)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
        console.log(`[${org_id}] Cleared auth dir: ${d}`);
      } catch (err) {
        console.warn(`[${org_id}] Could not clear ${d}:`, err.message);
      }
    }
  }

  return res.json({ status: "disconnected" });
});

/**
 * GET /health
 * Liveness probe for Docker / load balancers.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", active_sessions: sessions.size });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[wa-sidecar] Running on port ${PORT}`);
  console.log(`[wa-sidecar] Session storage: ${SESSIONS_DIR}`);
});
