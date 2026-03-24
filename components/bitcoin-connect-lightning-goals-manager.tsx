'use client'

import React, { useState, useEffect } from 'react'
import { WalletConnect } from './wallet-connect'
import { ClientOnly } from './client-only'
import { LightningInvoiceQR } from './lightning-invoice-qr'
import { CheckCircle, Smartphone, Zap } from 'lucide-react'
import * as bolt11 from 'bolt11'
import { toast } from 'sonner'

interface InvoiceData {
  invoice: string
  paymentHash: string
  amount: number
}

export function BitcoinConnectLightningGoalsManager({ 
  userPubkey,
  authData,
  currentWordCount = 0,
  onStakeActivated,
  onSetupStatusChange
}: { 
  userPubkey: string
  authData: any
  currentWordCount?: number
  onStakeActivated?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
}) {
  return (
    <ClientOnly fallback={<div className="p-8 text-center">Loading payment system...</div>}>
      <BitcoinConnectLightningGoalsManagerInner 
        userPubkey={userPubkey} 
        authData={authData} 
        currentWordCount={currentWordCount}
        onStakeActivated={onStakeActivated}
        onSetupStatusChange={onSetupStatusChange}
      />
    </ClientOnly>
  )
}

function BitcoinConnectLightningGoalsManagerInner({ 
  userPubkey, 
  authData,
  currentWordCount = 0,
  onStakeActivated,
  onSetupStatusChange
}: { 
  userPubkey: string
  authData: any
  currentWordCount?: number
  onStakeActivated?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
}) {
  const [isConnected, setIsConnected] = useState(false)
  
  const [screen, setScreen] = useState<'setup' | 'invoice' | 'verifying' | 'active'>('setup')
  const [goalWords, setGoalWords] = useState(500)
  const [stakeAmount, setStakeAmount] = useState(100)
  const [dailyReward, setDailyReward] = useState(100)
  const [lightningAddress, setLightningAddress] = useState('')
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'connect' | 'invoice' | null>(null)
  const [verificationStarted, setVerificationStarted] = useState(false)
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)
  
  // Start payment verification for QR code payments
  useEffect(() => {
    if (screen === 'invoice' && paymentMethod === 'invoice' && invoiceData && !loading && !verificationStarted) {
      console.log('[Manager] 🔍 Starting payment verification for QR code payment...')
      setVerificationStarted(true)
      startPaymentVerification(invoiceData.paymentHash, invoiceData.invoice)
    }
  }, [screen, paymentMethod, invoiceData, loading, verificationStarted])
  
  // Check connection state and load user data
  useEffect(() => {
    const checkConnection = async () => {
      if (!window.webln) {
        console.log('[Manager] 🔍 No WebLN provider available')
        setIsConnected(false)
        return
      }
      
      try {
        // Try to get wallet info to test if it's actually connected
        const info = await window.webln.getInfo()
        console.log('[Manager] 🔍 WebLN provider is connected:', { 
          hasInfo: !!info, 
          webln: !!window.webln,
          enabled: window.webln.enabled,
          provider: window.webln
        })
        setIsConnected(true)
      } catch (error) {
        console.log('[Manager] 🔍 WebLN provider not connected:', error.message)
        setIsConnected(false)
      }
    }
    
    // Check initial state
    checkConnection()
    
    // Listen for connection events
    const handleConnected = () => {
      console.log('[Manager] ✅ Wallet connected event received')
      setIsConnected(true)
    }
    
    const handleDisconnected = () => {
      console.log('[Manager] ❌ Wallet disconnected event received')
      setIsConnected(false)
    }
    
    // Listen for both Bitcoin Connect events and WebLN changes
    document.addEventListener('bc:connected', handleConnected)
    document.addEventListener('bc:disconnected', handleDisconnected)
    
    // Also listen for window.webln changes
    const interval = setInterval(checkConnection, 2000) // Check every 2 seconds
    
    return () => {
      document.removeEventListener('bc:connected', handleConnected)
      document.removeEventListener('bc:disconnected', handleDisconnected)
      clearInterval(interval)
    }
  }, [])
  
  // Load user's lightning address from profile when wallet connects
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!isConnected) return // Only load when wallet is connected
      
      console.log('[Manager] 🔍 Loading user profile, isConnected:', isConnected)
      
      try {
        // Try to get lightning address from window.webln first
        if (window.webln?.getInfo) {
          const info = await window.webln.getInfo()
          console.log('[Manager] 📊 Wallet info received:', info)
          
          if (info.lightningAddress) {
            setLightningAddress(info.lightningAddress)
            console.log('[Manager] ⚡ Lightning address from wallet:', info.lightningAddress)
            
            // Save to localStorage for future use
            localStorage.setItem(`lightning-address-${userPubkey}`, info.lightningAddress)
            return
          } else {
            console.log('[Manager] ⚠️ No lightning address in wallet info')
          }
        } else {
          console.log('[Manager] ⚠️ window.webln.getInfo not available')
        }
        
        // Fallback: try to get from localStorage
        const savedAddress = localStorage.getItem(`lightning-address-${userPubkey}`)
        if (savedAddress) {
          setLightningAddress(savedAddress)
          console.log('[Manager] ⚡ Lightning address from localStorage:', savedAddress)
        } else {
          console.log('[Manager] ⚠️ No saved lightning address found')
          
          // Additional fallback: try to get from Nostr profile
          try {
            const { SimplePool } = await import('nostr-tools')
            const pool = new SimplePool()
            
            // Query for user's profile event (kind 0)
            const profileEvents = await pool.querySync(['wss://relay.damus.io'], {
              kinds: [0],
              authors: [userPubkey],
              limit: 1
            })
            
            if (profileEvents.length > 0) {
              const profile = JSON.parse(profileEvents[0].content)
              if (profile.lud16 || profile.lightning_address) {
                const address = profile.lud16 || profile.lightning_address
                setLightningAddress(address)
                console.log('[Manager] ⚡ Lightning address from Nostr profile:', address)
                
                // Save to localStorage for future use
                localStorage.setItem(`lightning-address-${userPubkey}`, address)
              }
            }
            
            pool.close()
          } catch (profileError) {
            console.log('[Manager] ⚠️ Could not load from Nostr profile:', profileError)
          }
        }
      } catch (error) {
        console.log('[Manager] ⚠️ Could not load lightning address:', error)
      }
    }
    
    loadUserProfile()
  }, [isConnected, userPubkey])
  // ============================================
  // STEP 1: CREATE DEPOSIT INVOICE (Backend)
  // ============================================
  
  // Initialize remote signer to ensure Lightning Goals can sign events
  useEffect(() => {
    async function initializeRemoteSigner() {
      if (authData.authMethod === 'remote' && authData.sessionData) {
        try {
          console.log('[Manager] 🔧 Initializing remote signer for Lightning Goals...')
          const { resumeSession } = await import('@/lib/auth/unified-remote-signer')
          
          const resumed = await resumeSession()
          
          if (resumed) {
            console.log('[Manager] ✅ Remote signer initialized for Lightning Goals')
          } else {
            console.error('[Manager] ❌ Failed to initialize remote signer for Lightning Goals')
          }
        } catch (error) {
          console.error('[Manager] ❌ Error initializing remote signer:', error)
        }
      }
    }
    
    initializeRemoteSigner()
  }, [authData])
  
  // Start payment verification for QR code payments
  useEffect(() => {
    if (screen === 'invoice' && paymentMethod === 'invoice' && invoiceData && !verificationStarted) {
      console.log('[Manager] 🔍 Starting payment verification for QR code payment...')
      setVerificationStarted(true)
      startPaymentVerification(invoiceData.paymentHash, invoiceData.invoice)
    }
  }, [screen, paymentMethod, invoiceData, verificationStarted])

  // ── Payment Recovery: on mount, check for interrupted payments ──
  // If user paid but closed the tab before Nostr signing completed,
  // we detect it here and retry the Nostr publish automatically.
  useEffect(() => {
    if (!userPubkey || screen !== 'setup') return

    async function recoverPendingPayments() {
      const pendingKey = `pending-stake-${userPubkey}`
      const raw = localStorage.getItem(pendingKey)
      if (!raw) return

      try {
        const pending = JSON.parse(raw)
        const ageMs = Date.now() - new Date(pending.confirmedAt).getTime()
        // Only recover if within last 24 hours
        if (ageMs > 24 * 60 * 60 * 1000) {
          localStorage.removeItem(pendingKey)
          return
        }

        console.log('[Manager] 🔄 Found pending stake from interrupted session:', pending)
        toast('Recovering your payment from last session...', { duration: 4000 })

        // Retry Nostr publishing
        const { createStake } = await import('@/lib/lightning-goals')
        await createStake(userPubkey, {
          dailyWordGoal: pending.goalWords,
          dailyReward: pending.dailyReward,
          depositAmount: pending.amount,
          lightningAddress: pending.lightningAddress,
          currentWordCount: 0,
          paymentHash: pending.paymentHash
        }, authData)

        localStorage.removeItem(pendingKey)
        if (pending.paymentHash) {
          fetch('/api/incentive/record-payment', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentHash: pending.paymentHash })
          }).catch(() => {})
        }

        console.log('[Manager] ✅ Recovered pending stake — Nostr event published')
        toast.success('Payment recovered! Your stake is now active.')
        setScreen('active')
        if (onStakeActivated) onStakeActivated()
        if (onSetupStatusChange) onSetupStatusChange(true)

      } catch (err) {
        console.error('[Manager] ⚠️ Recovery failed:', err.message)
        toast('Could not auto-recover payment. Please contact support with your payment details.', { duration: 8000 })
      }
    }

    recoverPendingPayments()
  }, [userPubkey, screen])

  async function createDepositInvoice() {
    console.log('[Manager] 🔘 Create Stake Invoice button clicked')
    console.log('[Manager] 🔍 Current state:', { 
      isConnected, 
      goalWords, 
      stakeAmount, 
      dailyReward, 
      lightningAddress,
      loading 
    })
    
    // Wallet connection is already handled by UI - this function only runs when connected
    
    // Validate required fields
    if (!lightningAddress || !lightningAddress.includes('@')) {
      console.log('[Manager] ❌ Invalid lightning address:', lightningAddress)
      toast.error('Please enter a valid Lightning address (format: user@domain.com)')
      return
    }

    if (dailyReward <= 0) {
      console.log('[Manager] ❌ Invalid daily reward:', dailyReward)
      toast.error('Daily reward must be greater than 0')
      return
    }
    
    if (stakeAmount <= 0) {
      console.log('[Manager] ❌ Invalid stake amount:', stakeAmount)
      toast.error('Stake amount must be greater than 0')
      return
    }
    
    console.log('[Manager] ✅ All validations passed, creating invoice...')
    setLoading(true)
    setVerificationStarted(false) // Reset verification flag
    console.log('[Manager] Creating deposit invoice...')
    console.log('[Manager] Settings:', { goalWords, stakeAmount, dailyReward, lightningAddress })
    
    try {
      // Call backend to create invoice via YOUR NWC
      console.log('[Manager] 📡 Calling API with data:', {
        userPubkey,
        amountSats: stakeAmount,
        dailyReward: dailyReward,
        lightningAddress: lightningAddress,
        timestamp: Date.now()
      })
      
      const response = await fetch('/api/incentive/create-deposit-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey,
          amountSats: stakeAmount,
          dailyReward: dailyReward,
          lightningAddress: lightningAddress,
          timestamp: Date.now()
        })
      })
      
      console.log('[Manager] 📡 API response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.log('[Manager] ❌ API error response:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }
      
      const data = await response.json()
      console.log('[Manager] 📡 API response data:', data)
      
      if (!data.success) {
        console.log('[Manager] ❌ API returned success: false:', data.error)
        throw new Error(data.error || 'Failed to create invoice')
      }
      
      console.log('[Manager] ✅ Invoice created successfully:', {
        invoice: data.invoice?.substring(0, 50) + '...',
        paymentHash: data.paymentHash,
        amount: data.amount
      })
      
      // Extract real payment hash from BOLT11 invoice
      let realPaymentHash = data.paymentHash
      try {
        console.log('[Manager] 🔍 Decoding BOLT11 invoice to extract real payment hash...')
        const decoded = bolt11.decode(data.invoice)
        console.log('[Manager] 📋 Decoded invoice:', decoded)
        console.log('[Manager] 📋 Available fields:', Object.keys(decoded))
        
        // Try different possible field names for payment hash
        if (decoded.paymentHash) {
          realPaymentHash = decoded.paymentHash
          console.log('[Manager] ✅ Real payment hash extracted from paymentHash field:', realPaymentHash)
        } else if (decoded.payment_hash) {
          realPaymentHash = decoded.payment_hash
          console.log('[Manager] ✅ Real payment hash extracted from payment_hash field:', realPaymentHash)
        } else if (decoded.tags) {
          // Look for payment hash in tags
          const paymentHashTag = decoded.tags.find(tag => tag.tagName === 'payment_hash' || tag.tagName === 'h')
          if (paymentHashTag && paymentHashTag.data) {
            realPaymentHash = paymentHashTag.data
            console.log('[Manager] ✅ Real payment hash extracted from tags:', realPaymentHash)
          } else {
            console.log('[Manager] ⚠️ No payment hash found in tags, using API response hash')
            console.log('[Manager] 📋 Available tags:', decoded.tags.map(tag => ({ name: tag.tagName, data: tag.data?.toString().substring(0, 16) + '...' })))
          }
        } else {
          console.log('[Manager] ⚠️ No payment hash found in decoded invoice, using API response hash')
        }
      } catch (error) {
        console.log('[Manager] ⚠️ Failed to decode BOLT11 invoice:', error.message)
        console.log('[Manager] ⚠️ Using API response payment hash as fallback')
      }
      
      setInvoiceData({
        invoice: data.invoice,
        paymentHash: realPaymentHash,
        amount: data.amount
      })
      
      setScreen('invoice')
      
      // Note: Payment verification will start for QR code payments
      // Bitcoin Connect payments will also use the same verification polling for security
      
    } catch (error) {
      console.error('[Manager] ❌ Failed to create invoice:', error)
      console.error('[Manager] ❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      toast.error('Failed to create invoice: ' + error.message)
    } finally {
      // Set loading=false since we're showing the payment options screen
      setLoading(false)
      console.log('[Manager] 🔄 Invoice created, showing payment options')
    }
  }
  
  // ============================================
  // STEP 2: USER PAYS INVOICE (Bitcoin Connect)
  // ============================================
  
  async function payInvoice() {
    if (!invoiceData || !window.webln) return
    
    console.log('[Manager] 💸 Paying invoice via Bitcoin Connect...')
    console.log('[Manager] 🔒 SECURITY: Bitcoin Connect will ONLY trigger payment, verification via NWC only')
    
    try {
      // CRITICAL SECURITY: Start verification polling FIRST, before any Bitcoin Connect interaction
      // This ensures verification is ALWAYS running regardless of Bitcoin Connect behavior
      console.log('[Manager] 🔍 Starting NWC verification polling IMMEDIATELY...')
      setVerificationStarted(true)
      setScreen('verifying') // Show verifying state immediately
      startPaymentVerification(invoiceData.paymentHash, invoiceData.invoice)
      
      // Now attempt Bitcoin Connect payment (this is just a trigger, not verification)
      try {
        console.log('[Manager] 🔌 Attempting Bitcoin Connect payment trigger...')
        const paymentResult = await window.webln.sendPayment(invoiceData.invoice)
        console.log('[Manager] ✅ Bitcoin Connect payment triggered!', paymentResult)
        console.log('[Manager] 🔍 Payment verification is already running via NWC...')
        
        // Note: We do NOT trust this response - verification polling will confirm if payment was actually made
        
      } catch (weblnError) {
        console.log('[Manager] ⚠️ Bitcoin Connect payment failed, but NWC verification continues:', weblnError)
        console.log('[Manager] 🔍 Showing QR code fallback while NWC verification continues...')
        
        // Show QR code as fallback if Bitcoin Connect fails
        setPaymentMethod('invoice')
        setScreen('invoice')
      }
      
      // CRITICAL: Payment confirmation will ONLY happen via verification polling success
      // This completely prevents the security vulnerability of trusting Bitcoin Connect responses
      
    } catch (error) {
      console.error('[Manager] ❌ Bitcoin Connect payment process failed:', error)
      setLoading(false)
      toast.error('Payment failed. Try the QR code method instead.')
    }
  }
  
  // ============================================
  // STEP 3: VERIFY PAYMENT (Backend Polling)
  // ============================================
  
  function startPaymentVerification(paymentHash: string, invoice: string) {
    console.log('[Manager] ========================================')
    console.log('[Manager] 🔍 STARTING PAYMENT VERIFICATION')
    console.log('[Manager] 🔒 SECURITY: This is the ONLY way payments can be confirmed')
    console.log('[Manager] 🔒 SECURITY: Bitcoin Connect responses are NOT trusted')
    console.log('[Manager] ========================================')
    console.log('[Manager] Payment hash:', paymentHash)
    console.log('[Manager] Invoice preview:', invoice.substring(0, 50) + '...')
    console.log('[Manager] Payment method:', paymentMethod)
    console.log('[Manager] Will check every 3 seconds for up to 3 minutes')
    
    let attempts = 0
    const maxAttempts = 60 // 3 minutes (60 * 3 seconds)
    
    const interval = setInterval(async () => {
      attempts++
      
      try {
        console.log(`[Manager] 🔄 Verification attempt ${attempts}/${maxAttempts}`)
        console.log(`[Manager] Time remaining: ${Math.floor((maxAttempts - attempts) * 3 / 60)} minutes`)
        
        const response = await fetch('/api/incentive/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentHash,
            invoiceString: invoice
          })
        })
        
        const result = await response.json()
        console.log('[Manager] 📡 API response:', result)
        
        if (result.paid) {
          console.log('[Manager] ========================================')
          console.log('[Manager] 🎉 PAYMENT CONFIRMED!')
          console.log('[Manager] 🔒 SECURITY: Payment verified via NWC backend - NOT Bitcoin Connect')
          console.log('[Manager] ========================================')
          console.log('[Manager] API response amount:', result.amount)
          console.log('[Manager] Invoice amount:', invoiceData?.amount)
          
          clearInterval(interval)
          
          // Use invoice amount if API doesn't return amount
          const confirmedAmount = result.amount || invoiceData?.amount || stakeAmount
          console.log('[Manager] 💰 Crediting balance:', confirmedAmount, 'sats')
          console.log('[Manager] 💰 Amount sources:', { 
            apiAmount: result.amount, 
            invoiceAmount: invoiceData?.amount, 
            stakeAmount: stakeAmount,
            finalAmount: confirmedAmount 
          })
          
          if (!confirmedAmount || confirmedAmount <= 0) {
            console.error('[Manager] ❌ No amount available for crediting!')
            console.error('[Manager] ❌ Amount sources:', { 
              apiAmount: result.amount, 
              invoiceAmount: invoiceData?.amount, 
              stakeAmount: stakeAmount,
              finalAmount: confirmedAmount 
            })
            toast.error('Payment confirmed but amount could not be determined. Please contact support.')
            setLoading(false)
            return
          }
          
          await handlePaymentConfirmed(confirmedAmount)
          
          // Show payment success alert
          setShowPaymentSuccess(true)
          
          setLoading(false)
          
          // Trigger callbacks to update parent components and switch to Progress/Summary
          if (onStakeActivated) {
            onStakeActivated()
          }
          if (onSetupStatusChange) {
            onSetupStatusChange(true) // Stake is now active
          }
          
          // Wait a moment to show the success alert, then switch to Progress/Summary
          setTimeout(() => {
            setShowPaymentSuccess(false)
            setScreen('active')
          }, 2000)
          
          console.log('[Manager] ✅ Stake activated successfully!')
          
        } else if (attempts >= maxAttempts) {
          console.log('[Manager] ========================================')
          console.log('[Manager] ⏰ VERIFICATION TIMEOUT')
          console.log('[Manager] ========================================')
          console.log('[Manager] Checked', maxAttempts, 'times over 3 minutes')
          console.log('[Manager] No payment detected')
          
          clearInterval(interval)
          setLoading(false)
          
          toast.error('Payment verification timed out. If you paid, contact support with payment hash: ' + paymentHash.substring(0, 16) + '...')
          
        } else {
          // Still waiting
          console.log('[Manager] ⏳ Payment not confirmed yet, will check again in 3 seconds')
        }
        
      } catch (error) {
        console.error('[Manager] ❌ Verification error:', error)
        console.error('[Manager] ❌ Error details:', {
          message: error.message,
          attempts: attempts,
          maxAttempts: maxAttempts
        })
        
        if (attempts >= maxAttempts) {
          clearInterval(interval)
          setLoading(false)
          toast.error('Payment verification failed. Please try again.')
        }
      }
    }, 3000) // Check every 3 seconds
  }
  
  // ============================================
  // STEP 4: CREDIT BALANCE (Update Nostr Event)
  // ============================================
  // NOTE: Rewards are sent via NWC (Nostr Wallet Connect) backend service
  // This is separate from Bitcoin Connect which is used for user wallet connection
  // Bitcoin Connect = User deposits | NWC = Automated reward payouts
  
  async function handlePaymentConfirmed(amount: number) {
    const paymentHash = invoiceData?.paymentHash || ''
    console.log('[Manager] 💰 Payment confirmed, recording to server ledger first...', { amount, paymentHash: paymentHash.substring(0, 16) })

    // ── STEP 1: Record to server-side ledger (NWC double-verify + persist) ──
    // This runs BEFORE anything else. If the user closes the tab after this,
    // their payment is recorded and recoverable.
    try {
      const ledgerRes = await fetch('/api/incentive/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentHash,
          userPubkey,
          amountSats: amount,
          lightningAddress,
          goalWords,
          dailyReward,
          stakeConfig: { goalWords, dailyReward, lightningAddress, amount }
        })
      })
      const ledgerData = await ledgerRes.json()
      if (ledgerData.success) {
        console.log('[Manager] ✅ Payment recorded in server ledger')
      } else {
        console.warn('[Manager] ⚠️ Server ledger record failed:', ledgerData.error)
      }
    } catch (err) {
      console.warn('[Manager] ⚠️ Server ledger unreachable, continuing with localStorage backup')
    }

    // ── STEP 2: localStorage backup — survives tab close/refresh ──
    const pendingKey = `pending-stake-${userPubkey}`
    localStorage.setItem(pendingKey, JSON.stringify({
      paymentHash,
      amount,
      lightningAddress,
      goalWords,
      dailyReward,
      confirmedAt: new Date().toISOString()
    }))
    console.log('[Manager] 💾 Payment backed up to localStorage')

    // ── STEP 3: Move to active screen immediately ──
    setScreen('active')
    if (onStakeActivated) onStakeActivated()
    if (onSetupStatusChange) onSetupStatusChange(true)
    toast.success('Payment confirmed! Stake activated.')

    // ── STEP 4: Publish Nostr stake event in background (non-blocking) ──
    // Extension signing popup appears without freezing the UI.
    // If it fails, the server ledger + localStorage are the recovery path.
    ;(async () => {
    try {
      const { createStake } = await import('@/lib/lightning-goals')
      
      await createStake(userPubkey, {
        dailyWordGoal: goalWords,
        dailyReward: dailyReward,
        depositAmount: amount,
        lightningAddress: lightningAddress,
        currentWordCount: currentWordCount,
        paymentHash: paymentHash || 'confirmed'
      }, authData)
      
      console.log('[Manager] ✅ Nostr stake event published')

      // ── STEP 5: Mark as published in server ledger + clear localStorage backup ──
      if (paymentHash) {
        fetch('/api/incentive/record-payment', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentHash })
        }).catch(() => {}) // fire and forget
      }
      localStorage.removeItem(pendingKey)
      console.log('[Manager] 🧹 Cleared pending stake backup (Nostr published successfully)')
      
    } catch (error) {
      // Background publish failed — stake is still active via server ledger + localStorage
      console.error('[Manager] ⚠️ Background Nostr publish failed. Payment is safe in server ledger + localStorage. Will retry on next load.', error.message)
      toast('Stake saved. Sign the Nostr event when prompted to fully activate.', { duration: 6000 })
    }
    })()
  }
  
  // ============================================
  // RENDER
  // ============================================
  
  return (
    <div className="max-w-md mx-auto">
      {/* Show setup screen directly */}
      {screen === 'setup' && (
        <div className="space-y-4">
          {/* Optional wallet connection status */}
          {isConnected && (
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-green-600 font-medium">Wallet Connected</span>
            </div>
          )}
          {/* Optional wallet connection */}
          {!isConnected && (
            <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-sm text-foreground mb-2">
                Optional: Connect a wallet for 1-click payments
              </p>
              <WalletConnect />
            </div>
          )}
          
          {/* Consolidated Goal Setup Form */}
          <div className="bg-secondary rounded-lg p-6 border border-border">
            <h2 className="text-xl font-bold mb-6 text-center text-foreground">Create Your Writing Goal</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Daily Word Goal
                </label>
                <input
                  type="number"
                  value={goalWords || ''}
                  onChange={(e) => setGoalWords(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded bg-secondary text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none"
                  min="100"
                  step="50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many words you need to write each day
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Daily Reward (sats)
                </label>
                <input
                  type="number"
                  value={dailyReward || ''}
                  onChange={(e) => setDailyReward(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded bg-secondary text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none"
                  min="1"
                  step="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Reward you'll earn when you reach your daily goal
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Stake Amount (sats)
                </label>
                <input
                  type="number"
                  value={stakeAmount || ''}
                  onChange={(e) => setStakeAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded bg-secondary text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none"
                  min="10"
                  step="10"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Balance you'd like to load to your account
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Lightning Address
                </label>
                <input
                  type="text"
                  value={lightningAddress}
                  onChange={(e) => setLightningAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-secondary text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none"
                  placeholder="your@lightning.address"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Where rewards will be sent (auto-filled from your wallet or profile)
                </p>
                {!lightningAddress && (
                  <p className="text-xs text-primary mt-1">
                    No Lightning address found in wallet. Please enter one manually.
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {/* Primary Payment Button - Default to Bitcoin Connect */}
          <div className="pt-4 border-t border-border">
            <button
              onClick={async () => {
                if (!isConnected) {
                  toast('Connect your wallet using the button at the top of the page first')
                  return
                }
                setPaymentMethod('connect')
                await createDepositInvoice()
              }}
              disabled={loading || !lightningAddress || dailyReward <= 0 || stakeAmount <= 0}
              className="w-full py-4 bg-primary text-primary-foreground rounded-lg font-medium text-lg
                       hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-colors
                       flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Creating Invoice...
                </>
              ) : (
                <>
                  <Zap className="w-6 h-6" />
                  Create Stake Invoice
                </>
              )}
            </button>
            
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Pay instantly with your connected Bitcoin wallet
            </p>
            
            {/* Alternative Payment Method - Instant QR Code */}
            <div className="mt-4">
              <button
                onClick={async () => {
                  setPaymentMethod('invoice')
                  await createDepositInvoice()
                }}
                disabled={loading || !lightningAddress || dailyReward <= 0 || stakeAmount <= 0}
                className="w-full py-4 bg-secondary hover:bg-muted
                         disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed
                         text-foreground rounded-lg font-medium text-lg transition-all duration-200
                         flex items-center justify-center gap-2 border border-border"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Creating Invoice...
                  </>
                ) : (
                  <>
                    <Smartphone className="w-5 h-5" />
                    Or pay manually with QR code
                  </>
                )}
              </button>
              
              <div className="mt-3 text-xs text-muted-foreground text-center">
                <p>Scan with any Lightning wallet to pay instantly</p>
              </div>
            </div>
            
            {/* Validation Message */}
            {(!lightningAddress || dailyReward <= 0 || stakeAmount <= 0) && (
              <p className="text-xs text-red-500 text-center mt-3">
                Please fill in all fields with valid values
              </p>
            )}
            
          </div>
        </div>
      )}
      
      {/* Show invoice screen if screen is invoice */}
      {screen === 'invoice' && invoiceData && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">Pay Your Stake</h2>
          
          {/* Payment Success Alert */}
          {showPaymentSuccess && (
            <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-300">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold">Payment Confirmed!</span>
              </div>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Switching to Progress/Summary...
              </p>
            </div>
          )}
          
          {/* Show different UI based on payment method chosen */}
          {paymentMethod === 'connect' ? (
            // CONNECT WALLET FLOW: Show 1-click payment prominently
            <>
              {/* Primary: 1-Click Payment */}
              <div className="border border-border rounded-lg p-6 bg-secondary">
                <div className="text-center mb-4">
                  <div className="mb-3"><Zap className="w-12 h-12 text-primary mx-auto" /></div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Pay with Connected Wallet
                  </h3>
                  <p className="text-3xl font-bold font-mono text-primary mb-3">
                    {invoiceData.amount} sats
                  </p>
                </div>
                
                <button
                  onClick={payInvoice}
                  disabled={loading}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-lg font-medium text-lg
                           hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-colors"
                >
                  {loading ? 'Processing Payment...' : 'Pay Now'}
                </button>
                
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Instant 1-click payment from your connected wallet
                </p>
              </div>

              {/* Secondary: QR Code Alternative */}
              <details className="border border-border rounded-lg bg-secondary">
                <summary className="p-4 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Or scan QR code with another wallet
                </summary>
                <div className="p-4 border-t border-border">
                  <LightningInvoiceQR
                    invoice={invoiceData.invoice}
                    amount={invoiceData.amount}
                  />
                </div>
              </details>
            </>
          ) : (
            // GENERATE INVOICE FLOW: Show QR code prominently - Top-Up Style Design
            <>
              {/* Primary: QR Code */}
              <div className="bg-secondary p-6 rounded-lg border border-border">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Stake Payment
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {loading ? 'Waiting for payment...' : 'Scan QR code or copy invoice to pay'}
                  </p>
                </div>

                {/* QR Code */}
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-4 rounded-lg border-2 border-border">
                    <LightningInvoiceQR 
                      invoice={invoiceData.invoice}
                      amount={invoiceData.amount}
                    />
                  </div>
                </div>
                
                {/* Payment verification for QR code payments */}
                {paymentMethod === 'invoice' && loading && (
                  <div className="bg-primary/10 border border-primary/20 rounded p-3 text-sm text-foreground mb-4 flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    Checking for payment...
                    <div className="text-xs text-muted-foreground mt-1">
                      Checking every 3 seconds for up to 3 minutes
                    </div>
                  </div>
                )}
              </div>
              
              {/* Secondary: Connect Wallet Alternative */}
              <details className="border border-border rounded-lg bg-secondary">
                <summary className="p-4 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Or connect a wallet for 1-click payment
                </summary>
                <div className="p-4 border-t border-border text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Connect a WebLN-compatible wallet to pay instantly
                  </p>
                  <WalletConnect />
                  <button
                    onClick={payInvoice}
                    disabled={loading || !isConnected}
                    className="w-full mt-3 py-3 bg-primary text-primary-foreground rounded-lg font-medium
                             hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-colors"
                  >
                    {loading ? 'Processing...' : 'Pay with Connected Wallet'}
                  </button>
                </div>
              </details>
            </>
          )}
          
          {/* Payment Status (shown for both methods) */}
          {loading && (
            <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              <p className="text-sm font-medium text-foreground mb-2">
                Waiting for Payment...
              </p>
              <p className="text-xs text-muted-foreground">
                Pay the invoice above from any Lightning wallet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Checking automatically every 3 seconds
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This usually takes 5-30 seconds after you pay
              </p>
            </div>
          )}
          

               {/* Back Button */}
               <button
                 onClick={() => {
                   setScreen('setup')
                   setPaymentMethod(null)
                   setInvoiceData(null)
                   setVerificationStarted(false)
                 }}
                 className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
               >
                 ← Back to setup
               </button>
        </div>
      )}
      
      {/* Show verifying screen */}
      {screen === 'verifying' && (
        <div className="space-y-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            </div>
            <h2 className="text-xl font-bold text-foreground">Verifying Payment</h2>
            <p className="text-foreground">
              Please wait while we verify your payment...
            </p>
            <p className="text-sm text-muted-foreground">
              This may take up to 2 minutes
            </p>
          </div>
        </div>
      )}
      
      {/* Show active screen if connected and screen is active */}
      {isConnected && screen === 'active' && (
        <>
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle className="w-16 h-16 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Stake Active!</h2>
            <p className="text-muted-foreground">
              Write {goalWords} words today to earn your reward
            </p>
          </div>
        </>
      )}
    </div>
  )
}
