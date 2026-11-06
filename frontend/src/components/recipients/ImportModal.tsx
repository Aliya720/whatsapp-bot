"use client";

import { useState, useEffect, useRef } from "react";

type Step = "UPLOAD" | "MAP" | "VALIDATE" | "SUCCESS";

interface ImportRow {
  row_index: number;
  data: Record<string, string>;
}

interface PreviewData {
  file_id: string;
  total_rows: number;
  detected_columns: string[];
  preview_rows: ImportRow[];
}

interface ValidatedRow {
  row_index: number;
  recipient: {
    phone_number: string;
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    custom_data?: Record<string, unknown>;
  } | null;
  is_duplicate?: boolean;
  errors: string[];
}

interface ValidationResult {
  file_id: string;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  rows: ValidatedRow[];
}

interface ImportConfirmResult {
  message: string;
  imported: number;
  updated: number;
  skipped: number;
}

interface ColumnMapping {
  phone_number: string;
  first_name: string;
  last_name: string;
  company: string;
  custom_fields: Record<string, string>;
}

interface ImportModalProps {
  onClose: () => void;
  onComplete: () => void;
}

const COUNTRIES = [
  { code: "IN", name: "India (+91)", dial: "+91" },
  { code: "US", name: "United States / Canada (+1)", dial: "+1" },
  { code: "GB", name: "United Kingdom (+44)", dial: "+44" },
  { code: "AE", name: "United Arab Emirates (+971)", dial: "+971" },
  { code: "SA", name: "Saudi Arabia (+966)", dial: "+966" },
  { code: "AU", name: "Australia (+61)", dial: "+61" },
  { code: "SG", name: "Singapore (+65)", dial: "+65" },
  { code: "MY", name: "Malaysia (+60)", dial: "+60" },
  { code: "PK", name: "Pakistan (+92)", dial: "+92" },
  { code: "BD", name: "Bangladesh (+880)", dial: "+880" },
  { code: "DE", name: "Germany (+49)", dial: "+49" },
  { code: "FR", name: "France (+33)", dial: "+33" },
  { code: "ZA", name: "South Africa (+27)", dial: "+27" },
  { code: "BR", name: "Brazil (+55)", dial: "+55" },
];

export default function ImportModal({ onClose, onComplete }: ImportModalProps) {
  const [step, setStep] = useState<Step>("UPLOAD");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResult | null>(null);

  const [defaultRegion, setDefaultRegion] = useState("IN");
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update">("skip");

  const [mapping, setMapping] = useState<ColumnMapping>({
    phone_number: "",
    first_name: "",
    last_name: "",
    company: "",
    custom_fields: {},
  });

  const [activeTab, setActiveTab] = useState<"all" | "invalid" | "duplicates">("all");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const autoDetectColumns = (columns: string[]) => {
    const newMapping: ColumnMapping = {
      phone_number: "",
      first_name: "",
      last_name: "",
      company: "",
      custom_fields: {},
    };

    columns.forEach((col) => {
      const lower = col.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!newMapping.phone_number && (lower.includes("phone") || lower.includes("mobile") || lower.includes("contact") || lower.includes("whatsapp") || lower.includes("tel") || lower.includes("cell") || lower === "number")) {
        newMapping.phone_number = col;
      } else if (!newMapping.first_name && (lower.includes("first") || lower.includes("fname") || lower === "name" || lower === "fullname")) {
        newMapping.first_name = col;
      } else if (!newMapping.last_name && (lower.includes("last") || lower.includes("lname") || lower.includes("surname"))) {
        newMapping.last_name = col;
      } else if (!newMapping.company && (lower.includes("company") || lower.includes("org") || lower.includes("business"))) {
        newMapping.company = col;
      }
    });

    setMapping(newMapping);
  };

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      setError("Please select a valid CSV or Excel (.xlsx) file.");
      return;
    }
    setError("");
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setError("");
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/recipients/import/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Upload failed (Status ${res.status})`);
      }

      setPreviewData(data);
      autoDetectColumns(data.detected_columns || []);
      setStep("MAP");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleValidate = async () => {
    if (!previewData) return;
    if (!mapping.phone_number) {
      setError("Please map the Phone Number column before validating.");
      return;
    }
    setError("");
    setIsProcessing(true);
    try {
      const res = await fetch("/api/recipients/import/validate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_id: previewData.file_id,
          mapping: mapping,
          default_region: defaultRegion,
          duplicate_action: duplicateAction,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Validation failed. Please check your column mappings.");
      }

      setValidationResult(data);
      setStep("VALIDATE");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Validation error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewData) return;
    setError("");
    setIsProcessing(true);
    try {
      const res = await fetch("/api/recipients/import/confirm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_id: previewData.file_id,
          duplicate_action: duplicateAction,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Import confirmation failed.");
      }

      setConfirmResult(data);
      setStep("SUCCESS");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import contacts.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent =
      "Phone,First Name,Last Name,Company\n" +
      "+919876543210,Rohan,Sharma,Acme Inc\n" +
      "9876501234,Priya,Patel,TechCorp\n" +
      "+14155552671,John,Doe,Globex\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample_recipients.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // RENDER STEP 1: UPLOAD
  const renderUpload = () => (
    <div className="space-y-5">
      {/* Drag & Drop Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-emerald-500 bg-emerald-50"
            : file
            ? "border-emerald-400 bg-emerald-50/40"
            : "border-gray-300 hover:border-emerald-400 hover:bg-gray-50/60"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => handleFileSelect(e.target.files ? e.target.files[0] : null)}
          className="hidden"
        />

        <div className="flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3 shadow-inner">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          {file ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">{file.name}</p>
              <p className="text-xs text-emerald-600 font-medium">{formatFileSize(file.size)} • Click to change file</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-800">
                Click to browse or drag & drop contact list
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supports CSV, XLSX, or XLS (up to 50,000 rows, max 5MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Info & Sample CSV Download */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <svg className="text-emerald-600 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Columns can be in any order. Headers will be matched automatically.</span>
        </div>
        <button
          type="button"
          onClick={downloadSampleCsv}
          className="font-medium text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download Sample CSV
        </button>
      </div>

      {/* Action Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || isProcessing}
          className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-md transition-all flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Uploading...
            </>
          ) : (
            <>
              Next: Map Columns
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );

  // RENDER STEP 2: MAP
  const renderMap = () => {
    if (!previewData) return null;

    return (
      <div className="space-y-5">
        {/* Country & Duplicates Settings */}
        <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/80 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                Default Country Code
              </label>
              <select
                value={defaultRegion}
                onChange={(e) => setDefaultRegion(e.target.value)}
                className="w-full text-sm border-gray-300 rounded-xl shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white p-2.5"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Applied to numbers without a leading + or country code.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                Duplicate Handling
              </label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center text-xs font-medium text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="dupAction"
                    value="skip"
                    checked={duplicateAction === "skip"}
                    onChange={() => setDuplicateAction("skip")}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 mr-2"
                  />
                  Skip duplicates
                </label>
                <label className="flex items-center text-xs font-medium text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="dupAction"
                    value="update"
                    checked={duplicateAction === "update"}
                    onChange={() => setDuplicateAction("update")}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 mr-2"
                  />
                  Update existing
                </label>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {duplicateAction === "skip"
                  ? "Existing contacts will be left unchanged."
                  : "Existing contacts will have names/custom fields updated."}
              </p>
            </div>
          </div>
        </div>

        {/* Column Mappings */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-3">
            Map File Columns to Recipient Fields
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">* Required</span>
              </label>
              <select
                value={mapping.phone_number}
                onChange={(e) => setMapping({ ...mapping, phone_number: e.target.value })}
                className={`w-full text-sm rounded-xl shadow-sm bg-white p-2.5 ${
                  !mapping.phone_number
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                    : "border-gray-300 focus:border-emerald-500 focus:ring-emerald-500"
                }`}
              >
                <option value="">Select column...</option>
                {previewData.detected_columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
              <select
                value={mapping.first_name}
                onChange={(e) => setMapping({ ...mapping, first_name: e.target.value })}
                className="w-full text-sm border-gray-300 rounded-xl shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white p-2.5"
              >
                <option value="">(Skip / None)</option>
                {previewData.detected_columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <select
                value={mapping.last_name}
                onChange={(e) => setMapping({ ...mapping, last_name: e.target.value })}
                className="w-full text-sm border-gray-300 rounded-xl shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white p-2.5"
              >
                <option value="">(Skip / None)</option>
                {previewData.detected_columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Company</label>
              <select
                value={mapping.company}
                onChange={(e) => setMapping({ ...mapping, company: e.target.value })}
                className="w-full text-sm border-gray-300 rounded-xl shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white p-2.5"
              >
                <option value="">(Skip / None)</option>
                {previewData.detected_columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Preview Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              File Preview (First {previewData.preview_rows.length} of {previewData.total_rows} rows)
            </span>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden max-h-40 overflow-x-auto text-xs">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {previewData.detected_columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                      {col}
                      {mapping.phone_number === col && (
                        <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                          Phone
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {previewData.preview_rows.map((row) => (
                  <tr key={row.row_index} className="hover:bg-gray-50/50">
                    {previewData.detected_columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {row.data[col] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setStep("UPLOAD")}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <button
            type="button"
            onClick={handleValidate}
            disabled={!mapping.phone_number || isProcessing}
            className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-md transition-all flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Validating...
              </>
            ) : (
              <>
                Next: Validate & Review
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // RENDER STEP 3: VALIDATE
  const renderValidate = () => {
    if (!validationResult) return null;

    const { total_rows, valid_count, invalid_count, duplicate_count, rows } = validationResult;
    const canImport = duplicateAction === "update" ? valid_count > 0 : valid_count > 0;

    // Filter rows for review tab
    const issueRows = rows.filter((r) => r.errors.length > 0 || r.is_duplicate);
    const invalidRows = rows.filter((r) => r.errors.some((e) => !e.includes("will be skipped") && !e.includes("already exists")));
    const duplicateRows = rows.filter((r) => r.is_duplicate);

    const displayedRows =
      activeTab === "invalid"
        ? invalidRows
        : activeTab === "duplicates"
        ? duplicateRows
        : issueRows;

    return (
      <div className="space-y-5">
        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-2.5 text-center">
          <div className="bg-gray-50 border border-gray-200/80 p-3 rounded-2xl">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Total</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{total_rows}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-semibold">Valid</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{valid_count}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl">
            <p className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold">Duplicates</p>
            <p className="text-xl font-bold text-amber-700 mt-0.5">{duplicate_count}</p>
          </div>
          <div className="bg-red-50 border border-red-200 p-3 rounded-2xl">
            <p className="text-[10px] text-red-600 uppercase tracking-wider font-semibold">Invalid</p>
            <p className="text-xl font-bold text-red-700 mt-0.5">{invalid_count}</p>
          </div>
        </div>

        {/* Status Notification / Guidance */}
        {valid_count === 0 && duplicate_count > 0 && duplicateAction === "skip" && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold">All contacts in this file already exist in your organization.</p>
              <p className="mt-0.5 text-amber-700">
                To update these existing contacts with new information from this file, click &quot;Back&quot; and choose &quot;Update existing&quot; under Duplicate Handling.
              </p>
            </div>
          </div>
        )}

        {/* Detailed Issues Review */}
        {issueRows.length > 0 && (
          <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-700">Review Items ({issueRows.length})</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeTab === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  All ({issueRows.length})
                </button>
                {invalidRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("invalid")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      activeTab === "invalid" ? "bg-red-50 text-red-700 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Invalid ({invalidRows.length})
                  </button>
                )}
                {duplicateRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("duplicates")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      activeTab === "duplicates" ? "bg-amber-50 text-amber-700 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Duplicates ({duplicateRows.length})
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto divide-y divide-gray-100 text-xs">
              {displayedRows.length === 0 ? (
                <p className="p-4 text-center text-gray-400">No items in this filter.</p>
              ) : (
                displayedRows.map((r, idx) => (
                  <div key={idx} className="p-3 flex items-start justify-between gap-3 hover:bg-gray-50/50">
                    <div>
                      <span className="font-semibold text-gray-800">Row {r.row_index + 1}:</span>{" "}
                      <span className="text-gray-600">{r.recipient?.phone_number || "No valid phone"}</span>
                      {r.recipient?.first_name && (
                        <span className="text-gray-400 ml-1.5">
                          ({[r.recipient.first_name, r.recipient.last_name].filter(Boolean).join(" ")})
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      {r.errors.map((err, eIdx) => (
                        <span
                          key={eIdx}
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ml-1 ${
                            err.includes("skipped") || err.includes("already exists")
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {err}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setStep("MAP")}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Mapping
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canImport || isProcessing}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-md transition-all flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Importing...
              </>
            ) : (
              <>
                {duplicateAction === "update" && duplicate_count > 0
                  ? `Import ${valid_count} & Update ${duplicate_count} Recipients`
                  : `Import ${valid_count} Recipients`}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // RENDER STEP 4: SUCCESS
  const renderSuccess = () => (
    <div className="text-center py-6 space-y-4">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 shadow-inner">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-bold text-gray-900">Import Complete!</h3>
        <p className="text-sm text-gray-500 mt-1">
          Your recipients have been successfully processed into your database.
        </p>
      </div>

      {confirmResult && (
        <div className="inline-flex gap-4 p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs text-gray-700 font-medium">
          <span>
            <strong className="text-emerald-600 text-sm">{confirmResult.imported}</strong> added
          </span>
          {confirmResult.updated > 0 && (
            <span>
              • <strong className="text-teal-600 text-sm">{confirmResult.updated}</strong> updated
            </span>
          )}
          {confirmResult.skipped > 0 && (
            <span>
              • <strong className="text-amber-600 text-sm">{confirmResult.skipped}</strong> skipped
            </span>
          )}
        </div>
      )}

      <div className="pt-4">
        <button
          type="button"
          onClick={() => {
            onComplete();
            onClose();
          }}
          className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 shadow-md transition-all"
        >
          View Recipients
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden"
        style={{
          background: "#ffffff",
          backgroundColor: "#ffffff",
          border: "1px solid rgba(0, 0, 0, 0.12)",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.45)",
          animation: "modalIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
          zIndex: 10000,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent Bar */}
        <div style={{ height: 4, background: "linear-gradient(90deg, #25D366 0%, #128C7E 100%)" }} />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ backgroundColor: "#ffffff" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl"
              style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900" style={{ letterSpacing: "-0.01em" }}>
                Import Recipients
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-xs font-semibold ${
                    step === "UPLOAD"
                      ? "text-emerald-600"
                      : step === "MAP"
                      ? "text-teal-600"
                      : step === "VALIDATE"
                      ? "text-indigo-600"
                      : "text-green-600"
                  }`}
                >
                  Step {step === "UPLOAD" ? "1" : step === "MAP" ? "2" : step === "VALIDATE" ? "3" : "4"} of 4
                </span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-500">
                  {step === "UPLOAD"
                    ? "Upload Spreadsheet"
                    : step === "MAP"
                    ? "Column Mapping & Country"
                    : step === "VALIDATE"
                    ? "Review & Validate"
                    : "Complete"}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #e5e7eb 20%, #e5e7eb 80%, transparent)" }} />

        {/* Modal Body */}
        <div className="px-6 py-5" style={{ backgroundColor: "#ffffff" }}>
          {/* Error Alert */}
          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl text-xs bg-red-50 border border-red-200 text-red-700" style={{ backgroundColor: "#fef2f2" }}>
              <svg className="w-4 h-4 text-red-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {step === "UPLOAD" && renderUpload()}
          {step === "MAP" && renderMap()}
          {step === "VALIDATE" && renderValidate()}
          {step === "SUCCESS" && renderSuccess()}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          0%  { opacity: 0; transform: scale(0.94) translateY(10px); }
          100%{ opacity: 1; transform: scale(1)   translateY(0); }
        }
      `}</style>
    </div>
  );
}
