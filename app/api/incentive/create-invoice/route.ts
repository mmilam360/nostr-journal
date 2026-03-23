import { NextRequest, NextResponse } from 'next/server'
import { NWCClient } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateInvoice] ${msg}`, data || '')

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
    log('📥 CREATE INVOICE REQUEST')
    log('========================================')

    const body = await request.json()
    log('📝 Request body:', body)
    const { amount, amountSats, description } = body
    const invoiceAmount = amountSats ?? amount

    if (!invoiceAmount || invoiceAmount <= 0) {
      log('❌ Invalid amount')
      return NextResponse.json({
        success: false,
        error: 'Invalid amount'
      }, { status: 400 })
    }

    const appNwc = getAppNwc()
    log('📝 Creating invoice via NWC...')

    const { invoice, payment_hash } = await appNwc.makeInvoice({
      amount: invoiceAmount,
      description: description || 'Nostr Journal Payment'
    })

    log('✅ Invoice created via NWC')

    return NextResponse.json({
      success: true,
      invoice,
      paymentHash: payment_hash,
      amount: invoiceAmount
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })

  } catch (error: any) {
    console.error('[CreateInvoice] ❌ Error:', error)
    console.error('[CreateInvoice] ❌ Stack:', error.stack)
    console.error('[CreateInvoice] ❌ Message:', error.message)
    console.error('[CreateInvoice] ❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)))

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
