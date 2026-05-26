import { timingSafeEqual } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

export interface StudyUser {
  id: string
  password: string
  role: "user" | "admin"
  display_name: string
}

const PROJECT_ROOT = process.env.INIT_CWD ?? process.cwd()
const USERS_SECRET_PATH = path.join(PROJECT_ROOT, "secrets", "users.json")

export async function readStudyUsers() {
  const raw = await readFile(USERS_SECRET_PATH, "utf8")
  const parsed = JSON.parse(raw) as { users?: StudyUser[] }
  return parsed.users ?? []
}

export async function authenticateStudyUser(id: string, password: string) {
  const users = await readStudyUsers()
  const user = users.find((candidate) => candidate.id === id)

  if (!user || !secureEqual(user.password, password)) {
    return null
  }

  return {
    id: user.id,
    role: user.role,
    display_name: user.display_name,
  }
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}
