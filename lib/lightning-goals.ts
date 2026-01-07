import { SimplePool } from 'nostr-tools'
import { signEventWithRemote } from './ndk-signer-manager'

// Create pool instance
const pool = new SimplePool()
const RELAYS = ['wss://relay.damus.io', 'wss://relay.snort.social', 'wss://nos.lol', 'wss://relay.nostr.band']

// Add debug mode
const DEBUG = true
const log = (msg: string, data?: any) => {
  if (DEBUG) {
    console.log(`[LightningGoals] ${msg}`, data || '')
  }
}

// ==============================================================================
// 1. Immutable Event Types (The "Golden Source")
// ==============================================================================

// Event Kinds and Tag Prefixes
const APP_TAG = 'nostr-journal'
const EVENT_KIND = 30078 // Parameterized Replaceable Event

// D-Tag Prefixes for different event types
const D_PREFIX_STAKE = 'lg-stake-'        // For stake creation/settings
const D_PREFIX_TX = 'lg-tx-'              // For financial transactions
const D_PREFIX_PROGRESS = 'lg-progress-'  // For daily writing progress
const D_PREFIX_STATUS = 'lg-status-'      // For status changes (cancel/pause)

// ==============================================================================
// 2. Data Models (State Projections)
// ==============================================================================

export interface LightningGoals {
  // Goal settings (from latest lg-stake- event)
  dailyWordGoal: number
  dailyReward: number
  
  // Balance (calculated from lg-tx- events)
  currentBalance: number
  initialStake: number
  totalDeposited: number
  totalWithdrawn: number
  
  // Status (from latest lg-status- or lg-stake- event)
  status: 'active' | 'paused' | 'cancelled' | 'pending_payment' | 'ended'
  createdAt: number
  lastUpdated: number
  
  // Baseline (from lg-stake- event)
  stakeCreatedAt: number
  baselineWordCount: number
  totalWordCountAtLastUpdate: number
  
  // Payment
  lightningAddress: string
  
  // Today's tracking (calculated from lg-progress- events)
  todayDate: string
  todayWords: number
  todayGoalMet: boolean
  todayRewardSent: boolean
  todayRewardAmount: number
  
  // History (calculated from lg-progress- and lg-tx- events)
  history: DayHistory[]
  
  // Stats
  currentStreak: number
  totalGoalsMet: number
  totalRewardsEarned: number
  lastRewardDate: string
  missedDays: number
  lastMissedDate: string
}

export interface DayHistory {
  date: string
  words: number
  goalMet: boolean
  rewardSent: boolean
  amount: number
  transactions: TransactionHistory[]
}

export interface TransactionHistory {
  id: string
  type: 'deposit' | 'payout' | 'refund' | 'top_up' | 'stake_created' | 'goal_met' | 'goal_missed'
  amount: number
  timestamp: number
  description: string
  txHash?: string
}

// ==============================================================================
// 3. Helper Functions for Publishing Immutable Events
// ==============================================================================

async function publishEvent(
  userPubkey: string,
  dTag: string,
  tags: string[][],
  authData: any,
  content: string = ""
): Promise<string> {
  const event = {
    kind: EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", dTag],
      ["client", APP_TAG],
      ...tags
    ],
    content,
    pubkey: userPubkey
  }
  
  log(`Publishing event: ${dTag}`, { tags: event.tags })
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
  return signedEvent.id
}

// ==============================================================================
// 4. Projection Logic (State Reconstruction)
// ==============================================================================

/**
 * The Core Projection Function
 * Fetches all relevant events and reconstructs the current state
 */
export async function getLightningGoals(userPubkey: string): Promise<LightningGoals | null> {
  log(`Fetching ledger events for ${userPubkey.substring(0, 8)}...`)
  
  // 1. Fetch all events
  const events = await pool.querySync(RELAYS, {
    kinds: [EVENT_KIND],
    authors: [userPubkey],
    "#client": [APP_TAG] // Filter by our app tag
  })
  
  // Filter for our specific prefixes
  const relevantEvents = events.filter(e => {
    const d = e.tags.find(t => t[0] === 'd')?.[1] || ''
    return d.startsWith('lg-') || d === 'lightning-goals' // Include old legacy event for migration
  })
  
  if (relevantEvents.length === 0) {
    log('No ledger events found')
    return null
  }
  
  // Check for legacy migration
  const legacyEvent = relevantEvents.find(e => e.tags.find(t => t[0] === 'd')?.[1] === 'lightning-goals')
  const newEvents = relevantEvents.filter(e => e.tags.find(t => t[0] === 'd')?.[1]?.startsWith('lg-'))
  
  if (newEvents.length === 0 && legacyEvent) {
    log('Only legacy event found. Returning legacy parsed object (Migration needed on next action)')
    return parseLegacyEvent(legacyEvent) // Fallback to old parser for read-only compatibility
  }
  
  // Sort events chronologically
  newEvents.sort((a, b) => a.created_at - b.created_at)
  
  // 3. Replay History (The Ledger)
  
  // Initial Empty State
  let state: LightningGoals = {
    dailyWordGoal: 500,
    dailyReward: 100,
    currentBalance: 0,
    initialStake: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    status: 'pending_payment',
    createdAt: 0,
    lastUpdated: 0,
    stakeCreatedAt: 0,
    baselineWordCount: 0,
    totalWordCountAtLastUpdate: 0,
    lightningAddress: '',
    todayDate: new Date().toISOString().split('T')[0],
    todayWords: 0,
    todayGoalMet: false,
    todayRewardSent: false,
    todayRewardAmount: 0,
    history: [],
    currentStreak: 0,
    totalGoalsMet: 0,
    totalRewardsEarned: 0,
    lastRewardDate: '',
    missedDays: 0,
    lastMissedDate: ''
  }
  
  const today = new Date().toISOString().split('T')[0]
  const historyMap = new Map<string, DayHistory>() // Map date -> History
  
  // Process events in order
  for (const event of newEvents) {
    const d = event.tags.find(t => t[0] === 'd')?.[1] || ''
    const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1]
    
    // --- STAKE CREATION / SETTINGS ---
    if (d.startsWith(D_PREFIX_STAKE)) {
      state.dailyWordGoal = parseInt(getTag('daily_word_goal') || '0')
      state.dailyReward = parseInt(getTag('daily_reward') || '0')
      state.initialStake = parseInt(getTag('initial_stake') || '0')
      state.lightningAddress = getTag('lightning_address') || state.lightningAddress
      
      const ts = parseInt(getTag('timestamp') || event.created_at.toString()) * 1000
      
      // If this is the FIRST stake event, set creation times
      if (state.createdAt === 0) {
        state.createdAt = ts
        state.stakeCreatedAt = ts
        state.baselineWordCount = parseInt(getTag('baseline_word_count') || '0')
        state.status = 'pending_payment' // Default to pending until money arrives
      }
      
      // If it has a payment hash (from direct creation), it's active immediately?
      // Actually, we usually wait for a transaction event to confirm balance.
      // But let's check legacy logic: status was set in update.
      const statusTag = getTag('status')
      if (statusTag) state.status = statusTag as any
    }
    
    // --- STATUS CHANGE ---
    if (d.startsWith(D_PREFIX_STATUS)) {
      state.status = (getTag('status') || 'active') as any
    }
    
    // --- TRANSACTIONS (The Ledger) ---
    if (d.startsWith(D_PREFIX_TX)) {
      const type = getTag('type') as TransactionHistory['type']
      const amount = parseInt(getTag('amount') || '0')
      const txTimestamp = parseInt(getTag('timestamp') || '0')
      const txDate = new Date(txTimestamp).toISOString().split('T')[0]
      const txHash = getTag('tx_hash')
      const description = getTag('description') || ''
      const txId = d
      
      // Update Global Balance
      if (type === 'deposit' || type === 'top_up' || type === 'stake_created') {
        state.currentBalance += amount
        state.totalDeposited += amount
        // If we get money, we are usually active
        if (state.status === 'pending_payment') state.status = 'active'
      } else if (type === 'payout') {
        state.currentBalance -= amount
        state.totalWithdrawn += amount
        state.totalRewardsEarned += amount
        state.totalGoalsMet += 1
        state.lastRewardDate = txDate
      } else if (type === 'refund') {
        state.currentBalance -= amount // Money leaves system
        state.totalWithdrawn += amount // Count as withdrawn
        state.status = 'cancelled'
      }
      
      // Add to Day History
      let dayHistory = historyMap.get(txDate)
      if (!dayHistory) {
        dayHistory = createEmptyDayHistory(txDate)
        historyMap.set(txDate, dayHistory)
      }
      
      dayHistory.transactions.push({
        id: txId,
        type,
        amount,
        timestamp: txTimestamp,
        description,
        txHash
      })
      
      // Update day specific stats from tx
      if (type === 'payout') {
        dayHistory.rewardSent = true
        dayHistory.amount += amount
      }
    }
    
    // --- DAILY PROGRESS ---
    if (d.startsWith(D_PREFIX_PROGRESS)) {
      const pDate = getTag('date') || ''
      if (pDate) {
        let dayHistory = historyMap.get(pDate)
        if (!dayHistory) {
          dayHistory = createEmptyDayHistory(pDate)
          historyMap.set(pDate, dayHistory)
        }
        
        dayHistory.words = parseInt(getTag('words') || '0')
        dayHistory.goalMet = getTag('goal_met') === 'true'
        
        // Update "Today" state if this event matches today
        if (pDate === today) {
          state.todayWords = dayHistory.words
          state.todayGoalMet = dayHistory.goalMet
        }
      }
    }
  } // End Event Loop
  
  // 4. Finalize Project
  
  // Sync "Today" specific fields from the history map
  const todayEntry = historyMap.get(today)
  if (todayEntry) {
    state.todayWords = todayEntry.words
    state.todayGoalMet = todayEntry.goalMet
    state.todayRewardSent = todayEntry.rewardSent
    state.todayRewardAmount = todayEntry.amount
  } else {
    // Reset today if no entry exists yet
    state.todayWords = 0
    state.todayGoalMet = false
    state.todayRewardSent = false
    state.todayRewardAmount = 0
  }

  // Convert Map to Array and Sort (descending date)
  state.history = Array.from(historyMap.values()).sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  ).slice(0, 14) // Keep last 14 days for UI, but we processed ALL for balance
  
  // Recalculate Streak
  state.currentStreak = calculateStreak(historyMap, today)
  state.lastUpdated = Date.now()
  
  log('✅ Reconstructed Ledger State:', {
    balance: state.currentBalance,
    txCount: newEvents.filter(e => e.tags.find(t => t[0] === 'd')?.[1]?.startsWith(D_PREFIX_TX)).length
  })
  
  return state
}


//Helper to create empty day history
function createEmptyDayHistory(date: string): DayHistory {
  return {
    date,
    words: 0,
    goalMet: false,
    rewardSent: false,
    amount: 0,
    transactions: []
  }
}

// Helper to calculate streak from history map
function calculateStreak(historyMap: Map<string, DayHistory>, today: string): number {
  let streak = 0
  let checkDate = new Date(today)
  
  // Check today first
  const todayEntry = historyMap.get(today)
  if (todayEntry && todayEntry.goalMet) {
    streak++
  }
  
  // Go backwards
  for (let i = 1; i < 365; i++) {
    checkDate.setDate(checkDate.getDate() - 1)
    const dateStr = checkDate.toISOString().split('T')[0]
    const entry = historyMap.get(dateStr)
    
    if (entry && entry.goalMet) {
      streak++
    } else {
      break
    }
  }
  return streak
}

// Legacy Parser for compatibility during migration
function parseLegacyEvent(event: any): LightningGoals {
  // ... (Identical to original getLightningGoals parsing logic)
  // Simply extracting tags and returning the object
  // For brevity, using a simplified version relying on the fact current app uses it
  const getTag = (name: string) => event.tags.find((t: any) => t[0] === name)?.[1] || ''
  
  return {
    dailyWordGoal: parseInt(getTag('daily_word_goal') || '500'),
    dailyReward: parseInt(getTag('daily_reward') || '100'),
    currentBalance: parseInt(getTag('current_balance') || '0'),
    initialStake: parseInt(getTag('initial_stake') || '0'),
    totalDeposited: parseInt(getTag('total_deposited') || '0'),
    totalWithdrawn: parseInt(getTag('total_withdrawn') || '0'),
    status: (getTag('status') || 'active') as any,
    createdAt: parseInt(getTag('created_at') || '0'),
    lastUpdated: parseInt(getTag('last_updated') || '0'),
    stakeCreatedAt: parseInt(getTag('stake_created_at') || '0'),
    baselineWordCount: parseInt(getTag('baseline_word_count') || '0'),
    totalWordCountAtLastUpdate: parseInt(getTag('total_word_count_at_last_update') || '0'),
    lightningAddress: getTag('lightning_address'),
    todayDate: getTag('today_date'),
    todayWords: parseInt(getTag('today_words') || '0'),
    todayGoalMet: getTag('today_goal_met') === 'true',
    todayRewardSent: getTag('today_reward_sent') === 'true',
    todayRewardAmount: parseInt(getTag('today_reward_amount') || '0'),
    history: [], // We won't parse legacy history JSON since we want to encourage migration
    currentStreak: parseInt(getTag('current_streak') || '0'),
    totalGoalsMet: parseInt(getTag('total_goals_met') || '0'),
    totalRewardsEarned: parseInt(getTag('total_rewards_earned') || '0'),
    lastRewardDate: getTag('last_reward_date'),
    missedDays: parseInt(getTag('missed_days') || '0'),
    lastMissedDate: getTag('last_missed_date')
  }
}

// ==============================================================================
// 5. Action Functions (Commands) - Now publishing atomic events
// ==============================================================================

/**
 * Creates the initial stake.
 * Publishes: `lg-stake-<ts>` and `lg-tx-<ts>` (if paid)
 */
export async function createStake(
  userPubkey: string,
  config: {
    dailyWordGoal: number
    dailyReward: number
    depositAmount: number
    lightningAddress: string
    currentWordCount: number
    paymentHash?: string
  },
  authData: any
): Promise<void> {
  log('Creating Stake (Event Sourced)...', config)
  
  const now = Date.now()
  const stakeId = `lg-stake-${now}`
  
  // 1. Publish Stake Definition (Settings)
  await publishEvent(userPubkey, stakeId, [
    ['type', 'settings'],
    ['daily_word_goal', config.dailyWordGoal.toString()],
    ['daily_reward', config.dailyReward.toString()],
    ['initial_stake', config.depositAmount.toString()],
    ['lightning_address', config.lightningAddress],
    ['baseline_word_count', config.currentWordCount.toString()],
    ['timestamp', Math.floor(now / 1000).toString()],
    ['status', config.paymentHash ? 'active' : 'pending_payment']
  ], authData)

  // 2. If already paid (paymentHash present), Record Transaction
  if (config.paymentHash) {
    await recordTransactionEvent(
      userPubkey, 
      'stake_created', 
      config.depositAmount, 
      `Initial stake deposit`, 
      config.paymentHash,
      authData
    )
  }
}

/**
 * Confirms payment for a pending stake
 */
export async function confirmPayment(
  userPubkey: string,
  paymentHash: string,
  authData: any
): Promise<void> {
  const goals = await getLightningGoals(userPubkey)
  if (!goals) throw new Error("No goals found")
    
  // Update status to active
  const now = Date.now()
  await publishEvent(userPubkey, `lg-status-${now}`, [
    ['status', 'active'],
    ['timestamp', Math.floor(now / 1000).toString()]
  ], authData)
  
  // Record the transaction
  await recordTransactionEvent(
    userPubkey,
    'stake_created',
    goals.initialStake, // Use initial stake amount from settings
    'Stake activated via payment',
    paymentHash,
    authData
  )
}

/**
 * Updates writing progress for the day
 */
export async function updateWordCount(
  userPubkey: string,
  totalWordCount: number,
  authData: any
): Promise<{ shouldSendReward: boolean; rewardAmount: number }> {
  
  const goals = await getLightningGoals(userPubkey)
  if (!goals || goals.status !== 'active') return { shouldSendReward: false, rewardAmount: 0 }
  
  const wordsWrittenSinceStake = totalWordCount - goals.baselineWordCount
  const goalMet = wordsWrittenSinceStake >= goals.dailyWordGoal
  const today = new Date().toISOString().split('T')[0]
  
  // Idempotency: Don't republish if nothing changed for today?
  // Actually, we want to update the word count as it increases.
  // We use `lg-progress-<date>` as a parameterized replaceable event for THAT DAY
  // So we can update it multiple times per day without spamming infinite events (just replaces today's event)
  
  await publishEvent(userPubkey, `lg-progress-${today}`, [
    ['date', today],
    ['words', totalWordCount.toString()], // Storing total words is fine, calculation uses baseline
    ['goal_met', goalMet.toString()]
  ], authData)
  
  // Check Reward Conditions
  if (goalMet && !goals.todayRewardSent && goals.currentBalance >= goals.dailyReward) {
    return { shouldSendReward: true, rewardAmount: goals.dailyReward }
  }
  
  return { shouldSendReward: false, rewardAmount: 0 }
}

/**
 * Records a reward payout
 */
export async function recordRewardSent(
  userPubkey: string,
  amount: number,
  authData: any
): Promise<void> {
  const goals = await getLightningGoals(userPubkey)
  if (!goals) return

  await recordTransactionEvent(
    userPubkey,
    'payout',
    amount,
    `Daily goal reward sent to ${goals.lightningAddress}`,
    undefined,
    authData
  )
}

/**
 * Records a top-up
 */
export async function addToStake(
  userPubkey: string,
  amount: number,
  paymentHash: string,
  authData: any
): Promise<void> {
  await recordTransactionEvent(
    userPubkey,
    'top_up',
    amount,
    `Top-up: Added ${amount} sats to stake`,
    paymentHash,
    authData
  )
}

/**
 * Cancels stake
 */
export async function cancelStake(
  userPubkey: string,
  authData: any
): Promise<{ forfeited: number }> {
  const goals = await getLightningGoals(userPubkey)
  if (!goals) return { forfeited: 0 }
  
  const forfeited = goals.currentBalance
  
  // Record forfeit transaction (refund logic can be added here if needed)
  if (forfeited > 0) {
    await recordTransactionEvent(
      userPubkey,
      'refund', // Using 'refund' type but logically it's a forfeit/exit
      forfeited,
      `Stake cancelled - ${forfeited} sats forfeited`,
      undefined,
      authData
    )
  }
  
  // Update status
  const now = Date.now()
  await publishEvent(userPubkey, `lg-status-${now}`, [
    ['status', 'cancelled'],
    ['timestamp', Math.floor(now / 1000).toString()]
  ], authData)
  
  return { forfeited }
}

export async function updateLightningAddress(
  userPubkey: string,
  lightningAddress: string,
  authData: any
): Promise<void> {
    const goals = await getLightningGoals(userPubkey)
    if (!goals) throw new Error("No goals found")

    // We republish the stake settings with new address? 
    // Or just a specific update event?
    // Use a new stake event to "Update Settings"
    const now = Date.now()
    await publishEvent(userPubkey, `lg-stake-${now}`, [
        ['type', 'settings_update'],
        ['daily_word_goal', goals.dailyWordGoal.toString()],
        ['daily_reward', goals.dailyReward.toString()],
        ['initial_stake', goals.initialStake.toString()],
        ['lightning_address', lightningAddress], // New Address
        ['baseline_word_count', goals.baselineWordCount.toString()],
        ['timestamp', Math.floor(now / 1000).toString()]
    ], authData)
}

/**
 * Generic Helper to record a transaction event
 */
async function recordTransactionEvent(
  userPubkey: string,
  type: TransactionHistory['type'],
  amount: number,
  description: string,
  txHash: string | undefined,
  authData: any
) {
  const now = Date.now()
  // Unique D-tag for every transaction to ensure it is appended to history
  const dTag = `lg-tx-${now}-${Math. floor(Math.random() * 1000)}` 
  
  await publishEvent(userPubkey, dTag, [
    ['type', type],
    ['amount', amount.toString()],
    ['description', description],
    ['tx_hash', txHash || ''],
    ['timestamp', now.toString()]
  ], authData)
}

export async function addTransaction(
    userPubkey: string, 
    transaction: TransactionHistory, 
    authData: any
  ): Promise<void> {
    // Wrapper for legacy compatibility if needed, but UI calls specific functions mostly
    await recordTransactionEvent(
        userPubkey,
        transaction.type,
        transaction.amount,
        transaction.description,
        transaction.txHash,
        authData
    )
  }
