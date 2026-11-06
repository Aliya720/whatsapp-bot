"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMode } from "@/context/ModeContext";

export default function CampaignsPage() {
  const { mode } = useMode();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<"MODE" | "ALL">("MODE");

  useEffect(() => {
    fetchCampaigns();
    // In a real app we might use websockets or SSE for live updates,
    // but polling every 5s works for this phase requirement "Live campaign progress".
    const interval = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(interval);
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

  const displayCampaigns = campaigns.filter(
    c => viewFilter === "ALL" || c.mode.toLowerCase() === mode
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">Manage and monitor your messaging campaigns.</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <select 
            className="border-gray-300 rounded-md text-sm py-2 pl-3 pr-8 focus:ring-wa-green focus:border-wa-green"
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value as "MODE" | "ALL")}
          >
            <option value="MODE">Show {mode.toLowerCase()} mode only</option>
            <option value="ALL">Show all campaigns</option>
          </select>
          <Link 
            href="/campaigns/create"
            className="inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-wa-green hover:bg-wa-green-dark"
          >
            + Create Campaign
          </Link>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        {loading && campaigns.length === 0 ? (
          <div className="animate-pulse p-6 space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="flex justify-between items-center py-4 border-b">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
              </div>
            ))}
          </div>
        ) : displayCampaigns.length === 0 ? (
          <div className="p-16 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No campaigns found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {viewFilter === "MODE" ? `Create your first ${mode.toLowerCase()} campaign to start messaging.` : "Create your first campaign to start messaging."}
            </p>
            <div className="mt-6">
              <Link href="/campaigns/create" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-wa-green hover:bg-wa-green-dark">
                + New Campaign
              </Link>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign</th>
                {viewFilter === "ALL" && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">Progress</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayCampaigns.map((c) => {
                const total = c.valid_recipients || 0;
                const processed = (c.sent_count || 0) + (c.failed_count || 0);
                const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
                
                return (
                <tr key={c.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-500">{new Date(c.created_at).toLocaleString()}</div>
                  </td>
                  {viewFilter === "ALL" && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${c.mode.toUpperCase() === 'PROFESSIONAL' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                        {c.mode.toUpperCase()}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      c.status === 'completed' ? 'bg-green-100 text-green-800' :
                      c.status === 'running' ? 'bg-indigo-100 text-indigo-800 animate-pulse' :
                      c.status === 'queued' ? 'bg-yellow-100 text-yellow-800' :
                      c.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <div className="w-full bg-gray-200 rounded-full h-2.5 flex-1">
                        <div className="bg-wa-green h-2.5 rounded-full" style={{ width: `${percent}%` }}></div>
                      </div>
                      <span className="text-xs font-medium text-gray-700 w-8">{percent}%</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 flex justify-between">
                      <span>{processed} / {total} processed</span>
                      <span className="space-x-2">
                        <span className="text-green-600" title="Delivered">{c.delivered_count || 0}D</span>
                        <span className="text-gray-600" title="Sent">{c.sent_count || 0}S</span>
                        <span className="text-red-600" title="Failed">{c.failed_count || 0}F</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/reports?campaign_id=${c.id}`} className="text-wa-teal-light hover:text-indigo-900">
                      Report
                    </Link>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
