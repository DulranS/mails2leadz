// lib/redux/store.js
import { configureStore } from '@reduxjs/toolkit';
import sentLeadsReducer from './slices/sentLeadsSlice';
import repliedLeadsReducer from './slices/repliedLeadsSlice';
import followUpHistoryReducer from './slices/followUpHistorySlice';
import settingsReducer from './slices/settingsSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    sentLeads: sentLeadsReducer,
    repliedLeads: repliedLeads,
    followUpHistory: followUpHistoryReducer,
    settings: settingsReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['sentLeads/fetch/fulfilled', 'repliedLeads/fetch/fulfilled'],
        // Ignore these field paths in all actions
        ignoredPaths: ['sentLeads.data', 'repliedLeads.data'],
      },
    }),
});
