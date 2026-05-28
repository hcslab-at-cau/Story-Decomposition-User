"use client"

import { LogIn } from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"

import { LanguageSelect } from "@/components/LanguageSelect"
import { useLanguage } from "@/components/LanguageProvider"

export default function LoginPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [userId, setUserId] = useState("user01")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setStatus("")

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, password }),
      })
      const data = (await response.json()) as {
        user?: { id: string; role: "user" | "admin"; display_name: string }
        error?: string
      }

      if (!response.ok || !data.user) {
        throw new Error(data.error ?? t("loginFailed"))
      }

      localStorage.setItem(
        "scene_chunking_identity",
        JSON.stringify({
          role: data.user.role,
          id: data.user.id,
          name: data.user.id,
          displayName: data.user.display_name,
        }),
      )
      if (data.user.role === "admin") {
        router.push("/admin")
      } else {
        router.push(`/annotate?annotatorId=${encodeURIComponent(data.user.id)}`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("loginFailed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <LanguageSelect />
        <h1 className="title">{t("loginTitle")}</h1>
        <p className="subtle">{t("loginSubtitle")}</p>

        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>{t("userId")}</span>
            <input
              autoComplete="username"
              className="input"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="user01"
            />
          </label>

          <label className="field">
            <span>{t("password")}</span>
            <input
              autoComplete="current-password"
              className="input"
              inputMode="numeric"
              maxLength={4}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
            />
          </label>

          <button className="button" disabled={loading} type="submit">
            <LogIn size={18} />
            {t("continue")}
          </button>
          {status ? <div className="notice">{status}</div> : null}
        </form>
      </section>
    </main>
  )
}
