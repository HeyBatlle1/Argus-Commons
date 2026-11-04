'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Local persistence for the MiniCalendar. The calendar component and its
 * hover bubble were already in the repo but never mounted; the backend's
 * `argus_schedule` table is cron-shaped (task_name/cron_expression), not
 * date-shaped, so there's no honest way to write these there yet. Until a
 * schedule endpoint exists, items live in localStorage (per browser).
 */
type Item = {
  id: string; title: string; time?: string;
  risk_level: 'low' | 'medium' | 'high' | 'ghost';
  status: 'pending' | 'running' | 'complete' | 'cancelled';
  created_by: 'bradlee' | 'argus' | 'claude';
};
type Data = Record<string, Item[]>;
const KEY = 'argus.calendar.v1';

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function useLocalSchedule() {
  const [data, setData] = useState<Data>({});

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setData(JSON.parse(raw)); } catch { /* storage blocked */ }
  }, []);

  const add = useCallback((date: Date, title: string) => {
    setData((prev) => {
      const k = dateKey(date);
      const next = { ...prev, [k]: [...(prev[k] ?? []), { id: `${Date.now()}`, title, risk_level: 'low' as const, status: 'pending' as const, created_by: 'bradlee' as const }] };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  const count = Object.values(data).reduce((n, items) => n + items.length, 0);
  return { data, add, count };
}
