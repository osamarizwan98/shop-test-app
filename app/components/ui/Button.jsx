/* eslint-disable react/prop-types */
export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`SB_uiButton SB_uiButton--${variant} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

