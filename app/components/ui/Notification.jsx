/* eslint-disable react/prop-types */
export function Notification({ tone = 'info', className = '', children }) {
  return (
    <div className={`SB_uiNotification SB_uiNotification--${tone} ${className}`.trim()} role="status">
      {children}
    </div>
  );
}

