/* eslint-disable react/prop-types */
export function Card({
  as: Component = 'div',
  className = '',
  children,
  ...rest
}) {
  return (
    <Component className={`SB_uiCard ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
}

