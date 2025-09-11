import { configureStore } from '@reduxjs/toolkit'

import provider from './reducers/provider'
import tokens from './reducers/tokens'
import bridge from './reducers/bridge'

export const store = configureStore({
  reducer: {
    provider,
    tokens,
    bridge
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false // ok for ethers objects
    })
})
