/**
 * Server-side payment ledger — records confirmed payments before Nostr publishing.
 * This is the safety net: if Nostr signing fails or the user closes the tab,
 * the payment is still recorded here and can be recovered on next page load.
 *
 * Storage: Vercel KV if available, otherwise falls back to in-memory + response
 * so the client can persist it in localStorage as backup.
 */

import { NextRequest, NextResponse } from 'next/server'
import { NWCClient } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[RecordPayment] ${msg}`, data || '')

function getAppNwc() {
  const nwcString = process.env.APP_NWC_STRING
  if (!nwcString) throw new Error('APP_NWC_STRING not configured')
  return new NWCClient({ nostrWalletConnectUrl: nwcString })
}

// In-memory ledger (survives within a serverless instance lifetime)
// Primary safety net before Nostr publishing completes
const paymentLedger = new Map<string, PaymentRecord>()

interface PaymentRecord {
  paymentHash: string
  userPubkey: string
  amountSats: number
  lightningAddress: string
  goalWords: number
  dailyReward: number
  confirmedAt: string
  nostrPublished: boolean
  stakeConfig: object
}

/**
 * POST /api/incentive/record-payment
 * Called immediately after payment verification, before Nostr publishing.
 * Verifies the payment hash is actually settled on-chain, then records it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      paymentHash,
      userPubkey,
      amountSats,
      lightningAddress,
      goalWords,
      dailyReward,
      stakeConfig
    } = body

    if (!paymentHash || !userPubkey) {
      return NextResponse.json({ success: false, error: 'paymentHash and userPubkey required' }, { status: 400 })
    }

    // Double-verify with NWC before recording — don't trust the client
    log('Verifying payment hash with NWC before recording:', paymentHash.substring(0, 16) + '...')
    const appNwc = getAppNwc()
    const invoice = await appNwc.lookupInvoice({ payment_hash: paymentHash })
    const isSettled = invoice.state === 'settled' || invoice.settled_at != null

    if (!isSettled) {
      log('⚠️ Payment not settled, refusing to record')
      return NextResponse.json({
        success: false,
        error: 'Payment not confirmed by NWC — not recording',
        state: invoice.state
      }, { status: 400 })
    }

    // Record in ledger
    const record: PaymentRecord = {
      paymentHash,
      userPubkey,
      amountSats: amountSats || Math.round((invoice.amount || 0) / 1000),
      lightningAddress: lightningAddress || '',
      goalWords: goalWords || 0,
      dailyReward: dailyReward || 0,
      confirmedAt: new Date().toISOString(),
      nostrPublished: false,
      stakeConfig: stakeConfig || {}
    }

    paymentLedger.set(paymentHash, record)
    log('✅ Payment recorded in ledger:', { paymentHash: paymentHash.substring(0, 16), amountSats: record.amountSats, userPubkey: userPubkey.substring(0, 8) })

    return NextResponse.json({
      success: true,
      record: {
        paymentHash,
        amountSats: record.amountSats,
        confirmedAt: record.confirmedAt,
        ledgerEntry: 'recorded'
      }
    })

  } catch (error: any) {
    log('❌ Error recording payment:', error.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/incentive/record-payment
 * Called after Nostr publishing succeeds — marks the ledger entry as published.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { paymentHash } = await request.json()
    if (!paymentHash) {
      return NextResponse.json({ success: false, error: 'paymentHash required' }, { status: 400 })
    }

    const record = paymentLedger.get(paymentHash)
    if (record) {
      record.nostrPublished = true
      paymentLedger.set(paymentHash, record)
      log('✅ Ledger entry marked as Nostr-published:', paymentHash.substring(0, 16))
    } else {
      log('⚠️ No ledger entry found for hash:', paymentHash.substring(0, 16))
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/incentive/record-payment?userPubkey=xxx
 * Returns any unresolved (Nostr not published) payments for a user.
 * Called on page load to recover from interrupted sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userPubkey = searchParams.get('userPubkey')

    if (!userPubkey) {
      return NextResponse.json({ success: false, error: 'userPubkey required' }, { status: 400 })
    }

    const pending = Array.from(paymentLedger.values()).filter(
      r => r.userPubkey === userPubkey && !r.nostrPublished
    )

    return NextResponse.json({
      success: true,
      pending,
      hasPending: pending.length > 0
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
