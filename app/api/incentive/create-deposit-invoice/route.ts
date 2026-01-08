import { NextRequest, NextResponse } from 'next/server'
// export const runtime = 'edge'
export const runtime = 'nodejs'
import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateDepositInvoice] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 CREATE DEPOSIT INVOICE REQUEST')
    log('========================================')

    const body = await request.json()
    log('📝 Request body:', body)
    const { userPubkey, amountSats, dailyReward, lightningAddress } = body

    // Validate inputs
    if (!userPubkey || !amountSats || amountSats <= 0) {
      log('❌ Invalid inputs')
      return NextResponse.json({
        success: false,
        error: 'Missing required fields or invalid amount'
      }, { status: 400 })
    }

    // Get NWC connection URL from environment
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL

    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      throw new Error('Server not configured: NWC_CONNECTION_URL missing')
    }

    log('✅ NWC_CONNECTION_URL found')

    // Connect to NWC
    log('🔌 Creating NWC connection...')
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })

    log('🔌 Enabling NWC...')
    await nwc.enable()
    log('✅ NWC connected successfully')

    // Create invoice via NWC
    log('📝 Creating deposit invoice via NWC...')
    const invoice = await nwc.makeInvoice({
      amount: amountSats,
      memo: `Nostr Journal Stake Deposit - ${userPubkey.substring(0, 8)}`
    })

    log('✅ Deposit invoice created via NWC')

    // Extract payment hash
    let paymentHash = invoice.paymentHash || invoice.payment_hash || invoice.rHash || invoice.r_hash

    if (!paymentHash && invoice.invoice) {
      paymentHash = invoice.invoice.paymentHash || invoice.invoice.payment_hash
    }

    if (!paymentHash) {
      // Fallback if we can't get the hash, though this is risky for verification
      log('⚠️ No payment hash found in NWC response')
      paymentHash = `fallback-${Date.now()}` // Should verify if this is acceptable
    }

    log('✅ Payment hash:', paymentHash)

    // Note: We are NO LONGER interpreting 'global' persistence here.
    // The client will initiate payment, and verification will follow via LNBits/NWC lookup.

    return NextResponse.json({
      success: true,
      invoice: invoice.paymentRequest,
      paymentHash: paymentHash,
      amount: amountSats
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })

  } catch (error: any) {
    console.error('[CreateDepositInvoice] ❌ Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create deposit invoice'
    }, { status: 500 })
  }
}
