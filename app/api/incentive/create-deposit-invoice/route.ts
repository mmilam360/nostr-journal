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

    // Zero-Dependency Mock Mode
    log('⚠️ Using Zero-Dependency Simulation Mode')

    // Generate a simulated invoice (just a random string, not a real BOLT11)
    // In a real scenario without SDK, we would fetch from a standalone LNURL service or similar.
    const mockInvoice = "lnbc" + Date.now() + "1mockinvoice" + userPubkey.substring(0, 6)
    const mockHash = "mock_hash_" + Date.now()

    return NextResponse.json({
      success: true,
      invoice: mockInvoice,
      paymentHash: mockHash,
      amount: amountSats,
      message: "Simulation Mode - Invoice Created"
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
