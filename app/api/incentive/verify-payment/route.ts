export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
// import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[VerifyPayment] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 VERIFY PAYMENT REQUEST (MOCK MODE)')
    log('========================================')
    const body = await request.json()
    const { paymentHash, invoiceString } = body

    // Zero-Dependency Mock Mode
    const isMock = paymentHash.startsWith('mock_hash_')

    if (isMock) {
      log('✅ Auto-Approving Simulation Invoice')
      return NextResponse.json({
        success: true,
        paid: true,
        amount: 1000,
        settledAt: Date.now() / 1000,
        state: 'SETTLED',
        lookupMethod: 'simulation'
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })
    }

    return NextResponse.json({
      success: true,
      paid: false,
      state: 'PENDING'
    })

  } catch (error: any) {
    console.error('[VerifyPayment] ❌ Error:', error)
    return NextResponse.json({
      success: false,
      paid: false,
      error: error.message
    }, { status: 500 })
  }
}