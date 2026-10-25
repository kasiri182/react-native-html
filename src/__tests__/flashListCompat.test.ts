import {flashListSizingProps} from '../flashListCompat';
it('preserves the caller estimate for FlashList 1', () => {
  expect(flashListSizingProps(1, 180)).toEqual({estimatedItemSize: 180});
});
it('omits the removed prop for FlashList 2', () => {
  expect(flashListSizingProps(2, 180)).toEqual({});
});
