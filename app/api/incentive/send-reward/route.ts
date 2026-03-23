import { NextRequest, NextResponse } from 'next/server'
import { NWCClient } from '@getalby/sdk'
import { createHash } from 'crypto'

const log = (msg: string, data?: any) => console.log(`[SendReward] ${msg}`, data || '')

function getAppNwc() {
  const nwcString = process.env.APP_NWC_STRING
  if (!nwcString) {
    throw new Error('APP_NWC_STRING not configured')
  }
  return new NWCClient({ nostrWalletConnectUrl: nwcString })
}

function getPayoutDate(date?: string) {
  return date || new Date().toISOString().split('T')[0]
}

async function payToLightningAddress(lightningAddress: string, amountSats: number, description: string) {
  const [name, domain] = lightningAddress.trim().toLowerCase().split('@')

  if (!name || !domain) {
    throw new Error('Invalid lightningAddress')
  }

  const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`, {
    cache: 'no-store'
  })
  if (!lnurlRes.ok) {
    throw new Error('Failed to resolve lightning address')
  }

  const lnurlData = await lnurlRes.json()
  if (!lnurlData?.callback) {
    throw new Error('Lightning address callback missing')
  }

  const amountMsats = amountSats * 1000
  const callbackUrl = new URL(lnurlData.callback)
  callbackUrl.searchParams.set('amount', String(amountMsats))

  if (lnurlData.commentAllowed && description) {
    callbackUrl.searchParams.set('comment', description.slice(0, lnurlData.commentAllowed))
  }

  const invoiceRes = await fetch(callbackUrl.toString(), {
    cache: 'no-store'
  })
  if (!invoiceRes.ok) {
    throw new Error('Failed to get invoice from lightning address')
  }

  const invoiceData = await invoiceRes.json()
  const invoice = invoiceData?.pr
  if (!invoice || typeof invoice !== 'string') {
    throw new Error('Lightning address did not return an invoice')
  }

  const appNwc = getAppNwc()
  const { preimage } = await appNwc.payInvoice({ invoice })
  return { preimage, invoice }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userPubkey,
      date,
      lightningAddress,
      dailyRewardSats,
      amount,
      memo
    } = body

    const payoutAmount = dailyRewardSats ?? amount

    if (!userPubkey || typeof userPubkey !== 'string') {
      return NextResponse.json({ success: false, error: 'userPubkey required' }, { status: 400 })
    }

    if (!lightningAddress || typeof lightningAddress !== 'string' || !lightningAddress.includes('@')) {
      return NextResponse.json({ success: false, error: 'lightningAddress required' }, { status: 400 })
    }

    if (!payoutAmount || payoutAmount <= 0) {
      return NextResponse.json({ success: false, error: 'dailyRewardSats required' }, { status: 400 })
    }

    const payoutDate = getPayoutDate(date)
    const description = memo || `Nostr Journal reward - ${payoutDate}`

    log('Paying lightning address...', { lightningAddress, payoutAmount })
    const { preimage, invoice } = await payToLightningAddress(lightningAddress, payoutAmount, description)
    const paymentHash = preimage
      ? createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex')
      : undefined

    return NextResponse.json({
      success: true,
      preimage,
      invoice,
      paymentHash,
      amountSats: payoutAmount,
      date: payoutDate
    })
  } catch (error: any) {
    log('❌ Error sending reward:', error.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
