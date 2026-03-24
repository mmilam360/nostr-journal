'use client'

import { Check, X, Zap, FileText, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface IncentiveSuccessMessageProps {
  amount: number
  dailyReward: number
  onClose: () => void
}

export function IncentiveSuccessMessage({
  amount,
  dailyReward,
  onClose
}: IncentiveSuccessMessageProps) {
  const daysOfRewards = Math.floor(amount / dailyReward)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card className="max-w-md w-full p-6 relative animate-in zoom-in duration-300 bg-[#0a0a0a] border-zinc-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
            <Check className="w-10 h-10 text-emerald-400" />
          </div>

          {/* Title and Amount */}
          <div>
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center justify-center gap-2">
              Payment Detected
              <Zap className="w-6 h-6 text-[#F7931A]" />
            </h2>
            <p className="text-zinc-400 mt-2">
              Your stake of <span className="font-mono font-semibold text-[#F7931A]">{amount.toLocaleString()} sats</span> has been automatically detected and confirmed.
            </p>
          </div>

          {/* Info Card */}
          <div className="w-full bg-[#111] border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-[#F7931A]" />
              <p className="text-sm font-semibold text-zinc-200">
                <span className="font-mono">{daysOfRewards}</span> days of rewards ready
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              <span className="font-mono">{dailyReward}</span> sats per day when you hit your goal
            </p>
          </div>

          {/* Next Steps */}
          <div className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg p-4">
            <p className="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#F7931A]" />
              How it works:
            </p>
            <ul className="text-sm text-zinc-400 space-y-1 text-left">
              <li>1. Write your journal entry</li>
              <li>2. Hit your word goal (tracked automatically)</li>
              <li className="flex items-center gap-1">3. Earn your daily reward <Zap className="w-3 h-3 text-[#F7931A] inline" /></li>
              <li>4. <strong className="text-zinc-200">Remember:</strong> Quitting forfeits your stake</li>
            </ul>
          </div>

          {/* CTA Button */}
          <Button
            onClick={onClose}
            className="w-full h-12 bg-[#F7931A] hover:bg-[#E8850F] text-black font-semibold"
          >
            Start Writing
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  )
}
