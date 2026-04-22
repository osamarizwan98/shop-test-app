/* eslint-disable react/prop-types */
export function Input({ hasError = false, className = '', ...rest }) {
  return (
    <input
      className={`SB_uiInput ${hasError ? 'SB_uiInput--error' : ''} ${className}`.trim()}
      {...rest}
    />
  );
}

