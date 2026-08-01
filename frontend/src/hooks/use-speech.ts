import { useCallback, useEffect, useRef, useState } from "react"

import type { SpeechSegment } from "@/lib/answer-markdown"
import type {
  AnswerLanguage,
  ApiError,
  SpeechBatchResponse,
  SpeechLanguage,
  SpeechModel,
  SpeechModelsResponse,
} from "@/lib/api-types"
import { getSpeechAudio, saveSpeechAudio } from "@/lib/browser-storage"

const DEFAULT_SPEECH_MODEL = "x-ai/grok-voice-tts-1.0"
const SPEECH_MODEL_STORAGE = "susume-speech-model"
const FALLBACK_MODELS: SpeechModel[] = [
  {
    id: DEFAULT_SPEECH_MODEL,
    name: "xAI: Grok Voice TTS 1.0",
    voices: ["eve", "ara", "rex", "sal", "leo"],
  },
]

type QueuedClip = {
  audio: HTMLAudioElement
  dispose: () => void
  id: string
}

function queuedClip(blob: Blob, id: string): QueuedClip {
  const url = URL.createObjectURL(blob)
  const dispose = () => URL.revokeObjectURL(url)
  try {
    const audio = new Audio(url)
    audio.preload = "auto"
    audio.load()
    return { audio, dispose, id }
  } catch (error) {
    dispose()
    throw error
  }
}

function queuedClips(blobs: Blob[], segments: SpeechSegment[]) {
  const queue: QueuedClip[] = []
  try {
    segments.forEach((segment, index) => {
      queue.push(queuedClip(blobs[index], segment.id))
    })
    return queue
  } catch (error) {
    queue.forEach((clip) => {
      clip.audio.pause()
      clip.audio.removeAttribute("src")
      clip.audio.load()
      clip.dispose()
    })
    throw error
  }
}

function disposeQueue(queue: QueuedClip[]) {
  for (const clip of queue) {
    clip.audio.onended = null
    clip.audio.onerror = null
    clip.audio.ontimeupdate = null
    clip.audio.ondurationchange = null
    clip.audio.pause()
    clip.audio.removeAttribute("src")
    clip.audio.load()
    clip.dispose()
  }
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

function preferredVoice(model: SpeechModel, language: SpeechLanguage) {
  if (model.id === DEFAULT_SPEECH_MODEL && model.voices.includes("ara")) {
    return "ara"
  }

  const languageVoice = {
    ja: /(^j[fm]_|-ja$|^ja[-_])/i,
    en: /(^[ab][fm]_|-en$|^en[-_])/i,
    pt: /(^p[fm]_|-pt$|^pt[-_])/i,
    es: /(^e[fm]_|-es$|^es[-_])/i,
    fr: /(^f[fm]_|-fr$|^fr[-_])/i,
  }[language]
  return (
    model.voices.find((voice) => languageVoice.test(voice)) ?? model.voices[0]
  )
}

function audioBlob(audioBase64: string, mediaType: string) {
  if (!mediaType.startsWith("audio/")) {
    throw new Error("The speech provider returned invalid audio.")
  }
  const decoded = atob(audioBase64)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  const blob = new Blob([bytes], { type: mediaType })
  if (!blob.size) throw new Error("The speech provider returned invalid audio.")
  return blob
}

export function useSpeech() {
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<SpeechModel[]>(FALLBACK_MODELS)
  const [model, setModel] = useState(DEFAULT_SPEECH_MODEL)
  const [preparedSegments, setPreparedSegments] = useState(0)
  const [totalSegments, setTotalSegments] = useState(0)
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [segmentProgress, setSegmentProgress] = useState(0)
  const requestRef = useRef<AbortController | null>(null)
  const queueRef = useRef<QueuedClip[]>([])
  const playClipRef = useRef<(index: number) => void>(() => undefined)
  const playbackRunRef = useRef(0)

  const stop = useCallback((updateState = true) => {
    playbackRunRef.current += 1
    requestRef.current?.abort()
    requestRef.current = null

    disposeQueue(queueRef.current)
    queueRef.current = []

    if (updateState) {
      setLoading(false)
      setSpeaking(false)
      setPreparedSegments(0)
      setTotalSegments(0)
      setActiveSegmentId(null)
      setSegmentProgress(0)
    }
  }, [])

  const playClip = useCallback(
    (index: number) => {
      const clip = queueRef.current[index]
      if (!clip) {
        stop()
        return
      }
      const { audio } = clip
      const run = playbackRunRef.current
      setActiveSegmentId(clip.id)
      setSegmentProgress(0)
      setLoading(false)
      setSpeaking(true)

      const updateProgress = () => {
        if (run !== playbackRunRef.current) return
        const duration = audio.duration
        setSegmentProgress(
          Number.isFinite(duration) && duration > 0
            ? Math.min(1, Math.max(0, audio.currentTime / duration))
            : 0
        )
      }
      audio.ontimeupdate = updateProgress
      audio.ondurationchange = updateProgress
      audio.onended = () => {
        if (run !== playbackRunRef.current) return
        setSegmentProgress(1)
        playClipRef.current(index + 1)
      }
      audio.onerror = () => {
        if (run !== playbackRunRef.current) return
        stop()
        setError("This browser could not play the generated speech.")
      }
      void audio.play().catch(() => {
        if (run !== playbackRunRef.current) return
        stop()
        setError("This browser could not play the generated speech.")
      })
    },
    [stop]
  )
  useEffect(() => {
    playClipRef.current = playClip
  }, [playClip])

  useEffect(() => () => stop(false), [stop])

  useEffect(() => {
    const controller = new AbortController()
    const storedModel = localStorage.getItem(SPEECH_MODEL_STORAGE)

    void (async () => {
      try {
        const response = await fetch("/api/v1/audio/speech/models", {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Speech models are unavailable")
        const catalog = (await response.json()) as SpeechModelsResponse
        if (controller.signal.aborted || !catalog.models.length) return
        setModels(catalog.models)
        const selected = catalog.models.some((item) => item.id === storedModel)
          ? storedModel!
          : catalog.default_model
        setModel(selected)
      } catch {
        // The built-in Grok catalog keeps Listen available while offline.
      }
    })()

    return () => controller.abort()
  }, [])

  const selectModel = useCallback(
    (nextModel: string) => {
      if (!models.some((item) => item.id === nextModel)) return
      stop()
      setError(null)
      setModel(nextModel)
      localStorage.setItem(SPEECH_MODEL_STORAGE, nextModel)
    },
    [models, stop]
  )

  const speak = useCallback(
    async (
      segments: SpeechSegment[],
      preferredLanguage: AnswerLanguage = "auto"
    ) => {
      stop()
      setError(null)
      if (!segments.length) return

      const controller = new AbortController()
      requestRef.current = controller
      setLoading(true)
      setTotalSegments(segments.length)
      setPreparedSegments(0)

      try {
        const language = speechLanguage(
          segments.map((segment) => segment.input).join(" "),
          preferredLanguage
        )
        const selectedModel =
          models.find((item) => item.id === model) ?? FALLBACK_MODELS[0]
        const voice = preferredVoice(selectedModel, language)
        if (!voice) {
          throw new Error("The selected speech model has no available voice.")
        }

        let prepared = 0
        const blobs = await Promise.all(
          segments.map(async (segment) => {
            const blob = await getSpeechAudio(
              segment.input,
              language,
              selectedModel.id,
              voice
            ).catch(() => null)
            if (blob) {
              prepared += 1
              setPreparedSegments(prepared)
            }
            return blob
          })
        )
        if (controller.signal.aborted) return

        const missing = segments.filter((_, index) => !blobs[index])
        if (missing.length) {
          const response = await fetch("/api/v1/audio/speech/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language,
              model: selectedModel.id,
              voice,
              segments: missing,
            }),
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(await speechError(response))
          const payload = (await response.json()) as SpeechBatchResponse
          if (payload.segments.length !== missing.length) {
            throw new Error("The speech provider returned an incomplete batch.")
          }

          const generated = new Map(
            payload.segments.map((segment) => [segment.id, segment])
          )
          const generatedBlobs = missing.map((segment) => {
            const result = generated.get(segment.id)
            if (!result) {
              throw new Error(
                "The speech provider returned an incomplete batch."
              )
            }
            return audioBlob(result.audio_base64, result.media_type)
          })

          await Promise.all(
            missing.map(async (segment, missingIndex) => {
              const index = segments.findIndex((item) => item.id === segment.id)
              blobs[index] = generatedBlobs[missingIndex]
              await saveSpeechAudio(
                segment.input,
                language,
                selectedModel.id,
                voice,
                generatedBlobs[missingIndex]
              ).catch(() => undefined)
              prepared += 1
              setPreparedSegments(prepared)
            })
          )
        }

        if (controller.signal.aborted) return
        const completeBlobs = blobs.map((blob) => {
          if (!blob) {
            throw new Error("The speech provider returned an incomplete batch.")
          }
          return blob
        })
        requestRef.current = null

        queueRef.current = queuedClips(completeBlobs, segments)
        playClipRef.current(0)
      } catch (caught) {
        if (controller.signal.aborted) return
        if (requestRef.current === controller) requestRef.current = null
        playbackRunRef.current += 1
        disposeQueue(queueRef.current)
        queueRef.current = []
        setSpeaking(false)
        setPreparedSegments(0)
        setTotalSegments(0)
        setActiveSegmentId(null)
        setSegmentProgress(0)
        setError(
          caught instanceof Error
            ? caught.message
            : "Speech could not be generated. Please try again."
        )
      } finally {
        setLoading(false)
      }
    },
    [model, models, stop]
  )

  return {
    activeSegmentId,
    error,
    loading,
    model,
    models,
    preparedSegments,
    segmentProgress,
    selectModel,
    speak,
    speaking,
    stop,
    totalSegments,
  }
}
