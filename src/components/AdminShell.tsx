"use client"

import { BarChart3, Database, Gauge, LogOut, PlayCircle } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"

import { LanguageSelect } from "@/components/LanguageSelect"
import { useLanguage } from "@/components/LanguageProvider"

const navItems = [
  { href: "/admin", labelKey: "overview", icon: Gauge },
  { href: "/admin/documents", labelKey: "documents", icon: Database },
  { href: "/admin/pipeline", labelKey: "pipeline", icon: PlayCircle },
  { href: "/admin/dashboard", labelKey: "dashboard", icon: BarChart3 },
] as const

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()

  function logout() {
    localStorage.removeItem("scene_chunking_identity")
    router.push("/")
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Scene Eval</strong>
          <span className="subtle">{t("admin")}</span>
        </div>
        <LanguageSelect compact />
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link className={active ? "active" : ""} href={item.href} key={item.href}>
                <Icon size={18} />
                {t(item.labelKey)}
              </Link>
            )
          })}
          <button className="button secondary" onClick={logout} type="button">
            <LogOut size={17} />
            {t("logout")}
          </button>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
