import { NextResponse } from "next/server";

export type ParsedActionItem = {
  hasActionItem: boolean;
  type: "event" | "task";
  title: string;
  dateOrTime: string;
  assignee: string | null;
};

const emptyParsedAction: ParsedActionItem = {
  hasActionItem: false,
  type: "task",
  title: "",
  dateOrTime: "",
  assignee: null,
};

const SYSTEM_PROMPT = `
You are a family planning assistant.
Extract actionable family calendar items or tasks from the user's message.
Return ONLY valid JSON with this exact structure:
{
  "hasActionItem": boolean,
  "type": "event" | "task",
  "title": string,
  "dateOrTime": string,
  "assignee": string | null
}

Rules:
- If there is no clear event or task, return {"hasActionItem": false, "type": "task", "title": "", "dateOrTime": "", "assignee": null}
- Prefer event for anything that looks like a scheduled date/time or appointment.
- Prefer task for chores, reminders, pickups, errands, or general requests.
- title MUST be a concise 2-5 word headline summarizing the action item. It must NEVER be the raw chat input or a full sentence. Example: input "Dad has a dentist appointment tomorrow at 3pm" -> title "Dad's Dentist Appointment".
- dateOrTime MUST contain only the date or time extracted from the message, such as "Tomorrow at 3:00 PM". Do not include the event/action, conversational text, or inferred date/time. If none is explicitly stated, return an empty string.
- Set hasActionItem to true ONLY when a specific event, reminder, or task is present. General conversation or vague statements are not action items.
- assignee should be a person name if clearly mentioned; otherwise null.
- Do not invent details. Keep each field limited to the requested information.
- Output only JSON, no code fences, no extra text.
`;

const BRIEF_SYSTEM_PROMPT = `
You are a helpful family planning assistant. Read the family's recent chat messages and summarize what they should focus on today.
Return exactly two concise sentences in plain text. Mention concrete events, reminders, or tasks when present. Do not invent details.
`;

function parseFallback(text: string, sender?: string): ParsedActionItem {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return emptyParsedAction;
  }

  const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?\b|\b(?:today|tomorrow|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm))?\b|\bin\s+\d+\s+(?:days?|weeks?)\b/i;
  const timePattern = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i;
  const dateMatch = datePattern.exec(trimmedText);
  const timeMatch = timePattern.exec(trimmedText);
  const hasDateSignal = Boolean(dateMatch) || /\b(next week|next weekend|next month)\b/i.test(trimmedText);
  const hasTaskSignal = /\b(remind(?:er)?|pick\s?up|drop(?:\s?off)?|call|book|clean|cook|shop|buy|grocery|laundry|doctor|appointment|care|school|practice|schedule|take|send|bring|dentist|meeting|birthday|game|visit|party|class|lesson|training|concert|recital|soccer|football|basketball|baseball|swim(?:ming)?|field trip|event)\b/i.test(trimmedText);

  if (!hasTaskSignal) {
    return emptyParsedAction;
  }

  const possibleAssignee = /for\s+([A-Za-z][A-Za-z\s'-]+)/i.exec(trimmedText);
  const assignee = possibleAssignee ? possibleAssignee[1].trim() || null : sender ? sender.trim() || null : null;

  const type: "event" | "task" = hasDateSignal && /\b(appointment|dentist|doctor|meeting|birthday|game|visit|party|practice|class|lesson|training|concert|recital|soccer|football|basketball|baseball|swim(?:ming)?|field trip|event)\b/i.test(trimmedText) ? "event" : "task";
  const lowerText = trimmedText.toLowerCase();
  const title = /\bdentist\b/.test(lowerText)
    ? "Dentist Appointment"
    : /\bdoctor\b/.test(lowerText)
      ? "Doctor Appointment"
    : /\bappointment\b/.test(lowerText)
      ? "Family Appointment"
      : /\b(pick\s?up|drop(?:\s?off)?)\b/.test(lowerText)
        ? /\bschool\b/.test(lowerText) ? "School Pickup" : "Family Pickup"
        : /\b(grocery|shop|buy)\b/.test(lowerText)
          ? "Grocery Shopping"
          : /\b(laundry|clean|cook)\b/.test(lowerText)
            ? "Household Task"
            : /\b(soccer|football|basketball|baseball|swim(?:ming)?)\b/.test(lowerText)
            ? `${(trimmedText.match(/\b(soccer|football|basketball|baseball|swim(?:ming)?)\b/i)?.[0] ?? "Family").replace(/\b\w/g, (letter) => letter.toUpperCase())} ${/\bpractice\b/i.test(lowerText) ? "Practice" : "Game"}`
              : /\b(practice|class|lesson|training|concert|recital|field trip|meeting|birthday|party|game|visit)\b/i.test(lowerText)
                ? (trimmedText.match(/\b(?:[A-Za-z'-]+\s+){0,2}(?:practice|class|lesson|training|concert|recital|field trip|meeting|birthday|party|game|visit)\b/i)?.[0] ?? "Family Event")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase())
                : /\b(call|send|bring|take)\b/.test(lowerText)
                  ? "Family Reminder"
                  : type === "event"
                    ? "Family Event"
                    : "Family Task";
  const dateOrTime = dateMatch
    ? dateMatch[0]
    : timeMatch?.[0] ?? "";
  const dateWithSeparateTime = dateMatch && timeMatch && !timePattern.test(dateMatch[0])
    ? `${dateOrTime} at ${timeMatch[0]}`
    : dateOrTime;

  return {
    hasActionItem: true,
    type,
    title,
    dateOrTime: dateWithSeparateTime,
    assignee,
  };
}

function normalizeParsedAction(value: unknown): ParsedActionItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const hasActionItem = Boolean(candidate.hasActionItem);

  if (!hasActionItem) {
    return {
      ...emptyParsedAction,
      type: candidate.type === "event" ? "event" : "task",
    };
  }

  const type = candidate.type === "event" ? "event" : "task";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "Action item";
  const dateOrTime = typeof candidate.dateOrTime === "string" ? candidate.dateOrTime.trim() : "When needed";
  const assignee = typeof candidate.assignee === "string" ? candidate.assignee.trim() || null : null;

  return {
    hasActionItem: true,
    type,
    title: title || "Action item",
    dateOrTime: dateOrTime || "When needed",
    assignee,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: "brief";
      text?: string;
      sender?: string;
      messages?: Array<{ sender?: string; text?: string }>;
    };

    if (body.mode === "brief") {
      const messages = Array.isArray(body.messages)
        ? body.messages
            .filter((message) => typeof message.text === "string")
            .slice(-20)
        : [];

      if (messages.length === 0) {
        return NextResponse.json({ brief: "There are no family messages to summarize yet. Share an update to get started. Add a task or event when something needs attention." });
      }

      const messagesText = messages
        .map((message) => `${message.sender || "Family"}: ${message.text}`)
        .join("\n");
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        const summary = messages
          .slice(-2)
          .map((message) => message.text?.trim())
          .filter(Boolean)
          .join(" ");
        return NextResponse.json({
          brief: `${summary || "Review the latest family updates."} Check the schedule for upcoming plans and confirm who is handling each task.`,
        });
      }

      const briefResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemma2-9b-it",
          temperature: 0.2,
          messages: [
            { role: "system", content: BRIEF_SYSTEM_PROMPT },
            { role: "user", content: `Recent family messages:\n${messagesText}` },
          ],
        }),
      });

      if (!briefResponse.ok) {
        return NextResponse.json({ brief: "Review the latest family updates and upcoming schedule. Confirm who is handling any pending tasks or events." });
      }

      const briefPayload = (await briefResponse.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const brief = briefPayload.choices?.[0]?.message?.content?.trim();

      return NextResponse.json({
        brief: brief || "Review the latest family updates and upcoming schedule. Confirm who is handling any pending tasks or events.",
      });
    }

    const text = typeof body.text === "string" ? body.text : "";
    const sender = typeof body.sender === "string" ? body.sender : undefined;

    if (!text.trim()) {
      return NextResponse.json(emptyParsedAction);
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(parseFallback(text, sender));
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemma2-9b-it",
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extract action item from this message: ${text}` },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(parseFallback(text, sender));
    }

    const responsePayload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = responsePayload.choices?.[0]?.message?.content ?? "";
    const cleanedContent = rawContent.replace(/```json|```/gi, "").trim();

    if (!cleanedContent) {
      return NextResponse.json(parseFallback(text, sender));
    }

    try {
      const parsed = JSON.parse(cleanedContent) as unknown;
      const normalized = normalizeParsedAction(parsed);

      if (!normalized) {
        return NextResponse.json(parseFallback(text, sender));
      }

      return NextResponse.json(normalized);
    } catch {
      return NextResponse.json(parseFallback(text, sender));
    }
  } catch {
    return NextResponse.json({ error: "Could not parse the message." }, { status: 500 });
  }
}
