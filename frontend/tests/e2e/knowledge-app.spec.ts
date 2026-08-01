import { expect, test } from "@playwright/test"

const citedAnswer = {
  question: "What does は do?",
  answer: "は marks the topic of a sentence [1].",
  found: true,
  citations: [
    {
      number: 1,
      document_id: "chapter-05",
      title: "Chapter 05 — Particles",
      source_ref: "book/05.mdx",
      chapter: "05",
      section: "The topic particle",
      excerpt: "The particle は identifies the topic under discussion.",
    },
  ],
}

const multiCitedAnswer = {
  question: "How are は and が different?",
  answer:
    "は introduces the topic [1]. が commonly identifies the grammatical subject [2]. Context determines which contrast matters [3].",
  found: true,
  citations: [
    citedAnswer.citations[0],
    {
      number: 2,
      document_id: "chapter-06",
      title: "Chapter 06 — Subjects",
      source_ref: "book/06.mdx",
      chapter: "06",
      section: "The subject particle",
      excerpt:
        "The particle が identifies the grammatical subject or new information.",
    },
    {
      number: 3,
      document_id: "chapter-07",
      title: "Chapter 07 — Contrast",
      source_ref: "book/07.mdx",
      chapter: "07",
      section: "Choosing a particle",
      excerpt:
        "The surrounding discourse determines whether topic or subject marking is natural.",
    },
  ],
}

async function openHydrated(page: import("@playwright/test").Page) {
  await page.goto("/")
  await page.locator("astro-island:not([ssr])").waitFor()
}

async function waitForHydration(page: import("@playwright/test").Page) {
  await page.locator("astro-island:not([ssr])").waitFor()
}

test("asks a question, filters by level, and opens its citation", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> = {}
  await page.route("**/api/v1/answers", async (route) => {
    requestBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(citedAnswer),
    })
  })
  await openHydrated(page)
  await page.getByRole("button", { name: "N5" }).click()
  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()
  await expect(page.getByText("は marks the topic of a sentence")).toBeVisible()
  await expect(page.getByText("Chapter 05 — Particles")).toBeVisible()
  expect(requestBody).toMatchObject({
    question: "What does は do?",
    levels: ["N5"],
  })
})

test("chooses an answer language and restores it from browser history", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> = {}
  const portugueseAnswer = {
    ...citedAnswer,
    question: "What does は do?",
    answer: "A partícula は marca o tópico da frase [1].",
    language: "pt",
  }
  await page.route("**/api/v1/answers", async (route) => {
    requestBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(portugueseAnswer),
    })
  })

  await openHydrated(page)
  await page.getByLabel("Answer language").click()
  await page.getByRole("option", { name: "Portuguese — Português" }).click()
  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()

  await expect(page.getByText("A partícula は marca o tópico")).toBeVisible()
  expect(requestBody).toMatchObject({ language: "pt" })

  await page.getByRole("button", { name: "Open answer history" }).click()
  await expect(page.getByRole("dialog")).toContainText("What does は do?")
  await page.getByRole("button", { name: "Close" }).click()

  await page.reload()
  await waitForHydration(page)
  await page.getByRole("button", { name: "Open answer history" }).click()
  await page.getByRole("button", { name: "Open answer" }).click()

  await expect(page.getByText("A partícula は marca o tópico")).toBeVisible()
  await expect(page.getByLabel("Answer language")).toContainText("Portuguese")
})

test("shows rejected administrator access clearly", async ({ page }) => {
  await page.route("**/api/v1/documents", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "unauthorized",
        message: "A valid X-API-Key header is required.",
        request_id: "test",
      }),
    })
  )
  await openHydrated(page)
  await page.getByRole("button", { name: "Add content" }).click()
  await page.getByLabel("Administrator API key").fill("wrong")
  await page.getByLabel("Title").fill("Counter notes")
  await page.getByLabel("Content", { exact: true }).fill("本を二冊買いました。")
  await page
    .getByRole("button", { name: "Add content", exact: true })
    .last()
    .click()
  await expect(
    page.getByText("That administrator API key was not accepted.")
  ).toBeVisible()
})

test("adds text and then finds the newly indexed content", async ({ page }) => {
  await page.route("**/api/v1/documents", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "{}" })
  )
  await page.route("**/api/v1/answers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(citedAnswer),
    })
  )
  await openHydrated(page)
  await page.getByRole("button", { name: "Add content" }).click()
  await page.getByLabel("Administrator API key").fill("secret")
  await page.getByLabel("Title").fill("Counter notes")
  await page.getByLabel("Content", { exact: true }).fill("本を二冊買いました。")
  await page
    .getByRole("button", { name: "Add content", exact: true })
    .last()
    .click()
  await expect(
    page.getByText("Content added and indexed. It is ready to search.")
  ).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()
  await expect(page.getByText("は marks the topic of a sentence")).toBeVisible()
})

test("uploads a supported file", async ({ page }) => {
  await page.route("**/api/v1/documents/upload", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "{}" })
  )
  await openHydrated(page)
  await page.getByRole("button", { name: "Add content" }).click()
  await page.getByRole("tab", { name: "Upload file" }).click()
  const uploadPanel = page.getByRole("tabpanel", { name: "Upload file" })
  await uploadPanel.getByLabel("Administrator API key").fill("secret")
  await uploadPanel.getByLabel("File", { exact: true }).setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("猫です"),
  })
  await uploadPanel.getByRole("button", { name: "Upload and index" }).click()
  await expect(
    page.getByText("File uploaded and indexed. It is ready to search.")
  ).toBeVisible()
})

test("follows the system theme and persists a manual override", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await openHydrated(page)

  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Switch to light mode" }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)
  expect(await page.evaluate(() => localStorage.getItem("susume-theme"))).toBe(
    "light"
  )

  await page.reload()
  await waitForHydration(page)
  await expect(page.locator("html")).not.toHaveClass(/dark/)
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" })
  ).toBeVisible()
})

test("keeps action sounds opt-in and persists the preference", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & { __audioStarts: number }
    testWindow.__audioStarts = 0

    class AudioContextStub {
      currentTime = 0
      destination = {}
      state: AudioContextState = "running"

      createGain() {
        return {
          connect: () => undefined,
          gain: {
            exponentialRampToValueAtTime: () => undefined,
            setValueAtTime: () => undefined,
          },
        }
      }

      createOscillator() {
        return {
          connect: () => undefined,
          frequency: { setValueAtTime: () => undefined },
          start: () => {
            testWindow.__audioStarts += 1
          },
          stop: () => undefined,
          type: "sine",
        }
      }

      close() {
        return Promise.resolve()
      }

      resume() {
        return Promise.resolve()
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: AudioContextStub,
    })
  })

  await openHydrated(page)
  const soundButton = page.getByRole("button", { name: "Enable action sounds" })
  await expect(soundButton).toHaveAttribute("aria-pressed", "false")
  expect(
    await page.evaluate(() => localStorage.getItem("susume-sound-effects"))
  ).toBeNull()

  await soundButton.click()
  await expect(
    page.getByRole("button", { name: "Disable action sounds" })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "How do I use は and が?" }).click()
  expect(
    await page.evaluate(
      () => (window as typeof window & { __audioStarts: number }).__audioStarts
    )
  ).toBeGreaterThan(1)

  await page.reload()
  await waitForHydration(page)
  await expect(
    page.getByRole("button", { name: "Disable action sounds" })
  ).toHaveAttribute("aria-pressed", "true")
})

test("generates OpenRouter speech, plays it, and stops on request", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & {
      __audioPaused: number
      __audioPlayed: string | null
    }
    testWindow.__audioPaused = 0
    testWindow.__audioPlayed = null

    class AudioStub {
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      src: string

      constructor(src: string) {
        this.src = src
      }

      load() {}

      pause() {
        testWindow.__audioPaused += 1
      }

      play() {
        testWindow.__audioPlayed = this.src
        return Promise.resolve()
      }

      removeAttribute(name: string) {
        if (name === "src") this.src = ""
      }
    }

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: AudioStub,
    })
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:susume-speech",
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    })
  })
  let speechRequest: Record<string, unknown> = {}
  let speechRequests = 0
  await page.route("**/api/v1/answers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(citedAnswer),
    })
  )
  await page.route("**/api/v1/audio/speech", async (route) => {
    speechRequests += 1
    speechRequest = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: Buffer.from("generated mp3"),
    })
  })

  await openHydrated(page)
  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()
  await page.getByRole("button", { name: "Listen to answer" }).click()

  await expect(
    page.getByRole("button", { name: "Stop reading answer" })
  ).toBeVisible()
  expect(speechRequest).toEqual({
    input: "は marks the topic of a sentence.",
    language: "en",
  })
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __audioPlayed: string | null })
          .__audioPlayed
    )
  ).toBe("blob:susume-speech")
  await page.getByRole("button", { name: "Stop reading answer" }).click()
  expect(
    await page.evaluate(
      () => (window as typeof window & { __audioPaused: number }).__audioPaused
    )
  ).toBeGreaterThanOrEqual(1)

  await page.getByRole("button", { name: "Listen to answer" }).click()
  await expect(
    page.getByRole("button", { name: "Stop reading answer" })
  ).toBeVisible()
  expect(speechRequests).toBe(1)

  await page.getByRole("button", { name: "Stop reading answer" }).click()
  await page.reload()
  await waitForHydration(page)
  await page.getByRole("button", { name: "Open answer history" }).click()
  await page.getByRole("button", { name: "Open answer" }).click()
  await page.getByRole("button", { name: "Listen to answer" }).click()
  await expect(
    page.getByRole("button", { name: "Stop reading answer" })
  ).toBeVisible()
  expect(speechRequests).toBe(1)
})

test("shows speech provider errors without losing the answer", async ({
  page,
}) => {
  await page.route("**/api/v1/answers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(citedAnswer),
    })
  )
  await page.route("**/api/v1/audio/speech", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "tts_not_configured",
        message: "Speech generation is not configured.",
        request_id: "test",
      }),
    })
  )

  await openHydrated(page)
  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()
  await page.getByRole("button", { name: "Listen to answer" }).click()

  await expect(page.getByRole("alert")).toHaveText(
    "Speech generation is not configured."
  )
  await expect(page.getByText("は marks the topic of a sentence")).toBeVisible()
})

test("moves through focused citations and supports inline citation selection", async ({
  page,
}) => {
  await page.route("**/api/v1/answers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(multiCitedAnswer),
    })
  )
  await openHydrated(page)
  await page.getByLabel("Question").fill("How are は and が different?")
  await page.getByRole("button", { name: "Ask Susume" }).click()

  await expect(page.getByText("Chapter 05 — Particles")).toBeVisible()
  await expect(page.getByLabel("Source 1 of 3")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Previous source" })
  ).toBeDisabled()

  await page.getByRole("button", { name: "Next source" }).click()
  await expect(page.getByText("Chapter 06 — Subjects")).toBeVisible()
  await expect(page.getByLabel("Source 2 of 3")).toBeVisible()

  await page.getByRole("link", { name: "Show source 3" }).click()
  await expect(page.getByText("Chapter 07 — Contrast")).toBeVisible()
  await expect(page.getByLabel("Source 3 of 3")).toBeVisible()
  await expect(page.getByRole("button", { name: "Next source" })).toBeDisabled()
})

test("keeps controls usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHydrated(page)

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Enable action sounds" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Add content" }).click()

  const dialogBox = await page.getByRole("dialog").boundingBox()
  expect(dialogBox).not.toBeNull()
  expect(dialogBox?.width).toBeLessThanOrEqual(390)
  expect(dialogBox?.height).toBeLessThanOrEqual(812)
})

test("uses a full-screen five-to-seven study desk on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHydrated(page)

  const askBox = await page.locator("#ask-workspace").boundingBox()
  const answerBox = await page.locator("#answer-workspace").boundingBox()

  expect(askBox).not.toBeNull()
  expect(answerBox).not.toBeNull()
  expect(askBox?.height).toBe(900)
  expect(answerBox?.height).toBe(900)
  expect(
    Math.abs(
      (askBox?.width || 0) / ((askBox?.width || 0) + (answerBox?.width || 0)) -
        5 / 12
    )
  ).toBeLessThan(0.02)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight
    )
  ).toBe(true)
})

test("switches the mobile workspace between Ask and Answer without losing state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route("**/api/v1/answers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(citedAnswer),
    })
  )
  await openHydrated(page)

  const askTab = page.getByRole("tab", { name: /質問.*Ask/ })
  const answerTab = page.getByRole("tab", { name: /回答.*Answer/ })

  await expect(askTab).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("#ask-workspace")).toBeVisible()
  await expect(page.locator("#answer-workspace")).not.toBeVisible()

  await askTab.focus()
  await page.keyboard.press("ArrowRight")
  await expect(answerTab).toBeFocused()
  await askTab.click()

  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()

  await expect(answerTab).toHaveAttribute("aria-selected", "true")
  await expect(page.getByText("は marks the topic of a sentence")).toBeVisible()

  await askTab.click()
  await expect(page.getByLabel("Question")).toHaveValue("What does は do?")

  await page.getByRole("button", { name: "Open answer history" }).click()
  await page.getByRole("button", { name: "Open answer" }).click()
  await expect(answerTab).toHaveAttribute("aria-selected", "true")
  await expect(
    page
      .locator("#answer-result")
      .getByText("は marks the topic of a sentence", { exact: true })
  ).toBeVisible()
})

test("keeps result interactions functional with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.route("**/api/v1/answers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(multiCitedAnswer),
    })
  )
  await openHydrated(page)
  await page.getByLabel("Question").fill("How are は and が different?")
  await page.getByRole("button", { name: "Ask Susume" }).click()
  await page.getByRole("button", { name: "Next source" }).click()
  await expect(page.getByLabel("Source 2 of 3")).toBeVisible()
})
