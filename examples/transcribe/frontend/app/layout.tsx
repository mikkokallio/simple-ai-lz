import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Terveydenhuollon Transkriptio | Healthcare Transcription',
  description: 'AI-powered healthcare documentation assistant for Finnish healthcare providers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  )
}
