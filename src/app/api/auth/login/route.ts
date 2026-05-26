import { NextResponse } from "next/server"

import { authenticateStudyUser } from "@/lib/auth/users"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string
    password?: string
  }
  const id = body.id?.trim() ?? ""
  const password = body.password?.trim() ?? ""

  if (!id || !password) {
    return NextResponse.json({ error: "ID and password are required." }, { status: 400 })
  }

  const user = await authenticateStudyUser(id, password)

  if (!user) {
    return NextResponse.json({ error: "Invalid ID or password." }, { status: 401 })
  }

  return NextResponse.json({ user })
}
