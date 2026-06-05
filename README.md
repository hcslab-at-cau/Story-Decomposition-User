# Story-Decomposition-User

Standalone workbench for thesis-oriented scene-aware chunking evaluation.

This project separates the workflow into two surfaces:

- `User`: annotators only read a paragraph-numbered chapter and mark scene boundaries.
- `Admin`: the researcher uploads documents, prepares predictions, builds consensus gold, checks progress, and exports evaluation tables.

The goal is not to build reader support, QA, RAG, or a knowledge graph. The goal is to produce reproducible evaluation data for paragraph-level scene-like chunking.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The UI supports Korean and English. Korean is the default language on first load.

## Pages

- `/`: study login. Enter an assigned user ID and 4-digit password.
- `/admin`: admin overview.
- `/admin/documents`: upload EPUB/plain text, import Firestore documents, and inspect available chapters.
- `/admin/pipeline`: build consensus, generate fixed-size predictions, import `STATE.3` JSON, and run evaluation.
- `/admin/dashboard`: monitor annotator progress and inspect result tables.
- `/annotate`: user-facing paragraph-level boundary annotation workspace.

## Study Login

Local participant credentials live in `secrets/users.json`. The directory is intentionally git-ignored because it contains the 4-digit passwords used by the study login.

Add participant accounts with `role: "user"` and keep the researcher account as `role: "admin"`. The admin dashboard derives its registered-user group from these user accounts, excluding any IDs that start with `test`.

For deployment, set `STUDY_USERS_JSON` as a server-side environment variable with the same JSON shape:

```json
{"users":[{"id":"user01","password":"1234","role":"user","display_name":"Participant 01"}]}
```

Do not use a `NEXT_PUBLIC_` prefix for this value.

On Vercel, add `STUDY_USERS_JSON` under Project Settings -> Environment Variables for the environments you deploy to, then redeploy. Locally, `secrets/users.json` remains the fallback when `STUDY_USERS_JSON` is not set.

## Firebase Import

`/admin/documents` can import source documents directly from the existing Firebase project. The API reads from `documents_v2` by default and can also read the legacy `documents` collection.

Only chapters with a saved `PRE.2` artifact are listed/imported. During import, `PRE.2.units` are used to keep story-text paragraphs and drop front matter, license text, and other non-story units from the user annotation view.

Set one of these server-side credential options before running the app:

- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_PROJECT_ID`

Imported Firestore chapters are normalized into the app's `NarrativeDocument` shape and saved through the configured study data store.

## Deployment Storage

On Vercel, the app stores study data in Firestore instead of writing to local files. This covers imported documents, uploaded document JSON, annotations, consensus gold, predictions, and the latest evaluation bundle.

Set these server-side environment variables:

- `STUDY_DATA_STORE=firebase`
- `STUDY_FIRESTORE_PREFIX=scene_chunking_eval` (optional; this is the default)
- Firebase Admin credentials from the Firebase section above

Firestore collections are created with the prefix:

- `scene_chunking_eval_documents`
- `scene_chunking_eval_annotations`
- `scene_chunking_eval_consensus`
- `scene_chunking_eval_predictions`
- `scene_chunking_eval_results`

User-study result logs are also written to a hierarchical Firestore path:

```text
studies/{studyId}
  participants/{participantId}
    sessions/{sessionId}
      sessionMeta/current
      readingEvents/{eventId}
      scaffoldEvents/{eventId}
      taskResponses/{responseId}
      surveyResponses/{responseId}
```

Defaults:

- `STUDY_ID=scene_boundary_annotation_v1`
- `STUDY_RESULTS_ROOT=studies`
- `STUDY_RESULTS_STORE` follows `STUDY_DATA_STORE` unless explicitly set
- `NEXT_PUBLIC_STUDY_ID=scene_boundary_annotation_v1`
- `NEXT_PUBLIC_STUDY_CONDITION=control`

The annotation page creates one session per participant/task/browser tab, buffers scroll and boundary interaction events client-side, and flushes them to `readingEvents` in batches. Annotation saves are mirrored to `taskResponses` as `scene_boundary_annotation` while the existing flat annotation store remains available for admin dashboards and evaluation scripts.

Local development still uses `data/` unless `STUDY_DATA_STORE=firebase` or `DATA_STORE=firebase` is set. On Vercel, Firestore is used by default because the deployed function filesystem is read-only except for temporary scratch space.

The pipeline page can import `STATE.3` predictions directly from the selected document's Firebase run. The document must have been imported from Firebase so the app can resolve its original `documents_v2/{doc}/chapters/{chapter}/runs` source.

## Data

When using the local filesystem store, research artifacts are stored under `data/`:

- `data/documents`: imported paragraph/chapter JSON.
- `data/annotations`: one annotation JSON per annotator/chapter.
- `data/consensus`: majority-vote gold boundary JSON.
- `data/predictions`: fixed-size and imported `STATE.3` prediction JSON.
- `data/results`: exported CSV/Markdown evaluation tables.
- `data/uploads`: uploaded source files.

The included `alice-sample` document lets the UI and metrics run without external data.
