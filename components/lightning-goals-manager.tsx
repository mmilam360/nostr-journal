'use client'

import { useState, useEffect } from 'react'
import { getLightningGoals, createStake, addToStake, cancelStake, updateLightningAddress, confirmPayment } from '@/lib/lightning-goals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, QrCode, Clock, CheckCircle, Target } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'

interface Props {
  userPubkey: string
  authData: any
  userLightningAddress: string
  currentWordCount?: number  // NEW: Add this prop (optional)
  onWordCountProcessed?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
  onStakeActivated?: () => void
}

export function LightningGoalsManager({
  userPubkey,
  authData,
  userLightningAddress,
  currentWordCount,  // NEW
  onWordCountProcessed,
  onSetupStatusChange,
  onStakeActivated
}: Props) {
  const [goals, setGoals] = useState<any>(null)
  const [screen, setScreen] = useState<'setup' | 'invoice' | 'tracking'>('setup')
  const [loading, setLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)

  // Setup form state
  const [dailyWordGoal, setDailyWordGoal] = useState('')
  const [dailyReward, setDailyReward] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [lightningAddress, setLightningAddress] = useState('')

  // Payment flow state
  const [invoiceData, setInvoiceData] = useState<any>(null)
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'checking' | 'confirmed'>('pending')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const [paymentCheckInterval, setPaymentCheckInterval] = useState<NodeJS.Timeout | null>(null)
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false)
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false)
  const [showCancelSuccess, setShowCancelSuccess] = useState(false)
  const [forfeitedAmount, setForfeitedAmount] = useState(0)

  // Input validation
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({})
  const [isFormValid, setIsFormValid] = useState(false)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

  // Load goals
  useEffect(() => {
    async function load() {
      console.log('[Manager] Loading goals for user:', userPubkey?.substring(0, 8))
      setLoading(true)
      try {
        const g = await getLightningGoals(userPubkey)
        console.log('[Manager] Loaded goals:', g)

        if (g && g.status === 'active') {
          console.log('[Manager] Active goals found, showing tracking screen')
          setGoals(g)
          setScreen('tracking')
        } else if (g && g.status === 'pending_payment') {
          console.log('[Manager] Pending payment found, but no invoice data - clearing and going to setup')
          // Clear the pending payment goal so user can start fresh
          try {
            await cancelStake(userPubkey, authData)
            console.log('[Manager] Cleared pending payment goal')
          } catch (error) {
            console.error('[Manager] Error clearing pending goal:', error)
          }
          setGoals(null)
          setScreen('setup')
        } else {
          console.log('[Manager] No goals found, showing setup screen')
          setScreen('setup')
        }

        // Pre-fill Lightning address from prop or master event
        const addressFromEvent = g?.lightningAddress
        const addressToUse = userLightningAddress || addressFromEvent || ''
        console.log('[Manager] Lightning address sources:', {
          fromProp: userLightningAddress,
          fromEvent: addressFromEvent,
          using: addressToUse
        })
        setLightningAddress(addressToUse)
      } catch (error) {
        console.error('[Manager] Error loading goals:', error)
        console.log('[Manager] Error occurred, showing setup screen')
        setScreen('setup')
      } finally {
        console.log('[Manager] Loading complete, screen set to:', screen)
        setLoading(false)
      }
    }

    if (userPubkey) {
      load()
    }
  }, [userPubkey, userLightningAddress])

  // Auto-refresh every 10 seconds when on tracking screen
  useEffect(() => {
    if (screen !== 'tracking') return

    const interval = setInterval(async () => {
      try {
        const g = await getLightningGoals(userPubkey)
        setGoals(g)
      } catch (error) {
        console.error('[Manager] Error refreshing goals:', error)
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [screen, userPubkey])

  // Validate inputs whenever form values change
  useEffect(() => {
    validateInputs()

    // Reset attempted submit flag when user starts typing
    if (hasAttemptedSubmit) {
      setHasAttemptedSubmit(false)
      setValidationErrors({})
    }
  }, [dailyWordGoal, dailyReward, depositAmount, lightningAddress])

  // Auto-check payment when on invoice screen
  useEffect(() => {
    if (screen === 'invoice' && invoiceData && paymentStatus === 'pending') {
      console.log('[Manager] Starting automatic payment checking...')
      const interval = setInterval(() => {
        handlePaymentVerification(true) // Pass true for automatic checks
      }, 1000) // Check every 1 second

      setPaymentCheckInterval(interval)

      // Cleanup interval after 5 minutes
      setTimeout(() => {
        if (interval) {
          clearInterval(interval)
          setPaymentCheckInterval(null)
          console.log('[Manager] Stopped automatic payment checking after 5 minutes')
        }
      }, 300000)

      return () => {
        if (interval) {
          clearInterval(interval)
          setPaymentCheckInterval(null)
        }
      }
    }
  }, [screen, invoiceData, paymentStatus])

  // Input validation
  function validateInputs(showErrors: boolean = false) {
    const errors: {[key: string]: string} = {}

    if (!dailyWordGoal || dailyWordGoal.trim() === '') {
      if (showErrors) errors.dailyWordGoal = 'Daily word goal is required'
    } else if (parseInt(dailyWordGoal) <= 0) {
      if (showErrors) errors.dailyWordGoal = 'Daily word goal must be greater than 0'
    }

    if (!dailyReward || dailyReward.trim() === '') {
      if (showErrors) errors.dailyReward = 'Daily reward is required'
    } else if (parseInt(dailyReward) <= 0) {
      if (showErrors) errors.dailyReward = 'Daily reward must be greater than 0'
    }

    if (!depositAmount || depositAmount.trim() === '') {
      if (showErrors) errors.depositAmount = 'Deposit amount is required'
    } else if (parseInt(depositAmount) <= 0) {
      if (showErrors) errors.depositAmount = 'Deposit amount must be greater than 0'
    }

    if (!lightningAddress || lightningAddress.trim() === '') {
      if (showErrors) errors.lightningAddress = 'Lightning address is required'
    }

    // Check if deposit is sufficient for daily reward
    if (dailyReward && depositAmount && parseInt(depositAmount) < parseInt(dailyReward)) {
      if (showErrors) errors.depositAmount = 'Deposit must be at least as much as the daily reward'
    }

    if (showErrors) {
      setValidationErrors(errors)
    }

    const isValid = Object.keys(errors).length === 0
    setIsFormValid(isValid)
    return isValid
  }

  async function handleCreateStake() {
    setHasAttemptedSubmit(true)

    if (!validateInputs(true)) {
      return
    }

    try {
      setLoading(true)

      // Create stake with pending payment status
      await createStake(userPubkey, {
        dailyWordGoal: parseInt(dailyWordGoal),
        dailyReward: parseInt(dailyReward),
        depositAmount: parseInt(depositAmount),
        lightningAddress: lightningAddress.trim(),
        currentWordCount: currentWordCount || 0
      }, authData)

      // Generate Lightning invoice
      console.log('[Manager] Generating Lightning invoice...')
      console.log('[Manager] Current window location:', window.location.href)
      console.log('[Manager] API URL will be:', window.location.origin + '/api/incentive/create-invoice')

      const invoiceResponse = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: userPubkey,
          amountSats: parseInt(depositAmount),
          timestamp: Date.now(),
          requestId: Math.random().toString(36).substring(7)
        })
      })

      console.log('[Manager] Invoice response status:', invoiceResponse.status)
      console.log('[Manager] Invoice response headers:', invoiceResponse.headers.get('content-type'))

      if (!invoiceResponse.ok) {
        const errorText = await invoiceResponse.text()
        console.error('[Manager] API error response:', errorText)
        throw new Error(`API error: ${invoiceResponse.status} - ${errorText}`)
      }

      const responseText = await invoiceResponse.text()
      console.log('[Manager] Raw response:', responseText)

      let invoiceResult
      try {
        invoiceResult = JSON.parse(responseText)
      } catch (parseError) {
        console.error('[Manager] JSON parse error:', parseError)
        console.error('[Manager] Raw response was:', responseText)
        throw new Error('Invalid JSON response from API')
      }

      if (!invoiceResult.success) {
        throw new Error(invoiceResult.error)
      }

      // Store payment hash and invoice string for verification
      localStorage.setItem(`payment-hash-${userPubkey}`, invoiceResult.paymentHash)
      localStorage.setItem(`invoice-string-${userPubkey}`, invoiceResult.invoice)

      setInvoiceData(invoiceResult)
      setScreen('invoice')

      // Generate QR code for the invoice
      if (invoiceResult.invoice) {
        QRCode.toDataURL(invoiceResult.invoice, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        }).then(setQrCodeDataUrl).catch(console.error)
      }

    } catch (error) {
      console.error('[Manager] Error creating stake:', error)
      console.error('Error creating stake:', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePaymentVerification(isAutoCheck: boolean = false) {
    if (!invoiceData) return

    try {
      setPaymentStatus('checking')

      const paymentHash = localStorage.getItem(`payment-hash-${userPubkey}`)
      const invoiceString = localStorage.getItem(`invoice-string-${userPubkey}`)

      if (!paymentHash) {
        throw new Error('No payment hash found for verification')
      }

      console.log('[Manager] Checking payment status...')
      console.log('[Manager] Payment hash:', paymentHash)
      console.log('[Manager] Invoice string:', invoiceString ? 'present' : 'missing')

      const checkResponse = await fetch('/api/incentive/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentHash,
          ...(invoiceString && { invoiceString })
        })
      })

      console.log('[Manager] Verify payment response status:', checkResponse.status)

      if (!checkResponse.ok) {
        const errorText = await checkResponse.text()
        console.log('[Manager] Verify payment API error:', errorText)
        throw new Error(`API returned ${checkResponse.status}: ${errorText}`)
      }

      const checkResult = await checkResponse.json()
      console.log('[Manager] Verify payment result:', checkResult)

      if (checkResult.success && checkResult.paid) {
        console.log('[Manager] Payment confirmed! Amount:', checkResult.amountSats, 'sats')

        setIsUpdatingBalance(true)

        await confirmPayment(userPubkey, paymentHash, authData)

        console.log('[Manager] Payment confirmed and stake activated')

        localStorage.removeItem(`payment-hash-${userPubkey}`)
        localStorage.removeItem(`invoice-string-${userPubkey}`)

        setInvoiceData(null)
        setPaymentStatus('pending')
        setQrCodeDataUrl('')

        if (paymentCheckInterval) {
          clearInterval(paymentCheckInterval)
          setPaymentCheckInterval(null)
        }

        setScreen('tracking')

        if (onStakeActivated) {
          onStakeActivated()
        }

        setTimeout(async () => {
          const g = await getLightningGoals(userPubkey)
          setGoals(g)
          setIsUpdatingBalance(false)
        }, 1000)

      } else {
        setPaymentStatus('pending')
        if (!isAutoCheck) {
          toast('Payment not yet received. Please try again.')
        }
      }

    } catch (error) {
      console.error('[Manager] Error verifying payment:', error)
      console.error('[Manager] Error message:', error.message)
      setPaymentStatus('pending')

      if (isAutoCheck) {
        console.log('[Manager] Automatic payment check failed, will retry next interval')
      } else {
        console.error('Error verifying payment:', error.message)
        toast.error(`Payment verification failed: ${error.message}`)
      }
    }
  }

  async function handleCancelStake() {
    if (!goals) return

    setShowCancelConfirmation(true)
  }

  async function confirmCancelStake() {
    if (!goals) return

    setIsCancelling(true)
    setShowCancelConfirmation(false)

    try {
      console.log('[Manager] Cancelling stake...')

      const { forfeited } = await cancelStake(userPubkey, authData)

      console.log('[Manager] Stake cancelled')
      console.log('[Manager] Forfeited:', forfeited, 'sats')

      setForfeitedAmount(forfeited)
      setShowCancelSuccess(true)

      setTimeout(() => {
        setGoals(null)
        setScreen('setup')
        setShowCancelSuccess(false)
        setForfeitedAmount(0)
      }, 3000)

    } catch (error) {
      console.error('[Manager] Error:', error)
      setShowCancelConfirmation(false)
      toast.error('Error cancelling stake: ' + error.message)
    } finally {
      setIsCancelling(false)
    }
  }

  async function handleUpdateLightningAddress() {
    if (!lightningAddress) {
      console.error('Please enter a Lightning address')
      return
    }

    try {
      await updateLightningAddress(userPubkey, lightningAddress, authData)

      setGoals({ ...goals, lightningAddress })

      toast.success('Lightning address updated successfully!')

    } catch (error) {
      console.error('[Manager] Error updating Lightning address:', error)
      toast.error('Error updating Lightning address: ' + error.message)
    }
  }

  console.log('[Manager] Rendering with state:', { loading, screen, hasGoals: !!goals })

  if (loading) {
    console.log('[Manager] Showing loading screen')
    return (
      <Card className="bg-[#111] border-zinc-800">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F7931A] mx-auto mb-4"></div>
            <p className="text-zinc-300">Loading Lightning Goals...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {screen === 'tracking' && goals && (
        <div className="space-y-4">
          {/* Progress Card */}
          <Card className="bg-[#111] border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Your Writing Goal</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Progress */}
              <div className="mb-4">
                {(() => {
                  const wordsSinceStake = goals.todayWords - (goals.baselineWordCount || 0)
                  const progressPercent = Math.min(100, (wordsSinceStake / goals.dailyWordGoal) * 100)

                  return (
                    <>
                      <div className="flex justify-between text-sm mb-2 text-zinc-300">
                        <span>Progress (since stake)</span>
                        <span>{wordsSinceStake} / {goals.dailyWordGoal} words</span>
                      </div>

                      <div className="w-full bg-zinc-800 rounded-full h-4">
                        <div
                          className="h-4 rounded-full transition-all duration-500 bg-[#F7931A]"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      {goals.todayRewardSent && (
                        <div className="mt-2 text-[#F7931A] text-sm flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-mono">{goals.todayRewardAmount} sats</span> earned today!
                        </div>
                      )}
                    </>
                  )
                })()}

                {goals.todayGoalMet && !goals.todayRewardSent && (
                  <div className="text-[#F7931A] text-sm mt-2 flex items-center gap-1.5">
                    <Target className="w-4 h-4" />
                    Goal met! Waiting for reward...
                  </div>
                )}
              </div>

              {/* Balance */}
              <div className="mb-4">
                <div className="text-sm text-zinc-400">Current Balance</div>
                <div className="text-2xl font-bold text-zinc-100">
                  {isUpdatingBalance ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#F7931A]"></div>
                      <span className="text-zinc-500">Updating...</span>
                    </div>
                  ) : (
                    <span className="font-mono">{goals.currentBalance} sats</span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-400">Streak</div>
                  <div className="font-bold text-zinc-100">{goals.currentStreak} days</div>
                </div>
                <div>
                  <div className="text-zinc-400">Total Earned</div>
                  <div className="font-bold text-zinc-100"><span className="font-mono">{goals.totalRewardsEarned} sats</span></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lightning Address */}
          <Card className="bg-[#111] border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Lightning Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={lightningAddress}
                  onChange={(e) => setLightningAddress(e.target.value)}
                  placeholder="your@lightning.address"
                  className="flex-1 bg-[#0a0a0a] border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
                <Button
                  onClick={handleUpdateLightningAddress}
                  disabled={!lightningAddress || lightningAddress === goals.lightningAddress}
                  className="bg-[#F7931A] hover:bg-[#E8850F] text-white"
                >
                  Update
                </Button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Where daily rewards will be sent
              </p>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="bg-[#111] border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleCancelStake}
                variant="destructive"
                disabled={isCancelling}
                className="w-full"
              >
                {isCancelling ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Cancelling...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Cancel Stake & Forfeit
                  </div>
                )}
              </Button>

              <div className="mt-2 p-3 bg-red-900/20 border border-red-900/40 rounded-lg">
                <div className="text-sm text-red-400">
                  <p className="font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Warning
                  </p>
                  <p className="mt-1">
                    Cancelling will forfeit your remaining balance of <strong className="font-mono">{goals.currentBalance} sats</strong>.
                  </p>
                  <p className="mt-1 text-xs text-red-500">
                    This is your commitment to your writing goal.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {screen === 'setup' && (
        <Card className="bg-[#111] border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Set Up Lightning Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block text-zinc-300">Daily Word Goal</label>
              <Input
                type="number"
                value={dailyWordGoal}
                onChange={(e) => setDailyWordGoal(e.target.value)}
                placeholder="500"
                className={`bg-[#0a0a0a] border-zinc-700 text-zinc-100 placeholder:text-zinc-500 ${hasAttemptedSubmit && validationErrors.dailyWordGoal ? 'border-red-500' : ''}`}
              />
              {hasAttemptedSubmit && validationErrors.dailyWordGoal && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.dailyWordGoal}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block text-zinc-300">Daily Reward (sats)</label>
              <Input
                type="number"
                value={dailyReward}
                onChange={(e) => setDailyReward(e.target.value)}
                placeholder="100"
                className={`bg-[#0a0a0a] border-zinc-700 text-zinc-100 placeholder:text-zinc-500 ${hasAttemptedSubmit && validationErrors.dailyReward ? 'border-red-500' : ''}`}
              />
              {hasAttemptedSubmit && validationErrors.dailyReward && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.dailyReward}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block text-zinc-300">Initial Deposit (sats)</label>
              <Input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="1000"
                className={`bg-[#0a0a0a] border-zinc-700 text-zinc-100 placeholder:text-zinc-500 ${hasAttemptedSubmit && validationErrors.depositAmount ? 'border-red-500' : ''}`}
              />
              {hasAttemptedSubmit && validationErrors.depositAmount && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.depositAmount}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block text-zinc-300">Lightning Address</label>
              <Input
                type="text"
                value={lightningAddress}
                onChange={(e) => setLightningAddress(e.target.value)}
                placeholder="your@lightning.address"
                className={`bg-[#0a0a0a] border-zinc-700 text-zinc-100 placeholder:text-zinc-500 ${hasAttemptedSubmit && validationErrors.lightningAddress ? 'border-red-500' : ''}`}
              />
              {hasAttemptedSubmit && validationErrors.lightningAddress && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.lightningAddress}</p>
              )}
              <p className="text-xs text-zinc-500 mt-1">
                Where daily rewards will be sent
              </p>
            </div>

            <Button
              onClick={handleCreateStake}
              disabled={loading || !isFormValid}
              className="w-full bg-[#F7931A] hover:bg-[#E8850F] text-white"
            >
              {loading ? 'Creating...' : 'Generate Lightning Invoice'}
            </Button>

            <div className="text-xs text-zinc-500">
              <p>You will earn <span className="font-mono">{dailyReward || 'X'} sats</span> each day you write {dailyWordGoal || 'X'}+ words</p>
              <p>Your deposit of <span className="font-mono">{depositAmount || 'X'} sats</span> will be used to pay rewards</p>
              <p>Cancelling forfeits your remaining balance</p>
            </div>
          </CardContent>
        </Card>
      )}

      {screen === 'invoice' && (
        <div className="space-y-4">
          {invoiceData ? (
            <Card className="bg-[#111] border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Complete Your Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* QR Code Display */}
                {qrCodeDataUrl && (
                  <div className="bg-[#1a1a1a] p-6 rounded-xl border border-zinc-700 mb-4">
                    <div className="flex flex-col items-center space-y-4">
                      {/* QR Code Container */}
                      <div className="bg-white p-4 rounded-xl shadow-lg border border-zinc-600">
                        <img
                          src={qrCodeDataUrl}
                          alt="Lightning Invoice QR Code"
                          className="w-48 h-48 rounded-lg"
                        />
                      </div>

                      {/* QR Code Description */}
                      <div className="text-center">
                        <p className="text-sm font-medium text-zinc-200 mb-1">
                          Scan with Lightning Wallet
                        </p>
                        <p className="text-xs text-zinc-400">
                          Use any Lightning wallet to pay this invoice
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invoice Text */}
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-zinc-700 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-[#F7931A] rounded-full"></div>
                    <span className="text-sm font-medium text-zinc-200">Lightning Invoice</span>
                  </div>
                  <div className="bg-[#0a0a0a] p-3 rounded-lg border border-zinc-800 font-mono text-xs break-all text-zinc-300">
                    {invoiceData.invoice}
                  </div>
                </div>

                {/* Copy Button */}
                <Button
                  onClick={() => navigator.clipboard.writeText(invoiceData.invoice)}
                  className="w-full bg-[#F7931A] hover:bg-[#E8850F] text-white font-medium py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border-0"
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Copy Invoice
                </Button>

                {/* Payment Status Indicator */}
                <div className="bg-[#1a1a1a] border border-zinc-700 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin">
                      <Clock className="w-4 h-4 text-[#F7931A]" />
                    </div>
                    <span className="text-sm text-zinc-300">
                      Waiting for payment... (checking automatically every second)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-[#111] border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Payment Required</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-lg font-semibold mb-2 text-zinc-100">Pending Payment</div>
                  <div className="text-sm text-zinc-400 mb-4">
                    You have a pending Lightning Goals stake that requires payment to activate.
                  </div>
                </div>

                <div className="bg-[#F7931A]/10 border border-[#F7931A]/30 rounded-lg p-4">
                  <div className="text-sm text-[#F7931A]">
                    <p className="font-medium flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Incomplete Setup
                    </p>
                    <p className="mt-1 text-zinc-400">
                      Your stake was created but payment was not completed.
                      The invoice data is missing.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      try {
                        if (goals) {
                          await cancelStake(userPubkey, authData)
                          setGoals(null)
                          setScreen('setup')
                        }
                      } catch (error) {
                        console.error('Error cancelling pending stake:', error)
                        console.error('Error cancelling pending stake:', error.message)
                      }
                    }}
                    variant="outline"
                    className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancel & Start Over
                  </Button>
                  <Button
                    onClick={() => setScreen('setup')}
                    className="flex-1 bg-[#F7931A] hover:bg-[#E8850F] text-white"
                  >
                    Try Again
                  </Button>
                </div>

                <div className="text-xs text-zinc-500 text-center">
                  <p>Cancel to start fresh with new settings</p>
                  <p>Try Again to return to setup</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Fallback - should never reach here */}
      {screen !== 'setup' && screen !== 'tracking' && screen !== 'invoice' && (
        <Card className="bg-[#111] border-zinc-800">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-red-500">Unknown screen state: {screen}</p>
              <Button onClick={() => setScreen('setup')} className="mt-2 bg-[#F7931A] hover:bg-[#E8850F] text-white">
                Go to Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirmation && goals && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-[#111] border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-5 h-5" />
                Cancel Stake?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-4">
                <p className="text-red-400 font-medium mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  WARNING
                </p>
                <p className="text-zinc-300 text-sm">
                  Your remaining balance of <strong className="font-mono">{goals.currentBalance} sats</strong> will be <strong>FORFEITED</strong> (not refunded).
                </p>
                <p className="text-zinc-500 text-xs mt-2">
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setShowCancelConfirmation(false)}
                  variant="outline"
                  className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  disabled={isCancelling}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmCancelStake}
                  variant="destructive"
                  className="flex-1"
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Forfeiting...
                    </div>
                  ) : (
                    'Forfeit Stake'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cancel Success Modal */}
      {showCancelSuccess && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-[#111] border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-400">
                <CheckCircle className="w-5 h-5" />
                Stake Cancelled
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-900/40 rounded-lg p-4">
                <p className="text-emerald-400 font-medium mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Complete
                </p>
                <p className="text-zinc-300 text-sm">
                  <strong className="font-mono">{forfeitedAmount} sats</strong> forfeited.
                </p>
                <p className="text-zinc-500 text-xs mt-2">
                  You can create a new stake anytime.
                </p>
              </div>

              <Button
                onClick={() => {
                  setShowCancelSuccess(false)
                  setGoals(null)
                  setScreen('setup')
                }}
                className="w-full bg-[#F7931A] hover:bg-[#E8850F] text-white"
              >
                Create New Stake
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
