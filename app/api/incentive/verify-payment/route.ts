import { NextRequest, NextResponse } from 'next/server'
import { NWCClient } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[VerifyPayment] ${msg}`, data || '')

function getAppNwc() {
  const nwcString = process.env.APP_NWC_STRING
  if (!nwcString) {
    throw new Error('APP_NWC_STRING not configured')
  }
  return new NWCClient({ nostrWalletConnectUrl: nwcString })
}

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 VERIFY PAYMENT REQUEST')
    log('========================================')
    const body = await request.json()
    const { paymentHash, payment_hash } = body
    const hash = paymentHash || payment_hash

    if (!hash) {
      return NextResponse.json({
        success: false,
        error: 'paymentHash required'
      }, { status: 400 })
    }

    const appNwc = getAppNwc()
    const { settled } = await appNwc.lookupInvoice({ payment_hash: hash })

    return NextResponse.json({
      success: true,
      settled,
      paid: settled
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
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
