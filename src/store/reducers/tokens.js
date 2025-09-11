import { createSlice } from '@reduxjs/toolkit'

export const tokens = createSlice({
  name: 'tokens',
  initialState: {
    contracts: [null, null],  // [ausdcSepolia, ausdcFuji]
    symbols: ['aUSDC'],
    balances: ['0', '0'], // [balanceSepolia, balanceFuji]
  },
  reducers: {
    setTokenContracts: (state, action) => { // action.payload = [ausdcSepolia, ausdcFuji]
      state.contracts = action.payload
    },
    setSymbols: (state, action) => {
      state.symbols = action.payload
    },
    balancesLoaded: (state, action) => {  // payload: [sepolia, fuji]
      state.balances = action.payload
    }
  }
})

export const {
  setTokenContracts,
  setSymbols,
  balancesLoaded
} = tokens.actions

export default tokens.reducer;
