'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// Two contexts on purpose. The ACTIONS (add / success / error ...) never change, so a page that only shows toasts is not
// re-rendered when a toast appears or fades away. Only the small container that draws the toasts follows the list.
// (Before, one object holding the list was handed to every page: each toast re-rendered the whole page it was shown on.)
const NotificationActions = createContext(null);
const NotificationList = createContext([]);

export const useNotifications = () => {
  const context = useContext(NotificationActions);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const notification = { id, message, type, duration };

    setNotifications(prev => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  }, [removeNotification]);

  const actions = useMemo(() => ({
    addNotification,
    removeNotification,
    success: (message, duration) => addNotification(message, 'success', duration),
    error: (message, duration) => addNotification(message, 'error', duration),
    warning: (message, duration) => addNotification(message, 'warning', duration),
    info: (message, duration) => addNotification(message, 'info', duration),
  }), [addNotification, removeNotification]);

  return (
    <NotificationActions.Provider value={actions}>
      <NotificationList.Provider value={notifications}>
        {children}
        <NotificationContainer />
      </NotificationList.Provider>
    </NotificationActions.Provider>
  );
};

const NotificationContainer = () => {
  const notifications = useContext(NotificationList);
  const { removeNotification } = useNotifications();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
};

const Notification = ({ notification, onClose }) => {
  const { type, message } = notification;

  const styles = {
    success: 'bg-green-500 text-white border-green-600',
    error: 'bg-red-500 text-white border-red-600',
    warning: 'bg-yellow-500 text-white border-yellow-600',
    info: 'bg-blue-500 text-white border-blue-600',
  };

  return (
    <div className={`
      max-w-sm w-full p-4 rounded-lg border-l-4 shadow-lg transform transition-all duration-300 ease-in-out
      ${styles[type]}
    `}>
      <div className="flex items-start">
        <div className="flex-1">
          <p className="text-sm font-medium">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 text-white hover:text-gray-200 focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default NotificationProvider;