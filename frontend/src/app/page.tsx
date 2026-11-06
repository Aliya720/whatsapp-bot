"use client";

import { useMode } from "@/context/ModeContext";
import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardStats {
  mode: string;
  total_campaigns: number;
  total_sent: number;
  total_delivered: number;
  total_failed: number;
}

export default function Home() {
  const { mode } = useMode();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/dashboard/stats?mode=${mode}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error("Failed to fetch stats", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [mode]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div>
          <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-96"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 h-28">
              <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isPersonal = mode === "personal";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isPersonal ? "Personal" : "Professional"} Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isPersonal 
              ? "Manage your local WhatsApp Web sessions and broadcast lists." 
              : "Manage your official Meta WhatsApp Business API campaigns."}
          </p>
        </div>
        <Link
          href="/campaigns/create"
          className="inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-wa-green hover:bg-wa-green-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wa-green"
        >
          + New {isPersonal ? "Personal" : "Professional"} Campaign
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">WhatsApp Status</h3>
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {isPersonal ? "Online" : "Connected"}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Campaigns</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{stats?.total_campaigns || 0}</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Messages Sent</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{stats?.total_sent || 0}</p>
        </div>

        {!isPersonal && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Delivered</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stats?.total_delivered || 0}</p>
          </div>
        )}
        
        {!isPersonal && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Failed</h3>
            <p className="mt-2 text-3xl font-semibold text-red-600">{stats?.total_failed || 0}</p>
          </div>
        )}
      </div>
    </div>
  );
}
