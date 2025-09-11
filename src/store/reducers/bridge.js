import { createSlice } from '@reduxjs/toolkit'

export const bridge = createSlice({
  name: 'bridge',
  initialState: {
    contracts: [null, null],  // [sender, receiver]
    bridging: {
      isBridging: false,
      isSuccess: false,
      transactionHash: null
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
    },
    bridgeSuccess: (state, action) => {
      state.bridging.isBridging = false
      state.bridging.isSuccess = true
      state.bridging.transactionHash = action.payload
    },
    bridgeFail: (state, action) => {
      state.bridging.isBridging = false
      state.bridging.isSuccess = false
      state.bridging.transactionHash = null
    }
  }
})

export const { setBridgeContracts, bridgeRequest, bridgeSuccess, bridgeFail } = bridge.actions

export default bridge.reducer
