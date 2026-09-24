// React 19's types no longer declare a global `JSX` namespace — it lives at
// React.JSX. The pages here annotate their returns as `JSX.Element` (113 of
// them), so this restores that one name as an alias of React's own type rather
// than rewriting every signature for the Next 14 → 16 upgrade.
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
