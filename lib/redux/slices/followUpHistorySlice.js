// lib/redux/slices/followUpHistorySlice.js
import { createSlice } from '@reduxjs/toolkit';

const followUpHistorySlice = createSlice({
  name: 'followUpHistory',
  initialState: {
    history: {}, // { email: { count: 0, lastFollowUpAt: null, dates: [] } }
  },
  reducers: {
    // Set follow-up history for a specific email
    setHistory: (state, action) => {
      const { email, history } = action.payload;
      state.history[email] = history;
    },
    // Increment follow-up count for an email
    incrementFollowUpCount: (state, action) => {
      const { email, timestamp } = action.payload;
      if (!state.history[email]) {
        state.history[email] = { count: 0, lastFollowUpAt: null, dates: [] };
      }
      state.history[email].count += 1;
      state.history[email].lastFollowUpAt = timestamp || new Date().toISOString();
      state.history[email].dates.push(timestamp || new Date().toISOString());
    },
    // Update last follow-up timestamp
    updateLastFollowUpAt: (state, action) => {
      const { email, timestamp } = action.payload;
      if (state.history[email]) {
        state.history[email].lastFollowUpAt = timestamp;
      }
    },
    // Clear history for a specific email
    clearHistory: (state, action) => {
      delete state.history[action.payload];
    },
    // Reset all history
    resetAllHistory: (state) => {
      state.history = {};
    },
    // Batch update multiple histories
    batchUpdateHistory: (state, action) => {
      const histories = action.payload;
      Object.entries(histories).forEach(([email, history]) => {
        state.history[email] = history;
      });
    },
  },
});

export const {
  setHistory,
  incrementFollowUpCount,
  updateLastFollowUpAt,
  clearHistory,
  resetAllHistory,
  batchUpdateHistory,
} = followUpHistorySlice.actions;

export default followUpHistorySlice.reducer;

// Selectors
export const selectFollowUpHistory = (state) => state.followUpHistory.history;
export const selectEmailHistory = (state, email) => state.followUpHistory.history[email];
export const selectEmailFollowUpCount = (state, email) =>
  state.followUpHistory.history[email]?.count || 0;
export const selectEmailLastFollowUpAt = (state, email) =>
  state.followUpHistory.history[email]?.lastFollowUpAt || null;
