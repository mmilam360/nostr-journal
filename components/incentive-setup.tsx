'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { fetchIncentiveSettings, saveIncentiveSettings } from '@/lib/incentive-nostr'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { CheckCircle, Zap, Target, Wallet, ArrowRight, Copy, Loader2 } from 'lucide-react'

export function IncentiveSetup({ userPubkey, authData }: any) {
  const [step, setStep] = useState(1)
  const [settings, setSettings] = useState({
    dailyWordGoal: 500,
    dailyRewardSats: 500,
    lightningAddress: '',
    stakeAmount: 5000
  })
  const [depositInvoice, setDepositInvoice] = useState('')
  const [paymentHash, setPaymentHash] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'paying' | 'paid' | 'error'>('idle')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadExistingSettings()
  }, [])

  const loadExistingSettings = async () => {
    const existing = await fetchIncentiveSettings(userPubkey)
    if (existing) {
      // User already has settings
      setStep(5) // Skip to complete
    }
  }

  const handleCreateDeposit = async () => {
    setLoading(true)
    try {
      // Save settings first
      await saveIncentiveSettings(
        userPubkey,
        {
          dailyWordGoal: settings.dailyWordGoal,
          dailyRewardSats: settings.dailyRewardSats,
          stakeBalanceSats: 0,
          lightningAddress: settings.lightningAddress,
          createdDate: new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString().split('T')[0]
        },
        authData
      )

      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: settings.stakeAmount
        })
      })

      const { invoice, paymentHash: newPaymentHash } = await response.json()
      setDepositInvoice(invoice)
      setPaymentHash(newPaymentHash)
      setStep(4)
    } catch (error) {
      toast.error('Failed to create deposit invoice')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const pollPaymentConfirmation = async (hash: string) => {
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const res = await fetch('/api/incentive/check-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentHash: hash })
      })
      const data = await res.json()
      if (data.paid) {
        setStep(5)
        return
      }
    }
  }

  const handleWeblnPay = async () => {
    setPaymentStatus('paying')
    try {
      if (window.webln) {
        await window.webln.enable()
        await window.webln.sendPayment(depositInvoice)
        setPaymentStatus('paid')
        await pollPaymentConfirmation(paymentHash)
      } else {
        setPaymentStatus('error')
      }
    } catch (error: any) {
      console.error('webln payment error:', error)
      setPaymentStatus('error')
    }
  }

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              step > s
                ? 'bg-[#F7931A] text-black'
                : step === s
                  ? 'bg-[#F7931A]/20 text-[#F7931A] ring-1 ring-[#F7931A]/50'
                  : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {step > s ? <CheckCircle className="w-4 h-4" /> : s}
          </div>
          {s < 4 && (
            <div
              className={`w-8 h-px ${step > s ? 'bg-[#F7931A]/40' : 'bg-zinc-800'}`}
            />
          )}
        </div>
      ))}
    </div>
  )

  return (
    <Card className="p-8 bg-[#0a0a0a] border border-zinc-800/60 shadow-2xl shadow-black/40 rounded-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-[#F7931A]/10 rounded-lg">
          <Zap className="w-5 h-5 text-[#F7931A]" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-100">
          Set Up Daily Writing Incentive
        </h2>
      </div>
      <p className="text-sm text-zinc-500 mb-6">
        Stake sats to stay accountable. Hit your word goal, earn them back.
      </p>

      {step < 5 && stepIndicator}

      {step === 1 && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-[#111] border border-zinc-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-[#F7931A]" />
              <label className="text-sm font-medium text-zinc-200">
                Daily Word Goal
              </label>
            </div>
            <Input
              type="number"
              value={settings.dailyWordGoal}
              onChange={(e) => setSettings({...settings, dailyWordGoal: parseInt(e.target.value)})}
              placeholder="500"
              className="bg-[#0a0a0a] border-zinc-700/50 text-zinc-100 font-mono text-lg h-12 focus:border-[#F7931A]/50 focus:ring-[#F7931A]/20"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Words you need to write each day to earn your reward
            </p>
          </div>
          <Button
            onClick={() => setStep(2)}
            className="w-full h-12 bg-[#F7931A] hover:bg-[#E8850F] text-black font-semibold text-sm tracking-wide transition-colors"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-[#111] border border-zinc-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-[#F7931A]" />
              <label className="text-sm font-medium text-zinc-200">
                Daily Reward
              </label>
              <span className="text-xs text-zinc-500 ml-auto">sats</span>
            </div>
            <Input
              type="number"
              value={settings.dailyRewardSats}
              onChange={(e) => setSettings({...settings, dailyRewardSats: parseInt(e.target.value)})}
              placeholder="500"
              className="bg-[#0a0a0a] border-zinc-700/50 text-zinc-100 font-mono text-lg h-12 focus:border-[#F7931A]/50 focus:ring-[#F7931A]/20"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Sats returned to you each day you hit your goal
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="h-12 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              className="flex-1 h-12 bg-[#F7931A] hover:bg-[#E8850F] text-black font-semibold text-sm tracking-wide transition-colors"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-[#111] border border-zinc-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-4 h-4 text-[#F7931A]" />
              <label className="text-sm font-medium text-zinc-200">
                Lightning Address
              </label>
            </div>
            <Input
              type="text"
              value={settings.lightningAddress}
              onChange={(e) => setSettings({...settings, lightningAddress: e.target.value})}
              placeholder="you@getalby.com"
              className="bg-[#0a0a0a] border-zinc-700/50 text-zinc-100 h-12 focus:border-[#F7931A]/50 focus:ring-[#F7931A]/20"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Where earned sats get delivered
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#111] border border-zinc-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-[#F7931A]" />
              <label className="text-sm font-medium text-zinc-200">
                Stake Amount
              </label>
              <span className="text-xs text-zinc-500 ml-auto">sats</span>
            </div>
            <Input
              type="number"
              value={settings.stakeAmount}
              onChange={(e) => setSettings({...settings, stakeAmount: parseInt(e.target.value)})}
              placeholder="5000"
              className="bg-[#0a0a0a] border-zinc-700/50 text-zinc-100 font-mono text-lg h-12 focus:border-[#F7931A]/50 focus:ring-[#F7931A]/20"
            />
            <div className="mt-3 p-3 rounded-lg bg-[#F7931A]/5 border border-[#F7931A]/10">
              <p className="text-xs text-zinc-400">
                Funds <span className="font-mono text-[#F7931A]">{Math.floor(settings.stakeAmount / settings.dailyRewardSats)}</span> days of rewards at <span className="font-mono text-zinc-300">{settings.dailyRewardSats}</span> sats/day
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="h-12 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            >
              Back
            </Button>
            <Button
              onClick={handleCreateDeposit}
              disabled={loading}
              className="flex-1 h-12 bg-[#F7931A] hover:bg-[#E8850F] text-black font-semibold text-sm tracking-wide transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Invoice...
                </>
              ) : (
                <>
                  Create Deposit Invoice
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && depositInvoice && (
        <div className="space-y-5">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-zinc-100 mb-1">
              Fund Your Stake
            </h3>
            <p className="text-sm text-zinc-500">
              <span className="font-mono text-[#F7931A] font-semibold">{settings.stakeAmount.toLocaleString()}</span>
              <span className="text-zinc-600 mx-1.5">/</span>
              <span className="font-mono text-zinc-300">{Math.floor(settings.stakeAmount / settings.dailyRewardSats)}</span> days of rewards
            </p>
          </div>

          {paymentStatus === 'idle' && (
            <Button
              onClick={handleWeblnPay}
              className="w-full h-12 bg-[#F7931A] hover:bg-[#E8850F] text-black font-semibold text-sm tracking-wide transition-colors"
            >
              <Zap className="w-4 h-4 mr-2" />
              Pay with Wallet Extension
            </Button>
          )}

          {paymentStatus === 'paying' && (
            <div className="flex items-center justify-center gap-2 py-3">
              <Loader2 className="w-4 h-4 text-[#F7931A] animate-spin" />
              <p className="text-sm text-zinc-400">Waiting for payment confirmation...</p>
            </div>
          )}

          {paymentStatus === 'paid' && (
            <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 font-semibold text-sm">Payment confirmed -- stake activated</span>
            </div>
          )}

          {paymentStatus === 'error' && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm text-center">
                Wallet payment failed. Scan the QR code below instead.
              </p>
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#0a0a0a] px-3 text-xs text-zinc-600">or scan with any Lightning wallet</span>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="p-1 rounded-2xl bg-gradient-to-b from-[#F7931A]/20 to-[#F7931A]/5 border border-[#F7931A]/10">
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG value={`lightning:${depositInvoice}`} size={200} />
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(depositInvoice)
              toast.success('Invoice copied to clipboard')
            }}
            className="w-full h-10 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Invoice
          </Button>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-zinc-100 mb-1">
              Stake Active
            </h3>
            <p className="text-sm text-zinc-500">
              Your writing incentive is live. Start writing to earn sats.
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
