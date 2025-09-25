import { createSlice } from '@reduxjs/toolkit'

/**
 * CHANGES (🟡):
 * - 🟡 Added `stage` to track UI steps: 'idle' | 'submitted' | 'executed' | 'failed' (no polling).
 * - 🟡 Added `destTxHash` placeholder (you can set it later if/when you fetch it).
 * - 🟡 Added two reducers: `setDestTxHash` and `setStage`.
 * - 🟡 bridgeSuccess now also marks stage = 'submitted'.
 */

// 🟡 Summary: Added stage + destTxHash + new reducers for clarity and future use.

export const bridge = createSlice({
  name: 'bridge',
  initialState: {
    contracts: [null, null],  // [sender, receiver]
    bridging: {
      isBridging: false,
      isSuccess: false,
      transactionHash: null,
      destTxHash: null,       // 🟡 destination tx (Fuji) — optional
      stage: 'idle',          // 🟡 'idle' | 'submitted' | 'executed' | 'failed'
      error: null
    }
  },
  reducers: {
    setBridgeContracts: (state, action) => {            // payload: [sender, receiver]
      state.contracts = action.payload
    },
    bridgeRequest: (state, action) => {
      state.bridging.isBridging = true
      state.bridging.isSuccess = false
      state.bridging.transactionHash = null
      state.bridging.destTxHash = null               // 🟡 reset dest hash
      state.bridging.stage = 'idle'                  // 🟡 reset stage
      state.bridging.error = null
    },
    bridgeSuccess: (state, action) => {
      state.bridging.isBridging = false
      state.bridging.isSuccess = true
      state.bridging.transactionHash = action.payload
      state.bridging.stage = 'submitted'             // 🟡 mark step 1 complete
      state.bridging.error = null
    },
    bridgeFail: (state, action) => {
      state.bridging.isBridging = false
      state.bridging.isSuccess = false
      state.bridging.transactionHash = null
      state.bridging.destTxHash = null               // 🟡 ensure reset
      state.bridging.stage = 'failed'                // 🟡 mark as failed
      state.bridging.error = action.payload || { message: 'Unknown error' }
    },

    // 🟡 NEW: allow UI or a background check to set the Fuji tx hash later
    setDestTxHash: (state, action) => {
      state.bridging.destTxHash = action.payload
      if (action.payload) state.bridging.stage = 'executed' // 🟡 move stage if we got a dest tx
    },

    // 🟡 NEW: manual stage updates (optional)
    setStage: (state, action) => {
      state.bridging.stage = action.payload
    }
  }
})

export const {
  setBridgeContracts,
  bridgeRequest,
  bridgeSuccess,
  bridgeFail,
  setDestTxHash,   // 🟡
  setStage         // 🟡
} = bridge.actions

export default bridge.reducer
