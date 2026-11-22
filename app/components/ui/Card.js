import React from 'react';

export const Card = ({
  children,
  className = '',
  padding = 'md',
  shadow = 'md',
  border = true,
  hover = false,
  role,
  ...props
}) => {
  const baseClasses = 'bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl transition-all duration-300';

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
  };

  const shadows = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  };

  const borderClasses = border ? 'border border-gray-200/50 dark:border-gray-700/50' : '';

  const hoverClasses = hover ? 'hover:shadow-xl hover:-translate-y-1 hover:border-blue-200/50 dark:hover:border-blue-800/50 cursor-pointer' : '';

  const classes = `${baseClasses} ${paddings[padding]} ${shadows[shadow]} ${borderClasses} ${hoverClasses} ${className}`;

  return (
    <div className={classes} role={role || (hover ? 'button' : undefined)} tabIndex={hover ? 0 : undefined} {...props}>
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`border-b border-gray-200/50 dark:border-gray-700/50 pb-5 mb-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={className} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`border-t border-gray-200/50 dark:border-gray-700/50 pt-5 mt-5 ${className}`} {...props}>
    {children}
  </div>
);

export default Card;