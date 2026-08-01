import { useCallback, useEffect, useState } from "react"

import type { AnswerLanguage, AnswerResponse } from "@/lib/api-types"
import {
  clearStudyHistory,
  deleteAnswerHistory,
  listAnswerHistory,
  saveAnswerHistory,
  type AnswerHistoryEntry,
} from "@/lib/browser-storage"

function entryId() {
  const unique = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36)
  return `${Date.now()}-${unique}`
}

export function useAnswerHistory() {
  const [entries, setEntries] = useState<AnswerHistoryEntry[]>([])

  useEffect(() => {
    let active = true
    void listAnswerHistory()
      .then((stored) => {
        if (active) setEntries(stored)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const add = useCallback(
    (question: string, language: AnswerLanguage, answer: AnswerResponse) => {
      const entry: AnswerHistoryEntry = {
        id: entryId(),
        question,
        language,
        answer,
        createdAt: Date.now(),
      }
      setEntries((current) => [entry, ...current].slice(0, 30))
      void saveAnswerHistory(entry).catch(() => undefined)
    },
    []
  )

  const remove = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id))
    void deleteAnswerHistory(id).catch(() => undefined)
  }, [])

  const clear = useCallback(() => {
    setEntries([])
    void clearStudyHistory().catch(() => undefined)
  }, [])

  return { add, clear, entries, remove }
}
