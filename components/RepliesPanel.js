// components/RepliesPanel.js
'use client';
import React, { useState, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../lib/redux/hooks';
import {
  fetchNewReplies,
  fetchConversation,
  markAsSeen,
  markAllAsSeen,
  setSelectedConversation,
} from '../lib/redux/slices/repliesSlice';
import {
  selectReplies,
  selectUnreadCount,
  selectSelectedConversation,
  selectRepliesLoading,
  selectLastCheck,
} from '../lib/redux/slices/repliesSlice';

export default function RepliesPanel({ userId, accessToken, senderEmail, isOpen: externalIsOpen, onToggle }) {
  const dispatch = useAppDispatch();
  const replies = useAppSelector(selectReplies);
  const unreadCount = useAppSelector(selectUnreadCount);
  const selectedConversation = useAppSelector(selectSelectedConversation);
  const loading = useAppSelector(selectRepliesLoading);
  const lastCheck = useAppSelector(selectLastCheck);

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = onToggle || setInternalIsOpen;
  const [autoCheck, setAutoCheck] = useState(true);

  // Auto-check for new replies every 5 minutes
  useEffect(() => {
    if (!autoCheck || !userId || !accessToken || !senderEmail) return;

    const checkForReplies = async () => {
      try {
        console.log('[RepliesPanel] Checking for replies...');
        await dispatch(fetchNewReplies({ userId, accessToken }));
        console.log('[RepliesPanel] Reply check complete');
      } catch (error) {
        console.error('[RepliesPanel] Failed to check for replies:', error);
      }
    };

    // Initial check
    checkForReplies();

    // Set up interval
    const interval = setInterval(checkForReplies, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [userId, accessToken, senderEmail, autoCheck, dispatch]);

  const handleCheckNow = async () => {
    try {
      await dispatch(fetchNewReplies({ userId, accessToken }));
    } catch (error) {
      console.error('Failed to check for replies:', error);
    }
  };

  const handleViewConversation = async (email, reply) => {
    try {
      await dispatch(fetchConversation({
        userId,
        email,
        threadId: reply.threadId,
        messageId: reply.messageId,
        accessToken,
      }));
      dispatch(setSelectedConversation({ email, reply }));
      dispatch(markAsSeen(email));
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
    }
  };

  const handleMarkAllAsSeen = () => {
    dispatch(markAllAsSeen());
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const repliesList = Object.entries(replies).sort((a, b) => {
    return new Date(b[1].lastReplyAt) - new Date(a[1].lastReplyAt);
  });

  // Log panel state changes
  useEffect(() => {
    console.log('[RepliesPanel] Panel isOpen:', isOpen, 'Replies count:', repliesList.length, 'Unread:', unreadCount);
  }, [isOpen, repliesList.length, unreadCount]);

  // Always show the button, even when no unread replies

  return (
    <>
      {/* Replies Panel */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-700">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-gray-800 rounded-t-xl">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-white">📬 Email Replies</h2>
                <span className="bg-blue-600 text-white text-sm px-3 py-1 rounded-full">
                  {unreadCount} unread
                </span>
                <span className="bg-gray-700 text-gray-300 text-sm px-3 py-1 rounded-full">
                  Total: {repliesList.length}
                </span>
                {lastCheck > 0 && (
                  <span className="text-gray-400 text-sm">
                    Last checked: {formatTime(lastCheck)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCheckNow}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Checking...' : '🔄 Check Now'}
                </button>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsSeen}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                  >
                    ✓ Mark All Read
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 bg-gray-900">
              {repliesList.length === 0 ? (
                <div className="text-center text-gray-400 py-16">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-xl mb-2">No replies detected yet</p>
                  <p className="text-sm mb-6">Click "Check Now" to scan your Gmail for new responses</p>
                  <button
                    onClick={handleCheckNow}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Checking...' : '🔄 Check Now'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {repliesList.map(([email, reply]) => (
                    <div
                      key={email}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] ${
                        !reply.seen 
                          ? 'bg-blue-900/30 border-blue-500 hover:bg-blue-900/50' 
                          : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                      } ${selectedConversation?.email === email ? 'ring-2 ring-blue-500' : ''}`}
                      onClick={() => handleViewConversation(email, reply)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-white">{email}</span>
                            {!reply.seen && (
                              <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">NEW</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-300 mb-1">{reply.replySubject}</p>
                          <p className="text-xs text-gray-400">
                            From: {reply.replyFrom} • {formatTime(reply.lastReplyAt)}
                          </p>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conversation View */}
            {selectedConversation && (
              <div className="border-t border-gray-700 p-4 bg-gray-800 rounded-b-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">💬 Conversation with {selectedConversation.email}</h3>
                  <button
                    onClick={() => dispatch(setSelectedConversation(null))}
                    className="text-gray-400 hover:text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors"
                  >
                    ✕ Close
                  </button>
                </div>
                {selectedConversation.reply?.conversation ? (
                  <div className="max-h-80 overflow-auto space-y-3 bg-gray-900 rounded-lg p-4">
                    {selectedConversation.reply.conversation.messages?.map((message) => (
                      <div
                        key={message.id}
                        className={`p-4 rounded-lg ${
                          message.from.includes(senderEmail)
                            ? 'bg-blue-600 ml-12 text-white'
                            : 'bg-gray-700 mr-12 text-gray-200'
                        }`}
                      >
                        <div className="text-xs text-gray-400 mb-2">
                          {message.from} • {formatTime(message.date)}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{message.body}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-400 py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                    Loading conversation...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
