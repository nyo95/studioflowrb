/** Public cross-app contracts only. No app may import another app's internals. */
export type EntityId = string;

export type Money = {
  amount: string;
  currency: string;
};
