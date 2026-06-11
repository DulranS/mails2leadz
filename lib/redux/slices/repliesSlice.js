// lib/redux/slices/repliesSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunk for fetching new replies from Gmail
export const fetchNewReplies = createAsyncThunk(
  'replies/fetch',
  async ({ userId, accessToken }, { rejectWithValue }) => {
    try {
      // Fetch all sent emails that haven't been checked for replies recently
      const response = await fetch('/api/check-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, accessToken }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch replies');
      }

      const data = await response.json();
      return data.replies || [];
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for fetching conversation thread
export const fetchConversation = createAsyncThunk(
  'replies/fetchConversation',
  async ({ userId, email, threadId, messageId, accessToken }, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/get-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, threadId, messageId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }

      const data = await response.json();
      return { email, conversation: data };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const repliesSlice = createSlice({
  name: 'replies',
  initialState: {
    replies: {}, // { email: { threadId, messageId, replyCount, lastReplyAt, conversation, seen } }
    loading: false,
    error: null,
    lastCheck: 0,
    unreadCount: 0,
    selectedConversation: null,
  },
  reducers: {
    // Add or update a reply
    addReply: (state, action) => {
      const { email, replyData } = action.payload;
      state.replies[email] = {
        ...state.replies[email],
        ...replyData,
        seen: false,
      };
      state.unreadCount = Object.values(state.replies).filter(r => !r.seen).length;
    },
    // Mark reply as seen
    markAsSeen: (state, action) => {
      const email = action.payload;
      if (state.replies[email]) {
        state.replies[email].seen = true;
        state.unreadCount = Object.values(state.replies).filter(r => !r.seen).length;
      }
    },
    // Mark all replies as seen
    markAllAsSeen: (state) => {
      Object.keys(state.replies).forEach(email => {
        state.replies[email].seen = true;
      });
      state.unreadCount = 0;
    },
    // Update conversation data for a reply
    updateConversation: (state, action) => {
      const { email, conversation } = action.payload;
      if (state.replies[email]) {
        state.replies[email].conversation = conversation;
      }
    },
    // Remove a reply
    removeReply: (state, action) => {
      const email = action.payload;
      delete state.replies[email];
      state.unreadCount = Object.values(state.replies).filter(r => !r.seen).length;
    },
    // Clear all replies
    clearReplies: (state) => {
      state.replies = {};
      state.unreadCount = 0;
    },
    // Set selected conversation
    setSelectedConversation: (state, action) => {
      state.selectedConversation = action.payload;
    },
    // Update last check timestamp
    updateLastCheck: (state, action) => {
      state.lastCheck = action.payload;
    },
    // Batch update replies
    batchUpdateReplies: (state, action) => {
      const replies = action.payload;
      Object.entries(replies).forEach(([email, replyData]) => {
        state.replies[email] = {
          ...state.replies[email],
          ...replyData,
          seen: false,
        };
      });
      state.unreadCount = Object.values(state.replies).filter(r => !r.seen).length;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch new replies
      .addCase(fetchNewReplies.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNewReplies.fulfilled, (state, action) => {
        state.loading = false;
        // Add new replies
        action.payload.forEach(reply => {
          state.replies[reply.email] = {
            ...state.replies[reply.email],
            ...reply,
            seen: false,
          };
        });
        state.lastCheck = Date.now();
        state.unreadCount = Object.values(state.replies).filter(r => !r.seen).length;
        state.error = null;
      })
      .addCase(fetchNewReplies.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch conversation
      .addCase(fetchConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchConversation.fulfilled, (state, action) => {
        state.loading = false;
        const { email, conversation } = action.payload;
        if (state.replies[email]) {
          state.replies[email].conversation = conversation;
        }
        state.error = null;
      })
      .addCase(fetchConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  addReply,
  markAsSeen,
  markAllAsSeen,
  updateConversation,
  removeReply,
  clearReplies,
  setSelectedConversation,
  updateLastCheck,
  batchUpdateReplies,
} = repliesSlice.actions;

export default repliesSlice.reducer;

// Selectors
export const selectReplies = (state) => state.replies.replies;
export const selectUnreadCount = (state) => state.replies.unreadCount;
export const selectReplyByEmail = (state, email) => state.replies.replies[email];
export const selectUnreadReplies = (state) =>
  Object.entries(state.replies.replies).filter(([_, r]) => !r.seen);
export const selectAllReplies = (state) => Object.entries(state.replies.replies);
export const selectSelectedConversation = (state) => state.replies.selectedConversation;
export const selectRepliesLoading = (state) => state.replies.loading;
export const selectRepliesError = (state) => state.replies.error;
export const selectLastCheck = (state) => state.replies.lastCheck;
