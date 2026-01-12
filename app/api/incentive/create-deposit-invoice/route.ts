export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
// import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateDepositInvoice] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 CREATE DEPOSIT INVOICE REQUEST')
    log('========================================')

    const body = await request.json()
    const { userPubkey, amountSats } = body

    // Connect to NWC
    log('🔌 Creating NWC connection...')
    const { NWCClient } = await import('@/lib/nwc') // Dynamic import to be safe

    const nwc = new NWCClient(process.env.NWC_CONNECTION_URL!)

    log('📝 Creating deposit invoice via NWC...')
    const invoice = await nwc.makeInvoice(
      amountSats,
      `Nostr Journal Stake Deposit - ${userPubkey.substring(0, 8)}`
    )

    // Map NWC response to our format
    const responseInvoice = {
      paymentRequest: invoice.payment_request,
      paymentHash: invoice.payment_hash
    }

    log('✅ Invoice created via NWC (Real)', responseInvoice)

    // Mock successful response to test UI flow and routing
    // This proves if the crash is caused by SDK loading
    return NextResponse.json({
      success: true,
      invoice: responseInvoice.paymentRequest,
      paymentHash: responseInvoice.paymentHash,
      amount: amountSats,
      note: "MOCK MODE - SDK Crash Debugging"
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })

  } catch (error: any) {
    console.error('[CreateDepositInvoice] ❌ Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
