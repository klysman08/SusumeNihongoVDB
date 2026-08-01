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
import { cn } from "@/lib/utils"

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

  return (
    <p className="text-base leading-8">
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (!match) return <span key={`${part}-${index}`}>{part}</span>

        const citationIndex = citations.findIndex(
          (citation) => citation.number === Number(match[1])
        )
        if (citationIndex < 0) {
          return <span key={`${part}-${index}`}>{part}</span>
        }

        return (
          <a
            aria-label={`Show source ${match[1]}`}
            className="mx-0.5 inline-flex align-super text-xs font-medium text-primary underline-offset-2 hover:underline"
            href={`#source-${match[1]}`}
            key={`${part}-${index}`}
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

  function selectCitation(index: number, scrollOnMobile = false) {
    if (index < 0 || index >= answer.citations.length) return
    setActiveCitationIndex(index)
    playSound("navigate")
    if (scrollOnMobile && window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => {
        navigatorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      })
    }
  }

  return (
    <div
      className={cn(
        "grid gap-5",
        citation
          ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"
          : "mx-auto max-w-3xl"
      )}
    >
      <Card>
        <CardHeader>
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

      {citation && (
        <div
          aria-label="Cited source navigator"
          aria-live="polite"
          className="scroll-mt-4"
          ref={navigatorRef}
        >
          <AnimatePresence initial={false} mode="wait">
            <m.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              initial={{ opacity: 0, x: 10 }}
              key={`${citation.document_id}-${citation.number}`}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Card id={`source-${citation.number}`}>
                <CardHeader>
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
                    disabled={
                      activeCitationIndex === answer.citations.length - 1
                    }
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
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
