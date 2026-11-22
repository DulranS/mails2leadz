import React from 'react';

export const Card = ({
  children,
  className = '',
  padding = 'md',
  shadow = 'md',
  border = true,
  hover = false,
  ...props
}) => {
  const baseClasses = 'bg-white dark:bg-gray-900 rounded-xl transition-all duration-200';

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
    xl: 'p-8',
  };

  const shadows = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  };

  const borderClasses = border ? 'border border-gray-200 dark:border-gray-800' : '';

  const hoverClasses = hover ? 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 cursor-pointer' : '';

  const classes = `${baseClasses} ${paddings[padding]} ${shadows[shadow]} ${borderClasses} ${hoverClasses} ${className}`;

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`border-b border-gray-200 dark:border-gray-800 pb-4 mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={className} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`border-t border-gray-200 dark:border-gray-800 pt-4 mt-4 ${className}`} {...props}>
    {children}
  </div>
);

export default Card;