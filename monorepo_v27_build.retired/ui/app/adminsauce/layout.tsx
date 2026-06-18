import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "AdminSauce — Twisted Engine GM Portal",
  description: "Game Master tools and world management for Twisted Engine"
}

export default function AdminSauceLayout({
  children
}: {
  children: React.ReactNode
}) {
  return children
}
