import { useRef, useState } from "react"
import {
  CaretLeftIcon,
  CaretRightIcon,
  PauseIcon,
  PlayIcon,
  QuotesIcon,
} from "@phosphor-icons/react"
import { AnimatePresence, m } from "motion/react"

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
import { Spinner } from "@/components/ui/spinner"
import { useSpeech } from "@/hooks/use-speech"
import type { SoundEffect } from "@/hooks/use-sound-effects"
import type { AnswerLanguage, AnswerResponse, Citation } from "@/lib/api-types"

type AnswerResultProps = {
  answer: AnswerResponse
  language: AnswerLanguage
  playSound: (effect: SoundEffect) => void
}

type CitedAnswerProps = {
  answer: string
  citations: Citation[]
  onSelectCitation: (index: number) => void
}

function CitedAnswer({
  answer,
  citations,
  onSelectCitation,
}: CitedAnswerProps) {
  const parts = answer.split(/(\[\d+\])/g)
  const keyedParts = parts.reduce<{
    offset: number
    values: Array<{ key: string; part: string }>
  }>(
    (result, part) => ({
      offset: result.offset + part.length,
      values: [...result.values, { key: `${result.offset}-${part}`, part }],
    }),
    { offset: 0, values: [] }
  ).values

  return (
    <p className="text-base leading-8">
      {keyedParts.map(({ key, part }) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (!match) return <span key={key}>{part}</span>

        const citationIndex = citations.findIndex(
          (citation) => citation.number === Number(match[1])
        )
        if (citationIndex < 0) {
          return <span key={key}>{part}</span>
        }

        return (
          <a
            aria-label={`Show source ${match[1]}`}
            className="mx-0.5 inline-flex align-super text-xs font-medium text-primary underline-offset-2 hover:underline"
            href={`#source-${match[1]}`}
            key={key}
            onClick={(event) => {
              event.preventDefault()
              onSelectCitation(citationIndex)
            }}
          >
            {part}
          </a>
        )
      })}
    </p>
  )
}

function SpeechButton({
  answer,
  language,
  playSound,
}: {
  answer: string
  language: AnswerLanguage
  playSound: (effect: SoundEffect) => void
}) {
  const speech = useSpeech()
  const active = speech.loading || speech.speaking

  return (
    <div className="flex max-w-full flex-col items-end gap-2">
      <Button
        aria-label={
          speech.loading
            ? "Cancel speech generation"
            : speech.speaking
              ? "Stop reading answer"
              : "Listen to answer"
        }
        onClick={() => {
          playSound("tap")
          if (active) speech.stop()
          else void speech.speak(answer, language)
        }}
        type="button"
        variant="outline"
      >
        {speech.loading ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : speech.speaking ? (
          <PauseIcon data-icon="inline-start" />
        ) : (
          <PlayIcon data-icon="inline-start" />
        )}
        {speech.loading ? "Preparing…" : speech.speaking ? "Stop" : "Listen"}
      </Button>
      {speech.error && (
        <p
          className="max-w-sm text-right text-sm text-destructive"
          role="alert"
        >
          {speech.error}
        </p>
      )}
    </div>
  )
}

export function AnswerResult({
  answer,
  language,
  playSound,
}: AnswerResultProps) {
  const [activeCitationIndex, setActiveCitationIndex] = useState(0)
  const navigatorRef = useRef<HTMLDivElement>(null)
  const citation = answer.citations[activeCitationIndex]

  function selectCitation(index: number, scrollToSource = false) {
    if (index < 0 || index >= answer.citations.length) return
    setActiveCitationIndex(index)
    playSound("navigate")
    if (scrollToSource) {
      window.requestAnimationFrame(() => {
        navigatorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        })
      })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Card>
        <CardHeader>
          <Badge className="mb-2 w-fit" variant="secondary">
            <span lang="ja">回答</span>
            <span aria-hidden="true">·</span>
            Answer
          </Badge>
          <CardTitle className="flex items-center gap-2">
            <QuotesIcon />
            Grounded answer
          </CardTitle>
          <CardDescription>
            {answer.found
              ? "Based only on the source passages shown alongside it."
              : "No sufficiently relevant passage was found."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CitedAnswer
            answer={answer.answer}
            citations={answer.citations}
            onSelectCitation={(index) => selectCitation(index, true)}
          />
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <Badge variant={answer.found ? "secondary" : "outline"}>
            {answer.found
              ? `${answer.citations.length} cited source${answer.citations.length === 1 ? "" : "s"}`
              : "No evidence"}
          </Badge>
          <SpeechButton
            answer={answer.answer}
            language={language}
            playSound={playSound}
          />
        </CardFooter>
      </Card>

      <AnimatePresence initial={false} mode="wait">
        {citation && (
          <m.div
            animate={{ opacity: 1, x: 0 }}
            aria-label="Cited source navigator"
            aria-live="polite"
            className="scroll-mt-4"
            exit={{ opacity: 0, x: -10 }}
            initial={{ opacity: 0, x: 10 }}
            key={`${citation.document_id}-${citation.number}`}
            ref={navigatorRef}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Card id={`source-${citation.number}`}>
              <CardHeader>
                <Badge className="mb-2 w-fit" variant="outline">
                  <span lang="ja">出典</span>
                  <span aria-hidden="true">·</span>
                  Source
                </Badge>
                <CardTitle>
                  {citation.number}. {citation.title}
                </CardTitle>
                <CardDescription>
                  {citation.section || "Overview"}
                </CardDescription>
                <CardAction>
                  {citation.chapter && (
                    <Badge variant="outline">Ch. {citation.chapter}</Badge>
                  )}
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="leading-7 text-muted-foreground">
                  {citation.excerpt}
                </p>
              </CardContent>
              <CardFooter className="justify-between gap-3 border-t">
                <Button
                  aria-label="Previous source"
                  className="min-h-10"
                  disabled={activeCitationIndex === 0}
                  onClick={() => selectCitation(activeCitationIndex - 1)}
                  type="button"
                  variant="outline"
                >
                  <CaretLeftIcon data-icon="inline-start" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <Badge
                  aria-label={`Source ${activeCitationIndex + 1} of ${answer.citations.length}`}
                  variant="secondary"
                >
                  {activeCitationIndex + 1} of {answer.citations.length}
                </Badge>
                <Button
                  aria-label="Next source"
                  className="min-h-10"
                  disabled={activeCitationIndex === answer.citations.length - 1}
                  onClick={() => selectCitation(activeCitationIndex + 1)}
                  type="button"
                  variant="outline"
                >
                  <span className="hidden sm:inline">Next</span>
                  <CaretRightIcon data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
