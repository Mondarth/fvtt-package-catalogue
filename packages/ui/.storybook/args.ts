/**
 * A story's args, less `children`: a story's template gives a component its content itself, so spreading the args
 * must not give it `children` as well.
 *
 * @param args - The story's args
 * @returns The rest of them
 */
export const withoutChildren = <T extends object>(args: T): Omit<T, 'children'> =>
  Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'children')) as Omit<T, 'children'>;
