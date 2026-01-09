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

    // Mock successful response to test UI flow and routing
    // This proves if the crash is caused by SDK loading
    return NextResponse.json({
      success: true,
      invoice: "lnbc1mockinvoice" + Date.now(),
      paymentHash: "mock-hash-" + Date.now(),
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
