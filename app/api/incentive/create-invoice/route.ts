import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

// Test GET handler to verify route is working
export async function GET(request: NextRequest) {
  console.log('[API] create-invoice GET request received')
  return NextResponse.json({
    success: true,
    message: 'API route is working'
  })
}


import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateInvoice] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 CREATE INVOICE REQUEST')
    log('========================================')

    const body = await request.json()
    log('📝 Request body:', body)
    const { amount, description } = body

    if (!amount || amount <= 0) {
      log('❌ Invalid amount')
      return NextResponse.json({
        success: false,
        error: 'Invalid amount'
      }, { status: 400 })
    }

    // Get NWC connection URL from environment
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL

    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      throw new Error('Server not configured: NWC_CONNECTION_URL missing')
    }

    // Connect to NWC
    log('🔌 Creating NWC connection...')
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })

    log('🔌 Enabling NWC...')
    await nwc.enable()
    log('✅ NWC connected')

    log('📝 Creating invoice via NWC...')
    const invoice = await nwc.makeInvoice({
      amount: amount,
      memo: description || 'Nostr Journal Payment'
    })

    log('✅ Invoice created via NWC')

    // Extract payment hash
    let paymentHash = invoice.paymentHash || invoice.payment_hash || invoice.rHash || invoice.r_hash

    if (!paymentHash && invoice.invoice) {
      paymentHash = invoice.invoice.paymentHash || invoice.invoice.payment_hash
    }

    if (!paymentHash) {
      log('⚠️ No payment hash found in NWC response')
      paymentHash = `fallback-${Date.now()}`
    }

    return NextResponse.json({
      success: true,
      invoice: invoice.paymentRequest,
      paymentHash: paymentHash,
      amount
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })

  } catch (error: any) {
    console.error('[CreateInvoice] ❌ Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create invoice'
    }, { status: 500 })
  }
}
