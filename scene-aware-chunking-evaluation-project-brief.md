# Scene-Aware Chunking Evaluation Project Brief

This document is a handoff brief for a new standalone project. It assumes the next implementer may not have any prior conversation memory. It explains why the scope was reduced, what already exists in the current `Story-Visualization` repository, and what should be implemented for the thesis-oriented scene-aware chunking evaluation.

## 1. Current Research Intent

The near-term goal is no longer to build a full reader-support system, knowledge graph, QA engine, or hint interface. Those are too broad for the remaining thesis-defense timeline.

The revised goal is:

> Build and evaluate a scene-aware chunking method for long-form narrative text by comparing automatically predicted scene boundaries against human scene segmentation.

The intended thesis contribution is modest but defensible:

> Long-form fiction does not usually provide explicit scene boundaries. We propose a paragraph-level scene-aware chunking method that uses narrative state changes, especially location shifts, cast turnover, and time signals, to segment a chapter into scene-like chunks. We evaluate how closely the predicted chunks match human consensus segmentation.

The project should focus on evaluation clarity, reproducibility, and clean evidence tables rather than broad system features.

## 2. What Is In Scope

Implement only the pieces needed to produce a thesis-ready segmentation evaluation.

In scope:

- A small annotation interface where humans mark scene boundaries.
- A data format for paragraphs, annotations, consensus gold, predictions, and metrics.
- Gold standard construction from multiple annotators.
- Comparison of several segmentation methods against human consensus gold.
- Human-human agreement reporting.
- Exportable CSV/JSON/Markdown result tables.
- Boundary visualizations useful for paper figures and debugging.
- Optional import of existing `STATE.3` outputs from the current `Story-Visualization` repo.

The core evaluation question:

> How similar is each automatic segmentation method to human scene segmentation?

## 3. What Is Out Of Scope

Do not implement these for the thesis MVP:

- Reader hints.
- Reader UI.
- Visual support generation.
- Knowledge graph construction.
- QA over a KG.
- RAG.
- User reading behavior logging.
- Support cards, support governors, or intervention policies.
- Entity annotation by human participants.
- Downstream scene representation beyond what is needed for segmentation.

Humans should not be asked to annotate important entities, character lists, places, causal edges, or summaries. They should only mark scene boundaries. Optional boundary reasons are acceptable because they support error analysis, but they should remain lightweight.

## 4. Existing Repository Context

Current repository:

```text
C:\Users\HOONLAB\Documents\Researches\06_Story_LLMs\Story-Visualization
```

The current app is a Next.js app with a multi-stage narrative pipeline. For this new project, the relevant portion is the segmentation branch:

```text
PRE.1 / PRE.2
-> ENT.1 / ENT.2 / ENT.3
-> STATE.1
-> STATE.2
-> STATE.3
-> SCENE.1
```

For the reduced thesis scope, the key endpoint is `STATE.3`, not the later scene/subscene/support/final branches.

Relevant existing files:

```text
src/lib/pipeline/state1.ts
src/lib/pipeline/state2.ts
src/lib/pipeline/state3.ts
src/lib/pipeline/scene1.ts
src/types/schema.ts
src/app/api/pipeline/state3/route.ts
docs/source/pipeline/state.md
```

The new standalone project can either copy/reimplement the needed logic or import/export JSON from the current repo. The fastest path is:

1. Use the current repo to run the pipeline and export `STATE.3` predictions.
2. Use the new project as the annotation/evaluation workbench.

## 5. Existing Implementation: STATE.1

Existing file:

```text
src/lib/pipeline/state1.ts
```

Role:

`STATE.1` performs rule-based paragraph-level narrative state tracking from the entity graph and raw chapter paragraphs.

Inputs:

- `EntityGraph` from `ENT.3`
- `RawChapter`
- `docId`
- `chapterId`

Output:

- `StateFrames`

Important implementation details:

- It indexes entity mentions by paragraph id (`pid`).
- It separates observed entities into cast, place, and time.
- It tracks active cast with a sliding window.
- It tracks current place with score-based persistence.
- It extracts time signal spans from time entities.

Current constants:

```ts
const CAST_WINDOW = 2
const PLACE_SET_THRESHOLD = 2.0
const PLACE_SHIFT_THRESHOLD = 3.0
const CARRY_GAP = 1
```

State frame structure conceptually includes:

```ts
{
  pid,
  observed: {
    cast: string[],
    place: string[],
    time: string[]
  },
  state: {
    active_cast: string[],
    primary_place?: string
  },
  transitions: {
    cast_enter: string[],
    cast_exit_candidates: string[],
    place_set?: string,
    place_shift?: { from: string, to: string },
    time_signals: string[]
  }
}
```

Interpretation:

- `active_cast` is not a human gold annotation; it is an internal feature used to detect scene changes.
- `primary_place` is also an internal feature.
- These internal features should not be annotated by humans in the new study.

## 6. Existing Implementation: STATE.2

Existing file:

```text
src/lib/pipeline/state2.ts
```

Role:

`STATE.2` uses an LLM to validate and normalize `STATE.1` frames into scene-facing paragraph states.

Inputs:

- `StateFrames`
- `EntityGraph`
- `RawChapter`
- `ContentUnits`
- `LLMClient`

Output:

- `RefinedStateFrames`

Important output fields:

```ts
interface ValidatedFrame {
  pid: number
  is_narrative: boolean
  validated_state: {
    current_place?: string | null
    mentioned_place?: string | null
    active_cast: string[]
  }
  actions: Array<unknown>
}
```

Interpretation:

- `STATE.2` decides whether each paragraph is narrative text.
- It maps internal entity ids to canonical names.
- It gives `STATE.3` validated place and cast state for boundary scoring.

For the new project:

- If implementing from scratch is too expensive, allow importing `STATE.2` and `STATE.3` JSON from the existing repo.
- If reimplementing, keep `STATE.2` optional and allow a simple text-only baseline plus imported predictions.

## 7. Existing Implementation: STATE.3

Existing file:

```text
src/lib/pipeline/state3.ts
```

Role:

`STATE.3` is the current scene boundary detector. It is rule-based, with optional LLM scene title generation.

Inputs:

- `RefinedStateFrames` from `STATE.2`
- optional `StateFrames` from `STATE.1`
- optional `LLMClient` for title generation
- optional `paragraphMap`

Output:

```ts
interface SceneBoundaries {
  stage_id: "STATE.3"
  method: "rule"
  boundaries: BoundaryCandidate[]
  scenes: SceneSpan[]
  scene_titles: Record<string, string>
}

interface BoundaryCandidate {
  boundary_before_pid: number
  score: number
  label: "scene_boundary" | "weak_boundary_candidate"
  reasons: BoundaryReason[]
}

interface SceneSpan {
  scene_id: string
  start_pid: number
  end_pid: number
}
```

Boundary reason types:

```ts
type BoundaryReasonType =
  | "place_shift"
  | "place_set_after_previous_place"
  | "cast_turnover"
  | "time_signal"
```

Current scoring constants:

```ts
const SCORE_PLACE_SHIFT = 4.0
const SCORE_PLACE_SET_AFTER = 2.0
const SCORE_CAST_HIGH = 2.0
const SCORE_CAST_MED = 1.0
const SCORE_TIME_SIGNAL = 1.0

const LABEL_SCENE = 4.0
const LABEL_WEAK = 3.0
const MIN_SCENE_LEN = 2
```

Boundary scoring logic:

- Compare adjacent narrative frames.
- Add 4.0 if current place differs from previous place.
- Add 2.0 if a place is re-established after previous place context.
- Add 2.0 for large cast turnover.
- Add 1.0 for medium cast turnover.
- Add 1.0 when time signals are detected at the current paragraph.
- Label as `scene_boundary` if score is at least 4.0.
- Label as `weak_boundary_candidate` if score is at least 3.0.
- Resolve nearby competing candidates.
- Keep only final `scene_boundary` pids for scene spans.
- Enforce minimum scene length of 2 narrative paragraphs.

The output `scenes` are the predicted chunks that should be compared against human segmentation.

## 8. Existing API Endpoint For STATE.3

Existing file:

```text
src/app/api/pipeline/state3/route.ts
```

Current route behavior:

- Loads raw chapter.
- Loads `STATE.2`.
- Optionally loads `STATE.1`.
- Runs `runBoundaryDetection`.
- Saves `STATE.3`.

Request body concept:

```ts
{
  docId: string
  chapterId: string
  runId: string
  parents?: Record<string, string>
  generateTitles?: boolean
}
```

For evaluation, title generation is unnecessary. Prefer `generateTitles: false` when producing segmentation predictions.

## 9. Existing SCENE.1 Is Not The Main Target

Existing file:

```text
src/lib/pipeline/scene1.ts
```

`SCENE.1` converts `STATE.3.scenes` into downstream scene packets:

- scene text with pid markers
- start/end state
- cast union
- current/mentioned places
- time signals
- weak phase markers

This can be useful for visualization or debugging, but the thesis evaluation can stop at `STATE.3.scenes`.

The new project does not need to implement the full `SCENE.1` packet builder unless a visual comparison panel needs the scene text grouped into chunks.

## 10. Human Annotation Task

Annotators should be asked only to mark scene boundaries.

Main instruction:

> Read the chapter as paragraph-numbered text. Mark a boundary before a paragraph when you think a new scene begins.

Do not ask annotators to:

- select important entities
- label all characters
- label places
- summarize scenes
- mark causal links
- mark goals or relations

Optional lightweight field:

When an annotator marks a boundary, allow them to choose one reason:

```text
place_change
time_change
cast_change
event_or_goal_change
narrative_focus_change
other
unsure
```

This optional reason is only for later error analysis. It should not be required for the main boundary metric.

## 11. Annotation Guideline For Participants

Give annotators a short guide like this:

```text
Your task is to divide the text into scenes.

Mark a new scene boundary when the story appears to move into a meaningfully new scene. Useful signals include:

1. The place changes.
2. The time changes or the narration jumps.
3. The active characters change substantially.
4. The main local event, goal, or situation changes.
5. The narration shifts into a different remembered, imagined, or reported situation.

Do not mark a boundary for every small paragraph transition.
Do not annotate characters, places, summaries, or themes.
If uncertain, choose the boundary position that best helps a reader treat each resulting chunk as one coherent scene.
```

Important wording:

- Use "scene-like chunk" if "scene" feels too strict for literary prose.
- Tell annotators that no single perfect answer is expected.
- The study measures human-like segmentation behavior, not objective film-scene boundaries.

## 12. Annotation Data Format

Recommended raw document format:

```json
{
  "doc_id": "alice",
  "title": "Alice's Adventures in Wonderland",
  "chapters": [
    {
      "chapter_id": "ch01",
      "chapter_index": 1,
      "title": "Down the Rabbit-Hole",
      "paragraphs": [
        { "pid": 1, "text": "Alice was beginning to get very tired..." },
        { "pid": 2, "text": "..." }
      ]
    }
  ]
}
```

Recommended human annotation format:

```json
{
  "annotation_id": "alice_ch01_annotator_a_v1",
  "doc_id": "alice",
  "chapter_id": "ch01",
  "annotator_id": "annotator_a",
  "created_at": "2026-05-20T00:00:00.000Z",
  "boundary_before_pids": [7, 14, 23],
  "boundary_reasons": {
    "7": "place_change",
    "14": "event_or_goal_change",
    "23": "time_change"
  },
  "notes": {
    "14": "Could also be a focus shift."
  }
}
```

Recommended scene span representation derived from boundaries:

```json
{
  "doc_id": "alice",
  "chapter_id": "ch01",
  "scenes": [
    { "scene_id": "scene_01", "start_pid": 1, "end_pid": 6 },
    { "scene_id": "scene_02", "start_pid": 7, "end_pid": 13 },
    { "scene_id": "scene_03", "start_pid": 14, "end_pid": 22 }
  ]
}
```

Store boundaries as the primary annotation. Scene spans can always be derived from boundaries and paragraph ranges.

## 13. Multi-Annotator Gold Standard

Use multiple annotators on the same chapters. Build a consensus gold boundary set with tolerance-based voting.

Recommended process:

1. Convert each annotator's scene spans into `boundary_before_pid[]`.
2. Collect all boundary pids for one chapter.
3. Cluster nearby boundaries.
4. Keep clusters with majority support.
5. Select one consensus boundary position per accepted cluster.
6. Save confidence metadata.

### 13.1 Boundary Clustering

Use a one-paragraph tolerance around a possible center.

Practical rule:

- A cluster may include boundary pids if there exists a center pid `c` such that every boundary in the cluster satisfies `abs(boundary_pid - c) <= 1`.
- Equivalently, a cluster width should normally be at most 2 pids.

Examples:

```text
[10, 10, 11] -> one cluster
[10, 11, 12] -> one cluster centered around 11
[10, 13] -> not one cluster
```

If uncertain, prefer conservative clustering. Do not merge two clearly different scene transitions just because they are near each other in a dense passage.

### 13.2 Majority Vote

For `N` annotators, accept a boundary cluster if at least `ceil(N / 2)` annotators marked a boundary in that cluster.

Recommended thresholds:

```text
3 annotators -> at least 2 votes
4 annotators -> at least 3 votes if possible, 2 votes can be ambiguous
5 annotators -> at least 3 votes
```

For a thesis MVP, 3 annotators is efficient and defensible.

### 13.3 Consensus Boundary Position

The gold standard needs one exact boundary pid.

Recommended rule:

1. If one pid has the most votes, use that pid.
2. Otherwise use the median pid.
3. If the median falls between two paragraph pids, choose the earlier pid by default.
4. Mark `position_confidence` as low when the position required tie-breaking.
5. Optionally allow an adjudicator to override ambiguous cases.

Examples:

```text
Annotator A: before P10
Annotator B: before P11
Annotator C: before P10

Cluster pids: [10, 11, 10]
Gold boundary: before P10
Vote count: 3/3
Position confidence: high
```

```text
Annotator A: before P10
Annotator B: before P11
Annotator C: no nearby boundary

Cluster pids: [10, 11]
Gold boundary: before P10
Vote count: 2/3
Position confidence: low
```

```text
Annotator A: before P10
Annotator B: before P11
Annotator C: before P12

Cluster pids: [10, 11, 12]
Gold boundary: before P11
Vote count: 3/3
Position confidence: medium
```

### 13.4 Consensus Gold Format

```json
{
  "doc_id": "alice",
  "chapter_id": "ch01",
  "annotator_count": 3,
  "tolerance_for_clustering": 1,
  "gold_boundaries": [
    {
      "boundary_before_pid": 10,
      "votes": 3,
      "annotator_count": 3,
      "annotator_pids": [10, 11, 10],
      "confidence": "unanimous",
      "position_confidence": "high"
    },
    {
      "boundary_before_pid": 22,
      "votes": 2,
      "annotator_count": 3,
      "annotator_pids": [22, 23],
      "confidence": "majority",
      "position_confidence": "low"
    }
  ],
  "ambiguous_boundaries": [
    {
      "candidate_center_pid": 35,
      "votes": 1,
      "annotator_count": 3,
      "annotator_pids": [35],
      "reason": "below_majority"
    }
  ]
}
```

Recommended confidence labels:

```text
unanimous: all annotators support the cluster
strong: all but one support the cluster
majority: minimum majority support
ambiguous: below majority or conflicting nearby clusters
```

Main evaluation should use majority-or-higher gold boundaries. Ambiguous candidates should be saved for analysis but excluded from the main gold set.

## 14. Human-Human Agreement

Report human-human agreement to show how reliable and subjective the task is.

Do not claim that human agreement proves an absolute ground truth. Instead, use it as a reference point:

> Scene boundaries are not always objectively unique, so we report pairwise human-human agreement as a reference point for interpreting automatic segmentation performance.

Compute pairwise boundary F1 with one-paragraph tolerance:

```text
A vs B
A vs C
B vs C
mean and standard deviation
```

Also report:

- Exact boundary F1, optional.
- Boundary F1 with `±1 paragraph`, main.
- Unanimous / majority / ambiguous boundary ratios.

Example table:

```text
| Agreement Type | Boundary F1 exact | Boundary F1 ±1 |
| --- | ---: | ---: |
| Human-Human Avg. | 0.61 | 0.78 |
```

Example consensus table:

```text
| Gold Boundary Type | Ratio |
| --- | ---: |
| Unanimous | 42% |
| Majority | 46% |
| Ambiguous excluded | 12% |
```

This gives a "human reference line" for automatic methods.

## 15. Experimental Conditions

Compare three methods against the same human consensus gold.

### 15.1 Fixed-Size Baseline

Purpose:

- Shows how a non-scene-aware chunking strategy performs.

Implementation:

- Split every `k` narrative paragraphs.
- Try one default such as `k = 5`.
- Optionally tune `k` to match the average human scene length on a small dev set.

Prediction format:

```json
{
  "method": "fixed_size_k5",
  "doc_id": "alice",
  "chapter_id": "ch01",
  "boundary_before_pids": [6, 11, 16, 21],
  "params": { "k": 5 }
}
```

### 15.2 LLM Text-Only Baseline

Purpose:

- Shows what a general LLM does when asked to segment the text directly, without the explicit state-change pipeline.

Prompt behavior:

- Input: paragraph-numbered chapter text.
- Output: JSON boundary pids only.
- Do not provide entity/state features.
- Do not provide the proposed method's boundary reasons.

Suggested prompt:

```text
You are segmenting a literary chapter into scene-like chunks.

Given paragraphs with ids, mark the paragraph ids where a new scene begins.
Return only JSON:

{
  "boundary_before_pids": [<pid>, <pid>],
  "rationale": {
    "<pid>": "<short reason>"
  }
}

Do not create a boundary for every paragraph. Use boundaries only when the scene-like situation changes substantially.

Paragraphs:
...
```

If time is too short, this baseline can be omitted. But including it makes the result more persuasive because it compares against a strong text-only model.

### 15.3 Ours: Scene-Aware Chunking

Purpose:

- Main proposed method.

Implementation options:

1. Import existing `STATE.3` JSON from the current repo.
2. Or reimplement the current rule-based `STATE.3` logic in the new project.

The method uses internal features:

- current place
- active cast
- cast turnover
- time signals
- narrative paragraph filtering

It predicts:

- boundary candidates
- scene boundaries
- scene spans
- reasons and scores

Prediction format:

```json
{
  "method": "scene_aware_state3",
  "doc_id": "alice",
  "chapter_id": "ch01",
  "boundary_before_pids": [7, 14, 23],
  "boundaries": [
    {
      "boundary_before_pid": 7,
      "score": 4,
      "label": "scene_boundary",
      "reasons": [
        { "type": "place_shift", "from_place": "riverbank", "to_place": "rabbit-hole" }
      ]
    }
  ],
  "scenes": [
    { "scene_id": "scene_01", "start_pid": 1, "end_pid": 6 },
    { "scene_id": "scene_02", "start_pid": 7, "end_pid": 13 }
  ]
}
```

## 16. Optional Ablation Conditions

If time permits, add ablations. These are useful for explaining what drives performance.

Recommended ablations:

```text
Ours-place-only
Ours-place+cast
Ours-place+cast+time
```

Since current `STATE.3` has explicit scoring components, ablation is conceptually simple:

- place-only: use `place_shift` and `place_set_after_previous_place`
- place+cast: add `cast_turnover`
- full: add `time_signal`

Report ablation in a smaller secondary table.

Example:

```text
| Method | Boundary F1 ±1 | WindowDiff ↓ |
| --- | ---: | ---: |
| Place only | ... | ... |
| Place + Cast | ... | ... |
| Place + Cast + Time | ... | ... |
```

## 17. Main Evaluation Metrics

Use boundary-level and segmentation-level metrics.

### 17.1 Boundary Precision, Recall, F1

Main metric:

- Boundary F1 with `±1 paragraph` tolerance.

Secondary metric:

- Exact boundary F1.

Matching rule:

1. Sort predicted boundaries.
2. Sort gold boundaries.
3. A prediction is correct if it matches an unmatched gold boundary within tolerance.
4. Prefer the nearest unmatched gold boundary.
5. Each gold boundary can be matched at most once.

Definitions:

```text
TP = matched predicted boundaries
FP = predicted boundaries not matched to gold
FN = gold boundaries not matched by prediction

Precision = TP / (TP + FP)
Recall = TP / (TP + FN)
F1 = 2PR / (P + R)
```

Compute for:

```text
tolerance = 0
tolerance = 1
tolerance = 2 optional
```

Use `tolerance = 1` as the main paper result.

### 17.2 Mean Boundary Distance

For each predicted boundary, find the nearest gold boundary distance.

For each gold boundary, find the nearest predicted boundary distance.

Report:

- mean nearest distance
- median nearest distance

This helps explain whether errors are near misses or entirely wrong boundaries.

### 17.3 Scene Count Error

Scene count error:

```text
abs(predicted_scene_count - gold_scene_count)
```

Normalized version:

```text
abs(predicted_scene_count - gold_scene_count) / gold_scene_count
```

This catches over-segmentation and under-segmentation.

### 17.4 WindowDiff And Pk

If implementation time allows, include one standard segmentation metric:

- WindowDiff
- Pk

WindowDiff is often easier to explain:

> It slides a window over the paragraph sequence and checks whether the predicted and gold segmentations contain the same number of boundaries in each window.

Use a window size around half the average gold scene length.

If WindowDiff/Pk implementation is risky, prioritize boundary F1 and scene count error. Those are easier to defend in a short thesis.

## 18. Main Result Tables

Minimum result table:

```text
| Method | Boundary P ±1 | Boundary R ±1 | Boundary F1 ±1 | Scene Count Error ↓ |
| --- | ---: | ---: | ---: | ---: |
| Fixed-size baseline | ... | ... | ... | ... |
| LLM text-only baseline | ... | ... | ... | ... |
| Ours: scene-aware chunking | ... | ... | ... | ... |
```

Better result table:

```text
| Method | Exact F1 | F1 ±1 | Mean Boundary Distance ↓ | WindowDiff ↓ | Scene Count Error ↓ |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fixed-size baseline | ... | ... | ... | ... | ... |
| LLM text-only baseline | ... | ... | ... | ... | ... |
| Ours | ... | ... | ... | ... | ... |
```

Human reference table:

```text
| Reference | Boundary F1 ±1 |
| --- | ---: |
| Human-Human Avg. | ... |
| Fixed-size baseline | ... |
| LLM text-only baseline | ... |
| Ours | ... |
```

Gold confidence table:

```text
| Consensus Type | Count | Ratio |
| --- | ---: | ---: |
| Unanimous | ... | ... |
| Majority | ... | ... |
| Ambiguous excluded | ... | ... |
```

## 19. Error Analysis

After computing metrics, sample false positives and false negatives.

False positive:

- System predicted a boundary, but human gold did not.

False negative:

- Human gold has a boundary, but system did not predict one.

Recommended error categories:

```text
place_not_changed_but_event_changed
place_changed_but_humans_kept_same_scene
gradual_cast_turnover
dialogue_without_clear_place_signal
time_shift_or_flashback
llm_state_validation_error
entity_resolution_error
non_narrative_or_chapter_formatting_noise
ambiguous_human_boundary
```

Use current `STATE.3.boundaries[].reasons` to explain system behavior:

```text
Boundary P42 predicted because:
- place_shift: "hall" -> "garden"
- cast_turnover delta: 0.8
```

Qualitative examples should include:

1. One clearly successful boundary.
2. One near miss within one paragraph.
3. One false positive.
4. One false negative.

These examples are useful in the thesis even if the quantitative score is moderate.

## 20. Recommended New Project Structure

This can be a standalone Next.js app, a local React app, or a Python-assisted evaluation tool. For speed, use a web UI for annotation and local JSON files for data.

Recommended structure:

```text
scene-chunking-eval/
  README.md
  package.json
  src/
    app/
      page.tsx
      api/
        documents/
        annotations/
        consensus/
        predictions/
        evaluate/
    components/
      DocumentSelector.tsx
      ChapterSelector.tsx
      AnnotationWorkspace.tsx
      BoundaryMarker.tsx
      ConsensusBuilder.tsx
      PredictionImporter.tsx
      MetricsTable.tsx
      BoundaryTimeline.tsx
      ErrorAnalysisPanel.tsx
    lib/
      segmentation/
        boundaries.ts
        fixed-size.ts
        state3-import.ts
        llm-baseline.ts
      evaluation/
        boundary-match.ts
        consensus.ts
        windowdiff.ts
        human-agreement.ts
        export.ts
      data/
        load-json.ts
        save-json.ts
    types/
      document.ts
      annotation.ts
      prediction.ts
      evaluation.ts
  data/
    documents/
    annotations/
    consensus/
    predictions/
    results/
  docs/
    annotation-guideline.md
    experiment-protocol.md
```

If building in Next.js, use App Router routes. If the project uses the same Next.js version family as the current repo, read the local Next docs in `node_modules/next/dist/docs/` before coding because the current repo has a warning that this version may differ from older Next conventions.

## 21. UI Requirements

### 21.1 Home / Study Dashboard

Show:

- document list
- chapter list
- annotator id input
- progress by annotator
- buttons:
  - annotate
  - build consensus
  - import predictions
  - evaluate
  - export results

Keep the UI utilitarian. This is a research tool, not a landing page.

### 21.2 Annotation Workspace

Main layout:

- Left or center: paragraph list.
- Each paragraph displays:
  - `P{pid}`
  - paragraph text
  - boundary toggle before the paragraph, except first paragraph
- Right panel:
  - selected boundary list
  - optional reason dropdown
  - notes
  - save status

Boundary interaction:

- Clicking the space before a paragraph toggles `boundary_before_pid`.
- Boundary marker should be visually clear but not intrusive.
- Show resulting scene numbers between boundaries.
- Allow undo or click again to remove.

Keyboard shortcuts optional:

```text
j / k: move paragraph focus
b: toggle boundary before focused paragraph
s: save
```

Do not require keyboard shortcuts for MVP.

### 21.3 Consensus Builder View

Show one chapter at a time.

For each candidate cluster:

- cluster center
- annotator pids
- vote count
- confidence
- chosen gold pid
- accept/reject/adjudicate controls

Visualization:

```text
P08 P09 | P10 P11 P12 | P13
        A,B     C
Gold: before P10
```

Allow manual override for ambiguous clusters.

### 21.4 Prediction Import View

Allow importing:

- fixed-size baseline generated by the app
- LLM baseline JSON
- existing `STATE.3` JSON from current repo

For imported `STATE.3`, map:

```ts
prediction.boundary_before_pids = state3.scenes.slice(1).map(scene => scene.start_pid)
```

or:

```ts
prediction.boundary_before_pids = state3.boundaries
  .filter(b => b.label === "scene_boundary")
  .map(b => b.boundary_before_pid)
```

Prefer using `state3.scenes.slice(1).map(start_pid)` for final segmentation evaluation because it reflects post-processing and minimum scene length enforcement.

### 21.5 Evaluation View

Show:

- method comparison table
- chapter-level table
- human-human agreement table
- boundary timeline overlay
- false positive / false negative lists

Timeline overlay should compare:

```text
Gold:   P01 ---- | P07 ---- | P14 ---- | P23
Ours:   P01 ----- | P08 --- | P14 ------ | P24
Fixed:  P01 -- | P06 -- | P11 -- | P16 -- | P21
```

## 22. Core Evaluation Functions

### 22.1 Convert Boundaries To Scenes

Input:

- sorted paragraph pids
- boundary_before_pids

Output:

- scene spans

Pseudo-code:

```ts
function boundariesToScenes(pids: number[], boundaries: number[]): SceneSpan[] {
  const sortedPids = [...pids].sort((a, b) => a - b)
  const starts = [sortedPids[0], ...boundaries.sort((a, b) => a - b)]
  return starts.map((start, index) => {
    const nextStart = starts[index + 1]
    const end = nextStart === undefined
      ? sortedPids[sortedPids.length - 1]
      : sortedPids[sortedPids.indexOf(nextStart) - 1]
    return { scene_id: `scene_${String(index + 1).padStart(2, "0")}`, start_pid: start, end_pid: end }
  })
}
```

### 22.2 Convert Scenes To Boundaries

```ts
function scenesToBoundaries(scenes: SceneSpan[]): number[] {
  return scenes
    .slice(1)
    .map(scene => scene.start_pid)
    .sort((a, b) => a - b)
}
```

### 22.3 Boundary Matching

Pseudo-code:

```ts
function matchBoundaries(pred: number[], gold: number[], tolerance: number) {
  const sortedPred = [...pred].sort((a, b) => a - b)
  const unmatchedGold = new Set(gold)
  const matches = []
  const falsePositives = []

  for (const p of sortedPred) {
    const candidates = [...unmatchedGold]
      .filter(g => Math.abs(p - g) <= tolerance)
      .sort((a, b) => Math.abs(p - a) - Math.abs(p - b))

    if (candidates.length === 0) {
      falsePositives.push(p)
      continue
    }

    const g = candidates[0]
    unmatchedGold.delete(g)
    matches.push({ pred: p, gold: g, distance: Math.abs(p - g) })
  }

  return {
    matches,
    falsePositives,
    falseNegatives: [...unmatchedGold]
  }
}
```

### 22.4 Metrics

```ts
function boundaryMetrics(pred: number[], gold: number[], tolerance: number) {
  const result = matchBoundaries(pred, gold, tolerance)
  const tp = result.matches.length
  const fp = result.falsePositives.length
  const fn = result.falseNegatives.length
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { tp, fp, fn, precision, recall, f1 }
}
```

## 23. Data Split

If tuning thresholds, avoid tuning on the same chapters used for final reporting.

Minimal split:

```text
Dev: 2 chapters
Test: remaining chapters
```

If there are too few chapters, do not tune. Use the existing `STATE.3` constants and report as fixed.

Recommended thesis wording:

> We did not train a model. We used a fixed rule-based segmentation method and compared it with human consensus boundaries.

If tuning fixed-size `k`, choose `k` based on dev set average human scene length, then evaluate on test.

## 24. Suggested Timeline

### Day 1

- Create new project.
- Add document/chapter/paragraph JSON schema.
- Add annotation schema.
- Add sample data.

### Day 2-3

- Build annotation UI.
- Save/load annotation JSON.
- Test with one chapter and one annotator.

### Day 4-5

- Collect annotations from 3 people for 3-5 chapters.
- Implement consensus gold builder.
- Export consensus JSON.

### Day 6-7

- Implement fixed-size baseline.
- Implement import of existing `STATE.3` predictions.
- Optional: implement LLM text-only baseline.

### Day 8-9

- Implement boundary F1 exact and `±1`.
- Implement scene count error and mean boundary distance.
- Optional: implement WindowDiff.

### Day 10-11

- Run full evaluation on available chapters.
- Produce method comparison CSV and Markdown table.

### Day 12-14

- Add human-human agreement.
- Add consensus confidence summary.
- Add error analysis panel.

### Final days

- Freeze data.
- Export figures/tables.
- Write thesis method/evaluation sections.

## 25. Minimum Deliverables

The project is successful if it produces:

1. Human annotation JSON for each chapter.
2. Consensus gold JSON for each chapter.
3. Prediction JSON for:
   - fixed-size baseline
   - ours / `STATE.3`
   - LLM text-only baseline if possible
4. Metrics CSV.
5. Method comparison Markdown table.
6. Human-human agreement table.
7. Error analysis examples.

Minimum result files:

```text
data/results/method_summary.csv
data/results/chapter_metrics.csv
data/results/human_agreement.csv
data/results/gold_confidence_summary.csv
data/results/error_cases.json
data/results/paper_tables.md
```

## 26. Thesis Framing

Recommended method section:

```text
We first preprocess each chapter into paragraph-level units. Our method tracks narrative state over paragraphs using entity-derived cast, place, and time signals. A scene boundary is predicted when adjacent paragraph states show a sufficiently strong shift, such as a location change, cast turnover, or explicit time signal. The output is a sequence of scene-like chunks represented by paragraph id spans.
```

Recommended evaluation section:

```text
To evaluate whether the resulting chunks align with human scene judgments, we collected manual scene boundary annotations from multiple annotators. Annotators were asked only to mark scene boundaries, not to label entities or intermediate state variables. We constructed a consensus gold standard by clustering human boundaries within a one-paragraph window and retaining majority-supported clusters. We compare each automatic method against this consensus using boundary precision, recall, and F1 with a one-paragraph tolerance, along with scene count error and segmentation-level metrics.
```

Recommended human agreement wording:

```text
Because scene boundaries in literary prose can be subjective, we report pairwise human-human agreement as a reference point for interpreting model performance.
```

Recommended result interpretation:

```text
The goal is not to show that automatic segmentation perfectly matches a single objective boundary set. Instead, the evaluation measures whether scene-aware state-change signals produce chunks closer to human scene segmentation than simple length-based chunking and text-only segmentation baselines.
```

## 27. Risks And Mitigations

### Risk: Annotation is inconsistent.

Mitigation:

- Report human-human agreement.
- Use consensus gold.
- Exclude ambiguous below-majority boundaries from main evaluation.

### Risk: Scores are not high.

Mitigation:

- Compare against fixed-size baseline.
- Show near-miss tolerance results.
- Include qualitative examples.
- Emphasize scene segmentation subjectivity.

### Risk: `STATE.3` over-segments.

Mitigation:

- Report scene count error.
- Inspect false positives.
- Consider dev-only threshold adjustment if time allows.

### Risk: `STATE.3` misses event changes without place/cast/time changes.

Mitigation:

- Use error category `place_not_changed_but_event_changed`.
- State this as a limitation and future work.

### Risk: Too much time is spent building a polished app.

Mitigation:

- Prioritize JSON import/export and metric correctness.
- UI only needs to support annotation and result inspection.

## 28. Non-Negotiable Scope Boundaries

Do not expand into KG or QA before the segmentation evaluation is complete.

Do not ask humans to annotate entities unless a separate later study is created.

Do not present reader support as the main thesis system.

Do not evaluate generated hints.

Do not make the final claim broader than the evidence:

Good claim:

> Scene-aware state-change chunking better approximates human scene segmentation than simple fixed-size chunking.

Too broad:

> The system understands stories.

Too broad:

> The system improves reader comprehension.

Too broad:

> The method builds a complete narrative knowledge graph.

## 29. Final Implementation Priority

If time is very short, implement in this order:

1. Annotation UI for boundary marking.
2. Consensus gold builder.
3. Fixed-size baseline.
4. Import existing `STATE.3` predictions.
5. Boundary F1 exact and `±1`.
6. Human-human agreement.
7. Result export.
8. Error analysis.
9. LLM text-only baseline.
10. WindowDiff/Pk.

Stop after item 7 if needed. Items 1-7 are enough for a basic thesis evaluation.

