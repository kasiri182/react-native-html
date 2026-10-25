/** FlashList 2 measures rows itself and removed estimatedItemSize. */
export function flashListSizingProps(major: number, estimatedItemSize: number) {
  return major < 2 ? {estimatedItemSize} : {};
}
