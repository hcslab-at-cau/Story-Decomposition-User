import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import fs from "node:fs"

interface ServiceAccountLike {
  projectId?: string
  clientEmail?: string
  privateKey?: string
}

function readServiceAccount(): ServiceAccountLike | null {
  const rawPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (rawPath) {
    const parsed = JSON.parse(fs.readFileSync(rawPath, "utf8")) as Record<string, string>
    return {
      projectId: parsed.project_id ?? parsed.projectId,
      clientEmail: parsed.client_email ?? parsed.clientEmail,
      privateKey: parsed.private_key ?? parsed.privateKey,
    }
  }

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as Record<string, string>
    return {
      projectId: parsed.project_id ?? parsed.projectId,
      clientEmail: parsed.client_email ?? parsed.clientEmail,
      privateKey: parsed.private_key ?? parsed.privateKey,
    }
  }

  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (rawBase64) {
    const parsed = JSON.parse(Buffer.from(rawBase64, "base64").toString("utf8")) as Record<string, string>
    return {
      projectId: parsed.project_id ?? parsed.projectId,
      clientEmail: parsed.client_email ?? parsed.clientEmail,
      privateKey: parsed.private_key ?? parsed.privateKey,
    }
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }
  }

  return null
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n")
}

function getProjectId() {
  return process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
}

function buildCredential() {
  const serviceAccount = readServiceAccount()
  if (!serviceAccount) return applicationDefault()

  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error(
      "Firebase Admin service account is incomplete. Set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64, or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_PROJECT_ID.",
    )
  }

  return cert({
    projectId: serviceAccount.projectId,
    clientEmail: serviceAccount.clientEmail,
    privateKey: normalizePrivateKey(serviceAccount.privateKey),
  })
}

export function getAdminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  return initializeApp({
    credential: buildCredential(),
    projectId: getProjectId(),
  })
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp())
}

export function explainAdminCredentialError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes("Could not load the default credentials") ||
    message.includes("Firebase Admin service account") ||
    message.includes("Unable to detect a Project Id")
  ) {
    return new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_PROJECT_ID, or Google Application Default Credentials.",
    )
  }
  return error instanceof Error ? error : new Error(message)
}
