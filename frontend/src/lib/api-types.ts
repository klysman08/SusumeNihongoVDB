export type Level = "N5" | "N4" | "N3"
export type AnswerLanguage = "auto" | "ja" | "en" | "pt" | "es" | "fr"
export type SpeechLanguage = Exclude<AnswerLanguage, "auto">

export type SpeechModel = {
  id: string
  name: string
  voices: string[]
}

export type SpeechModelsResponse = {
  default_model: string
  models: SpeechModel[]
}

export type SpeechBatchResponse = {
  segments: Array<{
    id: string
    audio_base64: string
    media_type: string
    generation_id?: string
  }>
}

export const answerLanguageOptions: Array<{
  label: string
  value: AnswerLanguage
}> = [
  { label: "Automatic — match my question", value: "auto" },
  { label: "Japanese — 日本語", value: "ja" },
  { label: "English", value: "en" },
  { label: "Portuguese — Português", value: "pt" },
  { label: "Spanish — Español", value: "es" },
  { label: "French — Français", value: "fr" },
]

export function answerLanguageLabel(language: AnswerLanguage) {
  return (
    answerLanguageOptions.find((option) => option.value === language)?.label ??
    language
  )
}

export type Citation = {
  number: number
  document_id: string
  title: string
  source_ref?: string | null
  chapter?: string | null
  section?: string | null
  excerpt: string
}

export type AnswerResponse = {
  question: string
  answer: string
  found: boolean
  language: AnswerLanguage
  citations: Citation[]
}

export type ApiError = {
  code?: string
  message?: string
  request_id?: string
}
