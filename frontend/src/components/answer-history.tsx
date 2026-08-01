import { useState } from "react"
import {
  ArrowUpRightIcon,
  ClockCounterClockwiseIcon,
  HeadphonesIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"

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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SoundEffect } from "@/hooks/use-sound-effects"
import { answerLanguageLabel } from "@/lib/api-types"
import type { AnswerHistoryEntry } from "@/lib/browser-storage"

type AnswerHistoryProps = {
  entries: AnswerHistoryEntry[]
  onClear: () => void
  onDelete: (id: string) => void
  onSelect: (entry: AnswerHistoryEntry) => void
  playSound: (effect: SoundEffect) => void
}

const historyDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export function AnswerHistory({
  entries,
  onClear,
  onDelete,
  onSelect,
  playSound,
}: AnswerHistoryProps) {
  const [open, setOpen] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [search, setSearch] = useState("")

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredEntries = normalizedSearch
    ? entries.filter((entry) => {
        const searchableText = [
          entry.question,
          entry.answer.answer,
          ...entry.answer.citations.flatMap((citation) => [
            citation.title,
            citation.section || "",
            citation.excerpt,
          ]),
        ]
          .join(" ")
          .toLocaleLowerCase()
        return searchableText.includes(normalizedSearch)
      })
    : entries

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setConfirmingClear(false)
      setSearch("")
    }
    if (next) playSound("tap")
  }

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            aria-label="Open answer history"
            className="h-10 px-2 sm:px-3"
            variant="outline"
          />
        }
      >
        <ClockCounterClockwiseIcon data-icon="inline-start" />
        <span className="hidden sm:inline">History</span>
        {entries.length > 0 && (
          <Badge className="min-w-5 justify-center px-1.5" variant="secondary">
            {entries.length}
          </Badge>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100svh-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-10 text-xl">
            <span lang="ja">履歴</span>
            <span aria-hidden="true">·</span>
            Study archive
            {entries.length > 0 && (
              <Badge variant="secondary">{entries.length} saved</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Revisit answers stored only in this browser. Search questions,
            responses, and cited source titles.
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <Empty className="border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClockCounterClockwiseIcon />
              </EmptyMedia>
              <EmptyTitle>No saved answers yet</EmptyTitle>
              <EmptyDescription>
                Answers appear here after you ask your first question.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex min-h-0 flex-col gap-4">
            <InputGroup>
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search answer history"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search questions, answers, or sources…"
                value={search}
              />
              {search && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Clear history search"
                    onClick={() => setSearch("")}
                    size="icon-xs"
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>

            {filteredEntries.length === 0 ? (
              <Empty className="h-[min(52svh,28rem)] border py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MagnifyingGlassIcon />
                  </EmptyMedia>
                  <EmptyTitle>No matching answers</EmptyTitle>
                  <EmptyDescription>
                    Try a different question, phrase, or source title.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setSearch("")} variant="outline">
                    Clear search
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <ScrollArea className="max-h-[min(56svh,34rem)] pr-3">
                <div className="flex flex-col gap-3">
                  {filteredEntries.map((entry) => (
                    <Card key={entry.id} size="sm">
                      <CardHeader>
                        <CardTitle className="line-clamp-2 pr-8 text-base">
                          {entry.question}
                        </CardTitle>
                        <CardDescription>
                          {historyDate.format(entry.createdAt)}
                        </CardDescription>
                        <CardAction>
                          <Button
                            aria-label={`Delete history item: ${entry.question}`}
                            onClick={() => {
                              onDelete(entry.id)
                              playSound("tap")
                            }}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <TrashIcon />
                          </Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2 leading-6 text-muted-foreground">
                          {entry.answer.answer}
                        </p>
                      </CardContent>
                      <CardFooter className="flex-wrap justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {entry.language === "auto"
                              ? "Automatic"
                              : answerLanguageLabel(entry.language)}
                          </Badge>
                          <Badge variant="secondary">
                            {entry.answer.citations.length} source
                            {entry.answer.citations.length === 1 ? "" : "s"}
                          </Badge>
                        </div>
                        <Button
                          onClick={() => {
                            onSelect(entry)
                            playSound("navigate")
                            setOpen(false)
                          }}
                          size="sm"
                          type="button"
                        >
                          Open answer
                          <ArrowUpRightIcon data-icon="inline-end" />
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <HeadphonesIcon /> Audio is cached for replay.
          </p>
          {entries.length > 0 && (
            <div className="flex items-center gap-2">
              {confirmingClear && (
                <Button
                  onClick={() => setConfirmingClear(false)}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={() => {
                  if (!confirmingClear) {
                    setConfirmingClear(true)
                    return
                  }
                  onClear()
                  setConfirmingClear(false)
                  setSearch("")
                  playSound("tap")
                }}
                type="button"
                variant={confirmingClear ? "destructive" : "ghost"}
              >
                <TrashIcon data-icon="inline-start" />
                {confirmingClear ? "Confirm clear archive" : "Clear archive"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
