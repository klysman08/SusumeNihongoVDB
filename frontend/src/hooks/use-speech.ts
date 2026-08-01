import { useCallback, useEffect, useRef, useState } from "react"

import type { AnswerLanguage, ApiError, SpeechLanguage } from "@/lib/api-types"
import { getSpeechAudio, saveSpeechAudio } from "@/lib/browser-storage"

export function speechText(answer: string) {
  return answer
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function speechLanguage(
  text: string,
  preferred: AnswerLanguage = "auto"
): SpeechLanguage {
  if (preferred !== "auto") return preferred
  const japaneseCharacters =
    text.match(/[\u3040-\u30ff\u3400-\u9fff]/g)?.length ?? 0
  const latinCharacters = text.match(/[A-Za-z]/g)?.length ?? 0
  return japaneseCharacters > latinCharacters * 0.35 ? "ja" : "en"
}

async function speechError(response: Response) {
  try {
    const payload = (await response.json()) as ApiError
    if (payload.message) return payload.message
  } catch {
    // The edge may return a plain-text error before the request reaches FastAPI.
  }
  return response.status === 429
    ? "Speech is busy right now. Please wait a moment and try again."
    : "Speech could not be generated. Please try again."
}

export function useSpeech() {
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const stop = useCallback((updateState = true) => {
    requestRef.current?.abort()
    requestRef.current = null

    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (updateState) {
      setLoading(false)
      setSpeaking(false)
    }
  }, [])

  useEffect(() => () => stop(false), [stop])

  const speak = useCallback(
    async (answer: string, preferredLanguage: AnswerLanguage = "auto") => {
      stop()
      setError(null)
      const input = speechText(answer)
      if (!input) return

      const controller = new AbortController()
      requestRef.current = controller
      setLoading(true)

      try {
        const language = speechLanguage(input, preferredLanguage)
        let blob = await getSpeechAudio(input, language).catch(() => null)
        if (controller.signal.aborted) return
        if (!blob) {
          const response = await fetch("/api/v1/audio/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input, language }),
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(await speechError(response))
          blob = await response.blob()
          if (blob.size && blob.type.startsWith("audio/")) {
            await saveSpeechAudio(input, language, blob).catch(() => undefined)
          }
        }
        if (!blob.size || !blob.type.startsWith("audio/")) {
          throw new Error("The speech provider returned invalid audio.")
        }
        if (requestRef.current !== controller) return
        requestRef.current = null

        const objectUrl = URL.createObjectURL(blob)
        const audio = new Audio(objectUrl)
        objectUrlRef.current = objectUrl
        audioRef.current = audio
        audio.onended = () => {
          if (audioRef.current !== audio) return
          stop()
        }
        audio.onerror = () => {
          if (audioRef.current !== audio) return
          stop()
          setError("This browser could not play the generated speech.")
        }
        await audio.play()
        if (audioRef.current !== audio) return
        setLoading(false)
        setSpeaking(true)
      } catch (caught) {
        if (controller.signal.aborted) return
        if (requestRef.current === controller) requestRef.current = null
        stop()
        setError(
          caught instanceof Error
            ? caught.message
            : "Speech could not be generated. Please try again."
        )
      }
    },
    [stop]
  )

  return { error, loading, speak, speaking, stop }
}
