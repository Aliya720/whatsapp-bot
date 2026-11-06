"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import ImportModal from "@/components/recipients/ImportModal";
import ManualAddModal from "@/components/recipients/ManualAddModal";

interface Recipient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string;
  company: string | null;
  custom_data: Record<string, unknown>;
}

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const fetchRecipients = async () => {
    try {
      const res = await fetch(`/api/recipients/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        setRecipients(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recipients</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your contacts and broadcast lists.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => setShowManual(true)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            Add Contact
          </button>
          <button 
            onClick={() => setShowImport(true)}
            className="px-4 py-2 bg-wa-green border border-transparent rounded-md text-sm font-medium text-white hover:bg-wa-green-dark shadow-sm"
          >
            Import CSV/XLS
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        {loading && recipients.length === 0 ? (
          <div className="animate-pulse p-6 space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex justify-between items-center py-3 border-b">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : recipients.length === 0 ? (
          <div className="p-16 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No recipients found</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by adding contacts manually or importing a file.</p>
            <div className="mt-6 flex justify-center space-x-3">
              <button onClick={() => setShowManual(true)} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                Add Contact
              </button>
              <button onClick={() => setShowImport(true)} className="px-4 py-2 bg-wa-green border border-transparent rounded-md text-sm font-medium text-white hover:bg-wa-green-dark shadow-sm">
                Import CSV
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Custom Fields</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recipients.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {[r.first_name, r.last_name].filter(Boolean).join(" ") || "Unknown"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.phone_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.company || "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {Object.keys(r.custom_data).length} fields
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} onComplete={fetchRecipients} />}
      {showManual && <ManualAddModal onClose={() => setShowManual(false)} onComplete={fetchRecipients} />}
    </div>
  );
}
