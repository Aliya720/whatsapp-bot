"use client";

import { useState, useEffect, useRef } from "react";

interface ManualAddModalProps {
  onClose: () => void;
  onComplete: () => void;
}

export default function ManualAddModal({ onClose, onComplete }: ManualAddModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Focus phone field on open
  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!phone.trim()) {
      setError("Phone number is required.");
      phoneRef.current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/recipients/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone_number: phone.trim(),
          company: company.trim() || null,
          custom_data: {},
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }

      setSuccess(true);
      setTimeout(() => {
        onComplete();
        onClose();
      }, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
          border: "1px solid rgba(0,0,0,0.08)",
          animation: "modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div style={{ height: 4, background: "linear-gradient(90deg, #25D366 0%, #128C7E 100%)" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900" style={{ letterSpacing: "-0.01em" }}>Add Contact</h2>
              <p className="text-xs text-gray-400 mt-0.5">Fill in the details below</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #e5e7eb 20%, #e5e7eb 80%, transparent)" }} />

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Error banner */}
          {error && (
            <div
              className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-sm"
              style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}
            >
              <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Success banner */}
          {success && (
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-medium"
              style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Contact added successfully!
            </div>
          )}

          {/* Phone number — most important field, full width at top */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Phone Number <span style={{ color: "#25D366" }}>*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.59 1.31h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 6 6l.87-.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z" />
                </svg>
              </span>
              <input
                id="input-phone-number"
                ref={phoneRef}
                type="tel"
                required
                placeholder="+919876543210"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(""); }}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border transition-all outline-none"
                style={{
                  border: error && !phone ? "1.5px solid #ef4444" : "1.5px solid #e5e7eb",
                  background: "#fafafa",
                  color: "#111827",
                }}
                onFocus={e => { e.currentTarget.style.border = "1.5px solid #25D366"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,211,102,0.12)"; }}
                onBlur={e => { e.currentTarget.style.border = "1.5px solid #e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">Include country code — e.g. +91 (India), +1 (US/Canada)</p>
          </div>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "First Name", value: firstName, set: setFirstName, placeholder: "Rahul", id: "input-first-name" },
              { label: "Last Name", value: lastName, set: setLastName, placeholder: "Sharma", id: "input-last-name" },
            ].map(({ label, value, set, placeholder, id }) => (
              <div key={label}>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">{label}</label>
                <input
                  id={id}
                  type="text"
                  placeholder={placeholder}
                  value={value}
                  onChange={e => set(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all outline-none"
                  style={{ border: "1.5px solid #e5e7eb", background: "#fafafa", color: "#111827" }}
                  onFocus={e => { e.currentTarget.style.border = "1.5px solid #25D366"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,211,102,0.12)"; }}
                  onBlur={e => { e.currentTarget.style.border = "1.5px solid #e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
            ))}
          </div>

          {/* Company */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Company</label>
            <input
              id="input-company"
              type="text"
              placeholder="Acme Inc."
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all outline-none"
              style={{ border: "1.5px solid #e5e7eb", background: "#fafafa", color: "#111827" }}
              onFocus={e => { e.currentTarget.style.border = "1.5px solid #25D366"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,211,102,0.12)"; }}
              onBlur={e => { e.currentTarget.style.border = "1.5px solid #e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#f1f5f9" }} />

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all"
              style={{ border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || success}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              style={{
                background: success
                  ? "#16a34a"
                  : "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(37,211,102,0.35)",
                opacity: isSubmitting ? 0.8 : 1,
              }}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Saving…
                </>
              ) : success ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Saved!
                </>
              ) : (
                "Save Contact"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes modalIn {
          0%  { opacity: 0; transform: scale(0.92) translateY(12px); }
          100%{ opacity: 1; transform: scale(1)   translateY(0); }
        }
      `}</style>
    </div>
  );
}
