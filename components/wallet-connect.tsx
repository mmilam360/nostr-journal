'use client'

import { useEffect, useState } from 'react'
import { ClientOnly } from './client-only'
import { toast } from 'sonner'

export function WalletConnect() {
  return (
    <ClientOnly fallback={<div className="p-4 text-center">Loading wallet...</div>}>
      <WalletConnectInner />
    </ClientOnly>
  )
}

function WalletConnectInner() {
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [walletInfo, setWalletInfo] = useState<any>(null)
  
  useEffect(() => {
    const initializeBitcoinConnect = async () => {
      try {
        // Wait for Bitcoin Connect to be available
        if (typeof window !== 'undefined' && window.customElements) {
          // Check if webln is already available
          if (window.webln && window.webln.enabled) {
            console.log('[WalletConnect] ✅ WebLN already available')
            setIsConnected(true)
            try {
              const info = await window.webln.getInfo()
              setWalletInfo(info)
            } catch (error) {
              console.log('[WalletConnect] ⚠️ Could not get wallet info:', error)
            }
          }
          
          // Listen for connection events
          const handleConnected = async () => {
            console.log('[WalletConnect] ✅ Wallet connected event received')
            setIsConnected(true)
            try {
              if (window.webln) {
                const info = await window.webln.getInfo()
                setWalletInfo(info)
                console.log('[WalletConnect] 📊 Wallet info:', info)
              }
            } catch (error) {
              console.log('[WalletConnect] ⚠️ Could not get wallet info after connection:', error)
            }
          }
          
          const handleDisconnected = () => {
            console.log('[WalletConnect] ❌ Wallet disconnected event received')
            setIsConnected(false)
            setWalletInfo(null)
          }
          
          // Add event listeners
          document.addEventListener('bc:connected', handleConnected)
          document.addEventListener('bc:disconnected', handleDisconnected)
          
          setIsLoading(false)
          
          return () => {
            document.removeEventListener('bc:connected', handleConnected)
            document.removeEventListener('bc:disconnected', handleDisconnected)
          }
        }
      } catch (error) {
        console.error('[WalletConnect] ❌ Error initializing Bitcoin Connect:', error)
        setIsLoading(false)
      }
    }
    
    initializeBitcoinConnect()
  }, [])
  
  const handleConnect = async () => {
    try {
      console.log('[WalletConnect] 🔘 Connect button clicked')
      
      // Import Bitcoin Connect dynamically
      const { requestProvider } = await import('@getalby/bitcoin-connect')
      
      // Request provider connection
      const provider = await requestProvider()
      
      if (provider) {
        console.log('[WalletConnect] ✅ Provider connected:', provider)
        
        // Set webln on window for compatibility
        window.webln = provider
        
        // Ensure enabled property is set
        if (window.webln) {
          window.webln.enabled = true
        }
        
        // Get wallet info
        try {
          const info = await provider.getInfo()
          setWalletInfo(info)
          console.log('[WalletConnect] 📊 Wallet info:', info)
        } catch (error) {
          console.log('[WalletConnect] ⚠️ Could not get wallet info:', error)
        }
        
        setIsConnected(true)
      }
    } catch (error) {
      console.error('[WalletConnect] ❌ Connection failed:', error)
      toast.error('Failed to connect wallet: ' + error.message)
    }
  }
  
  const handleDisconnect = async () => {
    try {
      if (window.webln && window.webln.disconnect) {
        await window.webln.disconnect()
      }
      setIsConnected(false)
      setWalletInfo(null)
      console.log('[WalletConnect] ✅ Wallet disconnected')
    } catch (error) {
      console.error('[WalletConnect] ❌ Disconnect failed:', error)
    }
  }
  
  if (isLoading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Loading wallet connection...</p>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col gap-2">
      {!isConnected ? (
        <div className="text-center">
          <p className="mb-3 text-sm text-gray-600">
            Connect your Lightning wallet to deposit stake
          </p>
          <button
            onClick={handleConnect}
            className="w-full py-3 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 transition-colors"
          >
            Connect Lightning Wallet
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">✓ Wallet Connected</span>
            {walletInfo && (
              <span className="text-xs text-gray-500">
                {walletInfo.node?.alias || 'Lightning Wallet'}
              </span>
            )}
          </div>
          <button 
            onClick={handleDisconnect}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Change Wallet
          </button>
        </div>
      )}
    </div>
  )
}
