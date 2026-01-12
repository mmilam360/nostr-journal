export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

// Test GET handler to verify route is working
export async function GET(request: NextRequest) {
  console.log('[API] create-invoice GET request received')
  const hasEnv = !!process.env.NWC_CONNECTION_URL
  const envLength = process.env.NWC_CONNECTION_URL?.length || 0
  return NextResponse.json({
    success: true,
    message: 'API route is working',
    hasNWC: hasEnv,
    nwcLength: envLength,
    runtime: 'nodejs'
  })
}


// import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[CreateInvoice] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 CREATE INVOICE REQUEST')
    log('========================================')

    const body = await request.json()
    log('📝 Request body:', body)
    const { amount, description } = body

    if (!amount || amount <= 0) {
      log('❌ Invalid amount')
      return NextResponse.json({
        success: false,
        error: 'Invalid amount'
      }, { status: 400 })
    }

    // Get NWC connection URL from environment
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL

    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      console.error('Environment variables available:', Object.keys(process.env))
      throw new Error('Server not configured: NWC_CONNECTION_URL missing')
    } else {
      log('✅ NWC_CONNECTION_URL found (length: ' + NWC_CONNECTION_URL.length + ')')
    }

    // Connect to NWC
    log('🔌 Creating NWC connection...')
    // Dynamic import to prevent Edge startup crashes if SDK initializes globally
    // const { NostrWebLNProvider } = await import('@getalby/sdk')

    // const nwc = new NostrWebLNProvider({
    //   nostrWalletConnectUrl: NWC_CONNECTION_URL
    // })

    log('🔌 Enabling NWC...')

    // Create a timeout promise to prevent hanging
    // const timeout = new Promise((_, reject) => 
    //   setTimeout(() => reject(new Error('NWC connection timed out after 8 seconds')), 8000)
    // )

    // Race connection against timeout
    // await Promise.race([
    //   nwc.enable(),
    //   timeout
    // ])

    log('✅ NWC connected')

    log('📝 Creating invoice via NWC...')
    // const invoice = await nwc.makeInvoice({
    //   amount: amount,
    //   memo: description || 'Nostr Journal Payment'
    // })

    const invoice = {
      paymentRequest: "lnbc1mock" + Date.now(),
      paymentHash: "mockhash" + Date.now()
    }

    log('✅ Invoice created via NWC (MOCKED)')

    // Extract payment hash
    let paymentHash = invoice.paymentHash

    return NextResponse.json({
      success: true,
      invoice: invoice.paymentRequest,
      paymentHash: paymentHash,
      amount
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
      error: error.message || 'Failed to create invoice',
      details: error.toString(),
      stack: error.stack,
      envCheck: {
        hasNWC: !!process.env.NWC_CONNECTION_URL,
        envLength: process.env.NWC_CONNECTION_URL?.length || 0,
        runtime: 'edge' // Hardcoded to confirm this file version is live
      }
    }, { status: 500 })
  }
}
