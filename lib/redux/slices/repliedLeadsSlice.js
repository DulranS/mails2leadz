// lib/redux/slices/repliedLeadsSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { loadRepliedAndFollowUp as loadRepliedAndFollowUpFromFirebase } from '../../lib/firebase-operations.js';

// Async thunk for loading replied leads and follow-up history
export const fetchRepliedLeads = createAsyncThunk(
  'repliedLeads/fetch',
  async (userId, { rejectWithValue }) => {
    try {
      const result = await loadRepliedAndFollowUpFromFirebase(userId);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
  {
    // Cache configuration - don't refetch if data is less than 2 minutes old
    condition: (userId, { getState }) => {
      const { repliedLeads } = getState();
      const now = Date.now();
      const lastFetch = repliedLeads.lastFetch || 0;
      const cacheDuration = 2 * 60 * 1000; // 2 minutes

      // Skip fetch if data is fresh
      if (now - lastFetch < cacheDuration && repliedLeads.data.repliedMap) {
        return false;
      }
      return true;
    },
  }
);

const repliedLeadsSlice = createSlice({
  name: 'repliedLeads',
  initialState: {
    data: {
      repliedMap: {},
      followUpMap: {},
      history: {},
      stats: null,
    },
    loading: false,
    error: null,
    lastFetch: 0,
  },
  reducers: {
    // Mark a lead as replied
    markAsReplied: (state, action) => {
      const email = action.payload;
      state.data.repliedMap[email] = true;
      // Remove from follow-up map since they've replied
      delete state.data.followUpMap[email];
    },
    // Mark a lead as ready for follow-up
    markForFollowUp: (state, action) => {
      const email = action.payload;
      if (!state.data.repliedMap[email]) {
        state.data.followUpMap[email] = true;
      }
    },
    // Update follow-up history for a lead
    updateFollowUpHistory: (state, action) => {
      const { email, history } = action.payload;
      state.data.history[email] = history;
    },
    // Update stats
    updateStats: (state, action) => {
      state.data.stats = action.payload;
    },
    // Clear cache and force refetch
    invalidateCache: (state) => {
      state.lastFetch = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRepliedLeads.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRepliedLeads.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.lastFetch = Date.now();
        state.error = null;
      })
      .addCase(fetchRepliedLeads.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  markAsReplied,
  markForFollowUp,
  updateFollowUpHistory,
  updateStats,
  invalidateCache,
} = repliedLeadsSlice.actions;

export default repliedLeadsSlice.reducer;

// Selectors
export const selectRepliedMap = (state) => state.repliedLeads.data.repliedMap;
export const selectFollowUpMap = (state) => state.repliedLeads.data.followUpMap;
export const selectFollowUpHistory = (state) => state.repliedLeads.data.history;
export const selectFollowUpStats = (state) => state.repliedLeads.data.stats;
export const selectRepliedLeadsLoading = (state) => state.repliedLeads.loading;
export const selectRepliedLeadsError = (state) => state.repliedLeads.error;
export const selectHasReplied = (state, email) => !!state.repliedLeads.data.repliedMap[email];
export const selectNeedsFollowUp = (state, email) => !!state.repliedLeads.data.followUpMap[email];
