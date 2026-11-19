"use client";

import { useEffect, useState } from "react";

import { listOpenSlots } from "@/lib/db";

// Interviews happen in Philippine time, whatever the applicant's device says.
export const fullTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "short" });
const day = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const SLOT_MS = 20 * 60 * 1000;
const POLL_MS = 5000;

const selectClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500";

// Date + time selects over the department's open slots, re-polled so a slot someone else books disappears.
export default function SlotPicker({
  slug,
  initialSlots,
  value,
  onChange,
}: {
  slug: string;
  initialSlots: string[];
  value: string;
  onChange: (slot: string) => void;
}) {
  const [slots, setSlots] = useState(initialSlots);
  const [pickedDay, setPickedDay] = useState("");
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const id = setInterval(async () => {
      const next = await listOpenSlots(slug);
      setSlots(next);
      if (value && !next.includes(value)) {
        onChange("");
        setLost(true);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [slug, value, onChange]);

  const byDay = new Map<string, string[]>();
  for (const s of slots) {
    const key = day.format(new Date(s));
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  if (!slots.length) return <p className="text-sm text-slate-700 sm:col-span-2">No interview slots are open right now.</p>;

  return (
    <>
      <label className="space-y-2 text-sm">
        <span className="font-medium">Date</span>
        <select
          className={selectClass}
          value={pickedDay}
          onChange={(e) => {
            setPickedDay(e.target.value);
            onChange("");
          }}
          required
        >
          <option value="" disabled>Select a date</option>
          {[...byDay.keys()].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        <span className="font-medium">Time</span>
        <select
          className={selectClass}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setLost(false);
          }}
          disabled={!pickedDay}
          required
        >
          <option value="" disabled>Select a time</option>
          {(byDay.get(pickedDay) ?? []).map((s) => (
            <option key={s} value={s}>
              {time.format(new Date(s))} - {time.format(new Date(Date.parse(s) + SLOT_MS))}
            </option>
          ))}
        </select>
      </label>
      {lost && (
        <p className="text-sm text-red-700 sm:col-span-2">The time you picked was just taken. Please pick another one.</p>
      )}
    </>
  );
}
