"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export default function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/templates/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/templates/`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, content })
      });
      if (res.ok) {
        setShowCreate(false);
        setName("");
        setContent("");
        fetchTemplates();
      } else {
        alert("Failed to create template");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This action cannot be undone.")) return;
    try {
      await fetch(`/api/templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your reusable provider-agnostic templates.</p>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-wa-green border border-transparent rounded-md text-sm font-medium text-white hover:bg-wa-green-dark shadow-sm"
        >
          + Create Template
        </button>
      </div>

      {loading && templates.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 h-48 p-4">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-16 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No templates found</h3>
            <p className="mt-1 text-sm text-gray-500">Create your first template to speed up campaign creation.</p>
            <div className="mt-6">
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-wa-green hover:bg-wa-green-dark">
                + New Template
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-medium text-gray-900 truncate">{t.name}</h3>
                <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700 text-sm font-medium focus:outline-none focus:underline">Delete</button>
              </div>
              <div className="p-4 flex-1">
                <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans">{t.content}</pre>
              </div>
              <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
                Created {new Date(t.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 opacity-75" onClick={() => setShowCreate(false)}></div>
            <div className="bg-white rounded-lg overflow-hidden shadow-xl transform transition-all max-w-lg w-full p-6 relative">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create Template</h3>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Template Name</label>
                  <input 
                    type="text" required
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-wa-green focus:border-wa-green sm:text-sm"
                    value={name} onChange={e => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Content</label>
                  <textarea 
                    required rows={5}
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-wa-green focus:border-wa-green sm:text-sm"
                    value={content} onChange={e => setContent(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">Supported variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{phone_number}}'}, {'{{company}}'}</p>
                </div>
                <div className="flex justify-end space-x-3 mt-5">
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-wa-green text-white rounded-md text-sm hover:bg-wa-green-dark">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
