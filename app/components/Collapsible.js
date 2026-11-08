import React from "react";

// A section that opens with one tap. Native <details>: keyboard and screen-reader friendly, no script, large touch target.
export default function Collapsible({ title, hint = "", defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white min-h-[44px]">
        {title}
        {hint ? <span className="block text-xs font-normal text-gray-600 dark:text-gray-300 mt-0.5">{hint}</span> : null}
      </summary>
      <div className="px-2 pb-3">{children}</div>
    </details>
  );
}
