/* eslint-disable react/prop-types */
export function Table({ className = '', children }) {
  return <table className={`SB_uiTable ${className}`.trim()}>{children}</table>;
}

