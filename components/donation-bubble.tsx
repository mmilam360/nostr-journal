"use client"

import { Zap } from "lucide-react"

interface DonationBubbleProps {
  onClick: () => void
}

export default function DonationBubble({ onClick }: DonationBubbleProps) {
  return (
    <div className="relative">
          <button
        onClick={onClick}
        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
        aria-label="Support development with Lightning"
      >
        <Zap className="w-4 h-4" />
        <span>Support</span>
          </button>
    </div>
  )
}
