"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonalStatus = {
  connected: boolean;
  status: string; // "connected" | "qr_ready" | "qr_expired" | "initializing" | "disconnected" | ...
  phone: string | null;
  qr: string | null;
  error?: string | null;
};

type ConnectionPhase =
  | "idle"
  | "connecting"       // POST /connect sent, waiting for response
  | "qr_shown"         // QR displayed, waiting for user to scan
  | "polling_status"   // QR scanned, polling for "connected"
  | "connected"        // authenticated and active
  | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...authHeader(), ...(opts?.headers || {}) },
  });
  return res;
}

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();

  const [personalStatus, setPersonalStatus] = useState<PersonalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs for intervals so we can clear them reliably
  const qrRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollRef = useRef<NodeJS.Timeout | null>(null);

  const clearIntervals = () => {
    if (qrRefreshRef.current) { clearInterval(qrRefreshRef.current); qrRefreshRef.current = null; }
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
  };

  // ── Fetch status ─────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async (): Promise<PersonalStatus | null> => {
    try {
      const res = await apiFetch("/api/personal/status");
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchStatus().then((s) => {
      if (s) {
        setPersonalStatus(s);
        if (s.connected) setPhase("connected");
      }
      setLoading(false);
    });

    return () => clearIntervals();
  }, [fetchStatus]);

  // ── QR Refresh (every 18s — before WhatsApp's 20s expiry) ────────────────

  const startQrRefresh = useCallback(() => {
    clearIntervals();
    qrRefreshRef.current = setInterval(async () => {
      try {
        const res = await apiFetch("/api/personal/qr");
        if (res.status === 404) {
          // QR gone → either connected or expired. Poll status to find out.
          startStatusPolling();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.qr) setQrCode(data.qr);
        }
      } catch {
        // network hiccup — keep retrying
      }
    }, 18_000);
  }, []); // eslint-disable-line

  // ── Status polling (after QR scanned, waiting for "connected") ───────────

  const startStatusPolling = useCallback(() => {
    clearIntervals();
    setPhase("polling_status");

    statusPollRef.current = setInterval(async () => {
      const s = await fetchStatus();
      if (!s) return;
      if (s.connected) {
        clearIntervals();
        setPersonalStatus(s);
        setQrCode(null);
        setPhase("connected");
      } else if (s.status === "qr_expired" || s.status === "qr_ready") {
        // New QR emitted (e.g. user didn't scan in time) — show it
        clearIntervals();
        if (s.qr) setQrCode(s.qr);
        setPhase("qr_shown");
        startQrRefresh();
      } else if (["disconnected", "auth_failure", "error"].includes(s.status)) {
        clearIntervals();
        setPhase("error");
        setErrorMsg(s.error || "Session failed. Please try connecting again.");
      }
    }, 2500);
  }, [fetchStatus, startQrRefresh]);

  // ── Connect ───────────────────────────────────────────────────────────────

  const handleConnect = async () => {
    clearIntervals();
    setPhase("connecting");
    setQrCode(null);
    setErrorMsg(null);

    try {
      const res = await apiFetch("/api/personal/connect", { method: "POST" });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        setPhase("error");
        setErrorMsg(err.detail || "Failed to connect");
        return;
      }

      const data = await res.json();

      if (data.status === "connected") {
        const s = await fetchStatus();
        setPersonalStatus(s);
        setPhase("connected");
        return;
      }

      if (data.status === "qr_ready" && data.qr) {
        setQrCode(data.qr);
        setPhase("qr_shown");
        startQrRefresh();
        return;
      }

      // Initializing — start polling for status / QR
      setPhase("polling_status");
      startStatusPolling();

    } catch {
      setPhase("error");
      setErrorMsg("Could not reach the server. Is the WhatsApp service running?");
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    if (!confirm("This will log out of WhatsApp and require a new QR scan. Continue?")) return;
    clearIntervals();
    try {
      await apiFetch("/api/personal/disconnect", { method: "POST" });
    } catch { /* best-effort */ }
    setQrCode(null);
    setPersonalStatus({ connected: false, status: "disconnected", phone: null, qr: null });
    setPhase("idle");
  };

  // ── "I've scanned" button ─────────────────────────────────────────────────

  const handleScanned = () => {
    clearIntervals();
    setQrCode(null);
    startStatusPolling();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your provider integrations and platform preferences.</p>
      </div>

      {/* ── Personal Mode ── */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Personal WhatsApp</h3>
          <p className="mt-1 text-sm text-gray-500">Connect your personal WhatsApp via QR code.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Compliance notice */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r">
            <p className="text-sm text-yellow-800">
              <strong>Important:</strong> Personal Mode uses an unofficial WhatsApp Web automation layer.
              Message delivery is not guaranteed and may be affected by session expiry, rate-limiting,
              or WhatsApp interface changes. Use the Professional API for production-critical campaigns.
            </p>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500 animate-pulse">Loading status…</div>
          ) : phase === "connected" || personalStatus?.connected ? (
            /* ─ Connected State ─ */
            <div className="border border-green-200 bg-green-50 rounded-md p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-green-900">WhatsApp Connected</h4>
                  <p className="text-sm text-green-700">
                    Account: {personalStatus?.phone || "Active"}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  id="btn-reconnect"
                  onClick={handleConnect}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  Reconnect
                </button>
                <button
                  id="btn-disconnect"
                  onClick={handleDisconnect}
                  className="text-sm font-medium text-red-600 hover:text-red-500"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* ─ Disconnected / QR States ─ */
            <div className="border border-gray-200 rounded-md p-4 space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">
                    {phase === "connecting" && "Starting session…"}
                    {phase === "polling_status" && "Waiting for confirmation…"}
                    {phase === "qr_shown" && "Scan with WhatsApp"}
                    {phase === "error" && "Connection Failed"}
                    {phase === "idle" && "Not Connected"}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {phase === "connecting" && "Initializing WhatsApp Web session…"}
                    {phase === "polling_status" && "Verifying authentication…"}
                    {phase === "qr_shown" && "Open WhatsApp → Linked Devices → Link a Device"}
                    {phase === "error" && (errorMsg || "An error occurred.")}
                    {(phase === "idle") && "Generate a QR code to link your device."}
                  </p>
                </div>

                {(phase === "idle" || phase === "error") && (
                  <button
                    id="btn-generate-qr"
                    onClick={handleConnect}
                    className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
                  >
                    {phase === "error" ? "Retry" : "Generate QR Code"}
                  </button>
                )}
              </div>

              {/* Loading spinner */}
              {(phase === "connecting" || phase === "polling_status") && (
                <div className="flex justify-center py-6">
                  <svg className="animate-spin h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}

              {/* QR Code */}
              {phase === "qr_shown" && qrCode && (
                <div className="flex flex-col items-center space-y-4 pt-2">
                  <div className="bg-white p-3 border-2 border-green-200 rounded-xl shadow-md">
                    <Image
                      src={qrCode}
                      alt="WhatsApp QR Code — scan with your phone"
                      width={256}
                      height={256}
                      unoptimized
                    />
                  </div>

                  <div className="text-center max-w-xs">
                    <p className="text-xs text-gray-400 mb-1">QR refreshes automatically every 18 seconds</p>
                    <ol className="text-sm text-gray-600 text-left list-decimal list-inside space-y-1">
                      <li>Open <strong>WhatsApp</strong> on your phone</li>
                      <li>Tap <strong>⋮ Menu</strong> → <strong>Linked Devices</strong></li>
                      <li>Tap <strong>Link a Device</strong></li>
                      <li>Point your camera at this QR code</li>
                    </ol>
                    <button
                      id="btn-scanned"
                      onClick={handleScanned}
                      className="mt-4 text-sm font-medium text-green-700 hover:text-green-600 underline underline-offset-2"
                    >
                      I&apos;ve scanned the code →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Professional Mode ── */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Professional WhatsApp API</h3>
          <p className="mt-1 text-sm text-gray-500">Connect via the Official Meta Cloud API</p>
        </div>

        <div className="px-6 py-5">
          <ProfessionalSettingsBlock />
        </div>
      </div>
    </div>
  );
}

// ─── Professional Settings Block ──────────────────────────────────────────────

function ProfessionalSettingsBlock() {
  const [config, setConfig] = useState<{
    phone_number_id: string;
    business_account_id: string;
    access_token: string;
    webhook_verify_token: string;
  }>({
    phone_number_id: "",
    business_account_id: "",
    access_token: "",
    webhook_verify_token: "",
  });

  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/professional/config", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) {
          setIsConfigured(true);
          setConfig((prev) => ({
            ...prev,
            phone_number_id: data.phone_number_id,
            business_account_id: data.business_account_id,
            webhook_verify_token: data.webhook_verify_token,
            access_token: "••••••••",
          }));
        }
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/professional/config", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setIsConfigured(true);
        alert("Configuration saved securely.");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to save configuration.");
      }
    } catch {
      alert("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/professional/test-connection", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setTestResult({
        success: res.ok,
        msg: res.ok ? "Connection successful ✓" : (data.detail || "Connection failed"),
      });
    } catch (e: unknown) {
      setTestResult({ success: false, msg: e instanceof Error ? e.message : "Network error" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500 animate-pulse">Loading…</div>;

  return (
    <div className="space-y-4">
      {isConfigured && (
        <div className="p-4 border border-green-200 bg-green-50 rounded-md flex items-center space-x-3">
          <svg className="h-5 w-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium text-green-900">Professional API Configured</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone Number ID</label>
          <input
            id="input-phone-number-id"
            type="text"
            name="phone_number_id"
            value={config.phone_number_id}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-green-500 focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Business Account ID</label>
          <input
            id="input-business-account-id"
            type="text"
            name="business_account_id"
            value={config.business_account_id}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-green-500 focus:border-green-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Access Token <span className="text-gray-400">(Permanent or System User)</span>
          </label>
          <input
            id="input-access-token"
            type="password"
            name="access_token"
            value={config.access_token}
            onChange={handleChange}
            placeholder={isConfigured ? "Leave blank to keep existing token" : "EAAxxxxxxxxxx"}
            className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-green-500 focus:border-green-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Webhook Verify Token</label>
          <input
            id="input-webhook-verify-token"
            type="text"
            name="webhook_verify_token"
            value={config.webhook_verify_token}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-green-500 focus:border-green-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Set your Meta App webhook URL to:{" "}
            <code className="bg-gray-100 px-1 rounded">https://yourdomain.com/api/professional/webhook</code>
          </p>
        </div>
      </div>

      {testResult && (
        <div
          className={`p-3 rounded-md text-sm ${
            testResult.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {testResult.msg}
        </div>
      )}

      <div className="pt-4 flex justify-end space-x-3">
        {isConfigured && (
          <button
            id="btn-test-connection"
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
        )}
        <button
          id="btn-save-config"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-green-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save & Connect"}
        </button>
      </div>
    </div>
  );
}
