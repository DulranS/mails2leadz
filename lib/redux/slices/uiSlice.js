// lib/redux/slices/uiSlice.js
import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    // Loading states
    isSending: false,
    loadingSentLeads: false,
    loadingRepliedLeads: false,

    // Modal states
    showFollowUpModal: false,
    showConversationModal: false,
    showResearchModal: false,

    // Status messages
    status: '',
    statusType: 'info', // 'info', 'success', 'warning', 'error'

    // Notifications
    notifications: [],

    // Progress
    sendProgress: { current: 0, total: 0 },

    // Current time (for follow-up timing calculations)
    currentTime: new Date(),

    // Quota
    quotas: {
      emails: { used: 0, limit: 500, available: true },
      sms: { used: 0, limit: 100, available: true },
      calls: { used: 0, limit: 50, available: true },
    },

    // Auth state
    user: null,
    loadingAuth: true,
  },
  reducers: {
    // Sending state
    setSending: (state, action) => {
      state.isSending = action.payload;
    },
    // Loading states
    setLoadingSentLeads: (state, action) => {
      state.loadingSentLeads = action.payload;
    },
    setLoadingRepliedLeads: (state, action) => {
      state.loadingRepliedLeads = action.payload;
    },
    // Modal states
    setShowFollowUpModal: (state, action) => {
      state.showFollowUpModal = action.payload;
    },
    setShowConversationModal: (state, action) => {
      state.showConversationModal = action.payload;
    },
    setShowResearchModal: (state, action) => {
      state.showResearchModal = action.payload;
    },
    // Status messages
    setStatus: (state, action) => {
      state.status = action.payload;
    },
    setStatusType: (state, action) => {
      state.statusType = action.payload;
    },
    // Notifications
    addNotification: (state, action) => {
      const { message, type, duration } = action.payload;
      const notification = {
        id: Date.now(),
        message,
        type: type || 'info',
        duration: duration || 3000,
        timestamp: new Date(),
      };
      state.notifications.push(notification);
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        (n) => n.id !== action.payload
      );
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    // Progress
    setSendProgress: (state, action) => {
      state.sendProgress = action.payload;
    },
    // Current time
    setCurrentTime: (state, action) => {
      state.currentTime = action.payload;
    },
    // Quota
    setQuota: (state, action) => {
      const { type, quota } = action.payload;
      state.quotas[type] = quota;
    },
    incrementQuota: (state, action) => {
      const { type, amount } = action.payload;
      state.quotas[type].used += amount;
      state.quotas[type].available =
        state.quotas[type].used < state.quotas[type].limit;
    },
    // Auth
    setUser: (state, action) => {
      state.user = action.payload;
    },
    setLoadingAuth: (state, action) => {
      state.loadingAuth = action.payload;
    },
  },
});

export const {
  setSending,
  setLoadingSentLeads,
  setLoadingRepliedLeads,
  setShowFollowUpModal,
  setShowConversationModal,
  setShowResearchModal,
  setStatus,
  setStatusType,
  addNotification,
  removeNotification,
  clearNotifications,
  setSendProgress,
  setCurrentTime,
  setQuota,
  incrementQuota,
  setUser,
  setLoadingAuth,
} = uiSlice.actions;

export default uiSlice.reducer;

// Selectors
export const selectIsSending = (state) => state.ui.isSending;
export const selectLoadingSentLeads = (state) => state.ui.loadingSentLeads;
export const selectLoadingRepliedLeads = (state) => state.ui.loadingRepliedLeads;
export const selectShowFollowUpModal = (state) => state.ui.showFollowUpModal;
export const selectShowConversationModal = (state) => state.ui.showConversationModal;
export const selectShowResearchModal = (state) => state.ui.showResearchModal;
export const selectStatus = (state) => state.ui.status;
export const selectStatusType = (state) => state.ui.statusType;
export const selectNotifications = (state) => state.ui.notifications;
export const selectSendProgress = (state) => state.ui.sendProgress;
export const selectCurrentTime = (state) => state.ui.currentTime;
export const selectQuotas = (state) => state.ui.quotas;
export const selectUser = (state) => state.ui.user;
export const selectLoadingAuth = (state) => state.ui.loadingAuth;
