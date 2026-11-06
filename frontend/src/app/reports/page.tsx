"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaign_id");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>(campaignId || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/campaigns/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        setCampaigns(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedCampaign) return;
    try {
      const res = await fetch(`/api/reports/export?campaign_id=${selectedCampaign}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Export failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Get filename from header or fallback
      const disposition = res.headers.get("Content-Disposition");
      let filename = "export.csv";
      if (disposition && disposition.includes("filename=")) {
        filename = disposition.split("filename=")[1].replace(/"/g, "");
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to export report");
    }
  };

  const selectedCampaignDetails = campaigns.find(c => c.id === selectedCampaign);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Campaign Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Download detailed delivery logs and recipient statuses for your campaigns.
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Campaign to Export
        </label>
        <div className="flex items-center space-x-4">
          <select
            className="flex-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-wa-green focus:border-wa-green sm:text-sm py-2 px-3 border"
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
          >
            <option value="">-- Select a campaign --</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({new Date(c.created_at).toLocaleDateString()}) - {c.mode}
              </option>
            ))}
          </select>
          <button
            onClick={handleExport}
            disabled={!selectedCampaign}
            className={`inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
              !selectedCampaign ? "bg-indigo-400 cursor-not-allowed" : "bg-wa-green hover:bg-wa-green-dark"
            }`}
          >
            <svg className="mr-2 -ml-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {selectedCampaignDetails && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Report Summary: {selectedCampaignDetails.name}
            </h3>
          </div>
          <div className="px-6 py-5">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-4">
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Mode</dt>
                <dd className="mt-1 text-sm text-gray-900 font-semibold capitalize">{selectedCampaignDetails.mode}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Total Recipients</dt>
                <dd className="mt-1 text-sm text-gray-900">{selectedCampaignDetails.valid_recipients}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Sent</dt>
                <dd className="mt-1 text-sm text-green-600 font-semibold">{selectedCampaignDetails.sent_count}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Failed</dt>
                <dd className="mt-1 text-sm text-red-600 font-semibold">{selectedCampaignDetails.failed_count}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
