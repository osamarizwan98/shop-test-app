import { createContext, useContext, useMemo, useState } from 'react';

const StyleContext = createContext(null);

// Props are controlled by route composition and kept intentionally minimal.
// eslint-disable-next-line react/prop-types
export function StyleProvider({ initialConfig, children }) {
  const [styleConfig, setStyleConfig] = useState(initialConfig);

  const value = useMemo(() => ({
    styleConfig,
    setStyleConfig,
  }), [styleConfig]);

  return (
    <StyleContext.Provider value={value}>
      {children}
    </StyleContext.Provider>
  );
}

export function useStyleConfig() {
  const context = useContext(StyleContext);

  if (!context) {
    throw new Error('useStyleConfig must be used inside StyleProvider');
  }

  return context;
}
