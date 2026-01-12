export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
// import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateDepositInvoice] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 CREATE DEPOSIT INVOICE REQUEST (MOCK MODE)')
    log('========================================')

    const body = await request.json()
    const { userPubkey, amountSats } = body

    // Connect to NWC
    log('🔌 Creating NWC connection...')
    // const { NostrWebLNProvider } = await import('@getalby/sdk')

    // const nwc = new NostrWebLNProvider({
    //   nostrWalletConnectUrl: NWC_CONNECTION_URL
    // })

    log('🔌 Enabling NWC...')
    // await nwc.enable()
    log('✅ NWC connected successfully')

    // Create invoice via NWC
    log('📝 Creating deposit invoice via NWC...')
    // const invoice = await nwc.makeInvoice({
    //   amount: amountSats,
    //   memo: `Nostr Journal Stake Deposit - ${userPubkey.substring(0, 8)}`
    // })
    // Mock for now
    const invoice = {
      paymentRequest: "lnbc1mock" + Date.now(),
      paymentHash: "mockhash" + Date.now()
    }

    // Mock successful response to test UI flow and routing
    // This proves if the crash is caused by SDK loading
    return NextResponse.json({
      success: true,
      invoice: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
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
