"use client"

import { signEventWithRemote } from "@/lib/signer-manager"
import { publishSignedEvent } from "@/lib/nostr-storage"

type PayoutRecordInput = {
  userPubkey: string
  date: string
  amountSats: number
  preimage: string
  authData: any
}

export async function publishPayoutRecord({
  userPubkey,
  date,
  amountSats,
  preimage,
  authData
}: PayoutRecordInput): Promise<string> {
  if (!preimage) {
    throw new Error("Missing preimage for payout record")
  }

  const event = {
    kind: 30051,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", date],
      ["date", date],
      ["amount", String(amountSats)],
      ["status", "paid"],
      ["preimage", preimage]
    ],
    content: "",
    pubkey: userPubkey
  }

  const signedEvent = await signEventWithRemote(event, authData)
  await publishSignedEvent(signedEvent)
  return signedEvent.id
}
