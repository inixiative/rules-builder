import type { Workspace } from '../workspace';

export type TabProps = {
  ws: Workspace;
  patch: (partial: Partial<Workspace>) => void;
};
