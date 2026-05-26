"use client"

import { ArrowRight, BarChart3, Database, PlayCircle, Users } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"

import { useLanguage } from "@/components/LanguageProvider"

interface ProgressResponse {
  summary: {
    document_count: number
    chapter_count: number
    annotation_count: number
    consensus_count: number
    prediction_count: number
  }
}

export default function AdminOverviewPage() {
  const { t } = useLanguage()
  const [progress, setProgress] = useState<ProgressResponse | null>(null)

  useEffect(() => {
    fetch("/api/progress")
      .then((response) => response.json())
      .then((data: ProgressResponse) => setProgress(data))
      .catch(() => setProgress(null))
  }, [])

  const stats = progress?.summary

  return (
    <>
      <div className="topline">
        <div>
          <h1>{t("adminOverviewTitle")}</h1>
          <p className="subtle">{t("adminOverviewSubtitle")}</p>
        </div>
        <Link className="button" href="/annotate">
          <Users size={18} />
          {t("userPage")}
        </Link>
      </div>

      <section className="grid three">
        <Stat label={t("documents")} value={stats?.document_count ?? 0} />
        <Stat label={t("annotations")} value={stats?.annotation_count ?? 0} />
        <Stat label={t("predictions")} value={stats?.prediction_count ?? 0} />
      </section>

      <section className="grid three" style={{ marginTop: 16 }}>
        <ActionCard
          href="/admin/documents"
          icon={<Database size={22} />}
          title={t("documents")}
          text={t("overviewDocumentsText")}
        />
        <ActionCard
          href="/admin/pipeline"
          icon={<PlayCircle size={22} />}
          title={t("pipeline")}
          text={t("overviewPipelineText")}
        />
        <ActionCard
          href="/admin/dashboard"
          icon={<BarChart3 size={22} />}
          title={t("dashboard")}
          text={t("overviewDashboardText")}
        />
      </section>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="card stat">
      <span className="subtle">{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function ActionCard({
  href,
  icon,
  title,
  text,
}: {
  href: string
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <Link className="card" href={href}>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        {icon}
        <ArrowRight size={18} />
      </div>
      <h2>{title}</h2>
      <p className="subtle">{text}</p>
    </Link>
  )
}
