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

    log('🔍 Payment hash:', paymentHash)

    // MOCK LOGIN INSTEAD OF NWC LOOKUP
    // Verify if this matches our mock data pattern (or any request for now)
    const isMock = true

    if (isMock) {
      log('✅ Detected Mock Payment Hash - Auto-Confirming')
      return NextResponse.json({
        success: true,
        paid: true,
        amount: 1000, // Mock amount
        settledAt: Date.now() / 1000,
        state: 'SETTLED',
        lookupMethod: 'mock_confirmation'
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })
    }

    // Default mock response
    return NextResponse.json({
      success: true,
      paid: false,
      message: "SDK Disabled - Mock Mode",
      state: 'pending'
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    })

  } catch (error: any) {
    console.error('[VerifyPayment] ❌ Error:', error)
    return NextResponse.json({
      success: false,
      paid: false,
      error: error.message,
      details: error.stack
    }, { status: 500 })
  }
}