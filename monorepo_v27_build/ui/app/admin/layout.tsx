import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "AdminSauce — Twisted Engine GM Portal",
  description: "Game Master tools and world management"
}

export default function AdminLayout({
  children
}: {
  children: React.ReactNode
}) {
  return children
}
