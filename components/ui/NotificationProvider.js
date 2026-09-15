"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = "info", duration = 3000) => {
    const id = Date.now();
    const notification = { id, message, type };
    
    setNotifications((prev) => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const value = useMemo(
    () => ({ addNotification, removeNotification, notifications }),
    [addNotification, removeNotification, notifications]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationDisplay notifications={notifications} onRemove={removeNotification} />
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
};

const NotificationDisplay = ({ notifications, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 space-y-2 z-50 pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`pointer-events-auto p-4 rounded-lg shadow-lg text-white animate-fade-in-down ${getNotificationClass(
            notification.type
          )}`}
        >
          <div className="flex items-center justify-between">
            <span>{notification.message}</span>
            <button
              onClick={() => onRemove(notification.id)}
              className="ml-4 text-xl font-bold hover:opacity-75"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

function getNotificationClass(type) {
  switch (type) {
    case "success":
      return "bg-green-500";
    case "error":
      return "bg-red-500";
    case "warning":
      return "bg-yellow-500";
    case "info":
    default:
      return "bg-blue-500";
  }
}

export default NotificationProvider;
