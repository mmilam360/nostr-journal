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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userPubkey,
      date,
      userNwcString,
      dailyRewardSats,
      amount,
      memo
    } = body

    const payoutAmount = dailyRewardSats ?? amount

    if (!userPubkey || typeof userPubkey !== 'string') {
      return NextResponse.json({ success: false, error: 'userPubkey required' }, { status: 400 })
    }

    if (!userNwcString || typeof userNwcString !== 'string') {
      return NextResponse.json({ success: false, error: 'userNwcString required' }, { status: 400 })
    }

    if (!payoutAmount || payoutAmount <= 0) {
      return NextResponse.json({ success: false, error: 'dailyRewardSats required' }, { status: 400 })
    }

    const appNwc = getAppNwc()
    const userNwc = new NWCClient({ nostrWalletConnectUrl: userNwcString })
    const payoutDate = date || new Date().toISOString().split('T')[0]
    const description = memo || `Nostr Journal reward - ${payoutDate}`

    log('Creating user invoice...')
    const { invoice: payoutInvoice } = await userNwc.makeInvoice({
      amount: payoutAmount,
      description
    })

    log('Paying user invoice...')
    const { preimage } = await appNwc.sendPayment(payoutInvoice)
    const paymentHash = preimage
      ? createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex')
      : undefined

    return NextResponse.json({
      success: true,
      preimage,
      paymentHash,
      amountSats: payoutAmount
    })
  } catch (error: any) {
    log('❌ Error sending reward:', error.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
