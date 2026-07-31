import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  FileArrowUpIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  QuotesIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Level = "N5" | "N4" | "N3"

type Citation = {
  number: number
  document_id: string
  title: string
  source_ref?: string | null
  chapter?: string | null
  section?: string | null
  excerpt: string
}

type AnswerResponse = {
  question: string
  answer: string
  found: boolean
  citations: Citation[]
}

type ApiError = {
  code?: string
  message?: string
  request_id?: string
}

const levelItems: Array<{ label: string; value: Level | null }> = [
  { label: "No level", value: null },
  { label: "N5 — Beginner", value: "N5" },
  { label: "N4 — Elementary", value: "N4" },
  { label: "N3 — Intermediate", value: "N3" },
]

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T
  let payload: ApiError = {}
  try {
    payload = (await response.json()) as ApiError
  } catch {
    // The edge may return a plain-text 413/429 before the request reaches FastAPI.
  }
  if (response.status === 429) throw new Error("Too many requests. Please wait a moment and try again.")
  if (response.status === 401) throw new Error("That administrator API key was not accepted.")
  if (payload.code === "upstream_timeout") throw new Error("The answer provider took too long to respond.")
  if (payload.code === "llm_not_configured") throw new Error("Answer generation has not been configured by the administrator.")
  throw new Error(payload.message || "The request could not be completed.")
}

function CitedAnswer({ answer }: { answer: string }) {
  const parts = answer.split(/(\[\d+\])/g)
  return (
    <p className="text-base leading-8">
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/)
        return match ? (
          <a
            className="mx-0.5 inline-flex align-super text-xs font-medium text-primary underline-offset-2 hover:underline"
            href={`#source-${match[1]}`}
            key={`${part}-${index}`}
          >
            {part}
          </a>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      })}
    </p>
  )
}

function LoadingAnswer() {
  return (
    <div aria-label="Searching the book" className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
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
        <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function AdminDialog() {
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
      return
    }
    setPending(true)
    rememberKey()
    try {
      const response = await fetch("/api/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), level, tags: [] }),
      })
      await parseResponse(response)
      setTitle("")
      setContent("")
      setSuccess("Content added and indexed. It is ready to search.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Content could not be added.")
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
    if (!submittedKey || !(submittedFile instanceof File) || !submittedFile.name) {
      setError("API key and a file are required.")
      return
    }
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The file could not be uploaded.")
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
      <FieldDescription>Kept only in this browser tab using sessionStorage.</FieldDescription>
    </Field>
  )

  const levelField = (id: string) => (
    <Field>
      <FieldLabel htmlFor={id}>JLPT level</FieldLabel>
      <Select items={levelItems} onValueChange={(value) => setLevel(value as Level | null)} value={level}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {levelItems.map((item) => (
              <SelectItem key={item.label} value={item.value}>{item.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <Dialog onOpenChange={(open) => open && setApiKey(sessionStorage.getItem("susume-admin-key") || "")}>
      <DialogTrigger render={<Button variant="outline" />}>
        <PlusIcon data-icon="inline-start" />
        Add content
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add searchable content</DialogTitle>
          <DialogDescription>Add private study notes as text or upload a UTF-8 Markdown, MDX, or text file.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="paste">
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
                {success && <Alert><SparkleIcon /><AlertTitle>Ready to search</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
                <DialogFooter>
                  <Button disabled={pending} type="submit">
                    {pending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
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
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    type="file"
                  />
                  <FieldDescription>Maximum 512 KiB and 200,000 decoded characters.</FieldDescription>
                </Field>
                {error && <FieldError>{error}</FieldError>}
                {success && <Alert><SparkleIcon /><AlertTitle>Ready to search</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
                <DialogFooter>
                  <Button disabled={pending} type="submit">
                    {pending ? <Spinner data-icon="inline-start" /> : <FileArrowUpIcon data-icon="inline-start" />}
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

export function KnowledgeApp() {
  const [question, setQuestion] = useState("")
  const [levels, setLevels] = useState<Level[]>([])
  const [answer, setAnswer] = useState<AnswerResponse | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const promptExamples = useMemo(
    () => ["How do I use は and が?", "What does 〜ことになった mean?", "『はずだ』はいつ使いますか？"],
    [],
  )

  async function ask(event: FormEvent) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    setPending(true)
    setError("")
    setAnswer(null)
    try {
      const response = await fetch("/api/v1/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, levels }),
      })
      setAnswer(await parseResponse<AnswerResponse>(response))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The book could not be searched.")
    } finally {
      setPending(false)
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><QuotesIcon />Grounded answer</CardTitle>
            <CardDescription>{answer.found ? "Based only on the sources shown alongside it." : "No sufficiently relevant passage was found."}</CardDescription>
          </CardHeader>
          <CardContent><CitedAnswer answer={answer.answer} /></CardContent>
          <CardFooter><Badge variant={answer.found ? "secondary" : "outline"}>{answer.found ? `${answer.citations.length} cited source${answer.citations.length === 1 ? "" : "s"}` : "No evidence"}</Badge></CardFooter>
        </Card>
        <div aria-label="Cited sources" className="flex flex-col gap-3">
          {answer.citations.map((citation) => (
            <Card id={`source-${citation.number}`} key={citation.number} size="sm">
              <CardHeader>
                <CardTitle>{citation.number}. {citation.title}</CardTitle>
                <CardDescription>{citation.section || "Overview"}</CardDescription>
                <CardAction>{citation.chapter && <Badge variant="outline">Ch. {citation.chapter}</Badge>}</CardAction>
              </CardHeader>
              <CardContent><p className="line-clamp-5 leading-6 text-muted-foreground">{citation.excerpt}</p></CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  } else {
    resultView = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BookOpenTextIcon /></EmptyMedia>
          <EmptyTitle>Your study companion is ready</EmptyTitle>
          <EmptyDescription>Ask about grammar, vocabulary, usage, examples, or chapter material. Every answer stays grounded in the indexed book.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <main className="min-h-svh">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><BookOpenTextIcon className="size-5" weight="duotone" /></div>
            <div>
              <p className="font-heading font-medium">Susume Nihongo</p>
              <p className="text-xs text-muted-foreground">Vector knowledge book</p>
            </div>
          </div>
          <AdminDialog />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-16">
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <Badge variant="secondary"><SparkleIcon data-icon="inline-start" />64 chapters · N5 to N3</Badge>
          <div className="flex flex-col gap-3">
            <h1 className="font-heading text-4xl font-medium tracking-tight text-balance sm:text-6xl">Ask the book. Learn with evidence.</h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-pretty text-muted-foreground sm:text-lg">Search Japanese grammar, vocabulary, examples, and practice material with multilingual hybrid retrieval and source-backed answers.</p>
          </div>
        </section>

        <Card className="mx-auto w-full max-w-4xl">
          <CardHeader>
            <CardTitle>What would you like to understand?</CardTitle>
            <CardDescription>Ask in English or Japanese, then optionally narrow the search by JLPT level.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={ask}>
              <FieldGroup>
                <Field>
                  <FieldLabel className="sr-only" htmlFor="question">Question</FieldLabel>
                  <InputGroup>
                    <InputGroupTextarea
                      aria-label="Question"
                      id="question"
                      maxLength={1000}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder="e.g. What is the difference between は and が?"
                      rows={4}
                      value={question}
                    />
                    <InputGroupAddon align="block-end">
                      <span className="mr-auto text-xs">{question.length}/1000</span>
                      <InputGroupButton disabled={pending || !question.trim()} size="sm" type="submit" variant="default">
                        {pending ? <Spinner data-icon="inline-start" /> : <MagnifyingGlassIcon data-icon="inline-start" />}
                        {pending ? "Searching…" : "Ask Susume"}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <Field orientation="responsive">
                  <div>
                    <FieldLabel id="level-filter-label">JLPT level</FieldLabel>
                    <FieldDescription>Leave all off to search the whole book.</FieldDescription>
                  </div>
                  <ToggleGroup
                    aria-labelledby="level-filter-label"
                    multiple
                    onValueChange={(value) => setLevels(value as Level[])}
                    value={levels}
                    variant="outline"
                  >
                    {(["N5", "N4", "N3"] as Level[]).map((level) => <ToggleGroupItem key={level} value={level}>{level}</ToggleGroupItem>)}
                  </ToggleGroup>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 border-t">
            <span className="text-xs text-muted-foreground">Try:</span>
            {promptExamples.map((example) => (
              <Button key={example} onClick={() => setQuestion(example)} size="xs" type="button" variant="ghost">
                {example}<ArrowRightIcon data-icon="inline-end" />
              </Button>
            ))}
          </CardFooter>
        </Card>

        <section aria-live="polite">{resultView}</section>

        <footer className="flex flex-col items-center gap-2 border-t pt-7 text-center text-xs text-muted-foreground">
          <p>Answers are generated from indexed Susume Nihongo material and may still contain mistakes.</p>
          <p className="flex items-center gap-1"><KeyIcon />Administrator and LLM keys are never embedded in the browser bundle.</p>
        </footer>
      </div>
    </main>
  )
}
