import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { LanguageProvider } from "@/components/LanguageProvider"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Scene Chunking Eval",
  description: "Scene-aware chunking annotation and evaluation workbench",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
