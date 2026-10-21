/** Joins the truthy class names: cx('a', isB && 'b') → 'a b'. */
export function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ')
}
