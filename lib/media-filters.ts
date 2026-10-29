export const mediaSorts = {
  newest: 'Newest first', oldest: 'Oldest first',
  upvotes_desc: 'Most upvotes', upvotes_asc: 'Fewest upvotes',
};
export function mediaFilters(params: Record<string, string | string[] | undefined>) {
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const sort = value('sort');
  return {
    q: value('q').slice(0, 100), style: value('style'),
    status: ['draft', 'published'].includes(value('status')) ? value('status') : '',
    reactions: ['rated', 'unrated'].includes(value('reactions')) ? value('reactions') : '',
    sort: Object.hasOwn(mediaSorts, sort) ? sort as keyof typeof mediaSorts : 'newest' as const,
  };
}
