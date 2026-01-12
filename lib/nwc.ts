import { SimplePool, nip04, finalizeEvent, getPublicKey } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

/**
 * Lightweight NWC Client for Cloudflare Edge
 * Uses nostr-tools instead of @getalby/sdk to avoid strict Node.js dependencies
 */
export class NWCClient {
    private relayUrl: string
    private walletPubkey: string
    private secret: string // Client Private Key
    private pool: SimplePool

    constructor(connectionUri: string) {
        // Parse nostr+walletconnect://...
        // Output: pubkey, relay, secret
        const url = new URL(connectionUri.replace('nostr+walletconnect://', 'https://'))
        const pubkey = url.hostname || url.pathname.replace('//', '')
        const params = new URLSearchParams(url.search)
        const relay = params.get('relay')
        const secret = params.get('secret')

        if (!pubkey || !relay || !secret) {
            throw new Error('Invalid NWC Connection URL')
        }

        this.walletPubkey = pubkey
        this.relayUrl = relay
        this.secret = secret
        this.pool = new SimplePool()
    }

    async makeInvoice(amountSats: number, memo?: string): Promise<{ payment_request: string, payment_hash: string }> {
        return this.sendRequest('make_invoice', {
            amount: amountSats * 1000, // msats
            description: memo,
            description_hash: undefined // TODO if needed
        })
    }

    async lookupInvoice(paymentHash?: string, invoice?: string): Promise<any> {
        const params: any = {}
        if (paymentHash) params.payment_hash = paymentHash
        if (invoice) params.invoice = invoice

        return this.sendRequest('lookup_invoice', params)
    }

    async getInfo(): Promise<any> {
        return this.sendRequest('get_info', {})
    }

    private async sendRequest(method: string, params: any): Promise<any> {
        console.log(`[NWC] Sending ${method}...`)

        // 1. Construct JSON-RPC
        const payload = JSON.stringify({
            method,
            params,
        })

        // 2. Encrypt Content (NIP-04)
        // Note: nostr-tools v2 uses hex strings for keys usually? 
        // nip04.encrypt(privateKey, publicKey, text) (if using legacy) 
        // Check if secret is hex.

        // Cloudflare Edge Crypto check
        if (!globalThis.crypto || !globalThis.crypto.subtle) {
            console.warn('Crypto API missing? NWC might fail.')
        }

        const encryptedContent = await nip04.encrypt(this.secret, this.walletPubkey, payload)

        // 3. Create Request Event (Kind 23194)
        const eventTemplate = {
            kind: 23194,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', this.walletPubkey]],
            content: encryptedContent,
            pubkey: getPublicKey(hexToBytes(this.secret))
        }

        const signedEvent = finalizeEvent(eventTemplate, hexToBytes(this.secret))

        // 4. Subscribe to Response
        // We subscribe first to avoid missing the race
        const sub = this.pool.subscribeMany(
            [this.relayUrl],
            [
                {
                    kinds: [23195],
                    authors: [this.walletPubkey],
                    '#e': [signedEvent.id],
                },
            ] as any,
            {
                onevent: async (event) => {
                    // Handled in Promise wrapper Below
                }
            }
        )

        // 5. Publish Request
        await Promise.any(this.pool.publish([this.relayUrl], signedEvent))

        // 6. Wait for Response
        // Manual promise wrapper since SimplePool doesn't have "getOne" easily with subscription logic for specific logic
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                sub.close()
                reject(new Error('NWC Request Timed Out'))
            }, 10000)

            const handleEvent = async (event: any) => {
                if (event.kind === 23195 && event.tags.some((t: any) => t[0] === 'e' && t[1] === signedEvent.id)) {
                    clearTimeout(timeout)
                    sub.close()

                    try {
                        // Decrypt
                        const decrypted = await nip04.decrypt(this.secret, this.walletPubkey, event.content)
                        const response = JSON.parse(decrypted)

                        if (response.error) {
                            reject(new Error(response.error.message || 'NWC Error'))
                        } else {
                            resolve(response.result)
                        }
                    } catch (e) {
                        reject(new Error('Failed to decrypt NWC response'))
                    }
                }
            }

            // Re-implement simplified sub because subscribeMany is weird for single event
            this.pool.subscribeMany(
                [this.relayUrl],
                [{ kinds: [23195], authors: [this.walletPubkey], '#e': [signedEvent.id] }] as any,
                {
                    onevent: handleEvent
                }
            )
        })
    }
}
