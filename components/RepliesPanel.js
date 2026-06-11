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

export default function RepliesPanel({ userId, accessToken, senderEmail }) {
  const dispatch = useAppDispatch();
  const replies = useAppSelector(selectReplies);
  const unreadCount = useAppSelector(selectUnreadCount);
  const selectedConversation = useAppSelector(selectSelectedConversation);
  const loading = useAppSelector(selectRepliesLoading);
  const lastCheck = useAppSelector(selectLastCheck);

  const [isOpen, setIsOpen] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);

  // Auto-check for new replies every 5 minutes
  useEffect(() => {
    if (!autoCheck || !userId || !accessToken || !senderEmail) return;

    const checkForReplies = async () => {
      try {
        await dispatch(fetchNewReplies({ userId, accessToken }));
      } catch (error) {
        console.error('Failed to check for replies:', error);
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

  if (unreadCount === 0 && !isOpen) {
    return null;
  }

  return (
    <>
      {/* Floating button to open panel */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-colors z-50"
        style={{ display: isOpen ? 'none' : 'block' }}
      >
        <div className="relative">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </div>
      </button>

      {/* Replies Panel */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold">New Replies</h2>
                <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded">
                  {unreadCount} unread
                </span>
                {lastCheck > 0 && (
                  <span className="text-gray-500 text-sm">
                    Last checked: {formatTime(lastCheck)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCheckNow}
                  disabled={loading}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Check Now'}
                </button>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsSeen}
                    className="px-3 py-1 bg-blue-100 hover:bg-blue-200 rounded text-sm"
                  >
                    Mark All Read
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {repliesList.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>No new replies yet</p>
                  <button
                    onClick={handleCheckNow}
                    disabled={loading}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Check for Replies
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {repliesList.map(([email, reply]) => (
                    <div
                      key={email}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        !reply.seen ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                      } ${selectedConversation?.email === email ? 'ring-2 ring-blue-500' : ''}`}
                      onClick={() => handleViewConversation(email, reply)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{email}</span>
                            {!reply.seen && (
                              <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded">New</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{reply.replySubject}</p>
                          <p className="text-xs text-gray-500">
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
              <div className="border-t p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Conversation with {selectedConversation.email}</h3>
                  <button
                    onClick={() => dispatch(setSelectedConversation(null))}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Close
                  </button>
                </div>
                {selectedConversation.reply?.conversation ? (
                  <div className="max-h-64 overflow-auto space-y-2">
                    {selectedConversation.reply.conversation.messages?.map((message) => (
                      <div
                        key={message.id}
                        className={`p-3 rounded ${
                          message.from.includes(senderEmail)
                            ? 'bg-blue-100 ml-8'
                            : 'bg-gray-100 mr-8'
                        }`}
                      >
                        <div className="text-xs text-gray-500 mb-1">
                          {message.from} • {formatTime(message.date)}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{message.body}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">
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
