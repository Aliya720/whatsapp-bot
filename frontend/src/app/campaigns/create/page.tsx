"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMode } from "@/context/ModeContext";

interface Template {
  id: string;
  name: string;
  content: string;
}

export default function CreateCampaignWizard() {
  const router = useRouter();
  const { mode } = useMode();
  
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  
  // Recipients state
  const [availableRecipients, setAvailableRecipients] = useState<any[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  
  // Templates state
  const [availableTemplates, setAvailableTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Message state
  const [messageTemplate, setMessageTemplate] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewError, setPreviewError] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Fetch recipients when component mounts
    fetch(`/api/recipients/`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setAvailableRecipients(Array.isArray(data) ? data : []))
    .catch(err => console.error(err));

    // Fetch message templates
    fetch(`/api/templates/`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setAvailableTemplates(Array.isArray(data) ? data : []))
    .catch(err => console.error(err));
  }, []);

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const insertVariable = (variable: string) => {
    setMessageTemplate(prev => prev + `{{${variable}}}`);
  };

  const updatePreview = async () => {
    if (!messageTemplate || selectedRecipientIds.length === 0) {
      setPreviewText("");
      setPreviewError("");
      return;
    }

    try {
      const res = await fetch(`/api/campaigns/preview`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message_template: messageTemplate,
          recipient_id: selectedRecipientIds[0]
        })
      });

      if (!res.ok) {
        const d = await res.json();
        setPreviewError(d.detail || "Preview failed");
        setPreviewText("");
      } else {
        const d = await res.json();
        setPreviewText(d.rendered_message);
        setPreviewError("");
      }
    } catch (e: any) {
      setPreviewError(e.message);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (step === 3 || step === 4) {
        updatePreview();
      }
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [messageTemplate, step]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/campaigns/`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name,
          mode: mode, // Immobilized payload at creation time!
          message_template: messageTemplate,
          recipient_ids: selectedRecipientIds
        })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed to queue campaign");
      }

      router.push("/campaigns");
    } catch (e: any) {
      setSubmitError(e.message);
      setSubmitting(false);
    }
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <button onClick={() => router.push("/campaigns")} className="text-gray-500 hover:text-gray-700">
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create Campaign</h1>
      </div>
      
      {/* Step Indicator */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        {["Details", "Recipients", "Message", "Preview", "Confirm"].map((s, i) => (
          <div key={s} className={`text-sm font-medium ${step === i + 1 ? 'text-wa-teal-light' : 'text-gray-400'}`}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-[400px]">
        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Campaign Details</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">Campaign Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Summer Promo 2026"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-wa-green focus:border-wa-green sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Messaging Mode</label>
              <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                This campaign is strictly bound to <strong className="uppercase">{mode}</strong> mode. 
                It cannot be executed by the alternative provider.
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Recipients */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Select Recipients</h2>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">{selectedRecipientIds.length} selected</span>
              <button 
                onClick={() => setSelectedRecipientIds(availableRecipients.map(r => r.id))}
                className="text-wa-teal-light hover:text-indigo-800"
              >
                Select All
              </button>
            </div>
            <div className="border border-gray-200 rounded-md overflow-hidden max-h-96 overflow-y-auto">
              <ul className="divide-y divide-gray-200">
                {availableRecipients.map(r => (
                  <li key={r.id} className="p-3 hover:bg-gray-50 flex items-center space-x-3 cursor-pointer" onClick={() => toggleRecipient(r.id)}>
                    <input 
                      type="checkbox" 
                      checked={selectedRecipientIds.includes(r.id)}
                      readOnly
                      className="h-4 w-4 text-wa-teal-light focus:ring-wa-green border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "Unknown"}</p>
                      <p className="text-xs text-gray-500">{r.phone_number}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Step 3: Message Editor */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Write Message</h2>
                <p className="text-xs text-gray-500">Draft your message or choose from your saved templates.</p>
              </div>

              {availableTemplates.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="template-select" className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                    Template:
                  </label>
                  <select
                    id="template-select"
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedTemplateId(id);
                      const tmpl = availableTemplates.find((t) => t.id === id);
                      if (tmpl) {
                        setMessageTemplate(tmpl.content);
                      }
                    }}
                    className="text-xs border border-gray-300 rounded-lg p-2 bg-white shadow-sm focus:ring-wa-green focus:border-wa-green font-medium text-gray-800"
                  >
                    <option value="">-- Choose from saved templates --</option>
                    {availableTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-sm text-gray-500 mr-2 self-center">Insert Variable:</span>
              {['first_name', 'last_name', 'phone_number', 'company'].map(v => (
                <button 
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2.5 py-1 bg-gray-100 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
            
            <textarea
              rows={8}
              value={messageTemplate}
              onChange={e => setMessageTemplate(e.target.value)}
              placeholder="Hi {{first_name}}, your order is ready!"
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-wa-green focus:border-wa-green sm:text-sm"
            />
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Live Preview (Sample)</h3>
                <div className="p-4 bg-gray-50 rounded-lg min-h-[100px] text-sm text-gray-800 whitespace-pre-wrap">
                  {previewError ? (
                    <span className="text-red-500">{previewError}</span>
                  ) : previewText ? (
                    previewText
                  ) : (
                    <span className="text-gray-400">Type something to preview...</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Review & Validate</h2>
            
            <div className="bg-wa-bubble p-4 rounded-md">
              <h3 className="text-sm font-medium text-indigo-800">Campaign Summary</h3>
              <dl className="mt-2 text-sm text-indigo-700 grid grid-cols-2 gap-x-4 gap-y-2">
                <div><dt className="font-semibold inline">Name:</dt> <dd className="inline">{name}</dd></div>
                <div><dt className="font-semibold inline">Mode:</dt> <dd className="inline uppercase">{mode}</dd></div>
                <div><dt className="font-semibold inline">Recipients:</dt> <dd className="inline">{selectedRecipientIds.length}</dd></div>
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Message Payload</h3>
              <div className="p-4 bg-gray-100 rounded-md text-sm text-gray-800 whitespace-pre-wrap">
                {messageTemplate}
              </div>
            </div>
            
            {previewError && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md">
                <strong>Validation Error:</strong> {previewError}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 5 && (
          <div className="space-y-4 text-center py-10">
            <svg className="mx-auto h-16 w-16 text-wa-teal-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900">Ready to Send</h2>
            <p className="text-gray-500">
              Your campaign is ready to be queued. It will be dispatched via the <strong className="uppercase">{mode}</strong> provider.
            </p>
            {submitError && (
              <div className="max-w-md mx-auto p-3 bg-red-50 text-red-700 text-sm rounded-md mt-4 text-left">
                <strong>Error:</strong> {submitError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex justify-between mt-6">
        <button
          disabled={step === 1 || submitting}
          onClick={handleBack}
          className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>

        {step < 5 ? (
          <button
            onClick={handleNext}
            disabled={
              (step === 1 && !name) || 
              (step === 2 && selectedRecipientIds.length === 0) ||
              (step === 3 && (!messageTemplate || !!previewError)) ||
              (step === 4 && !!previewError)
            }
            className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-wa-green hover:bg-wa-green-dark disabled:opacity-50"
          >
            Next Step
          </button>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Queueing..." : "Confirm & Send"}
          </button>
        )}
      </div>
    </div>
  );
}
