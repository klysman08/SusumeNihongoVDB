import { describe, expect, it } from "vitest"

import {
  markdownSpeechSegments,
  markdownToPlainText,
  parseAnswerMarkdown,
} from "./answer-markdown"

describe("markdownSpeechSegments", () => {
  it("segments headings, English and Japanese sentences, lists, and examples", () => {
    const markdown = [
      "### Grammar points",
      "",
      "The topic is established clearly. The subject adds new information!",
      "日本語の文をゆっくり丁寧に読みます。次の日本語の文もはっきり読みます！",
      "",
      "- The first list sentence is complete. The second list sentence follows?",
      "",
      "> This example sentence is long enough. This translation follows it.",
    ].join("\n")

    expect(markdownSpeechSegments(markdown).map(({ input }) => input)).toEqual([
      "Grammar points.",
      "The topic is established clearly.",
      "The subject adds new information!",
      "日本語の文をゆっくり丁寧に読みます。",
      "次の日本語の文もはっきり読みます！",
      "The first list sentence is complete.",
      "The second list sentence follows?",
      "This example sentence is long enough.",
      "This translation follows it.",
    ])
  })

  it("keeps formatting text but excludes citations, links, raw HTML, and syntax", () => {
    const markdown =
      "**Topic:** `〜は` establishes the topic [1]. [Ignored link](https://example.com) <img src=x>"

    expect(markdownSpeechSegments(markdown).map(({ input }) => input)).toEqual([
      "Topic: 〜は establishes the topic.",
    ])
    expect(markdownToPlainText(markdown)).toBe(
      "Topic: 〜は establishes the topic. Ignored link"
    )
  })

  it("merges very short fragments with a neighbour", () => {
    expect(
      markdownSpeechSegments(
        "Yes. This sentence provides the full explanation."
      ).map(({ input }) => input)
    ).toEqual(["Yes. This sentence provides the full explanation."])
  })

  it("splits long unpunctuated input into clips no longer than 500 characters", () => {
    const segments = markdownSpeechSegments(
      `Prefix ${"word ".repeat(180)}suffix`
    )

    expect(segments.length).toBeGreaterThan(1)
    expect(segments.every(({ input }) => input.length <= 500)).toBe(true)
    expect(segments.map(({ input }) => input).join(" ")).toContain("suffix")
  })

  it("produces stable identifiers for the same Markdown", () => {
    const markdown =
      "One complete sentence here. Another complete sentence there."

    expect(parseAnswerMarkdown(markdown).segments).toEqual(
      parseAnswerMarkdown(markdown).segments
    )
  })
})
