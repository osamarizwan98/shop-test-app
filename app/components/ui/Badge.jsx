/* eslint-disable react/prop-types */
export function Badge({ tone = 'inactive', className = '', children }) {
  return (
    <span className={`SB_uiBadge SB_uiBadge--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}

