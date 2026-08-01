import { useState } from "react"
import {
  ArrowUpRightIcon,
  ClockCounterClockwiseIcon,
  HeadphonesIcon,
  TrashIcon,
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) setConfirmingClear(false)
    if (next) playSound("tap")
  }

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            aria-label="Open answer history"
            className="size-10 px-0 sm:w-auto sm:px-3"
            variant="outline"
          />
        }
      >
        <ClockCounterClockwiseIcon data-icon="inline-start" />
        <span className="hidden sm:inline">History</span>
        {entries.length > 0 && (
          <Badge className="hidden sm:inline-flex" variant="secondary">
            {entries.length}
          </Badge>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100svh-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Answer history</DialogTitle>
          <DialogDescription>
            Stored only in this browser. Generated speech is reused after the
            first listen, so replaying it does not make another TTS request.
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <Empty className="border py-10">
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
          <ScrollArea className="h-[min(60svh,32rem)] pr-3">
            <div className="flex flex-col gap-3">
              {entries.map((entry) => (
                <Card key={entry.id} size="sm">
                  <CardHeader>
                    <CardTitle className="line-clamp-2 pr-8">
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
                    <p className="line-clamp-3 leading-6 text-muted-foreground">
                      {entry.answer.answer}
                    </p>
                  </CardContent>
                  <CardFooter className="justify-between gap-3">
                    <Badge variant="outline">
                      {entry.language === "auto"
                        ? "Automatic"
                        : answerLanguageLabel(entry.language)}
                    </Badge>
                    <Button
                      onClick={() => {
                        onSelect(entry)
                        playSound("navigate")
                        setOpen(false)
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
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

        <DialogFooter className="items-center sm:justify-between">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <HeadphonesIcon /> Audio is cached after the first listen.
          </p>
          {entries.length > 0 && (
            <Button
              onClick={() => {
                if (!confirmingClear) {
                  setConfirmingClear(true)
                  return
                }
                onClear()
                setConfirmingClear(false)
                playSound("tap")
              }}
              type="button"
              variant={confirmingClear ? "destructive" : "ghost"}
            >
              <TrashIcon data-icon="inline-start" />
              {confirmingClear ? "Confirm clear" : "Clear local history"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
