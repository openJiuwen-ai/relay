/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { SendMessageOptions } from '@/hooks/useSendMessage';
import type { QueueEntry } from '@/stores/chat-types';
import type { RichTextareaHandle } from '../components/RichTextarea';
import { restoreSkillTokensFromSendText } from '../utils/helpers';

const queueEditDraftCache = new Map<string, { input: string; images: File[] }>();
const QUEUE_EDIT_DRAFT_DB = 'relay-claw-chat-input-cache';
const QUEUE_EDIT_DRAFT_DB_VERSION = 2;
const QUEUE_EDIT_DRAFT_STORE = 'queue-edit-drafts';
const QUEUE_EDIT_PENDING_STORE = 'queue-edit-pending';
const QUEUE_EDIT_PENDING_TTL_MS = 10 * 60 * 1000;
const QUEUE_EDIT_PENDING_MATCH_TIMEOUT_MS = 30 * 1000;

interface PersistedQueueEditDraftRecord {
  id: string;
  input: string;
  images: File[];
  updatedAt: number;
}

interface PersistedQueueEditPendingRecord {
  id: string;
  threadId: string;
  draftId: string;
  input: string;
  images: File[];
  updatedAt: number;
}

interface QueueEditReinsertContext {
  previousEntryId: string | null;
  nextEntryId: string | null;
}

interface UseQueueEditDraftManagerParams {
  activeQueueThreadId?: string;
  queuedEntries: QueueEntry[];
  input: string;
  images: File[];
  skillNames: string[];
  setInput: (next: string | ((prev: string) => string)) => void;
  setImages: Dispatch<SetStateAction<File[]>>;
  setQueueExpanded: Dispatch<SetStateAction<boolean>>;
  textareaRef: RefObject<RichTextareaHandle>;
  handleQueueExtractForEdit: (entryId: string) => Promise<QueueEntry | null>;
  handleQueueMoveToIndex: (entryId: string, targetIndex: number) => Promise<void>;
  handleQueueDelete: (entryId: string) => Promise<void>;
  handleQueueClear: () => Promise<void>;
}

function buildQueueEditDraftKey(threadId: string, entryId: string): string {
  return `${threadId}::${entryId}`;
}

function createClientDraftId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const randomHex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return [
    randomHex(8),
    randomHex(4),
    `4${randomHex(3)}`,
    `${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${randomHex(3)}`,
    randomHex(12),
  ].join('-');
}

let queueEditDraftDbPromise: Promise<IDBDatabase | null> | null = null;

function openQueueEditDraftDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (queueEditDraftDbPromise) return queueEditDraftDbPromise;
  queueEditDraftDbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(QUEUE_EDIT_DRAFT_DB, QUEUE_EDIT_DRAFT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(QUEUE_EDIT_DRAFT_STORE)) {
          db.createObjectStore(QUEUE_EDIT_DRAFT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(QUEUE_EDIT_PENDING_STORE)) {
          db.createObjectStore(QUEUE_EDIT_PENDING_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return queueEditDraftDbPromise;
}

async function persistQueueEditDraft(threadId: string, entryId: string, draft: { input: string; images: File[] }) {
  const db = await openQueueEditDraftDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(QUEUE_EDIT_DRAFT_STORE, 'readwrite');
      tx.objectStore(QUEUE_EDIT_DRAFT_STORE).put({
        id: buildQueueEditDraftKey(threadId, entryId),
        input: draft.input,
        images: draft.images,
        updatedAt: Date.now(),
      } satisfies PersistedQueueEditDraftRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadQueueEditDraft(threadId: string, entryId: string): Promise<{ input: string; images: File[] } | null> {
  const db = await openQueueEditDraftDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(QUEUE_EDIT_DRAFT_STORE, 'readonly');
      const req = tx.objectStore(QUEUE_EDIT_DRAFT_STORE).get(buildQueueEditDraftKey(threadId, entryId));
      req.onsuccess = () => {
        const value = req.result as PersistedQueueEditDraftRecord | undefined;
        if (!value) {
          resolve(null);
          return;
        }
        resolve({
          input: value.input,
          images: Array.isArray(value.images) ? value.images : [],
        });
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function clearQueueEditDraft(threadId: string, entryId: string) {
  const db = await openQueueEditDraftDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(QUEUE_EDIT_DRAFT_STORE, 'readwrite');
      tx.objectStore(QUEUE_EDIT_DRAFT_STORE).delete(buildQueueEditDraftKey(threadId, entryId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function persistPendingQueueEditDraft(record: PersistedQueueEditPendingRecord): Promise<void> {
  const db = await openQueueEditDraftDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(QUEUE_EDIT_PENDING_STORE, 'readwrite');
      tx.objectStore(QUEUE_EDIT_PENDING_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadPendingQueueEditDrafts(threadId: string): Promise<PersistedQueueEditPendingRecord[]> {
  const db = await openQueueEditDraftDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(QUEUE_EDIT_PENDING_STORE, 'readonly');
      const req = tx.objectStore(QUEUE_EDIT_PENDING_STORE).getAll();
      req.onsuccess = () => {
        const all = (req.result as PersistedQueueEditPendingRecord[] | undefined) ?? [];
        const now = Date.now();
        resolve(
          all.filter(
            (item) =>
              item.threadId === threadId &&
              typeof item.draftId === 'string' &&
              item.draftId.length > 0 &&
              now - item.updatedAt <= QUEUE_EDIT_PENDING_TTL_MS,
          ),
        );
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function clearPendingQueueEditDraft(recordId: string): Promise<void> {
  const db = await openQueueEditDraftDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(QUEUE_EDIT_PENDING_STORE, 'readwrite');
      tx.objectStore(QUEUE_EDIT_PENDING_STORE).delete(recordId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function clearPendingQueueEditDraftsByThread(threadId: string): Promise<void> {
  const db = await openQueueEditDraftDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const readTx = db.transaction(QUEUE_EDIT_PENDING_STORE, 'readonly');
      const readReq = readTx.objectStore(QUEUE_EDIT_PENDING_STORE).getAll();
      readReq.onsuccess = () => {
        const all = (readReq.result as PersistedQueueEditPendingRecord[] | undefined) ?? [];
        const targetIds = all.filter((item) => item.threadId === threadId).map((item) => item.id);
        if (targetIds.length === 0) {
          resolve();
          return;
        }
        const writeTx = db.transaction(QUEUE_EDIT_PENDING_STORE, 'readwrite');
        const store = writeTx.objectStore(QUEUE_EDIT_PENDING_STORE);
        for (const id of targetIds) store.delete(id);
        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () => resolve();
        writeTx.onabort = () => resolve();
      };
      readReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function useQueueEditDraftManager({
  activeQueueThreadId,
  queuedEntries,
  input,
  images,
  skillNames,
  setInput,
  setImages,
  setQueueExpanded,
  textareaRef,
  handleQueueExtractForEdit,
  handleQueueMoveToIndex,
  handleQueueDelete,
  handleQueueClear,
}: UseQueueEditDraftManagerParams) {
  const queueEditDraftRef = useRef<QueueEditReinsertContext | null>(null);
  const previousQueuedIdsRef = useRef<string[]>(queuedEntries.map((entry) => entry.id));
  const pendingDraftByIdRef = useRef(new Map<string, { input: string; images: File[] }>());
  const queueSendOptionsRef = useRef<SendMessageOptions | undefined>(undefined);
  const [pendingQueueReinsert, setPendingQueueReinsert] = useState<QueueEditReinsertContext | null>(null);

  useEffect(() => {
    if (!activeQueueThreadId || queuedEntries.length === 0) return;
    let cancelled = false;
    void (async () => {
      const now = Date.now();
      const pendingDrafts = await loadPendingQueueEditDrafts(activeQueueThreadId);
      if (cancelled) return;
      const pendingByDraftId = new Map(pendingDrafts.map((pending) => [pending.draftId, pending] as const));
      const matchedPendingIds = new Set<string>();
      for (const entry of queuedEntries) {
        if (!entry.clientDraftId) continue;
        if (queueEditDraftCache.has(entry.id)) continue;
        const runtimeDraft = pendingDraftByIdRef.current.get(entry.clientDraftId);
        const pending = pendingByDraftId.get(entry.clientDraftId);
        const draft = runtimeDraft ?? (pending ? { input: pending.input, images: pending.images } : null);
        if (!draft) continue;
        queueEditDraftCache.set(entry.id, draft);
        void persistQueueEditDraft(activeQueueThreadId, entry.id, draft);
        if (pending) {
          void clearPendingQueueEditDraft(pending.id);
          matchedPendingIds.add(pending.id);
        }
        pendingDraftByIdRef.current.delete(entry.clientDraftId);
      }
      for (const pending of pendingDrafts) {
        if (matchedPendingIds.has(pending.id)) continue;
        if (now - pending.updatedAt > QUEUE_EDIT_PENDING_MATCH_TIMEOUT_MS) {
          void clearPendingQueueEditDraft(pending.id);
          pendingDraftByIdRef.current.delete(pending.draftId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeQueueThreadId, queuedEntries]);

  useEffect(() => {
    const previousIds = previousQueuedIdsRef.current;
    const currentIds = queuedEntries.map((entry) => entry.id);
    if (!pendingQueueReinsert) {
      previousQueuedIdsRef.current = currentIds;
      return;
    }
    const previousIdSet = new Set(previousIds);
    const addedEntries = queuedEntries.filter((entry) => !previousIdSet.has(entry.id));
    const newestAdded = addedEntries[addedEntries.length - 1];
    if (!newestAdded) {
      previousQueuedIdsRef.current = currentIds;
      return;
    }

    const previousIndex = pendingQueueReinsert.previousEntryId
      ? queuedEntries.findIndex((entry) => entry.id === pendingQueueReinsert.previousEntryId)
      : -1;
    const nextIndex = pendingQueueReinsert.nextEntryId
      ? queuedEntries.findIndex((entry) => entry.id === pendingQueueReinsert.nextEntryId)
      : -1;
    const defaultTailIndex = queuedEntries.length - 1;
    let targetIndex = defaultTailIndex;
    if (previousIndex >= 0 && nextIndex >= 0) targetIndex = previousIndex < nextIndex ? previousIndex + 1 : nextIndex;
    else if (previousIndex >= 0) targetIndex = previousIndex + 1;
    else if (nextIndex >= 0) targetIndex = nextIndex;

    void handleQueueMoveToIndex(newestAdded.id, targetIndex);
    setPendingQueueReinsert(null);
    previousQueuedIdsRef.current = currentIds;
  }, [handleQueueMoveToIndex, pendingQueueReinsert, queuedEntries]);

  const handleQueueEdit = useCallback(
    async (entryId: string) => {
      const entryIndex = queuedEntries.findIndex((entry) => entry.id === entryId);
      if (entryIndex < 0) return;
      const previousEntryId = queuedEntries[entryIndex - 1]?.id ?? null;
      const nextEntryId = queuedEntries[entryIndex + 1]?.id ?? null;
      const extracted = await handleQueueExtractForEdit(entryId);
      if (!extracted) return;
      queueEditDraftRef.current = { previousEntryId, nextEntryId };
      const memoryDraft = queueEditDraftCache.get(entryId) ?? null;
      const persistedDraft =
        !memoryDraft && activeQueueThreadId ? await loadQueueEditDraft(activeQueueThreadId, entryId) : null;
      const cachedDraft = memoryDraft ?? persistedDraft;
      queueEditDraftCache.delete(entryId);
      if (activeQueueThreadId) void clearQueueEditDraft(activeQueueThreadId, entryId);
      const restoredInput = cachedDraft?.input ?? restoreSkillTokensFromSendText(extracted.content, skillNames);
      setInput(restoredInput);
      setImages(cachedDraft?.images ?? []);
      setQueueExpanded(true);
      setTimeout(() => {
        const el = textareaRef.current?.getElement();
        if (!el) return;
        textareaRef.current?.focus();
        const caret = restoredInput.length;
        textareaRef.current?.setSelectionRange(caret, caret);
      }, 0);
    },
    [
      activeQueueThreadId,
      handleQueueExtractForEdit,
      queuedEntries,
      setImages,
      setInput,
      setQueueExpanded,
      skillNames,
      textareaRef,
    ],
  );

  const handleQueueSend = useCallback((handleQueueSendBase: () => boolean) => {
    const editContext = queueEditDraftRef.current;
    const draft = { input, images: [...images] };
    const draftId = createClientDraftId();
    const clearPendingDraft = () => {
      pendingDraftByIdRef.current.delete(draftId);
      void clearPendingQueueEditDraft(draftId);
    };
    pendingDraftByIdRef.current.set(draftId, draft);
    if (activeQueueThreadId) {
      void persistPendingQueueEditDraft({
        id: draftId,
        threadId: activeQueueThreadId,
        draftId,
        input: draft.input,
        images: draft.images,
        updatedAt: Date.now(),
      });
    }
    queueSendOptionsRef.current = {
      clientDraftId: draftId,
      onQueueResult: (result) => {
        if (!activeQueueThreadId) {
          clearPendingDraft();
          return;
        }
        if (result.status === 'queued' && result.entryId) {
          const runtimeDraft = pendingDraftByIdRef.current.get(draftId);
          if (runtimeDraft) {
            queueEditDraftCache.set(result.entryId, runtimeDraft);
            void persistQueueEditDraft(activeQueueThreadId, result.entryId, runtimeDraft);
          }
          clearPendingDraft();
          return;
        }
        clearPendingDraft();
      },
    };
    const didQueueSend = handleQueueSendBase();
    if (didQueueSend && editContext) {
      setPendingQueueReinsert(editContext);
      queueEditDraftRef.current = null;
    }
    if (!didQueueSend) {
      queueSendOptionsRef.current = undefined;
      clearPendingDraft();
    }
  }, [activeQueueThreadId, images, input]);

  const handleQueueDeleteSafe = useCallback(
    async (entryId: string) => {
      queueEditDraftCache.delete(entryId);
      pendingDraftByIdRef.current.clear();
      if (activeQueueThreadId) void clearQueueEditDraft(activeQueueThreadId, entryId);
      if (activeQueueThreadId) void clearPendingQueueEditDraftsByThread(activeQueueThreadId);
      await handleQueueDelete(entryId);
    },
    [activeQueueThreadId, handleQueueDelete],
  );

  const handleQueueClearSafe = useCallback(async () => {
    pendingDraftByIdRef.current.clear();
    for (const entry of queuedEntries) {
      queueEditDraftCache.delete(entry.id);
      if (activeQueueThreadId) void clearQueueEditDraft(activeQueueThreadId, entry.id);
    }
    if (activeQueueThreadId) void clearPendingQueueEditDraftsByThread(activeQueueThreadId);
    await handleQueueClear();
  }, [activeQueueThreadId, handleQueueClear, queuedEntries]);

  const resolveQueueSendOptions = useCallback(() => {
    const next = queueSendOptionsRef.current;
    queueSendOptionsRef.current = undefined;
    return next;
  }, []);

  const resetQueueEditState = useCallback(() => {
    queueEditDraftRef.current = null;
    setPendingQueueReinsert(null);
  }, []);

  return {
    handleQueueEdit,
    handleQueueSend,
    handleQueueDeleteSafe,
    handleQueueClearSafe,
    resolveQueueSendOptions,
    resetQueueEditState,
  };
}

