"use client";

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type ChatMessage,
  type EventTask,
  getEvents,
  getGroupCode,
  getMessages,
  getUserName,
  joinGroup,
  logout,
  saveEvent,
  saveMessage,
} from "@/lib/storage";

type ParsedResult = {
  hasActionItem: boolean;
  type: "event" | "task";
  title: string;
  dateOrTime: string;
  assignee: string | null;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

function dateForEvent(item: EventTask): string | null {
  const value = item.dateOrTime.trim();
  if (!value) return null;

  const isoDate = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(value);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      parsed.getFullYear() === Number(year) &&
      parsed.getMonth() === Number(month) - 1 &&
      parsed.getDate() === Number(day)
    ) {
      return toDateKey(parsed);
    }
  }

  const numericDate = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/.exec(value);
  if (numericDate) {
    const [, monthText, dayText, yearText] = numericDate;
    const currentYear = new Date().getFullYear();
    const year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : currentYear;
    const month = Number(monthText);
    const day = Number(dayText);
    const parsed = new Date(year, month - 1, day);
    if (
      month >= 1 &&
      month <= 12 &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return toDateKey(parsed);
    }
  }

  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const monthPattern = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b|\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?\b/i.exec(value);
  if (monthPattern) {
    const monthText = monthPattern[1] ?? monthPattern[5];
    const day = Number(monthPattern[2] ?? monthPattern[4]);
    const year = Number(monthPattern[3] ?? monthPattern[6] ?? new Date().getFullYear());
    const month = monthNames.findIndex((name) => name.startsWith(monthText.toLowerCase().slice(0, 3)));
    const parsed = new Date(year, month, day);

    if (
      month >= 0 &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month &&
      parsed.getDate() === day
    ) {
      return toDateKey(parsed);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lowerValue = value.toLowerCase();

  if (/\btoday\b/.test(lowerValue)) return toDateKey(today);
  if (/\btomorrow\b/.test(lowerValue)) {
    today.setDate(today.getDate() + 1);
    return toDateKey(today);
  }

  const relativeDate = /\bin\s+(\d+)\s+(day|week)s?\b/.exec(lowerValue);
  if (relativeDate) {
    today.setDate(today.getDate() + Number(relativeDate[1]) * (relativeDate[2] === "week" ? 7 : 1));
    return toDateKey(today);
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayMatch = /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(value);
  if (!weekdayMatch) return null;

  const targetDay = weekdays.indexOf(weekdayMatch[2].toLowerCase());
  const dayOffset = (targetDay - today.getDay() + 7) % 7;
  today.setDate(today.getDate() + (weekdayMatch[1] ? dayOffset || 7 : dayOffset));
  return toDateKey(today);
}

export default function Home() {
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [scheduleItems, setScheduleItems] = useState<EventTask[]>([]);
  const [familyName, setFamilyName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [dailyBrief, setDailyBrief] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<EventTask | null>(null);
  const [manualEventDate, setManualEventDate] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDateOrTime, setManualDateOrTime] = useState("");
  const [manualAssignee, setManualAssignee] = useState("");
  const [manualType, setManualType] = useState<"event" | "task">("event");
  const [manualFormOpen, setManualFormOpen] = useState(false);

  useEffect(() => {
    const syncWorkspace = () => {
      try {
        const nextGroupCode = getGroupCode();
        const nextUserName = getUserName();

        setGroupCode(nextGroupCode);
        setUserName(nextUserName);
        setChatMessages(nextGroupCode ? getMessages() : []);
        setScheduleItems(nextGroupCode ? getEvents() : []);
      } catch (error) {
        setGroupCode(null);
        setUserName(null);
        setChatMessages([]);
        setScheduleItems([]);
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Could not access browser storage. Enable local storage for this site.",
        );
      }
    };

    const syncFromStorage = (event: StorageEvent) => {
      if (
        event.key === "kinsync-group-code" ||
        event.key === "kinsync-user-name" ||
        event.key === null
      ) {
        syncWorkspace();
        return;
      }

      const activeGroupCode = getGroupCode();

      if (
        activeGroupCode &&
        (event.key === `kinsync-group-${activeGroupCode.toLowerCase()}-messages` ||
          event.key === `kinsync-group-${activeGroupCode.toLowerCase()}-events`)
      ) {
        setChatMessages(getMessages());
        setScheduleItems(getEvents());
      }
    };

    const initialSync = window.setTimeout(syncWorkspace, 0);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const handleJoin = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmedName = familyName.trim();
    const trimmedPasscode = passcode.trim();

    if (!trimmedName || !trimmedPasscode) {
      setStatusMessage("Please add your name and family passcode.");
      return;
    }

    if (trimmedPasscode !== "0000" && trimmedPasscode.length < 4) {
      setStatusMessage("Passcodes must be at least 4 characters. You can use the demo passcode 0000.");
      return;
    }

    try {
      const result = joinGroup(trimmedPasscode, trimmedName);

      setGroupCode(result.groupCode);
      setUserName(result.userName);
      setChatMessages(getMessages());
      setScheduleItems(getEvents());
      setStatusMessage("Family room joined successfully.");
      setFamilyName("");
      setPasscode("");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Could not join the family space. Check browser storage settings and try again.",
      );
    }
  };

  const handleTryDemo = () => {
    const demoGroupCode = "0000";
    const demoUserName = "Alex";
    try {
      joinGroup(demoGroupCode, demoUserName);

      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const saturday = new Date(now);
      saturday.setDate(saturday.getDate() + ((6 - saturday.getDay() + 7) % 7 || 7));

      const demoMessages: ChatMessage[] = [
      {
        id: "kinsync-demo-message-1",
        sender: "Alex",
        text: "Dad has a dentist appointment tomorrow at 3:00 PM.",
        timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
      {
        id: "kinsync-demo-message-2",
        sender: "Jamie",
        text: "Can someone pick up groceries for Saturday?",
        timestamp: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
      },
      {
        id: "kinsync-demo-message-3",
        sender: "Alex",
        text: "I can handle the grocery run.",
        timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      },
      ];
      const demoEvents: EventTask[] = [
      {
        id: "kinsync-demo-event-1",
        type: "event",
        title: "Dad's Dentist Appointment",
        dateOrTime: `${toDateKey(tomorrow)} at 3:00 PM`,
        assignee: "Dad",
        createdByName: "Alex",
        createdAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
      {
        id: "kinsync-demo-event-2",
        type: "task",
        title: "Saturday Grocery Run",
        dateOrTime: toDateKey(saturday),
        assignee: "Alex",
        createdByName: "Jamie",
        createdAt: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
      },
      ];

      const existingMessages = getMessages();
      for (const message of demoMessages) {
        if (!existingMessages.some((item) => item.id === message.id)) {
          saveMessage(message);
        }
      }
      for (const event of demoEvents) {
        saveEvent(event);
      }

      setGroupCode(demoGroupCode);
      setUserName(demoUserName);
      setChatMessages(getMessages());
      setScheduleItems(getEvents());
      setStatusMessage("");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Could not start demo mode. Check browser storage settings and try again.",
      );
    }
  };

  const handleLogout = () => {
    logout();
    setGroupCode(null);
    setUserName(null);
    setChatMessages([]);
    setScheduleItems([]);
    setCalendarOpen(false);
    setSelectedEvent(null);
    setDailyBrief("");
    setStatusMessage("You have left the family workspace.");
  };

  const handleDailyBrief = async () => {
    if (chatMessages.length === 0) {
      setDailyBrief("There are no family updates to summarize yet. Share an update to get started. Add a task or event when something needs attention.");
      return;
    }

    setBriefLoading(true);
    setDailyBrief("");
    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "brief",
          messages: chatMessages.slice(-20).map(({ sender, text }) => ({ sender, text })),
        }),
      });
      if (!response.ok) {
        throw new Error(`Daily brief request failed (${response.status})`);
      }
      const result = (await response.json()) as { brief?: string };
      setDailyBrief(result.brief?.trim() || "Review the latest family updates and upcoming schedule. Confirm who is handling any pending tasks or events.");
    } catch {
      setDailyBrief("Review the latest family updates and upcoming schedule. Confirm who is handling any pending tasks or events.");
    } finally {
      setBriefLoading(false);
    }
  };

  const openManualEventForm = (date = toDateKey(new Date())) => {
    setManualEventDate(date);
    setManualDateOrTime(date);
    setManualTitle("");
    setManualAssignee("");
    setManualType("event");
    setManualFormOpen(true);
  };

  const handleSaveManualEvent = () => {
    if (!manualTitle.trim() || !userName) return;

    const eventItem: EventTask = {
      id: createId(),
      type: manualType,
      title: manualTitle.trim(),
      dateOrTime: manualDateOrTime.trim() || manualEventDate,
      assignee: manualAssignee.trim() || undefined,
      createdByName: userName,
      createdAt: new Date().toISOString(),
    };

    setScheduleItems(saveEvent(eventItem));
    setManualFormOpen(false);
    setStatusMessage("Manual item added to the family schedule.");
  };

  const handleSendMessage = async () => {
    if (!draftMessage.trim() || !groupCode || !userName) {
      return;
    }

    const trimmedMessage = draftMessage.trim();
    const newMessage: ChatMessage = {
      id: createId(),
      sender: userName,
      text: trimmedMessage,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = saveMessage(newMessage);
    setChatMessages(nextMessages);
    setDraftMessage("");
    setSending(true);
    setStatusMessage("Parsing your update...");

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmedMessage,
          sender: userName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Message parsing failed (${response.status})`);
      }

      const parsed: ParsedResult = await response.json();

      if (parsed?.hasActionItem) {
        const eventItem: EventTask = {
          id: createId(),
          type: parsed.type,
          title: parsed.title,
          dateOrTime: parsed.dateOrTime,
          assignee: parsed.assignee ?? undefined,
          createdByName: userName,
          createdAt: new Date().toISOString(),
        };

        const updatedEvents = saveEvent(eventItem);
        setScheduleItems(updatedEvents);
        setStatusMessage("Action item added to the family schedule.");
      } else {
        setStatusMessage("Message shared. No action item detected.");
      }
    } catch {
      setStatusMessage("Message shared. Parsing failed, but it stays in the chat.");
    } finally {
      setSending(false);
    }
  };

  const isJoined = Boolean(groupCode && userName);
  const calendarStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      calendarStart.getFullYear(),
      calendarStart.getMonth(),
      index - calendarStart.getDay() + 1,
    );
    const dateKey = toDateKey(date);

    return {
      date,
      dateKey,
      isCurrentMonth: date.getMonth() === calendarMonth.getMonth(),
      events: scheduleItems.filter((item) => dateForEvent(item) === dateKey),
    };
  });

  return (
    <main className="min-h-screen bg-[#f9fafb] text-slate-900">
      {!isJoined ? (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,#eef2ff_0%,#f8fafc_100%)] px-4 py-10">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Family planning</p>
                <h1 className="text-2xl font-bold text-slate-900">KinSync</h1>
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => handleJoin(event)}
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Your name</label>
                <input
                  value={familyName}
                  onChange={(event) => setFamilyName(event.target.value)}
                  placeholder="e.g. Maya"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-indigo-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Family passcode</label>
                <input
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  placeholder="Enter your family code"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-indigo-400 focus:bg-white"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Demo passcode: 0000. Custom passcodes need at least 4 characters.
                </p>
              </div>

              <button
                type="submit"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800"
              >
                <ShieldCheck className="h-4 w-4" />
                Enter family hub
              </button>

              <button
                type="button"
                onClick={handleTryDemo}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                <Sparkles className="h-4 w-4" />
                Try Demo Mode (Code: 0000)
              </button>

              {statusMessage ? (
                <p role="status" className="text-sm text-slate-600">{statusMessage}</p>
              ) : null}
            </form>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 rounded-[1.75rem] border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Family Space</p>
                  <h2 className="text-xl font-bold text-slate-900">{groupCode}</h2>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                  {userName}
                </div>
                <button
                  onClick={() => setCalendarOpen(true)}
                  aria-label="Open family calendar"
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                >
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Calendar</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <LogOut className="h-4 w-4" />
                  Leave
                </button>
              </div>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Family sync</p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">Chat</h3>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={handleDailyBrief}
                    disabled={briefLoading}
                    className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-sm font-medium text-violet-800 transition hover:bg-violet-200 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    {briefLoading ? "Generating..." : "✨ AI Daily Brief"}
                  </button>
                  <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
                    <ShieldCheck className="h-4 w-4" />
                    Local-first
                  </div>
                </div>
              </div>

              {dailyBrief ? (
                <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950" role="status">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <Sparkles className="h-4 w-4" />
                    Today&apos;s family focus
                  </div>
                  {dailyBrief}
                </div>
              ) : null}

              <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-3">
                {chatMessages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                    Share a family update or a planning note here.
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.sender === userName
                          ? "ml-auto bg-slate-900 text-white"
                          : "bg-white text-slate-700 ring-1 ring-slate-200"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] opacity-80">
                        <span>{message.sender}</span>
                        <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-sm leading-6">{message.text}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex gap-3">
                <input
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder="Share a message, reminder, or plan..."
                  className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-indigo-400 focus:bg-white"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !draftMessage.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Send className="h-4 w-4" />
                  {sending ? "Sending" : "Send"}
                </button>
              </div>

              {statusMessage ? <p className="mt-3 text-sm text-slate-600">{statusMessage}</p> : null}
            </section>

            <aside className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Plan board</p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">Schedule & tasks</h3>
                </div>
                <Calendar className="h-5 w-5 text-indigo-600" />
              </div>

              <div className="space-y-3">
                {scheduleItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                    Nothing scheduled yet. Any parsed family item will appear here.
                  </div>
                ) : (
                  scheduleItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedEvent(item)}
                      className="block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
                          {item.type}
                        </span>
                        {item.assignee ? (
                          <span className="text-xs text-slate-500">{item.assignee}</span>
                        ) : null}
                      </div>

                      <h4 className="text-base font-semibold text-slate-900">{item.title}</h4>
                      <p className="mt-2 text-sm text-slate-600">{item.dateOrTime}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                        Added by {item.createdByName}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {calendarOpen && isJoined ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCalendarOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-title"
            className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-2xl sm:rounded-[2rem] sm:p-6"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Family calendar</p>
                <h2 id="calendar-title" className="mt-1 text-2xl font-bold text-slate-900">
                  {calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                  }
                  aria-label="Previous month"
                  className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setCalendarMonth(new Date())}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Today
                </button>
                <button
                  onClick={() =>
                    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                  }
                  aria-label="Next month"
                  className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setCalendarOpen(false)}
                  aria-label="Close calendar"
                  className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Select a day to create a family event or task.</p>
              <button
                onClick={() => openManualEventForm(manualEventDate || toDateKey(new Date()))}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Add manual event
              </button>
            </div>

            <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-slate-200">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                <div
                  key={weekday}
                  className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {weekday}
                </div>
              ))}
              {calendarDays.map(({ date, dateKey, isCurrentMonth, events }) => {
                const isToday = dateKey === toDateKey(new Date());

                return (
                  <div
                    key={dateKey}
                    className={`min-h-28 border-b border-r border-slate-200 p-1.5 sm:min-h-32 sm:p-2 ${
                      isCurrentMonth ? "bg-white" : "bg-slate-50/70"
                    }`}
                  >
                    <button
                      onClick={() => openManualEventForm(dateKey)}
                      aria-label={`Add event on ${date.toLocaleDateString()}`}
                      className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition hover:bg-indigo-100 ${
                        isToday ? "bg-indigo-600 text-white hover:bg-indigo-500" : ""
                      } ${isCurrentMonth ? "text-slate-800" : "text-slate-400"}`}
                    >
                      {date.getDate()}
                    </button>
                    <div className="space-y-1">
                      {events.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedEvent(item)}
                          className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-medium sm:text-xs ${
                            item.type === "event"
                              ? "bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                              : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          }`}
                          title={`${item.title} — ${item.dateOrTime}`}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {manualFormOpen ? (
              <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">
                    Add to {new Date(`${manualEventDate}T00:00:00`).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </h3>
                  <button
                    onClick={() => setManualFormOpen(false)}
                    aria-label="Close manual event form"
                    className="rounded-lg p-1 text-slate-500 hover:bg-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Title
                    <input
                      autoFocus
                      value={manualTitle}
                      onChange={(event) => setManualTitle(event.target.value)}
                      placeholder="e.g. Dentist appointment"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Date or time
                    <input
                      value={manualDateOrTime}
                      onChange={(event) => setManualDateOrTime(event.target.value)}
                      placeholder="2026-10-10 or 10:30 AM"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Assignee (optional)
                    <input
                      value={manualAssignee}
                      onChange={(event) => setManualAssignee(event.target.value)}
                      placeholder="Who is responsible?"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Type
                    <select
                      value={manualType}
                      onChange={(event) => setManualType(event.target.value as "event" | "task")}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-indigo-400"
                    >
                      <option value="event">Event</option>
                      <option value="task">Task</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSaveManualEvent}
                    disabled={!manualTitle.trim()}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Save to calendar
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {selectedEvent ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-details-title"
            className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  {selectedEvent.type}
                </p>
                <h2 id="event-details-title" className="mt-2 text-2xl font-bold text-slate-900">
                  {selectedEvent.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                aria-label="Close event details"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="space-y-4">
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Date / time</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {selectedEvent.dateOrTime || "No date or time specified"}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Assignee</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">
                  {selectedEvent.assignee || "Unassigned"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Created by</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{selectedEvent.createdByName}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </main>
  );
}
