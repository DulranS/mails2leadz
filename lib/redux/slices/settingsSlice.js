// lib/redux/slices/settingsSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  loadSettingsFromFirebase,
  saveSettingsToFirebase,
} from '../../lib/firebase-operations.js';

// Async thunk for loading settings
export const fetchSettings = createAsyncThunk(
  'settings/fetch',
  async (userId, { rejectWithValue }) => {
    try {
      const settings = await loadSettingsFromFirebase(userId);
      return settings;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
  {
    // Cache configuration - don't refetch if data is less than 30 minutes old
    condition: (userId, { getState }) => {
      const { settings } = getState();
      const now = Date.now();
      const lastFetch = settings.lastFetch || 0;
      const cacheDuration = 30 * 60 * 1000; // 30 minutes

      // Skip fetch if data is fresh
      if (now - lastFetch < cacheDuration && settings.data) {
        return false;
      }
      return true;
    },
  }
);

// Async thunk for saving settings
export const saveSettings = createAsyncThunk(
  'settings/save',
  async ({ userId, settings }, { rejectWithValue }) => {
    try {
      const success = await saveSettingsToFirebase(userId, settings);
      if (success) {
        return settings;
      }
      return rejectWithValue('Failed to save settings');
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    data: null,
    loading: false,
    error: null,
    lastFetch: 0,
    saving: false,
    saveError: null,
  },
  reducers: {
    // Update a specific setting
    updateSetting: (state, action) => {
      const { key, value } = action.payload;
      if (state.data) {
        state.data[key] = value;
      }
    },
    // Update multiple settings at once
    updateSettings: (state, action) => {
      if (state.data) {
        state.data = { ...state.data, ...action.payload };
      }
    },
    // Clear cache and force refetch
    invalidateCache: (state) => {
      state.lastFetch = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch settings
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.lastFetch = Date.now();
        state.error = null;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Save settings
      .addCase(saveSettings.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(saveSettings.fulfilled, (state, action) => {
        state.saving = false;
        state.data = action.payload;
        state.saveError = null;
      })
      .addCase(saveSettings.rejected, (state, action) => {
        state.saving = false;
        state.saveError = action.payload;
      });
  },
});

export const {
  updateSetting,
  updateSettings,
  invalidateCache,
} = settingsSlice.actions;

export default settingsSlice.reducer;

// Selectors
export const selectSettings = (state) => state.settings.data;
export const selectSettingsLoading = (state) => state.settings.loading;
export const selectSettingsError = (state) => state.settings.error;
export const selectSettingsSaving = (state) => state.settings.saving;
export const selectSetting = (state, key) => state.settings.data?.[key];
