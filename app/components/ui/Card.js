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
  const baseClasses = 'bg-white dark:bg-gray-800 rounded-lg transition-all duration-200';

  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
    xl: 'p-8',
  };

  const shadows = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  };

  const borderClasses = border ? 'border border-gray-200 dark:border-gray-700' : '';

  const hoverClasses = hover ? 'hover:shadow-lg hover:-translate-y-0.5' : '';

  const classes = `${baseClasses} ${paddings[padding]} ${shadows[shadow]} ${borderClasses} ${hoverClasses} ${className}`;

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={className} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`border-t border-gray-200 dark:border-gray-700 pt-4 mt-4 ${className}`} {...props}>
    {children}
  </div>
);

export default Card;