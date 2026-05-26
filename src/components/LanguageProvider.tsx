"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { DEFAULT_LANGUAGE, type Language, type TranslationKey, translate } from "@/lib/i18n"

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE)

  useEffect(() => {
    const storedLanguage = localStorage.getItem("scene_chunking_language")
    if (storedLanguage === "ko" || storedLanguage === "en") {
      setLanguageState(storedLanguage)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage(nextLanguage) {
        setLanguageState(nextLanguage)
        localStorage.setItem("scene_chunking_language", nextLanguage)
      },
      t(key, values) {
        return translate(language, key, values)
      },
    }),
    [language],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.")
  }

  return context
}
