'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, Zap, CheckCircle, XCircle, DollarSign, CreditCard, RotateCcw, Smartphone, Plus, TrendingUp, AlertTriangle, Lock } from 'lucide-react'
import { BitcoinConnectLightningGoalsManager } from './bitcoin-connect-lightning-goals-manager'
import { TopUpBalance } from './top-up-balance'
import { toast } from 'sonner'

function LightningGoalsSummary({
  goals,
  currentWordCount,
  userPubkey,
  authData,
  onRefresh,
  onSetupStatusChange,
  onClose,
  onStreakUpdate,
  onStakeActivated
}: {
  goals: any
  currentWordCount: number
  userPubkey: string
  authData: any
  onRefresh: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
  onClose?: () => void
  onStreakUpdate?: (newStreak: number) => void
  onStakeActivated?: () => void
}) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<'progress' | 'history'>('progress')

  // Fix negative numbers by properly handling baseline word count
  const wordsSinceStake = Math.max(0, currentWordCount - (goals.baselineWordCount || 0))
  const progressPercentage = Math.min(100, (wordsSinceStake / goals.dailyWordGoal) * 100)
  const wordsToGo = Math.max(0, goals.dailyWordGoal - wordsSinceStake)

  const handleCancelStake = async () => {
    try {
      const { cancelStake } = await import('@/lib/lightning-goals')
      await cancelStake(userPubkey, authData)

      console.log('[Summary] ✅ Stake cancelled')
      setShowCancelConfirm(false)

      // Reset header status to show "Set Up Daily Goal"
      if (onSetupStatusChange) {
        onSetupStatusChange(false)
      }

      // Close the modal after successful cancellation
      if (onClose) {
        onClose()
      }

      onRefresh()
    } catch (error) {
      console.error('[Summary] ❌ Error cancelling stake:', error)
      toast.error('Failed to cancel stake: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="text-center">
        <div className="flex justify-center mb-2">
          <Zap className="w-12 h-12 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-emerald-400">Active Lightning Goal</h2>
        <p className="text-zinc-400">Write {goals.dailyWordGoal} words daily to earn rewards</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('progress')}
          className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${activeTab === 'progress'
            ? 'border-b-2 border-[#F7931A] text-[#F7931A]'
            : 'text-zinc-400 hover:text-zinc-200'
            }`}
        >
          Progress
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${activeTab === 'history'
            ? 'border-b-2 border-[#F7931A] text-[#F7931A]'
            : 'text-zinc-400 hover:text-zinc-200'
            }`}
        >
          History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'progress' ? (
        <>
          {/* Progress Section */}
          <div className="bg-[#1a1a1a] p-6 rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-100">Today's Progress</h3>
              <span className="text-sm text-zinc-400">
                {wordsSinceStake} / {goals.dailyWordGoal} words
              </span>
            </div>

            <div className="w-full bg-zinc-800 rounded-full h-3 mb-4">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${wordsSinceStake >= goals.dailyWordGoal
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                  : 'bg-gradient-to-r from-[#F7931A] to-[#E8850F]'
                  }`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            {wordsSinceStake >= goals.dailyWordGoal ? (
              <div className="text-center space-y-2">
                <p className="text-emerald-400 font-medium text-lg flex items-center justify-center gap-2">
                  {goals.todayRewardSent ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Reward sent!
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Goal complete! Processing reward...
                    </>
                  )}
                </p>
                {goals.todayRewardSent && (
                  <p className="text-emerald-300 text-sm font-medium">
                    Rewards have been paid out today for reaching your goal
                  </p>
                )}
              </div>
            ) : (
              <p className="text-center text-zinc-400">
                {wordsToGo} words to go
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#111] border border-zinc-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold font-mono text-[#F7931A]">{goals.dailyReward}</div>
              <div className="text-sm text-zinc-500">Daily Reward (sats)</div>
            </div>
            <div className="bg-[#111] border border-zinc-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold font-mono text-emerald-400">{goals.currentBalance}</div>
              <div className="text-sm text-zinc-500">Balance (sats)</div>
            </div>
            <div className="bg-[#111] border border-zinc-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold font-mono text-zinc-100">{goals.currentStreak || 0}</div>
              <div className="text-sm text-zinc-500">Day Streak</div>
            </div>
            <div className="bg-[#111] border border-zinc-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold font-mono text-zinc-100">{goals.totalGoalsMet || 0}</div>
              <div className="text-sm text-zinc-500">Goals Met</div>
            </div>
          </div>


          {/* Top Up Balance Section */}
          <TopUpBalance
            userPubkey={userPubkey}
            authData={authData}
            currentBalance={goals.currentBalance}
            onTopUpComplete={async () => {
              // Refresh goals in the modal
              await onRefresh()
              // Also refresh the parent component (main-app) to update header balance
              if (onStakeActivated) {
                await onStakeActivated()
              }
            }}
          />

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={onRefresh}
              variant="outline"
              className="flex-1"
            >
              Refresh
            </Button>
            <Button
              onClick={() => setShowCancelConfirm(true)}
              variant="destructive"
              className="flex-1"
            >
              Cancel Stake
            </Button>
          </div>
          {/* Lightning Address */}
          <div className="text-center text-sm text-zinc-500">
            <p>Rewards sent to: <span className="font-mono">{goals.lightningAddress}</span></p>
          </div>
        </>
      ) : (
        /* History Tab */
        <div className="space-y-4">
          <div className="bg-[#111] border border-zinc-800 p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4 text-zinc-100">Activity History</h3>
            {goals.history && goals.history.length > 0 ? (
              <div className="space-y-3">
                {goals.history.slice(-10).reverse().map((day: any, index: number) => (
                  <div key={index} className="bg-[#0a0a0a] p-4 rounded-lg border border-zinc-800">
                    {/* Date Header */}
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-zinc-800">
                      <span className="font-semibold text-zinc-100">{day.date}</span>
                      <span className="text-sm text-zinc-500">
                        {day.words} words
                      </span>
                    </div>

                    {/* Day Summary */}
                    <div className="flex items-center gap-2 mb-2">
                      {day.goalMet ? (
                        <div className="flex items-center gap-1 text-emerald-400 text-sm font-medium">
                          <CheckCircle className="w-4 h-4" />
                          <span>Goal Achieved</span>
                        </div>
                      ) : (
                        // Check if this is the stake creation day
                        day.transactions?.some((tx: any) => tx.type === 'stake_created') ? (
                          <div className="flex items-center gap-1 text-[#F7931A] text-sm font-medium">
                            <TrendingUp className="w-4 h-4" />
                            <span>New Goal Started</span>
                          </div>
                        ) : (
                          // Check if this is today (don't show "missed" for today)
                          day.isToday ? (
                            <div className="flex items-center gap-1 text-[#F7931A] text-sm font-medium">
                              <AlertTriangle className="w-4 h-4" />
                              <span>In Progress</span>
                            </div>
                          ) : (
                            // Only show "missed" for past days
                            <div className="flex items-center gap-1 text-red-400 text-sm font-medium">
                              <XCircle className="w-4 h-4" />
                              <span>Goal Missed</span>
                            </div>
                          )
                        )
                      )}
                    </div>

                    {/* Transaction History */}
                    {day.transactions && day.transactions.length > 0 && (
                      <div className="space-y-2 mt-3">
                        {day.transactions.map((tx: any, txIndex: number) => (
                          <div key={txIndex} className="flex items-start gap-2 text-sm bg-[#111] p-2 rounded">
                            {tx.type === 'stake_created' && (
                              <>
                                <Lock className="w-4 h-4 text-[#F7931A] mt-0.5" />
                                <div className="flex-1">
                                  <div className="font-medium text-[#F7931A]">Stake Created</div>
                                  <div className="text-xs text-zinc-500">Deposited <span className="font-mono">{tx.amount}</span> sats</div>
                                </div>
                              </>
                            )}
                            {tx.type === 'top_up' && (
                              <>
                                <Plus className="w-4 h-4 text-[#F7931A] mt-0.5" />
                                <div className="flex-1">
                                  <div className="font-medium text-[#F7931A]">Balance Top-Up</div>
                                  <div className="text-xs text-zinc-500">Added <span className="font-mono">{tx.amount}</span> sats</div>
                                </div>
                              </>
                            )}
                            {tx.type === 'goal_met' && (
                              <>
                                <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" />
                                <div className="flex-1">
                                  <div className="font-medium text-emerald-300">Goal Achieved</div>
                                  <div className="text-xs text-zinc-400">{tx.description}</div>
                                </div>
                              </>
                            )}
                            {tx.type === 'goal_missed' && (
                              <>
                                <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
                                <div className="flex-1">
                                  <div className="font-medium text-red-400">Goal Missed</div>
                                  <div className="text-xs text-zinc-400">{tx.description}</div>
                                </div>
                              </>
                            )}
                            {tx.type === 'payout' && (
                              <>
                                <Zap className="w-4 h-4 text-[#F7931A] mt-0.5" />
                                <div className="flex-1">
                                  <div className="font-medium text-[#F7931A]">Reward Paid</div>
                                  <div className="text-xs text-zinc-500">Sent <span className="font-mono">{tx.amount}</span> sats</div>
                                </div>
                              </>
                            )}
                            {(tx.type === 'deposit' || tx.type === 'refund') && (
                              <>
                                <CreditCard className="w-4 h-4 text-[#F7931A] mt-0.5" />
                                <div className="flex-1">
                                  <div className="font-medium text-[#F7931A]">
                                    {tx.type === 'deposit' ? 'Deposit' : 'Refund'}
                                  </div>
                                  <div className="text-xs text-zinc-500">
                                    {tx.type === 'deposit' ? '+' : '+'}<span className="font-mono">{tx.amount}</span> sats
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-400 text-center py-4">No activity yet</p>
            )}
          </div>

          {/* Actions for History Tab */}
          <div className="flex gap-3">
            <Button
              onClick={onRefresh}
              variant="outline"
              className="flex-1"
            >
              Refresh
            </Button>
            <Button
              onClick={() => setShowCancelConfirm(true)}
              variant="destructive"
              className="flex-1"
            >
              Cancel Stake
            </Button>
          </div>

          {/* Lightning Address */}
          <div className="text-center text-sm text-zinc-500">
            <p>Rewards sent to: <span className="font-mono">{goals.lightningAddress}</span></p>
          </div>
        </div>
      )}

      {/* Cancel Stake Confirmation Popup */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111] border border-zinc-800 p-6 rounded-lg max-w-md w-full">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <AlertTriangle className="w-16 h-16 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-zinc-100">Cancel Lightning Goal?</h3>
              <p className="text-zinc-400 mb-6">
                Are you sure you want to cancel your current stake? You will not receive a refund of your <span className="font-mono text-zinc-200">{goals.currentBalance}</span> sats balance.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowCancelConfirm(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Keep Goal
                </Button>
                <Button
                  onClick={handleCancelStake}
                  variant="destructive"
                  className="flex-1"
                >
                  Cancel Stake
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface IncentiveModalProps {
  isOpen: boolean
  onClose: () => void
  userPubkey: string
  authData: any
  selectedNote?: any
  lastSavedWordCount?: number
  userLightningAddress?: string
  onWordCountProcessed?: () => void
  onSetupStatusChange?: (hasSetup: boolean) => void
  onStakeActivated?: () => void
  onStreakUpdate?: (newStreak: number) => void
  onGoalCompleted?: () => void
}

export function IncentiveModal({
  isOpen,
  onClose,
  userPubkey,
  authData,
  selectedNote,
  lastSavedWordCount,
  userLightningAddress,
  onWordCountProcessed,
  onSetupStatusChange,
  onStakeActivated,
  onStreakUpdate,
  onGoalCompleted
}: IncentiveModalProps) {
  const [hasSetup, setHasSetup] = useState(false)
  const [goals, setGoals] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen && userPubkey) {
      // Initialize remote signer if needed
      initializeRemoteSigner()
      loadGoals()
    }
  }, [isOpen, userPubkey])

  // Initialize remote signer to ensure Lightning Goals can sign events
  async function initializeRemoteSigner() {
    if (authData.authMethod === 'remote' && authData.sessionData) {
      try {
        console.log('[IncentiveModal] 🔧 Initializing remote signer for Lightning Goals...')
        const { resumeSession } = await import('@/lib/auth/unified-remote-signer')

        const resumed = await resumeSession()

        if (resumed) {
          console.log('[IncentiveModal] ✅ Remote signer initialized for Lightning Goals')
        } else {
          console.error('[IncentiveModal] ❌ Failed to initialize remote signer for Lightning Goals')
        }
      } catch (error) {
        console.error('[IncentiveModal] ❌ Error initializing remote signer:', error)
      }
    }
  }

  const loadGoals = async () => {
    try {
      setLoading(true)
      const { getLightningGoals } = await import('@/lib/lightning-goals')
      const data = await getLightningGoals(userPubkey)

      console.log('[IncentiveModal] 📊 Loaded goals:', data)
      setGoals(data)
      setHasSetup(data && data.status === 'active')

      if (onSetupStatusChange) {
        onSetupStatusChange(data && data.status === 'active')
      }
    } catch (error) {
      console.error('[IncentiveModal] Error loading goals:', error)
      setGoals(null)
      setHasSetup(false)
    } finally {
      setLoading(false)
    }
  }

  const handleSetupStatusChange = (hasSetupValue: boolean) => {
    setHasSetup(hasSetupValue)
    if (onSetupStatusChange) {
      onSetupStatusChange(hasSetupValue)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-[#111] rounded-lg shadow-lg border border-zinc-800">
        <div className="flex flex-row items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
            <Zap className="w-6 h-6 text-[#F7931A]" />
            Lightning Goals
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F7931A] mx-auto mb-4"></div>
              <p className="text-zinc-400">Loading Lightning Goals...</p>
            </div>
          ) : (() => {
            console.log('[IncentiveModal] 🔍 Conditional check:', {
              hasGoals: !!goals,
              goalsStatus: goals?.status,
              hasSetup,
              shouldShowSummary: goals && goals.status === 'active'
            })
            return goals && goals.status === 'active'
          })() ? (
            <LightningGoalsSummary
              goals={goals}
              currentWordCount={lastSavedWordCount || 0}
              userPubkey={userPubkey}
              authData={authData}
              onRefresh={loadGoals}
              onSetupStatusChange={onSetupStatusChange}
              onClose={onClose}
              onStreakUpdate={onStreakUpdate}
              onStakeActivated={onStakeActivated}
            />
          ) : (
            <BitcoinConnectLightningGoalsManager
              userPubkey={userPubkey}
              authData={authData}
              currentWordCount={lastSavedWordCount || 0}
              onStreakUpdate={onStreakUpdate}
              onStakeActivated={async () => {
                console.log('[IncentiveModal] 🎉 Stake activated, switching to Progress/Summary...')

                // Wait a moment for the stake to be published to relays
                await new Promise(resolve => setTimeout(resolve, 2000))

                // Reload goals data to get the latest information
                await loadGoals()

                // Force modal to show Progress/Summary screen after data is loaded
                setHasSetup(true)

                // Also trigger parent component refresh for header updates
                if (onSetupStatusChange) {
                  onSetupStatusChange(true)
                }
                console.log('[IncentiveModal] ✅ Modal should now show Progress/Summary screen')
              }}
              onSetupStatusChange={setHasSetup}
            />
          )}
        </div>
      </div>
    </div>
  )
}