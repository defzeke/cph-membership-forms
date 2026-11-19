"use client";

import { useEffect, useState } from "react";

import { type Booking, getBooking, rescheduleInterview } from "@/lib/db";

import SlotPicker, { fullTime } from "./slot-picker";

const until = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Shows the booked interview and, for 5 hours after applying, lets the applicant move it.
export default function Reschedule() {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBooking().then(setBooking);
  }, []);

  if (!booking) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error } = await rescheduleInterview(slot);
    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    setOpen(false);
    setSlot("");
    setBooking(await getBooking());
  };

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-brand-200 bg-brand-50/70 p-4 text-sm leading-6 text-slate-700">
      <p>
        Your interview is on{" "}
        <span className="font-medium text-slate-900">{fullTime.format(new Date(booking.interviewAt))}</span> (Philippine
        time), if your answers pass the first evaluation. It lasts 20 minutes, so please be ready 5 minutes early.
      </p>

      {!open ? (
        <p>
          Need a different time? You can reschedule until {until.format(new Date(booking.deadline))}.{" "}
          <button type="button" className="font-medium text-brand-700 underline" onClick={() => setOpen(true)}>
            Reschedule
          </button>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="sm:col-span-2">Open slots update live, so pick quickly.</p>
          <SlotPicker slug={booking.slug} initialSlots={booking.slots} value={slot} onChange={setSlot} />
          <div className="flex gap-3 sm:col-span-2">
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-md bg-brand-600 px-4 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={!slot || saving}
              onClick={save}
            >
              {saving ? "Saving..." : "Save new time"}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Keep my time
            </button>
          </div>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 sm:col-span-2">{error}</p>}
        </div>
      )}
    </section>
  );
}
