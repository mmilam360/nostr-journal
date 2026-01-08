import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'
import { NostrWebLNProvider } from '@getalby/sdk'

const log = (msg: string, data?: any) => console.log(`[VerifyPayment] ${msg}`, data || '')

export async function POST(request: NextRequest) {
  try {
    log('========================================')
    log('📥 VERIFY PAYMENT REQUEST')
    log('========================================')

    const { paymentHash, invoiceString } = await request.json()

    log('🔍 Payment hash:', paymentHash)
    log('🔍 Has invoice string:', !!invoiceString)
    log('🔍 Invoice string length:', invoiceString?.length || 0)
    log('🔍 Invoice string preview:', invoiceString?.substring(0, 50) + '...' || 'None')

    // Validate payment hash format - accept both real payment hashes and tracking IDs
    if (!paymentHash) {
      throw new Error('Missing payment hash')
    }

    // Check if it's a real payment hash (64 hex chars) or tracking ID (contains dashes)
    const isRealPaymentHash = paymentHash.length === 64 && /^[a-f0-9]{64}$/i.test(paymentHash)
    const isTrackingId = paymentHash.includes('-') && paymentHash.length > 10

    if (!isRealPaymentHash && !isTrackingId) {
      throw new Error(`Invalid payment hash format: ${paymentHash} (expected 64-char hex or tracking ID)`)
    }

    log('🔍 Payment hash type:', isRealPaymentHash ? 'real_payment_hash' : 'tracking_id')
    log('🔍 Payment hash value:', paymentHash)
    log('🔍 Payment hash length:', paymentHash.length)
    log('🔍 Is real payment hash?', isRealPaymentHash)
    log('🔍 Is tracking ID?', isTrackingId)

    // Get NWC connection URL from environment
    const NWC_CONNECTION_URL = process.env.NWC_CONNECTION_URL

    if (!NWC_CONNECTION_URL) {
      log('❌ NWC_CONNECTION_URL not configured!')
      throw new Error('Server not configured: NWC_CONNECTION_URL missing')
    }

    log('✅ NWC_CONNECTION_URL found')
    log('🔌 NWC preview:', NWC_CONNECTION_URL.substring(0, 50) + '...')

    // Connect to NWC
    log('🔌 Creating NWC connection...')

    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: NWC_CONNECTION_URL
    })

    log('🔌 Enabling NWC...')
    await nwc.enable()

    log('✅ NWC connected successfully')

    // Get wallet info and VERIFY permissions
    log('📱 Getting wallet info...')
    let walletInfo = null
    try {
      walletInfo = await nwc.getInfo()
      log('📱 Wallet info:', {
        alias: walletInfo.alias || 'Unknown',
        pubkey: walletInfo.pubkey?.substring(0, 16) || 'Unknown',
        network: walletInfo.network || 'Unknown',
        methods: walletInfo.methods || []
      })

      // CRITICAL: Check if lookup_invoice method is available
      if (walletInfo.methods && Array.isArray(walletInfo.methods)) {
        const hasLookupInvoice = walletInfo.methods.includes('lookup_invoice') ||
          walletInfo.methods.includes('lookupInvoice')

        if (!hasLookupInvoice) {
          log('❌ lookup_invoice method NOT available!')
          log('❌ Available methods:', walletInfo.methods)

          // Return error - payment verification is not possible
          return NextResponse.json({
            success: false,
            paid: false,
            error: 'NWC connection does not have lookup_invoice permission. Please reconfigure with lookup_invoice enabled.',
            availableMethods: walletInfo.methods
          }, {
            status: 400,
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            }
          })
        } else {
          log('✅ lookup_invoice method is available')
        }
      } else {
        log('❌ Could not verify NWC methods!')
        throw new Error('Could not verify NWC connection permissions')
      }
    } catch (infoError: any) {
      log('❌ Could not get wallet info:', infoError.message)
      throw new Error('Failed to verify NWC connection: ' + infoError.message)
    }

    // Look up invoice via NWC
    log('🔍 Looking up invoice via NWC...')
    log('📋 Payment hash:', paymentHash)
    log('📋 Payment hash length:', paymentHash.length)
    log('📋 Invoice string length:', invoiceString?.length || 0)
    log('📋 Invoice string preview:', invoiceString?.substring(0, 50) + '...' || 'None')
    log('📋 Full invoice string:', invoiceString)

    let invoiceStatus: any = null
    let lookupMethod = 'invoice_verification'

    // CRITICAL: Invoice string is REQUIRED for verification
    if (!invoiceString) {
      log('❌ No invoice string provided - cannot verify payment!')
      return NextResponse.json({
        success: false,
        paid: false,
        error: 'Invoice string is required for payment verification'
      }, {
        status: 400,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      })
    }

    try {
      log('🔍 Attempting invoice lookup via NWC...')
      log('📋 Invoice string length:', invoiceString.length)
      log('📋 Invoice preview:', invoiceString.substring(0, 50) + '...')

      // Try direct invoice string (recommended by Alby SDK)
      try {
        log('🔍 Calling nwc.lookupInvoice(invoiceString) directly...')
        invoiceStatus = await nwc.lookupInvoice(invoiceString)
        lookupMethod = 'nwc_invoice_direct'
        log('✅ Invoice lookup successful!')
        log('📋 Invoice status response:', JSON.stringify(invoiceStatus, null, 2))

      } catch (directError: any) {
        log('❌ Direct invoice lookup failed:', directError.message)
        log('❌ Error type:', directError.constructor.name)
        log('❌ Error stack:', directError.stack)

        // If direct method fails, the invoice lookup is not working
        // This could mean:
        // 1. The invoice is not found (wrong invoice string)
        // 2. The NWC connection doesn't have proper permissions
        // 3. The invoice is still pending (not paid yet)
        throw directError
      }

    } catch (lookupError: any) {
      log('========================================')
      log('❌ INVOICE LOOKUP FAILED')
      log('❌ Error:', lookupError.message)
      log('❌ Error type:', lookupError.constructor.name)
      log('========================================')

      // Return NOT PAID (this is normal for pending invoices)
      // The frontend will continue polling
      return NextResponse.json({
        success: true,  // Request succeeded
        paid: false,    // But payment is not confirmed
        error: lookupError.message,
        state: 'pending',
        lookupMethod: 'lookup_failed'
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      })
    }

    log('📋 Invoice status received:', JSON.stringify(invoiceStatus, null, 2))

    // CRITICAL: Check if paid - MUST be explicitly confirmed
    log('========================================')
    log('🔍 CHECKING PAYMENT STATUS')
    log('========================================')
    log('📋 Raw invoice status:', JSON.stringify(invoiceStatus, null, 2))
    log('  settled:', invoiceStatus?.settled)
    log('  state:', invoiceStatus?.state)
    log('  status:', invoiceStatus?.status)
    log('  paid:', invoiceStatus?.paid)

    // STRICT CHECK: Payment is ONLY confirmed if explicitly marked as settled/paid
    const isPaid = !!(
      invoiceStatus.settled === true ||
      invoiceStatus.state === 'SETTLED' ||
      invoiceStatus.status === 'SETTLED' ||
      invoiceStatus.paid === true
    )

    // Extract amount from various possible fields
    const amount = invoiceStatus.amount ||
      invoiceStatus.value ||
      (invoiceStatus.amt_msat ? Math.floor(invoiceStatus.amt_msat / 1000) : null)

    log('========================================')
    log('🔍 PAYMENT VERIFICATION RESULT')
    log('========================================')
    log('✅ Is Paid:', isPaid ? 'YES - PAYMENT CONFIRMED' : 'NO - PAYMENT NOT CONFIRMED')
    log('💰 Amount:', amount, 'sats')
    log('🔍 Lookup method:', lookupMethod)
    log('🔍 Settled at:', invoiceStatus.settled_at || invoiceStatus.settledAt || 'N/A')
    log('🔍 State:', invoiceStatus.state || invoiceStatus.status || 'unknown')
    log('========================================')

    // CRITICAL: Only return paid:true if NWC explicitly confirmed payment
    if (!isPaid) {
      log('⏳ Payment not yet confirmed - returning paid:false')
      return NextResponse.json({
        success: true,
        paid: false,
        amount: amount,
        state: invoiceStatus.state || invoiceStatus.status || 'pending',
        lookupMethod: lookupMethod,
        message: 'Payment not yet confirmed by NWC'
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      })
    }

    log('🎉 PAYMENT CONFIRMED BY NWC!')
    log('💰 Returning paid:true with amount:', amount, 'sats')

    const response = {
      success: true,
      paid: true,
      amount: amount,
      settledAt: invoiceStatus.settled_at || invoiceStatus.settledAt,
      state: invoiceStatus.state || invoiceStatus.status,
      lookupMethod: lookupMethod
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })

  } catch (error: any) {
    log('========================================')
    log('❌ ERROR VERIFYING PAYMENT')
    log('❌ Error:', error.message)
    log('❌ Stack:', error.stack)
    log('========================================')

    return NextResponse.json({
      success: false,
      paid: false,
      error: error.message,
      details: error.stack
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    })
  }
}