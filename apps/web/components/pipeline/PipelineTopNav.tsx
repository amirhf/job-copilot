'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Inbox,
  Sparkles,
  CheckCircle2,
  Archive,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import type { PipelineStageCounts } from '../../lib/data';

export function PipelineTopNav({ counts }: { counts: PipelineStageCounts }) {
  const pathname = usePathname();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const navItems = [
    {
      href: '/inbox',
      label: 'Triage Inbox',
      count: counts.inbox,
      icon: Inbox,
    },
    {
      href: '/approved',
      label: 'Approved & Generating',
      count: counts.approved,
      icon: Sparkles,
    },
    {
      href: '/ready',
      label: 'Ready to Apply',
      count: counts.ready,
      icon: CheckCircle2,
    },
    {
      href: '/applied',
      label: 'Applied & Archive',
      count: counts.applied,
      icon: Archive,
    },
  ];

  async function handleSyncNow() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/jobs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        ok: boolean;
        fetchedCount?: number;
        error?: string;
      };
      if (data.ok) {
        setSyncMessage(`Synced (${data.fetchedCount ?? 0} fetched)`);
        router.refresh();
      } else {
        setSyncMessage(data.error ?? 'Sync error');
      }
    } catch {
      setSyncMessage('Network error');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href="/inbox"
            className="flex items-center gap-2.5 text-slate-100 font-semibold tracking-tight"
          >
            <span className="h-8 w-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
              JC
            </span>
            <span>Job Copilot</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  <span
                    className={`px-1.5 py-0.5 text-xs rounded-full ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {syncMessage && (
            <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-md">
              {syncMessage}
            </span>
          )}

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing Connectors...' : 'Sync Connectors'}</span>
          </button>

          <Link
            href="/profile"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              pathname === '/profile'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Career Graph & Rubric</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
