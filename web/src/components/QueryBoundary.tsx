import { Component } from "react";
import type { ReactNode } from "react";

/** Isolates failed live queries from the rest of the workspace. Retry remounts by key. */
export default class QueryBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
