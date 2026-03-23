import { NextRequest, NextResponse } from 'next/server'
import { NWCClient } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateDepositInvoice] ${msg}`, data || '')

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
    log('📥 CREATE DEPOSIT INVOICE REQUEST')
    log('========================================')

    const body = await request.json()
    const { userPubkey, amountSats } = body

    if (!amountSats || amountSats <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid amountSats'
      }, { status: 400 })
    }

    const appNwc = getAppNwc()
    const description = `Nostr Journal stake deposit - ${userPubkey?.substring(0, 8) || 'user'}`
    const { invoice, payment_hash } = await appNwc.makeInvoice({
      amount: amountSats,
      description
    })

    return NextResponse.json({
      success: true,
      invoice,
      paymentHash: payment_hash,
      amount: amountSats
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  } catch (err: any) {
    log('❌ Error creating deposit invoice:', err.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
