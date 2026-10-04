export type EventTaskType = "event" | "task";

export interface EventTask {
  id: string;
  type: EventTaskType;
  title: string;
  dateOrTime: string;
  assignee?: string;
  createdByName: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

const STORAGE_KEYS = {
  groupCode: "kinsync-group-code",
  userName: "kinsync-user-name",
};

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    throw new Error("Browser storage is unavailable. Enable local storage for this site and try again.");
  }
}

function readJson<T>(key: string, fallback: T): T {
  const storage = getStorage();

  if (!storage) {
    return fallback;
  }

  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

function removeKey(key: string): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(key);
}

function getGroupStorageKey(groupCode: string): string {
  return `kinsync-group-${groupCode.trim().toLowerCase()}`;
}

export function getGroupCode(): string | null {
  return readJson<string | null>(STORAGE_KEYS.groupCode, null);
}

export function getUserName(): string | null {
  return readJson<string | null>(STORAGE_KEYS.userName, null);
}

export function joinGroup(groupCode: string, userName: string): { groupCode: string; userName: string } {
  const nextGroupCode = groupCode.trim();
  const nextUserName = userName.trim();

  if (!nextGroupCode || !nextUserName) {
    return { groupCode: getGroupCode() ?? "", userName: getUserName() ?? "" };
  }

  writeJson(STORAGE_KEYS.groupCode, nextGroupCode);
  writeJson(STORAGE_KEYS.userName, nextUserName);

  return { groupCode: nextGroupCode, userName: nextUserName };
}

export function logout(): void {
  removeKey(STORAGE_KEYS.groupCode);
  removeKey(STORAGE_KEYS.userName);
}

export function getEvents(): EventTask[] {
  const groupCode = getGroupCode();

  if (!groupCode) {
    return [];
  }

  return readJson<EventTask[]>(`${getGroupStorageKey(groupCode)}-events`, []);
}

export function saveEvent(event: EventTask): EventTask[] {
  const groupCode = getGroupCode();

  if (!groupCode) {
    return [];
  }

  const groupKey = `${getGroupStorageKey(groupCode)}-events`;
  const nextEvents = readJson<EventTask[]>(groupKey, []);
  const existingIndex = nextEvents.findIndex((item) => item.id === event.id);

  if (existingIndex >= 0) {
    nextEvents[existingIndex] = event;
  } else {
    nextEvents.push(event);
  }

  writeJson(groupKey, nextEvents);
  return nextEvents;
}

export function getMessages(): ChatMessage[] {
  const groupCode = getGroupCode();

  if (!groupCode) {
    return [];
  }

  return readJson<ChatMessage[]>(`${getGroupStorageKey(groupCode)}-messages`, []);
}

export function saveMessage(message: ChatMessage): ChatMessage[] {
  const groupCode = getGroupCode();

  if (!groupCode) {
    return [];
  }

  const groupKey = `${getGroupStorageKey(groupCode)}-messages`;
  const nextMessages = readJson<ChatMessage[]>(groupKey, []);

  nextMessages.push(message);
  writeJson(groupKey, nextMessages);
  return nextMessages;
}
