'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Zap, Plus, Loader2, Copy, CheckCircle, Wallet } from 'lucide-react'
import { ClientOnly } from './client-only'
import QRCode from 'qrcode'

interface TopUpBalanceProps {
  userPubkey: string
  authData: any
  currentBalance: number
  onTopUpComplete: () => void
}

export function TopUpBalance({ userPubkey, authData, currentBalance, onTopUpComplete }: TopUpBalanceProps) {
  const [topUpAmount, setTopUpAmount] = useState<string>('1000')
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)
  const [invoiceData, setInvoiceData] = useState<{ invoice: string; paymentHash: string; amount: number } | null>(null)
  const [error, setError] = useState<string>('')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'invoice' | 'bitcoin-connect' | null>(null)
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)
  const [paymentVerified, setPaymentVerified] = useState(false)

  const checkPaymentStatus = async (invoice: string, paymentHash: string) => {
    try {
      console.log('[TopUp] Checking payment status...')

      const response = await fetch('/api/incentive/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceString: invoice,
          paymentHash: paymentHash
        })
      })

      const data = await response.json()

      console.log('[TopUp] Payment verification response:', data)

      return data.paid === true
    } catch (err: any) {
      console.error('[TopUp] Error checking payment:', err)
      return false
    }
  }

  const startPaymentPolling = async (invoice: string, paymentHash: string, amount: number) => {
    console.log('[TopUp] ========================================')
    console.log('[TopUp] 🔍 STARTING PAYMENT VERIFICATION')
    console.log('[TopUp] 🔒 SECURITY: This is the ONLY way payments can be confirmed')
    console.log('[TopUp] 🔒 SECURITY: WebLN responses are NOT trusted')
    console.log('[TopUp] ========================================')
    console.log('[TopUp] Payment hash:', paymentHash)
    console.log('[TopUp] Invoice preview:', invoice.substring(0, 50) + '...')
    console.log('[TopUp] Will check every 3 seconds for up to 3 minutes')
    
    setIsCheckingPayment(true)

    const maxAttempts = 60 // Poll for up to 3 minutes (60 * 3 seconds) - MATCHES STAKE VERIFICATION
    let attempts = 0

    const pollInterval = setInterval(async () => {
      attempts++
      
      try {
        console.log(`[TopUp] 🔄 Verification attempt ${attempts}/${maxAttempts}`)
        console.log(`[TopUp] Time remaining: ${Math.floor((maxAttempts - attempts) * 3 / 60)} minutes`)

      const isPaid = await checkPaymentStatus(invoice, paymentHash)

      if (isPaid) {
          console.log('[TopUp] ========================================')
          console.log('[TopUp] 🎉 PAYMENT CONFIRMED!')
          console.log('[TopUp] 🔒 SECURITY: Payment verified via NWC backend - NOT WebLN')
          console.log('[TopUp] ========================================')
          console.log('[TopUp] 💰 Crediting balance:', amount, 'sats')
          
        clearInterval(pollInterval)
        setIsCheckingPayment(false)
        setPaymentVerified(true)

        // Process the confirmed payment
        await handlePaymentConfirmed(paymentHash, amount)
      } else if (attempts >= maxAttempts) {
          console.log('[TopUp] ========================================')
          console.log('[TopUp] ⏰ VERIFICATION TIMEOUT')
          console.log('[TopUp] ========================================')
          console.log('[TopUp] Checked', maxAttempts, 'times over 3 minutes')
          console.log('[TopUp] No payment detected')
          
          clearInterval(pollInterval)
          setIsCheckingPayment(false)
          setError(`Payment verification timed out after 3 minutes. If you paid, please contact support with this payment hash: ${paymentHash.substring(0, 16)}...`)
        } else {
          // Still waiting
          console.log('[TopUp] ⏳ Payment not confirmed yet, will check again in 3 seconds')
        }
        
      } catch (error) {
        console.error('[TopUp] ❌ Verification error:', error)
        console.error('[TopUp] ❌ Error details:', {
          message: error.message,
          attempts: attempts,
          maxAttempts: maxAttempts
        })
        
        if (attempts >= maxAttempts) {
        clearInterval(pollInterval)
        setIsCheckingPayment(false)
          setError('Payment verification failed after maximum attempts. Please try again.')
        }
      }
    }, 3000) // Check every 3 seconds - MATCHES STAKE VERIFICATION
  }

  const handleCreateTopUpInvoice = async () => {
    const amount = parseInt(topUpAmount)

    if (!amount || amount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setIsCreatingInvoice(true)
    setError('')

    try {
      console.log('[TopUp] Creating top-up invoice for', amount, 'sats')

      const response = await fetch('/api/incentive/create-topup-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: amount,
          timestamp: Date.now()
        })
      })

      console.log('[TopUp] Response status:', response.status)
      console.log('[TopUp] Response headers:', Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TopUp] API error response:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create invoice')
      }

      console.log('[TopUp] Invoice created:', data.invoice.substring(0, 50))

      // Generate QR code
      const qrUrl = await QRCode.toDataURL(data.invoice.toUpperCase(), {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })

      setQrCodeDataUrl(qrUrl)
      setInvoiceData({
        invoice: data.invoice,
        paymentHash: data.paymentHash,
        amount: data.amount
      })
      setPaymentMethod('invoice')

      // Start polling for payment
      startPaymentPolling(data.invoice, data.paymentHash, data.amount)
    } catch (err: any) {
      console.error('[TopUp] Error creating invoice:', err)
      setError(err.message || 'Failed to create invoice')
    } finally {
      setIsCreatingInvoice(false)
    }
  }

  const handleBitcoinConnect = () => {
    const amount = parseInt(topUpAmount)

    if (!amount || amount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setPaymentMethod('bitcoin-connect')
  }

  const handleCopyInvoice = async () => {
    if (!invoiceData) return

    try {
      await navigator.clipboard.writeText(invoiceData.invoice)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handlePaymentConfirmed = async (paymentHash: string, amount: number) => {
    try {
      console.log('[TopUp] Payment confirmed, adding to stake...')
      console.log('[TopUp] Amount:', amount, 'sats')
      console.log('[TopUp] Payment hash:', paymentHash)

      // Add to stake using lightning-goals library
      const { addToStake } = await import('@/lib/lightning-goals')
      await addToStake(userPubkey, amount, paymentHash, authData)

      console.log('[TopUp] Stake topped up successfully')

      // Reset state
      setInvoiceData(null)
      setTopUpAmount('1000')
      setPaymentMethod(null)
      setQrCodeDataUrl('')

      // Notify parent to refresh
      onTopUpComplete()
    } catch (err: any) {
      console.error('[TopUp] Error confirming top-up:', err)
      setError(err.message || 'Failed to process top-up')
    }
  }

  // Show QR code payment screen
  if (paymentMethod === 'invoice' && invoiceData) {
    return (
      <div className="bg-secondary p-6 rounded-lg border border-border">
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Top-Up Payment
          </h3>
          <p className="text-sm text-muted-foreground">
            {paymentVerified ? 'Payment Confirmed!' : isCheckingPayment ? 'Waiting for payment...' : 'Scan QR code or copy invoice to pay'}
          </p>
        </div>

        {/* Payment Status */}
        {paymentVerified ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center mb-4">
            <CheckCircle className="w-16 h-16 mx-auto mb-3 text-green-600 dark:text-green-400" />
            <p className="text-lg font-semibold text-green-900 dark:text-green-100 mb-1">
              Payment Verified!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Your balance has been updated
            </p>
          </div>
        ) : (
          <>
            {/* QR Code */}
            {qrCodeDataUrl && (
              <div className="flex justify-center mb-4">
                <img src={qrCodeDataUrl} alt="Payment QR Code" className="w-64 h-64 rounded-lg" />
              </div>
            )}

            {/* Checking Status */}
            {isCheckingPayment && (
              <div className="bg-primary/10 border border-primary/20 rounded p-3 text-sm text-foreground mb-4 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Checking for payment...
                <div className="text-xs text-muted-foreground mt-1">
                  Checking every 3 seconds for up to 3 minutes
                </div>
              </div>
            )}

            {/* Copy Invoice */}
            <div className="space-y-3">
              <Button
                onClick={handleCopyInvoice}
                variant="outline"
                className="w-full"
                disabled={paymentVerified}
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Invoice
                  </>
                )}
              </Button>

              <Button
                onClick={() => {
                  setInvoiceData(null)
                  setPaymentMethod(null)
                  setQrCodeDataUrl('')
                  setError('')
                  setIsCheckingPayment(false)
                  setPaymentVerified(false)
                }}
                variant="outline"
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  // Show Bitcoin Connect payment screen
  if (paymentMethod === 'bitcoin-connect') {
    return (
      <ClientOnly fallback={<div className="p-6 text-center">Loading payment...</div>}>
        <BitcoinConnectTopUp
          amount={parseInt(topUpAmount)}
          userPubkey={userPubkey}
          authData={authData}
          onPaymentConfirmed={handlePaymentConfirmed}
          onCancel={() => setPaymentMethod(null)}
        />
      </ClientOnly>
    )
  }

  // Show amount input and payment method selection
  return (
    <div className="bg-secondary p-6 rounded-lg border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">
          Top Up Balance
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Amount to add (sats)
          </label>
          <Input
            type="number"
            min="1"
            step="100"
            value={topUpAmount}
            onChange={(e) => {
              setTopUpAmount(e.target.value)
              setError('')
            }}
            placeholder="Enter amount"
            className="text-lg"
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-card border border-border rounded p-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Current Balance:</span>
            <span className="font-semibold font-mono text-foreground">{currentBalance} sats</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">New Balance:</span>
            <span className="font-semibold font-mono text-emerald-400">
              {currentBalance + (parseInt(topUpAmount) || 0)} sats
            </span>
          </div>
        </div>

        {/* Payment Method Buttons */}
        <div className="space-y-2">
          <Button
            onClick={handleBitcoinConnect}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
          >
            <Wallet className="w-4 h-4 mr-2" />
            Pay with Bitcoin Connect
          </Button>

          <Button
            onClick={handleCreateTopUpInvoice}
            disabled={isCreatingInvoice}
            variant="outline"
            className="w-full"
          >
            {isCreatingInvoice ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Invoice...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Generate Invoice
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Bitcoin Connect payment component
function BitcoinConnectTopUp({
  amount,
  userPubkey,
  authData,
  onPaymentConfirmed,
  onCancel
}: {
  amount: number
  userPubkey: string
  authData: any
  onPaymentConfirmed: (hash: string, amount: number) => void
  onCancel: () => void
}) {
  const [isPaying, setIsPaying] = useState(false)
  const [error, setError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  const checkPayment = async (invoice: string, paymentHash: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/incentive/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceString: invoice, paymentHash })
      })
      const data = await response.json()
      return data.paid === true
    } catch {
      return false
    }
  }

  const handlePayWithWebLN = async () => {
    setIsPaying(true)
    setError('')

    try {
      console.log('[TopUp] Creating invoice for Bitcoin Connect payment...')
      const response = await fetch('/api/incentive/create-topup-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: amount,
          timestamp: Date.now()
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create invoice')
      }

      console.log('[TopUp] Invoice created, starting NWC verification polling...')
      setIsPaying(false)
      setIsVerifying(true)

      // Start verification polling (same pattern as stake verification)
      let attempts = 0
      const maxAttempts = 60
      const pollInterval = setInterval(async () => {
        attempts++
        try {
          console.log(`[TopUp] Verification attempt ${attempts}/${maxAttempts}`)
          const isPaid = await checkPayment(data.invoice, data.paymentHash)

          if (isPaid) {
            console.log('[TopUp] Payment confirmed via NWC!')
            clearInterval(pollInterval)
            setIsVerifying(false)
            await onPaymentConfirmed(data.paymentHash, data.amount)
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval)
            setIsVerifying(false)
            setError(`Payment verification timed out. If you paid, contact support with hash: ${data.paymentHash.substring(0, 16)}...`)
          }
        } catch (err) {
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval)
            setIsVerifying(false)
            setError('Payment verification failed. Please try again.')
          }
        }
      }, 3000)

      // Now attempt WebLN payment (trigger only, not trusted for verification)
      try {
        if (window.webln) {
          await window.webln.enable()
          await window.webln.sendPayment(data.invoice)
          console.log('[TopUp] WebLN payment triggered, NWC verification running...')
        } else {
          throw new Error('WebLN not available')
        }
      } catch (weblnError) {
        console.log('[TopUp] WebLN payment failed, NWC verification continues:', weblnError)
        setError('WebLN payment failed, but verification continues. Please use QR code if needed.')
      }

    } catch (err: any) {
      console.error('[TopUp] WebLN payment process failed:', err)
      setError(err.message || 'Payment process failed. Please try the QR code method instead.')
      setIsVerifying(false)
    } finally {
      setIsPaying(false)
    }
  }

  return (
    <div className="bg-card p-6 rounded-lg border border-border">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Bitcoin Connect Payment
        </h3>
        <p className="text-sm text-muted-foreground">
          Top up <span className="font-mono">{amount}</span> sats
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={handlePayWithWebLN}
          disabled={isPaying || isVerifying}
          className="w-full bg-primary hover:bg-primary/90"
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying Payment...
              <div className="text-xs text-muted-foreground mt-1">
                Checking every 3 seconds for up to 3 minutes
              </div>
            </>
          ) : isPaying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing Payment...
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4 mr-2" />
              Pay with Connected Wallet
            </>
          )}
        </Button>

        <Button
          onClick={onCancel}
          variant="outline"
          className="w-full"
          disabled={isPaying || isVerifying}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
