# Study Book — Content Map (CONTENT.md)

Canonical map of the Susume Nihongo study book: every chapter's topics and
subtopics, the components used to build them, the audit/issues register, and the
plan for the deep content pass. This file is the source of truth for content work.
It is plain Markdown (not `.mdx`) so it is **not** built as a page.

- **Scope:** 64 chapters — 20 × JLPT **N5** (beginner) + 20 × JLPT **N4** (pre-intermediate) + 24 × JLPT **N3** (intermediate, six units complete).
- **Last full audit:** 2026-07-13; N5–N4 accuracy register rechecked and all 40 chapters received applied guided-production and reading review.
- **Quality dimensions** every chapter is held to:
  1. **Linguistic accuracy** — correct, natural Japanese + correct romaji + correct rules.
  2. **Pedagogical clarity** — form + meaning + *when/why* + common mistakes; sound progression.
  3. **Completeness** — covers the chapter's JLPT scope (grammar, vocab, examples, quiz).
  4. **JLPT alignment** — vocab/kanji/grammar stay within the declared level.

> **Overall verdict from the audit:** content quality is **high**, especially the N4
> grammar chapters (giving/receiving, potential, causative-passive, conditionals,
> keigo) which are accurate and well-explained. Remaining work is mostly small
> accuracy/typo fixes, a couple of structural/ordering issues, and consistency
> polish — see the **Issues Register**.

---

## How the book is built (component guide)

Chapters are MDX composed from React islands in `src/components/book/`. Use these
consistently; they follow the design system (zinc neutrals, Japanese accent
palettes, dark mode).

| Component | Purpose | Accent |
|-----------|---------|--------|
| `ChapterHeader` | Title, level badge, learning objectives | ai |
| `SectionIntro` | Level-context lead-in paragraph | yamabuki |
| `BookImage` | Image-only chapter illustration inserted immediately after `SectionIntro`; generated from the intro context | — |
| `VocabTable` | Word lists (word / reading / romaji / meaning / type) | aotake |
| `KanjiCard` | Single-kanji card (on/kun, strokes, examples) | murasaki |
| `GrammarBox` | Pattern + meaning + formation + examples | yamabuki |
| `ExampleSentence` | One sentence (japanese / romaji / translation / note) | — |
| `ConversationDialog` | Contextual multi-line dialogue that reinforces the current chapter's target grammar/vocab/kana | asagi |
| `ChapterSummary` | Key takeaways | — |
| `QuizBlock` | Multiple-choice knowledge check | — |
| **`KanaGrid`** *(new)* | Reusable hiragana/katakana chart — base + dakuten + yōon; `highlight` look-alikes | sakura |
| **`ConjugationTable`** *(new)* | Verb/adjective form tables (polite/plain, tense, potential…) | yamabuki |
| **`ParticleCompare`** *(new)* | Side-by-side contrast of confusable particles/forms | yamabuki |
| **`CultureNote`** *(new)* | Styled cultural-context callout (replaces `## Cultural Note` prose) | fuji |
| **`CommonMistake`** *(new)* | "Watch out" callout for typical errors (replaces `[!WARNING]` blockquotes) | amber (semantic) |
| **`FamilyTable`** *(new)* | Humble vs. polite family-term table (responsive card/table) | aotake |
| **`PatternCompare`** | Meaning, formation, register, and constraint contrasts | yamabuki |
| **`PracticeBlock`** | Guided transformation/error-correction with hints and answer reveals | midori |
| **`ReadingPractice`** | Timed Japanese passage, glossary, questions, and answer explanations | kon |
| **`ListeningPractice`** | TTS listening rehearsal with hidden transcript and answers | asagi |
| **`KanjiCluster`** | Word-first kanji clusters taught through useful compounds | murasaki |

`KanaGrid` now also supports a katakana-only **`extended`** section (ファ/ティ/ウィ/
ジェ…) for modern loanword sounds — pass `sections={['extended']}`.

**Authoring conventions (decided):** prefer `KanaGrid` over hand-coded kana tables;
use `character`/`strokes` (not `kanji`/`strokeCount`) for `KanjiCard`; the romaji
scheme is **doubled vowels, kana-faithful** (おう→`ou`, えい→`ei`, おお→`oo`; katakana
ー doubles the vowel, so コーヒー→`koohii`) — **no macrons** anywhere in the book.
`ConversationDialog` blocks should be chapter-contextual: choose concrete scenes
from the lesson, keep 4–6 short turns, and avoid unrelated generic practice.
N3 romaji fades by unit: visible in Unit 1, toggled in Unit 2, absent from
reading/listening from Unit 3, and generally absent in Units 5–6.

**N3 image decision:** do not add `BookImage` to the initial N3 chapters. The N3
image pass will be planned separately after the level's text content is approved.

New components wired this pass: `KanaGrid` (Ch.01, Ch.02), `CultureNote` +
`CommonMistake` (Ch.01), `BookImage` (Ch.01, Ch.02 examples),
`ConjugationTable` (Ch.10), `ParticleCompare` (Ch.16), `FamilyTable`
(Ch.23). `KanaGrid` `extended` section wired in Ch.02.

---

## Curriculum map — JLPT N5 (Ch.01–20)

| # | Title | Core topics / subtopics |
|---|-------|-------------------------|
| 01 | Introduction & ひらがな | 3 writing systems; full hiragana (base/dakuten/yōon via `KanaGrid`); particle-only readings は/へ/を |
| 02 | カタカナ & Greetings | full katakana; chōonpu ー long vowels; small ッ; greetings (aisatsu); bowing |
| 03 | Numbers & は・の | kanji 1–10, 百/千/万; topic は; possessive の; lucky/unlucky numbers |
| 04 | Pronouns & も | personal pronouns; **ko-so-a-do pronouns これ/それ/あれ/どれ** (= demonstratives Part 1); も; honorifics |
| 05 | Question Words & か | question particle か; なに/なん, どこ, だれ, いつ, どうして; enryo |
| 06 | Demonstratives この/その/あの/どの | demonstrative **adjectives** (require a noun); これ vs この; shopping etiquette |
| 07 | Noun + です | copula です; negative じゃ/では ありません; politeness levels; jiko shōkai |
| 08 | Time & に | hours じ (irregulars 4/7/9), minutes ふん/ぷん, はん; time particle に; punctuality |
| 09 | Places & へ・で | destination へ; location-of-action で; means で; walking あるいて; train culture |
| 10 | Verb Conjugation ます-form | Group 1/2/3 → ます; negative ません; polite vs plain (`ConjugationTable`) |
| 11 | Particle を & Verbs 2 | direct object を; transitive verbs; SOV order; dining etiquette |
| 12 | Verb Groups & Dictionary Form | Group 1 (godan), Group 2 (ichidan), Group 3; exceptions (帰る等); concept of 間 (ma) |
| 13 | Existence ある・いる | inanimate ある / animate いる; が; location に; position words; wabi-sabi |
| 14 | い-Adjectives | identify い-adj; conjugate (neg/past/past-neg); noun modification; いい→よかった; seasons |
| 15 | な-Adjectives | な-adj as nouns; copula conjugation; な before noun; に adverbs; omotenashi |
| 16 | Particles Recap | は/が/を, に/で/へ, から/まで/と/も; desire ほしい/〜たい (`ParticleCompare`) |
| 17 | Past Tense | noun/な-adj でした; い-adj かった; verb ました/ませんでした; New Year |
| 18 | Counters 1 + て-form | native 〜つ; 〜個, 〜枚; **て-form introduced**; omiyage |
| 19 | Counters 2 + Comparison | 〜人 (hitori/futari), durations 時間/週間/ヶ月; より/ほう/いちばん; gift numbers |
| 20 | N5 Review & Capstone | particle+tense synthesis; counting & desire; mega-quiz; omotenashi |

## Curriculum map — JLPT N4 (Ch.21–40)

| # | Title | Core topics / subtopics |
|---|-------|-------------------------|
| 21 | N4 Kanji 1: Everyday Life | body/mind 体心目耳手足頭顔声; food 肉飯牛魚茶野菜; motion 走歩起寝; eating etiquette |
| 22 | N4 Kanji 2: Society & Work | school 教室習勉試験文答; work 業働社員院医者事; mind 心思考急意味楽運; work culture |
| 23 | N4 Vocabulary | family (humble vs polite); workplace ranks/terms; emotion adjectives |
| 24 | て-form Extensions | 〜てみる, 〜てしまう/ちゃう, 〜ておく/とく, 〜てくる/ていく; dandori |
| 25 | Giving & Receiving | あげる/もらう/くれる; 〜てあげる/てもらう/てくれる; gift culture |
| 26 | Potential Form | できる; G1 〜eru, G2 〜られる, irregulars; を→が; ability vs possibility; ra-nuki |
| 27 | Volitional Form | 〜よう/しよう; casual "let's"; 〜ようと思う; 〜ようとする |
| 28 | Conditional 〜たら | ta-form + ら; if / when-after / past discovery; よかったら |
| 29 | Conditionals ば・と・なら | ば advice; と natural consequence; なら contextual; comparison table |
| 30 | Passive 〜られる | conjugation; direct passive; suffering passive; に / によって |
| 31 | Causative 〜させる | make vs let; を/に particle rules; 〜せてください; 〜せていただく |
| 32 | Causative-Passive 〜させられる | full form; G1 shortcut 〜される; す-verb exception; reluctance nuance |
| 33 | Nominalization の・こと | の vs こと; perception/help → の; thought/fixed patterns → こと |
| 34 | Relative Clauses | pre-noun modifying clause; plain form; は→が(の) inside clause; implicit subject |
| 35 | Transitive & Intransitive | 他動詞/自動詞 pairs; 〜ている (resultant state); 〜てある (intentional) |
| 36 | Obligation | 〜なければならない / なきゃ / なくちゃ; 〜なくてもいい; 〜べき / べきではない; までに |
| 37 | Reason & Cause | から (subjective) vs ので (objective/polite); て-form cause; 〜ために (cause/purpose) |
| 38 | Contrast | が/けれど(も); のに (despite, emotional); 〜ても (even if); dangling-が buffer |
| 39 | Keigo | teineigo/sonkeigo/kenjōgo; special verbs; お〜になる / お〜する; uchi-soto |
| 40 | N4 Capstone | grammar synthesis; 〜させていただけませんか; N5→N4→N3 framing |

## Curriculum map — JLPT N3 (Ch.41–64)

| Unit | Chapters | Learning progression |
|------|----------|----------------------|
| 1 · Intermediate Foundations | 41–44 | verb-form recognition; transitivity and state; benefactive perspective; preparation, completion, trial, and directional change |
| 2 · Time, Change, and Plans | 45–48 | action stages; repetition and gradual change; decisions/rules; intentions and schedules |
| 3 · Purpose, Cause, and Evidence | 49–52 | controlled purpose vs desired result; cause tone; results and conclusions; appearance, reports, and inference |
| 4 · Conditions and Nuance | 53–56 | necessity and sufficiency; concession and criticism; focus and limits; advice and qualified judgement |
| 5 · Written and Lexical Japanese | 57–60 | formal relationships; event sequence; compound verbs; comparison, degree, and tendencies |
| 6 · Natural and Integrated Japanese | 61–64 | discourse and long sentences; spoken contraction/omission; integrated workshop; cumulative capstone |

**N3 authoring record:** Chapters 47–49 were replaced because their duplicated
examples and recognition-only quizzes did not teach use. Chapters 51–64 add the
remaining six-unit path. New lessons use distinct contextual Japanese, formation
and register contrasts, answer-reveal practice, no-romaji reading, listening
rehearsal, and application-based quizzes. Chapter 64 is the integrated capstone.

---

## Issues Register

Severity: **High** = factual error or broken structure · **Med** = accuracy/clarity ·
**Low** = consistency/polish. Items marked ✅ were fixed in the foundation pass; the
rest are scheduled into the batches below.

### High
| ID | Chapter | Finding | Proposed fix |
|----|---------|---------|--------------|
| H1 | 06 (title) | "Ko-So-A-Do **Part 2**" with no visible "Part 1" — Part 1 (これ/それ/あれ) actually lives in Ch.04, unlabeled. Confusing on the index. | ✅ Fixed (B2): Ch.06 retitled "Demonstrative Adjectives (この・その・あの・どの)" (dropped "Part 2"); Ch.04 cross-reference retained. |
| H2 | 10 (intro) | Says *"In Chapter 12, we learned how to classify verbs into three groups"* — but Ch.12 (verb groups) comes **after** Ch.10. ます-form depends on groups taught later. | ✅ Fixed (B3): Ch.10 intro made self-contained + quick group-spotting note; Ch.12 back-references the Ch.10 preview. Non-invasive (chapters not renumbered). |

### Med
| ID | Chapter | Finding | Proposed fix |
|----|---------|---------|--------------|
| M1 | 19 §2 | Example reads にこげつ; should be **にかげつ** (二ヶ月, ni-kagetsu). | ✅ Fixed: にこげつ→にかげつ. |
| M2 | 19 §2 | 〜日 labelled "(kan)"; the day-duration reading is nichi/-ka, while かん is an optional suffix (futsuka-kan). | ✅ Fixed: relabelled 〜日 (nichi / -ka); かん noted as optional duration suffix. |
| M3 | 35 (dialogue 2) | 「ゴミ箱に破片が入れいてあるから」 — typo 入れいて → **入れて** (irete aru). | ✅ Fixed. |
| M4 | 39 §4 / quiz | 「何を読みになりますか」 missing お → should be **お読みになりますか**. | ✅ Fixed: added お. |
| M5 | 36 (dialogue 1) | Romaji "owarasenakereba narana n desu" → **naranai n desu** (JP text is fine). | ✅ Fixed romaji. |
| M6 | 32 (§3 + quiz) | Romaji typos: "kakasareu"→kakasareru, "hashiraseu/hashirasareu"→…rareru. | ✅ Fixed romaji. |
| M7 | 10 §1 | Uses ななじ for 7:00 while Ch.08 teaches しちじ (rarely nana-ji). | ✅ Fixed (B3): changed to しちじ. |
| M8 | 04 §quiz Q11 | "これ ___ あなたの本です" answer "Either は or も" — も changes the meaning ("this too"); pedagogically muddy. | ✅ Fixed (B2): reworded to explicitly test も ("This is ALSO your book"), removed the "Either" option. |

### Low / consistency & completeness
| ID | Chapter | Finding | Proposed fix |
|----|---------|---------|--------------|
| L1 | book-wide | Romaji scheme inconsistent (kēki vs keeki, ō/ū vs ou/uu). | ✅ Fixed (B1): standardized on **doubled vowels, kana-faithful** (おう→ou, ー doubles the vowel → koohii). All macrons removed from book MDX + `KanaGrid` labels; verified zero macrons in built HTML. |
| L2 | book-wide | `KanjiCard` props inconsistent: N5 uses `character`/`strokes`, N4 uses `kanji`/`strokeCount` (both supported, but inconsistent). | ✅ Fixed: Ch.21/22 normalized to `character`/`strokes`. |
| L3 | 01 | Summary claims "stroke order is essential" but stroke order is never taught/shown. | ✅ Fixed (B1): added §7 "Writing Kana: Stroke Order" (top→bottom, left→right, horizontal→vertical) + a `CommonMistake` on stroke direction (ties to シ/ツ in Ch.02). Summary claim retained. |
| L4 | 01 / 02 | Kana completeness: long-vowel rules (おう/えい), small っ (sokuon) not taught; Ch.02 lacks extended katakana (ファ/ティ/ウィ). | ✅ Fixed (B1): Ch.01 §5 long vowels + §6 small っ sokuon (with quiz Qs); Ch.02 §3 small ッ + §4 extended katakana (via new `KanaGrid` `extended` section) + `[!WARNING]`→`CommonMistake` + quiz Qs. |
| L5 | 18 | て-form is introduced buried inside "Counters Part 1". | ✅ Fixed: title now "Counters Part 1 & the て-form (Connector)" (frontmatter + header). |
| L6 | 01 / 02 | Hand-coded duplicated kana tables. | Replaced with `KanaGrid` ✅. |
| L7 | 23 | Family terms use a hand-coded table. | ✅ Fixed (B1): built reusable `FamilyTable` component (humble/polite columns, responsive card+table, aotake accent); replaced Ch.23 hand-coded table. |

---

## Batch plan (deep content pass)

Foundation (this pass): full audit, `CONTENT.md`, and the new component set — **done**.
The deep per-chapter rewrites are split into themed batches; each gets its own
spec → plan → implementation cycle, driven by this file's map + register.

| Batch | Chapters | Theme | Status |
|-------|----------|-------|--------|
| Foundation | — | Audit + CONTENT.md + components | ✅ done |
| B1 | 01–02 | Kana & foundations (incl. L3/L4 completeness) | ✅ done — L1 romaji (book-wide), L3 stroke order, L4 long vowels/sokuon/extended katakana; L7 `FamilyTable` (Ch.23) done in this batch too |
| B2 | 03–09 | Particles & nouns (H1) | ✅ core done — H1 (Ch.06 retitle) + M8 (Ch.04 quiz) fixed; へ/で/に ParticleCompare added (Ch.09) |
| B3 | 10–13 | Verbs (H2 ordering, M7) | ✅ core done — H2, M7 fixed; を-vs-に/へ (Ch.11) + ある/いる (Ch.13) callouts added |
| B4 | 14–17 | Adjectives & past/recap | ✅ applied review added; Ch.14 overgeneralisation about い-adjectives corrected |
| B5 | 18–20 | Counters & N5 capstone (L5, M1/M2) | ✅ applied review added; registered counter issues remain fixed |
| B6 | 21–26 | N4 kanji/vocab + て-form family (L2) | ✅ applied review added; contextual kanji/vocab production included |
| B7 | 27–40 | N4 advanced grammar → keigo (M3–M6) | ✅ applied review added; registered Japanese/romaji issues remain fixed |
| N3-P1 | 41–43 | Strengthening the Foundations: verb-form review, transitivity, giving/receiving | ✅ done — text-first implementation; images deferred by decision |
| N3-P2 | 44–46 | Time, Actions, and Progress: preparation, timing, continuation, and gradual change | ✅ done — text-first implementation; images deferred by decision |
| N3-U2/3 | 47–52 | Plans through evidence: weak drafts replaced; cause, result, report, and inference added | ✅ done |
| N3-U4 | 53–56 | Conditions, contrast, emphasis, and qualified judgement | ✅ done |
| N3-U5 | 57–60 | Formal written relationships, sequence, compounds, degree, and tendencies | ✅ done |
| N3-U6 | 61–64 | Discourse, spoken Japanese, integrated workshop, and capstone | ✅ done |
