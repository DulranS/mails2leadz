// lib/redux/slices/sentLeadsSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { loadSentLeads as loadSentLeadsFromFirebase } from '../../lib/firebase-operations.js';

// Async thunk for loading sent leads
export const fetchSentLeads = createAsyncThunk(
  'sentLeads/fetch',
  async (userId, { rejectWithValue }) => {
    try {
      const leads = await loadSentLeadsFromFirebase(userId);
      return leads;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
  {
    // Cache configuration - don't refetch if data is less than 2 minutes old
    condition: (userId, { getState }) => {
      const { sentLeads } = getState();
      const now = Date.now();
      const lastFetch = sentLeads.lastFetch || 0;
      const cacheDuration = 2 * 60 * 1000; // 2 minutes

      // Skip fetch if data is fresh
      if (now - lastFetch < cacheDuration && sentLeads.data.length > 0) {
        return false;
      }
      return true;
    },
  }
);

const sentLeadsSlice = createSlice({
  name: 'sentLeads',
  initialState: {
    data: [],
    loading: false,
    error: null,
    lastFetch: 0,
    cacheHit: false,
  },
  reducers: {
    // Add a single lead to the state
    addLead: (state, action) => {
      state.data.push(action.payload);
    },
    // Update a single lead
    updateLead: (state, action) => {
      const index = state.data.findIndex(lead => lead.email === action.payload.email);
      if (index !== -1) {
        state.data[index] = { ...state.data[index], ...action.payload };
      }
    },
    // Remove a lead
    removeLead: (state, action) => {
      state.data = state.data.filter(lead => lead.email !== action.payload);
    },
    // Update multiple leads at once (batch update)
    batchUpdateLeads: (state, action) => {
      const updates = action.payload;
      updates.forEach(update => {
        const index = state.data.findIndex(lead => lead.email === update.email);
        if (index !== -1) {
          state.data[index] = { ...state.data[index], ...update };
        }
      });
    },
    // Clear cache and force refetch
    invalidateCache: (state) => {
      state.lastFetch = 0;
      state.cacheHit = false;
    },
    // Mark cache as hit (for monitoring)
    setCacheHit: (state, action) => {
      state.cacheHit = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSentLeads.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSentLeads.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.lastFetch = Date.now();
        state.error = null;
      })
      .addCase(fetchSentLeads.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  addLead,
  updateLead,
  removeLead,
  batchUpdateLeads,
  invalidateCache,
  setCacheHit,
} = sentLeadsSlice.actions;

export default sentLeadsSlice.reducer;

// Selectors
export const selectSentLeads = (state) => state.sentLeads.data;
export const selectSentLeadsLoading = (state) => state.sentLeads.loading;
export const selectSentLeadsError = (state) => state.sentLeads.error;
export const selectSentLeadsLastFetch = (state) => state.sentLeads.lastFetch;
export const selectLeadByEmail = (state, email) =>
  state.sentLeads.data.find(lead => lead.email === email);
export const selectLeadsByFilter = (state, filterFn) =>
  state.sentLeads.data.filter(filterFn);
