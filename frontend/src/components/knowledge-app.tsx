import { useReducer, useState, type FormEvent, type ReactNode } from "react"
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  FileArrowUpIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  SparkleIcon,
  SunIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  MotionConfig,
} from "motion/react"

import { AnswerResult } from "@/components/answer-result"
import { AnswerHistory } from "@/components/answer-history"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSoundEffects, type SoundEffect } from "@/hooks/use-sound-effects"
import { useAnswerHistory } from "@/hooks/use-answer-history"
import { useTheme } from "@/hooks/use-theme"
import {
  answerLanguageOptions,
  type AnswerLanguage,
  type AnswerResponse,
  type ApiError,
  type Level,
} from "@/lib/api-types"
import type { AnswerHistoryEntry } from "@/lib/browser-storage"
import { cn } from "@/lib/utils"

const levelItems: Array<{ label: string; value: Level | null }> = [
  { label: "No level", value: null },
  { label: "N5 — Beginner", value: "N5" },
  { label: "N4 — Elementary", value: "N4" },
  { label: "N3 — Intermediate", value: "N3" },
]

const promptExamples = [
  "How do I use は and が?",
  "What does 〜ことになった mean?",
  "『はずだ』はいつ使いますか？",
]

type QueryState = {
  question: string
  language: AnswerLanguage
  levels: Level[]
  answer: AnswerResponse | null
  pending: boolean
  error: string
}

type WorkspacePane = "ask" | "answer"

type QueryAction =
  | { type: "question_changed"; question: string }
  | { type: "language_changed"; language: AnswerLanguage }
  | { type: "levels_changed"; levels: Level[] }
  | { type: "request_started" }
  | { type: "request_succeeded"; answer: AnswerResponse }
  | { type: "request_failed"; error: string }
  | { type: "history_selected"; entry: AnswerHistoryEntry }

const initialQueryState: QueryState = {
  question: "",
  language: "auto",
  levels: [],
  answer: null,
  pending: false,
  error: "",
}

function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case "question_changed":
      return { ...state, question: action.question }
    case "language_changed":
      return { ...state, language: action.language }
    case "levels_changed":
      return { ...state, levels: action.levels }
    case "request_started":
      return { ...state, pending: true, error: "", answer: null }
    case "request_succeeded":
      return { ...state, pending: false, error: "", answer: action.answer }
    case "request_failed":
      return { ...state, pending: false, error: action.error }
    case "history_selected":
      return {
        ...state,
        question: action.entry.question,
        language: action.entry.language,
        answer: action.entry.answer,
        pending: false,
        error: "",
      }
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T
  let payload: ApiError = {}
  try {
    payload = (await response.json()) as ApiError
  } catch {
    // The edge may return a plain-text 413/429 before the request reaches FastAPI.
  }
  if (response.status === 429)
    throw new Error("Too many requests. Please wait a moment and try again.")
  if (response.status === 401)
    throw new Error("That administrator API key was not accepted.")
  if (payload.code === "upstream_timeout")
    throw new Error("The answer provider took too long to respond.")
  if (payload.code === "llm_not_configured")
    throw new Error(
      "Answer generation has not been configured by the administrator."
    )
  throw new Error(payload.message || "The request could not be completed.")
}

function LoadingAnswer() {
  return (
    <div aria-label="Searching the book" className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function AdminDialog({
  playSound,
}: {
  playSound: (effect: SoundEffect) => void
}) {
  const [apiKey, setApiKey] = useState("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [level, setLevel] = useState<Level | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  function rememberKey(value = apiKey) {
    if (value) sessionStorage.setItem("susume-admin-key", value)
  }

  async function submitText(event: FormEvent) {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (!apiKey || !title.trim() || !content.trim()) {
      setError("API key, title, and content are required.")
      playSound("error")
      return
    }
    playSound("tap")
    setPending(true)
    rememberKey()
    try {
      const response = await fetch("/api/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          level,
          tags: [],
        }),
      })
      await parseResponse(response)
      setTitle("")
      setContent("")
      setSuccess("Content added and indexed. It is ready to search.")
      playSound("success")
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Content could not be added."
      )
      playSound("error")
    } finally {
      setPending(false)
    }
  }

  async function submitFile(event: FormEvent) {
    event.preventDefault()
    setError("")
    setSuccess("")
    const submitted = new FormData(event.currentTarget as HTMLFormElement)
    const submittedKey = String(submitted.get("api_key") || apiKey)
    const submittedFile = submitted.get("file")
    if (
      !submittedKey ||
      !(submittedFile instanceof File) ||
      !submittedFile.name
    ) {
      setError("API key and a file are required.")
      playSound("error")
      return
    }
    playSound("tap")
    setPending(true)
    rememberKey(submittedKey)
    const form = new FormData()
    form.append("file", submittedFile)
    if (level) form.append("level", level)
    try {
      const response = await fetch("/api/v1/documents/upload", {
        method: "POST",
        headers: { "X-API-Key": submittedKey },
        body: form,
      })
      await parseResponse(response)
      setFile(null)
      const input = document.querySelector<HTMLInputElement>("#content-file")
      if (input) input.value = ""
      setSuccess("File uploaded and indexed. It is ready to search.")
      playSound("success")
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The file could not be uploaded."
      )
      playSound("error")
    } finally {
      setPending(false)
    }
  }

  const keyField = (id: string) => (
    <Field data-invalid={!apiKey && !!error}>
      <FieldLabel htmlFor={id}>Administrator API key</FieldLabel>
      <Input
        aria-invalid={!apiKey && !!error}
        autoComplete="off"
        id={id}
        name="api_key"
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="Enter the shared admin key"
        type="password"
        value={apiKey}
      />
      <FieldDescription>
        Kept only in this browser tab using sessionStorage.
      </FieldDescription>
    </Field>
  )

  const levelField = (id: string) => (
    <Field>
      <FieldLabel htmlFor={id}>JLPT level</FieldLabel>
      <Select
        items={levelItems}
        onValueChange={(value) => {
          setLevel(value as Level | null)
          playSound("tap")
        }}
        value={level}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {levelItems.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) return
        playSound("tap")
        setApiKey(sessionStorage.getItem("susume-admin-key") || "")
      }}
    >
      <DialogTrigger
        render={
          <Button
            aria-label="Add content"
            className="size-10 px-0 sm:w-auto sm:px-3"
            variant="outline"
          />
        }
      >
        <PlusIcon data-icon="inline-start" />
        <span className="hidden sm:inline">Add content</span>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add searchable content</DialogTitle>
          <DialogDescription>
            Add private study notes as text or upload a UTF-8 Markdown, MDX, or
            text file.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="paste" onValueChange={() => playSound("tap")}>
          <TabsList>
            <TabsTrigger value="paste">Paste text</TabsTrigger>
            <TabsTrigger value="upload">Upload file</TabsTrigger>
          </TabsList>
          <TabsContent value="paste">
            <form className="pt-4" onSubmit={submitText}>
              <FieldGroup>
                {keyField("paste-admin-api-key")}
                <Field data-invalid={!title.trim() && !!error}>
                  <FieldLabel htmlFor="content-title">Title</FieldLabel>
                  <Input
                    aria-invalid={!title.trim() && !!error}
                    id="content-title"
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Lesson notes: counters"
                    value={title}
                  />
                </Field>
                {levelField("paste-content-level")}
                <Field data-invalid={!content.trim() && !!error}>
                  <FieldLabel htmlFor="content-text">Content</FieldLabel>
                  <Textarea
                    aria-invalid={!content.trim() && !!error}
                    id="content-text"
                    maxLength={200000}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Paste Japanese examples, translations, grammar notes, or vocabulary…"
                    rows={8}
                    value={content}
                  />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                {success && (
                  <Alert>
                    <SparkleIcon />
                    <AlertTitle>Ready to search</AlertTitle>
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button disabled={pending} type="submit">
                    {pending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <PlusIcon data-icon="inline-start" />
                    )}
                    {pending ? "Indexing…" : "Add content"}
                  </Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </TabsContent>
          <TabsContent value="upload">
            <form className="pt-4" onSubmit={submitFile}>
              <FieldGroup>
                {keyField("upload-admin-api-key")}
                {levelField("upload-content-level")}
                <Field data-invalid={!file && !!error}>
                  <FieldLabel htmlFor="content-file">File</FieldLabel>
                  <Input
                    accept=".md,.mdx,.txt,text/markdown,text/plain"
                    aria-invalid={!file && !!error}
                    id="content-file"
                    name="file"
                    onChange={(event) =>
                      setFile(event.target.files?.[0] || null)
                    }
                    type="file"
                  />
                  <FieldDescription>
                    Maximum 512 KiB and 200,000 decoded characters.
                  </FieldDescription>
                </Field>
                {error && <FieldError>{error}</FieldError>}
                {success && (
                  <Alert>
                    <SparkleIcon />
                    <AlertTitle>Ready to search</AlertTitle>
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button disabled={pending} type="submit">
                    {pending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <FileArrowUpIcon data-icon="inline-start" />
                    )}
                    {pending ? "Uploading…" : "Upload and index"}
                  </Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground shadow-sm",
          compact ? "size-10" : "size-12"
        )}
      >
        <BookOpenTextIcon
          className={compact ? "size-5" : "size-6"}
          weight="duotone"
        />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-heading font-medium tracking-tight",
            compact ? "text-base" : "text-xl"
          )}
        >
          Susume Nihongo
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span lang="ja">すすめ日本語</span>
          <span aria-hidden="true"> · </span>
          Evidence-led study
        </p>
      </div>
    </div>
  )
}

function UtilityActions({
  history,
  onSelectHistory,
  sound,
  theme,
}: {
  history: ReturnType<typeof useAnswerHistory>
  onSelectHistory: (entry: AnswerHistoryEntry) => void
  sound: ReturnType<typeof useSoundEffects>
  theme: ReturnType<typeof useTheme>
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={
                "Switch to " +
                (theme.theme === "dark" ? "light" : "dark") +
                " mode"
              }
              onClick={() => {
                sound.playSound("tap")
                theme.toggleTheme()
              }}
              size="icon-lg"
              type="button"
              variant="ghost"
            />
          }
        >
          <AnimatePresence initial={false} mode="wait">
            <m.span
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              className="flex"
              exit={{ opacity: 0, rotate: 20, scale: 0.8 }}
              initial={{ opacity: 0, rotate: -20, scale: 0.8 }}
              key={theme.theme}
              transition={{ duration: 0.16 }}
            >
              {theme.theme === "dark" ? (
                <SunIcon data-icon="inline-start" />
              ) : (
                <MoonIcon data-icon="inline-start" />
              )}
            </m.span>
          </AnimatePresence>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Switch to {theme.theme === "dark" ? "light" : "dark"} mode
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={
                (sound.enabled ? "Disable" : "Enable") + " action sounds"
              }
              aria-pressed={sound.enabled}
              onClick={sound.toggleSound}
              size="icon-lg"
              type="button"
              variant="ghost"
            />
          }
        >
          <AnimatePresence initial={false} mode="wait">
            <m.span
              animate={{ opacity: 1, scale: 1 }}
              className="flex"
              exit={{ opacity: 0, scale: 0.8 }}
              initial={{ opacity: 0, scale: 0.8 }}
              key={String(sound.enabled)}
              transition={{ duration: 0.16 }}
            >
              {sound.enabled ? (
                <SpeakerHighIcon data-icon="inline-start" />
              ) : (
                <SpeakerSlashIcon data-icon="inline-start" />
              )}
            </m.span>
          </AnimatePresence>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {sound.enabled ? "Disable" : "Enable"} action sounds
        </TooltipContent>
      </Tooltip>

      <AnswerHistory
        entries={history.entries}
        onClear={history.clear}
        onDelete={history.remove}
        onSelect={onSelectHistory}
        playSound={sound.playSound}
      />
      <AdminDialog playSound={sound.playSound} />
    </div>
  )
}

function MobileHeader({
  history,
  onSelectHistory,
  sound,
  theme,
}: {
  history: ReturnType<typeof useAnswerHistory>
  onSelectHistory: (entry: AnswerHistoryEntry) => void
  sound: ReturnType<typeof useSoundEffects>
  theme: ReturnType<typeof useTheme>
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <BrandLockup compact />
      <UtilityActions
        history={history}
        onSelectHistory={onSelectHistory}
        sound={sound}
        theme={theme}
      />
    </header>
  )
}

function ReaderToolbar({
  history,
  onSelectHistory,
  sound,
  theme,
}: {
  history: ReturnType<typeof useAnswerHistory>
  onSelectHistory: (entry: AnswerHistoryEntry) => void
  sound: ReturnType<typeof useSoundEffects>
  theme: ReturnType<typeof useTheme>
}) {
  return (
    <header className="hidden items-center justify-between gap-4 border-b bg-background/92 px-8 py-4 backdrop-blur lg:flex xl:px-10">
      <div className="flex items-center gap-3">
        <Badge variant="outline">
          <span lang="ja">回答</span>
          <span aria-hidden="true">·</span>
          Answer
        </Badge>
        <p className="text-xs text-muted-foreground">
          Source-grounded Japanese study
        </p>
      </div>
      <UtilityActions
        history={history}
        onSelectHistory={onSelectHistory}
        sound={sound}
        theme={theme}
      />
    </header>
  )
}

function HeroSection() {
  return (
    <m.section
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-start gap-6"
      initial={false}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <BrandLockup />
      <div className="flex flex-col gap-4">
        <Badge className="w-fit" variant="secondary">
          <SparkleIcon data-icon="inline-start" />
          64 chapters · N5 to N3
        </Badge>
        <p
          className="font-heading text-sm tracking-[0.2em] text-primary"
          lang="ja"
        >
          本から学ぶ、日本語を深める
        </p>
        <h1 className="max-w-xl font-heading text-4xl font-medium tracking-tight text-balance sm:text-5xl xl:text-6xl">
          Ask the book. Learn with evidence.
        </h1>
        <p className="max-w-xl text-base leading-7 text-pretty text-muted-foreground sm:text-lg">
          Search Japanese grammar, vocabulary, examples, and practice material
          with multilingual hybrid retrieval and source-backed answers.
        </p>
      </div>
    </m.section>
  )
}

function QuestionCard({
  language,
  levels,
  onLanguageChange,
  onLevelsChange,
  onQuestionChange,
  onSubmit,
  pending,
  playSound,
  question,
}: {
  language: AnswerLanguage
  levels: Level[]
  onLanguageChange: (language: AnswerLanguage) => void
  onLevelsChange: (levels: Level[]) => void
  onQuestionChange: (question: string) => void
  onSubmit: (event: FormEvent) => void
  pending: boolean
  playSound: (effect: SoundEffect) => void
  question: string
}) {
  return (
    <Card className="w-full">
      <CardHeader>
        <Badge className="mb-2 w-fit" variant="outline">
          <span lang="ja">質問</span>
          <span aria-hidden="true">·</span>
          Ask
        </Badge>
        <CardTitle>What would you like to understand?</CardTitle>
        <CardDescription>
          Ask in English or Japanese, then optionally narrow the search by JLPT
          level.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel className="sr-only" htmlFor="question">
                Question
              </FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  aria-label="Question"
                  id="question"
                  maxLength={1000}
                  onChange={(event) => onQuestionChange(event.target.value)}
                  placeholder="e.g. What is the difference between は and が?"
                  rows={4}
                  value={question}
                />
                <InputGroupAddon align="block-end">
                  <span className="mr-auto text-xs">
                    {question.length}/1000
                  </span>
                  <InputGroupButton
                    disabled={pending || !question.trim()}
                    size="sm"
                    type="submit"
                    variant="default"
                  >
                    {pending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <MagnifyingGlassIcon data-icon="inline-start" />
                    )}
                    {pending ? "Searching…" : "Ask Susume"}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            <Field orientation="responsive">
              <div>
                <FieldLabel htmlFor="answer-language">
                  Answer language
                </FieldLabel>
                <FieldDescription>
                  Choose the language Susume should use in its response.
                </FieldDescription>
              </div>
              <Select
                items={answerLanguageOptions}
                onValueChange={(value) => {
                  onLanguageChange(value as AnswerLanguage)
                  playSound("tap")
                }}
                value={language}
              >
                <SelectTrigger
                  aria-label="Answer language"
                  className="w-full sm:w-64"
                  id="answer-language"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {answerLanguageOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="responsive">
              <div>
                <FieldLabel id="level-filter-label">JLPT level</FieldLabel>
                <FieldDescription>
                  Leave all off to search the whole book.
                </FieldDescription>
              </div>
              <ToggleGroup
                aria-labelledby="level-filter-label"
                multiple
                onValueChange={(value) => {
                  onLevelsChange(value as Level[])
                  playSound("tap")
                }}
                value={levels}
                variant="outline"
              >
                {(["N5", "N4", "N3"] as Level[]).map((level) => (
                  <ToggleGroupItem key={level} value={level}>
                    {level}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="min-w-0 gap-2 overflow-x-auto border-t sm:flex-wrap sm:overflow-visible">
        <span className="shrink-0 text-xs text-muted-foreground">Try:</span>
        {promptExamples.map((example) => (
          <Button
            className="shrink-0"
            key={example}
            onClick={() => {
              onQuestionChange(example)
              playSound("tap")
            }}
            size="xs"
            type="button"
            variant="ghost"
          >
            {example}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ))}
      </CardFooter>
    </Card>
  )
}

export function KnowledgeApp() {
  const [query, dispatchQuery] = useReducer(queryReducer, initialQueryState)
  const [workspacePane, setWorkspacePane] = useState<WorkspacePane>("ask")
  const { answer, error, language, levels, pending, question } = query
  const theme = useTheme()
  const sound = useSoundEffects()
  const history = useAnswerHistory()

  function selectHistory(entry: AnswerHistoryEntry) {
    dispatchQuery({ type: "history_selected", entry })
    setWorkspacePane("answer")
    window.requestAnimationFrame(() => {
      document.getElementById("answer-result")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })
  }

  async function ask(event: FormEvent) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    sound.playSound("tap")
    setWorkspacePane("answer")
    dispatchQuery({ type: "request_started" })
    try {
      const response = await fetch("/api/v1/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, levels, language }),
      })
      const responseAnswer = await parseResponse<AnswerResponse>(response)
      const completedAnswer = {
        ...responseAnswer,
        language: responseAnswer.language ?? language,
      }
      dispatchQuery({ type: "request_succeeded", answer: completedAnswer })
      history.add(trimmed, language, completedAnswer)
      sound.playSound("success")
    } catch (caught) {
      dispatchQuery({
        type: "request_failed",
        error:
          caught instanceof Error
            ? caught.message
            : "The book could not be searched.",
      })
      sound.playSound("error")
    }
  }

  let resultView: ReactNode
  if (pending) {
    resultView = <LoadingAnswer />
  } else if (error) {
    resultView = (
      <Alert variant="destructive">
        <WarningCircleIcon />
        <AlertTitle>We couldn’t complete that search</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  } else if (answer) {
    resultView = (
      <AnswerResult
        answer={answer}
        language={answer.language ?? language}
        playSound={sound.playSound}
      />
    )
  } else {
    resultView = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenTextIcon />
          </EmptyMedia>
          <p
            className="font-heading text-sm tracking-[0.18em] text-primary"
            lang="ja"
          >
            学びを始めましょう
          </p>
          <EmptyTitle>Your study companion is ready</EmptyTitle>
          <EmptyDescription>
            Ask about grammar, vocabulary, usage, examples, or chapter material.
            Every answer stays grounded in the indexed book.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const resultKey = pending
    ? "loading"
    : error
      ? "error"
      : answer
        ? `answer-${answer.question}`
        : "empty"

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <TooltipProvider>
          <Tabs
            className="h-svh gap-0 overflow-hidden lg:grid lg:grid-cols-[minmax(22rem,5fr)_minmax(0,7fr)] lg:grid-rows-1"
            onValueChange={(value) => setWorkspacePane(value as WorkspacePane)}
            value={workspacePane}
          >
            <MobileHeader
              history={history}
              onSelectHistory={selectHistory}
              sound={sound}
              theme={theme}
            />

            <div className="border-b bg-background/95 p-2 lg:hidden">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  aria-controls="ask-workspace"
                  id="ask-workspace-tab"
                  value="ask"
                >
                  <span lang="ja">質問</span>
                  <span aria-hidden="true">·</span>
                  Ask
                </TabsTrigger>
                <TabsTrigger
                  aria-controls="answer-workspace"
                  id="answer-workspace-tab"
                  value="answer"
                >
                  <span lang="ja">回答</span>
                  <span aria-hidden="true">·</span>
                  Answer
                </TabsTrigger>
              </TabsList>
            </div>

            <main
              aria-labelledby="ask-workspace-tab"
              className={cn(
                "min-h-0 flex-1 bg-sidebar lg:col-start-1 lg:row-start-1 lg:flex lg:border-r",
                workspacePane === "answer" ? "hidden" : "flex"
              )}
              id="ask-workspace"
            >
              <ScrollArea className="h-full w-full">
                <div className="washi-pattern mx-auto flex min-h-full w-full max-w-2xl flex-col gap-7 px-5 py-7 sm:px-8 sm:py-9 lg:max-w-none lg:px-10 lg:py-10 xl:px-12 xl:py-12">
                  <HeroSection />

                  <QuestionCard
                    language={language}
                    levels={levels}
                    onLanguageChange={(value) =>
                      dispatchQuery({
                        type: "language_changed",
                        language: value,
                      })
                    }
                    onLevelsChange={(value) =>
                      dispatchQuery({ type: "levels_changed", levels: value })
                    }
                    onQuestionChange={(value) =>
                      dispatchQuery({
                        type: "question_changed",
                        question: value,
                      })
                    }
                    onSubmit={ask}
                    pending={pending}
                    playSound={sound.playSound}
                    question={question}
                  />

                  <div className="mt-auto flex flex-col gap-4">
                    <Separator />
                    <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                      <KeyIcon className="mt-0.5 shrink-0" />
                      Administrator and LLM keys are never embedded in the
                      browser bundle.
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </main>

            <section
              aria-labelledby="answer-workspace-tab"
              className={cn(
                "reader-pattern min-h-0 flex-1 bg-background lg:col-start-2 lg:row-start-1 lg:flex",
                workspacePane === "ask" ? "hidden" : "flex"
              )}
              id="answer-workspace"
            >
              <div className="flex min-h-0 w-full flex-col">
                <ReaderToolbar
                  history={history}
                  onSelectHistory={selectHistory}
                  sound={sound}
                  theme={theme}
                />

                <ScrollArea className="min-h-0 flex-1">
                  <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-9 lg:px-10 lg:py-10 xl:px-12">
                    <section
                      aria-live="polite"
                      className="flex flex-1 scroll-mt-4 items-center"
                      id="answer-result"
                    >
                      <AnimatePresence initial={false} mode="wait">
                        <m.div
                          animate={{ opacity: 1, y: 0 }}
                          className="w-full"
                          exit={{ opacity: 0, y: -8 }}
                          initial={{ opacity: 0, y: 8 }}
                          key={resultKey}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                          {resultView}
                        </m.div>
                      </AnimatePresence>
                    </section>

                    <Separator />
                    <footer className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
                      <p>
                        Answers are generated from indexed Susume Nihongo
                        material and may still contain mistakes.
                      </p>
                      <p lang="ja">出典を確認しながら学びましょう。</p>
                    </footer>
                  </div>
                </ScrollArea>
              </div>
            </section>
          </Tabs>
        </TooltipProvider>
      </LazyMotion>
    </MotionConfig>
  )
}
