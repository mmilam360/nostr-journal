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
    const invoice = await appNwc.lookupInvoice({ payment_hash: hash })

    // Alby Hub returns state:"settled" and settled_at: <timestamp> (not a boolean `settled` field)
    const paid = invoice.state === 'settled' || invoice.settled_at != null
    const amount = invoice.amount ? Math.round(invoice.amount / 1000) : undefined // msats → sats

    log('Invoice state:', invoice.state)
    log('settled_at:', invoice.settled_at)
    log('paid:', paid)

    return NextResponse.json({
      success: true,
      settled: paid,
      paid,
      amount,
      state: invoice.state,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    })

  } catch (error: any) {
    console.error('[VerifyPayment] ❌ Error:', error)
    return NextResponse.json({
      success: false,
      paid: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
