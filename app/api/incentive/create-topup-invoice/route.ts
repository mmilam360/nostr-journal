import { NextRequest, NextResponse } from 'next/server'
import { NWCClient } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateTopUpInvoice] ${msg}`, data || '')

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
    log('📥 CREATE TOP-UP INVOICE REQUEST')
    log('========================================')

    const { userPubkey, amountSats, timestamp } = await request.json()

    log('📝 Amount:', amountSats, 'sats')
    log('📝 User:', userPubkey?.substring(0, 8))

    // Validate inputs
    if (!amountSats || amountSats <= 0) {
      throw new Error('Invalid amount: ' + amountSats)
    }

    if (!userPubkey || typeof userPubkey !== 'string') {
      throw new Error('Invalid userPubkey')
    }

    const appNwc = getAppNwc()
    const description = `Nostr Journal top-up - ${userPubkey.substring(0, 8)} - ${timestamp}`
    const { invoice, payment_hash } = await appNwc.makeInvoice({
      amount: amountSats * 1000, // Alby Hub NWC uses msats
      description
    })

    const response = {
      success: true,
      invoice,
      paymentHash: payment_hash,
      amount: amountSats * 1000, // Alby Hub NWC uses msats
      timestamp: new Date().toISOString()
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })

  } catch (error: any) {
    log('========================================')
    log('❌ ERROR CREATING TOP-UP INVOICE')
    log('❌ Error:', error.message)
    log('❌ Stack:', error.stack)
    log('========================================')

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })
  }
}
