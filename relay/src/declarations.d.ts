// No longer using holster

declare module "self-adjusting-interval" {
  const setSelfAdjustingInterval: (callback: () => void | Promise<void>, interval: number) => any;
  export default setSelfAdjustingInterval;
}
declare module "ip" {
  export function address(): string;
}

