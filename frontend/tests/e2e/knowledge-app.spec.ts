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

async function openHydrated(page: import("@playwright/test").Page) {
  await page.goto("/")
  await page.locator("astro-island:not([ssr])").waitFor()
}

test("asks a question, filters by level, and opens its citation", async ({ page }) => {
  let requestBody: Record<string, unknown> = {}
  await page.route("**/api/v1/answers", async (route) => {
    requestBody = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(citedAnswer) })
  })
  await openHydrated(page)
  await page.getByRole("button", { name: "N5" }).click()
  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()
  await expect(page.getByText("は marks the topic of a sentence")).toBeVisible()
  await expect(page.getByText("Chapter 05 — Particles")).toBeVisible()
  expect(requestBody).toMatchObject({ question: "What does は do?", levels: ["N5"] })
})

test("shows rejected administrator access clearly", async ({ page }) => {
  await page.route("**/api/v1/documents", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "unauthorized", message: "A valid X-API-Key header is required.", request_id: "test" }),
    }),
  )
  await openHydrated(page)
  await page.getByRole("button", { name: "Add content" }).click()
  await page.getByLabel("Administrator API key").fill("wrong")
  await page.getByLabel("Title").fill("Counter notes")
  await page.getByLabel("Content", { exact: true }).fill("本を二冊買いました。")
  await page.getByRole("button", { name: "Add content", exact: true }).last().click()
  await expect(page.getByText("That administrator API key was not accepted.")).toBeVisible()
})

test("adds text and then finds the newly indexed content", async ({ page }) => {
  await page.route("**/api/v1/documents", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "{}" }),
  )
  await page.route("**/api/v1/answers", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(citedAnswer) }),
  )
  await openHydrated(page)
  await page.getByRole("button", { name: "Add content" }).click()
  await page.getByLabel("Administrator API key").fill("secret")
  await page.getByLabel("Title").fill("Counter notes")
  await page.getByLabel("Content", { exact: true }).fill("本を二冊買いました。")
  await page.getByRole("button", { name: "Add content", exact: true }).last().click()
  await expect(page.getByText("Content added and indexed. It is ready to search.")).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await page.getByLabel("Question").fill("What does は do?")
  await page.getByRole("button", { name: "Ask Susume" }).click()
  await expect(page.getByText("は marks the topic of a sentence")).toBeVisible()
})

test("uploads a supported file", async ({ page }) => {
  await page.route("**/api/v1/documents/upload", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "{}" }),
  )
  await openHydrated(page)
  await page.getByRole("button", { name: "Add content" }).click()
  await page.getByRole("tab", { name: "Upload file" }).click()
  const uploadPanel = page.getByRole("tabpanel", { name: "Upload file" })
  await uploadPanel.getByLabel("Administrator API key").fill("secret")
  await uploadPanel.getByLabel("File", { exact: true }).setInputFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("猫です") })
  await uploadPanel.getByRole("button", { name: "Upload and index" }).click()
  await expect(page.getByText("File uploaded and indexed. It is ready to search.")).toBeVisible()
})
