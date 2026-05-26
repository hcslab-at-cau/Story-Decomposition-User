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
- `/annotate`: user-facing sentence-click boundary annotation workspace.

## Study Login

Local participant credentials live in `secrets/users.json`. The directory is intentionally git-ignored because it contains the 4-digit passwords used by the study login.

The first pass creates five user accounts: `user01`, `user02`, `user03`, `user04`, and `user05`.

## Firebase Import

`/admin/documents` can import source documents directly from the existing Firebase project. The API reads from `documents_v2` by default and can also read the legacy `documents` collection.

Only chapters with a saved `PRE.2` artifact are listed/imported. During import, `PRE.2.units` are used to keep story-text paragraphs and drop front matter, license text, and other non-story units from the user annotation view.

Set one of these server-side credential options before running the app:

- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_PROJECT_ID`

Imported Firestore chapters are normalized into the local `NarrativeDocument` shape and saved under `data/documents`.

## Data

Local research artifacts are stored under `data/`:

- `data/documents`: imported paragraph/chapter JSON.
- `data/annotations`: one annotation JSON per annotator/chapter.
- `data/consensus`: majority-vote gold boundary JSON.
- `data/predictions`: fixed-size and imported `STATE.3` prediction JSON.
- `data/results`: exported CSV/Markdown evaluation tables.
- `data/uploads`: uploaded source files.

The included `alice-sample` document lets the UI and metrics run without external data.
