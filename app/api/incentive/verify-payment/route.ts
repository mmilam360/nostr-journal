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

    // Connect to NWC using lightweight client
    const { NWCClient } = await import('@/lib/nwc')
    const nwc = new NWCClient(process.env.NWC_CONNECTION_URL!)

    // Look up invoice via NWC
    log('🔍 Looking up invoice via NWC...')

    // NWC lookup_invoice({ payment_hash: ... })
    // Returns { settled: true/false, amount: msats, ... }
    const invoiceStatus = await nwc.lookupInvoice(paymentHash)

    log('✅ Invoice lookup successful!', invoiceStatus)

    const isPaid = invoiceStatus.settled || invoiceStatus.status === 'paid' || invoiceStatus.paid === true
    const amountSats = invoiceStatus.amount ? Math.floor(invoiceStatus.amount / 1000) : 0

    if (isPaid) {
      return NextResponse.json({
        success: true,
        paid: true,
        amount: amountSats,
        settledAt: invoiceStatus.settled_at || Date.now() / 1000,
        state: 'SETTLED',
        lookupMethod: 'nwc_light'
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })
    } else {
      return NextResponse.json({
        success: true,
        paid: false,
        state: 'PENDING',
        lookupMethod: 'nwc_light'
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })
    }
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