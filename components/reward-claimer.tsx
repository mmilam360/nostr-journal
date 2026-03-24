'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { fetchIncentiveSettings, fetchTodayProgress, markRewardClaimed, recordTransaction, updateStakeBalance } from '@/lib/incentive-nostr'
import { publishPayoutRecord } from '@/lib/incentive-payout'
import { CheckCircle, Target } from 'lucide-react'
import { toast } from 'sonner'

export function RewardClaimer({ userPubkey, wordCount, authData }: any) {
  const [status, setStatus] = useState<'loading' | 'not_met' | 'met' | 'claimed'>('loading')
  const [settings, setSettings] = useState<any>(null)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [wordCount])

  const checkStatus = async () => {
    const incentiveSettings = await fetchIncentiveSettings(userPubkey)
    if (!incentiveSettings) {
      setStatus('loading')
      return
    }

    setSettings(incentiveSettings)

    const dailyGoal = parseInt(
      incentiveSettings.tags.find((t: string[]) => t[0] === 'daily_word_goal')[1]
    )

    const today = new Date().toISOString().split('T')[0]
    const todayProgress = await fetchTodayProgress(userPubkey, today)

    if (todayProgress?.tags.some((t: string[]) => t[0] === 'reward_claimed' && t[1] === 'true')) {
      setStatus('claimed')
      return
    }

    if (wordCount >= dailyGoal) {
      setStatus('met')
    } else {
      setStatus('not_met')
    }
  }

  const handleClaim = async () => {
    setClaiming(true)
    try {
      // Call backend to send reward
      const dailyReward = parseInt(
        settings.tags.find((t: string[]) => t[0] === 'daily_reward_sats')[1]
      )
      const lightningAddress = settings.tags.find((t: string[]) => t[0] === 'lightning_address')?.[1]

      if (!lightningAddress) {
        throw new Error('Missing Lightning address for user')
      }

      const response = await fetch('/api/incentive/send-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          date: new Date().toISOString().split('T')[0],
          lightningAddress,
          dailyRewardSats: dailyReward
        })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to claim reward')
      }

      // Mark as claimed in Nostr
      const today = new Date().toISOString().split('T')[0]
      const payoutDate = result.date || today

      try {
        await publishPayoutRecord({
          userPubkey,
          date: payoutDate,
          amountSats: result.amountSats,
          preimage: result.preimage,
          authData
        })
      } catch (error) {
        console.error('[RewardClaimer] ❌ Failed to publish payout record:', error)
      }

      await markRewardClaimed(
        userPubkey,
        payoutDate,
        result.paymentHash,
        result.amountSats,
        authData
      )

      // Record transaction
      await recordTransaction(
        userPubkey,
        'reward_payout',
        result.amountSats,
        result.paymentHash,
        authData
      )

      // Update stake balance
      const currentBalance = parseInt(
        settings.tags.find((t: string[]) => t[0] === 'stake_balance_sats')[1]
      )
      await updateStakeBalance(
        userPubkey,
        currentBalance - result.amountSats,
        authData
      )

      toast.success(`Reward claimed! ${result.amountSats} sats sent to your Lightning address`)
      setStatus('claimed')
    } catch (error: any) {
      toast.error(`Failed to claim reward: ${error.message}`)
      console.error(error)
    } finally {
      setClaiming(false)
    }
  }

  if (status === 'loading' || !settings) {
    return null
  }

  if (status === 'not_met') {
    const dailyGoal = parseInt(
      settings.tags.find((t: string[]) => t[0] === 'daily_word_goal')[1]
    )
    return (
      <Card className="p-4 bg-[#111] border-zinc-800">
        <p className="text-sm text-zinc-300">
          Keep writing! <span className="font-mono">{wordCount}</span> / <span className="font-mono">{dailyGoal}</span> words
        </p>
      </Card>
    )
  }

  if (status === 'claimed') {
    return (
      <Card className="p-4 bg-emerald-500/10 border-emerald-500/20">
        <p className="text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Today's reward claimed
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-4 bg-[#F7931A]/10 border-[#F7931A]/20">
      <p className="text-sm font-semibold mb-2 text-zinc-200 flex items-center gap-2">
        <Target className="w-4 h-4 text-[#F7931A]" />
        Goal achieved — claim your reward:
      </p>
      <Button 
        onClick={handleClaim}
        disabled={claiming}
        className="w-full"
      >
        {claiming ? 'Claiming...' : 'Claim Reward'}
      </Button>
    </Card>
  )
}
