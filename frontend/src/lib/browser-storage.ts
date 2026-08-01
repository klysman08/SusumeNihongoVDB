import type {
  AnswerLanguage,
  AnswerResponse,
  SpeechLanguage,
} from "@/lib/api-types"

const DATABASE_NAME = "susume-study"
const DATABASE_VERSION = 1
const HISTORY_STORE = "answer-history"
const AUDIO_STORE = "speech-audio"
const MAX_HISTORY_ENTRIES = 30
const MAX_AUDIO_ENTRIES = 50

export type AnswerHistoryEntry = {
  id: string
  question: string
  language: AnswerLanguage
  answer: AnswerResponse
  createdAt: number
}

type SpeechAudioEntry = {
  key: string
  input: string
  language: SpeechLanguage
  audio: Blob
  updatedAt: number
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is unavailable"))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        database.createObjectStore(HISTORY_STORE, { keyPath: "id" })
      }
      if (!database.objectStoreNames.contains(AUDIO_STORE)) {
        database.createObjectStore(AUDIO_STORE, { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("Study storage is blocked"))
  })
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function allEntries<T>(storeName: string) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(storeName, "readonly")
    return await requestResult(
      transaction.objectStore(storeName).getAll() as IDBRequest<T[]>
    )
  } finally {
    database.close()
  }
}

async function deleteKeys(storeName: string, keys: IDBValidKey[]) {
  if (!keys.length) return
  const database = await openDatabase()
  try {
    const transaction = database.transaction(storeName, "readwrite")
    const store = transaction.objectStore(storeName)
    keys.forEach((key) => store.delete(key))
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

export async function listAnswerHistory() {
  const entries = await allEntries<AnswerHistoryEntry>(HISTORY_STORE)
  return entries.sort((left, right) => right.createdAt - left.createdAt)
}

export async function saveAnswerHistory(entry: AnswerHistoryEntry) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(HISTORY_STORE, "readwrite")
    transaction.objectStore(HISTORY_STORE).put(entry)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
  const entries = await listAnswerHistory()
  await deleteKeys(
    HISTORY_STORE,
    entries.slice(MAX_HISTORY_ENTRIES).map((item) => item.id)
  )
}

export async function deleteAnswerHistory(id: string) {
  await deleteKeys(HISTORY_STORE, [id])
}

export async function clearStudyHistory() {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(
      [HISTORY_STORE, AUDIO_STORE],
      "readwrite"
    )
    transaction.objectStore(HISTORY_STORE).clear()
    transaction.objectStore(AUDIO_STORE).clear()
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

function speechAudioKey(input: string, language: SpeechLanguage) {
  let hash = 2166136261
  const value = `${language}:${input}`
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `v1:${language}:${input.length}:${(hash >>> 0).toString(36)}`
}

export async function getSpeechAudio(input: string, language: SpeechLanguage) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(AUDIO_STORE, "readonly")
    const entry = await requestResult<SpeechAudioEntry | undefined>(
      transaction.objectStore(AUDIO_STORE).get(speechAudioKey(input, language))
    )
    return entry?.input === input && entry.language === language
      ? entry.audio
      : null
  } finally {
    database.close()
  }
}

export async function saveSpeechAudio(
  input: string,
  language: SpeechLanguage,
  audio: Blob
) {
  const entry: SpeechAudioEntry = {
    key: speechAudioKey(input, language),
    input,
    language,
    audio,
    updatedAt: Date.now(),
  }
  const database = await openDatabase()
  try {
    const transaction = database.transaction(AUDIO_STORE, "readwrite")
    transaction.objectStore(AUDIO_STORE).put(entry)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
  const entries = await allEntries<SpeechAudioEntry>(AUDIO_STORE)
  const stale = entries
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(MAX_AUDIO_ENTRIES)
  await deleteKeys(
    AUDIO_STORE,
    stale.map((item) => item.key)
  )
}
