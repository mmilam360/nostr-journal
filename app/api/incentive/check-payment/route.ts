import { NextRequest, NextResponse } from 'next/server'
import { NWCClient } from '@getalby/sdk'

function getAppNwc() {
  const nwcString = process.env.APP_NWC_STRING
  if (!nwcString) {
    throw new Error('APP_NWC_STRING not configured')
  }
  return new NWCClient({ nostrWalletConnectUrl: nwcString })
}

export async function POST(request: NextRequest) {
  try {
    const { paymentHash } = await request.json()

    if (!paymentHash) {
      return NextResponse.json({
        success: false,
        error: 'Payment hash required'
      }, { status: 400 })
    }

    console.log('[API] Checking payment for:', paymentHash)

    const appNwc = getAppNwc()
    const { settled } = await appNwc.lookupInvoice({ payment_hash: paymentHash })

    return NextResponse.json({
      success: true,
      paid: settled,
      settled
    })

  } catch (error) {
    console.error('[API] Error checking payment:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to check payment'
    }, { status: 500 })
  }
}
