"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { Event, User, RSVPStatus } from "@watercooler/shared";
import { Calendar, MapPin, Plus, Users } from "lucide-react";

interface Props {
  user: User;
}

export function EventsPanel({ user }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Event | null>(null);

  const loadEvents = async () => {
    const data = await api.get<Event[]>("/api/events");
    setEvents(data);
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleRsvp = async (eventId: string, status: RSVPStatus) => {
    await api.post(`/api/events/${eventId}/rsvp`, { status });
    loadEvents();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-[var(--muted-foreground)]" />
          <span className="font-semibold text-sm">Events</span>
        </div>
        <button
          onClick={() => { setShowCreate(true); setSelected(null); }}
          className="flex items-center gap-1 text-sm text-[var(--primary)] hover:opacity-80"
        >
          <Plus size={16} /> Create
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {showCreate && (
          <CreateEventForm
            onDone={() => { setShowCreate(false); loadEvents(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {selected ? (
          <EventDetail event={selected} onBack={() => setSelected(null)} onRsvp={handleRsvp} />
        ) : (
          <div className="space-y-3">
            {events.length === 0 && (
              <p className="text-[var(--muted-foreground)] text-sm text-center py-8">
                No events yet
              </p>
            )}
            {events.map((ev) => (
              <div
                key={ev.id}
                onClick={() => setSelected(ev)}
                className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--primary)] transition-colors"
              >
                <h3 className="font-semibold">{ev.title}</h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(ev.startsAt).toLocaleDateString()} at{" "}
                    {new Date(ev.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {ev.locationText && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} />
                      {ev.locationText}
                    </span>
                  )}
                </div>
                {ev.rsvpCounts && (
                  <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted-foreground)]">
                    <span>{ev.rsvpCounts.going} going</span>
                    <span>{ev.rsvpCounts.interested} interested</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventDetail({
  event,
  onBack,
  onRsvp,
}: {
  event: Event;
  onBack: () => void;
  onRsvp: (eventId: string, status: RSVPStatus) => void;
}) {
  const statuses: { value: RSVPStatus; label: string }[] = [
    { value: "going", label: "Going" },
    { value: "interested", label: "Interested" },
    { value: "not_going", label: "Not Going" },
  ];

  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="text-sm text-[var(--primary)] hover:underline mb-4">
        &larr; Back to events
      </button>
      <h2 className="text-xl font-bold">{event.title}</h2>
      <div className="flex items-center gap-4 mt-2 text-sm text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1">
          <Calendar size={14} />
          {new Date(event.startsAt).toLocaleString()}
        </span>
        {event.endsAt && <span>to {new Date(event.endsAt).toLocaleString()}</span>}
      </div>
      {event.locationText && (
        <p className="flex items-center gap-1 mt-1 text-sm text-[var(--muted-foreground)]">
          <MapPin size={14} /> {event.locationText}
        </p>
      )}
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Created by {event.creator?.username}
      </p>
      {event.description && <p className="mt-4 text-sm whitespace-pre-wrap">{event.description}</p>}
      <div className="flex gap-2 mt-6">
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => onRsvp(event.id, s.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              event.myRsvp === s.value
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {event.rsvpCounts && (
        <div className="flex items-center gap-4 mt-3 text-sm text-[var(--muted-foreground)]">
          <span>{event.rsvpCounts.going} going</span>
          <span>{event.rsvpCounts.interested} interested</span>
          <span>{event.rsvpCounts.not_going} not going</span>
        </div>
      )}
    </div>
  );
}

function CreateEventForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    locationText: "",
    startsAt: "",
    endsAt: "",
  });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/events", {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      });
      onDone();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mb-4 space-y-3">
      <h3 className="font-semibold text-lg">Create Event</h3>
      <input
        type="text"
        required
        placeholder="Event title"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
      />
      <textarea
        placeholder="Description (optional)"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        rows={3}
        className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
      />
      <input
        type="text"
        placeholder="Location (optional)"
        value={form.locationText}
        onChange={(e) => setForm((f) => ({ ...f, locationText: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">Starts at</label>
          <input
            type="datetime-local"
            required
            value={form.startsAt}
            onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">Ends at (optional)</label>
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
          />
        </div>
      </div>
      {error && <p className="text-[var(--destructive)] text-sm">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Create Event
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-[var(--muted)] rounded-lg text-sm hover:bg-[var(--border)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
