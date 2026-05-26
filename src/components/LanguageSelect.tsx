"use client"

import { Languages } from "lucide-react"

import { useLanguage } from "@/components/LanguageProvider"

export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useLanguage()

  return (
    <label className={compact ? "language-select compact" : "field"}>
      <span>
        <Languages size={compact ? 15 : 16} />
        {t("language")}
      </span>
      <select
        className="select"
        value={language}
        onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "ko")}
      >
        <option value="ko">{t("korean")}</option>
        <option value="en">{t("english")}</option>
      </select>
    </label>
  )
}
