# Pagination, infinite scroll and lazy loading

How lists load in Nexa Chess. Pick the pattern by what the list *is*, never
return an unbounded `findMany` from a list endpoint, and never cap a list with a
silent `take: N` the user can't page past.

## 1. Which pattern

| List | Pattern | API shape | Web |
|---|---|---|---|
| Admin/coach **table** with totals, sorting, jumping to a page (users, batches, leads, batch classes, coach class history, referrals, invoices, analytics tables) | **Offset pages** (AUDIT H26) | `?page&pageSize&search&sort&order` → `{ …, pagination: PaginationMeta }` | `useServerTable` + `useDataTable({ manual… })` + `DataTablePagination` |
| Newest-first **feed** that grows while you read it (notifications, announcements, message delivery log, activity history, platform audit, puzzle catalogue, chat) | **Keyset cursor + infinite scroll** | `?cursor&limit` → `{ …, nextCursor: string \| null }` | `useInfiniteQuery` + `InfiniteScrollTrigger` |
| Small, naturally bounded list (a coach's own batches, a batch roster, settings rows) | One request | plain array | `useQuery`; client sort/paginate is fine |

A feed uses a cursor, not `page`, because rows arrive while the user scrolls: an
offset would then repeat or skip rows. A table uses offsets because people
want totals and "page 7".

## 2. API

### Offset pages — `common/pagination.ts`

```ts
const { page, pageSize, skip, take, search } = resolvePagination(query); // clamps pageSize ≤ 100
const [rows, total] = await Promise.all([findMany({ where, orderBy, skip, take }), count({ where })]);
return { items, pagination: paginationMeta(total, page, pageSize) };
```

- `orderBy` ends with a unique column (`id`) so page boundaries are stable.
- Sort keys come from an allow-list (`resolveOrderBy`, or an explicit mapping
  as in `CoachService.getClassHistory`) — never pass `sort` to Prisma raw.

### Keyset cursor — `common/cursor-pagination.ts`

For feeds ordered `(createdAt desc, id desc)`:

```ts
const rows = await prisma.x.findMany({
  where: { ...filters, ...createdAtCursorWhere(query.cursor) },
  orderBy: [...CREATED_AT_DESC_ORDER],
  take: query.limit + 1            // one probe row says whether there is a next page
});
const page = toCursorPage(rows, query.limit);
return { items: page.items.map(toItem), nextCursor: page.nextCursor };
```

- Validate the query with `cursorPageQuerySchema` (`@nexa-chess/types`;
  `limit` defaults to 30, max 100) through `ZodBodyPipe` on `@Query`.
- The cursor is opaque base64url `[createdAt, id]`; a tampered one is a **400**.
- Totals that describe the whole filter (unread count, delivery counts) ride on
  every page; the web reads them from `pages[0]`.
- Other orderings keep their own encoder (activity history, puzzle catalogue,
  platform audit) — same contract: `nextCursor` null on the last page.

## 3. Web

### Infinite scroll

```tsx
const query = useInfiniteQuery({
  queryKey, queryFn: ({ pageParam }) => getX(pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.nextCursor ?? undefined
});
const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
…
<InfiniteScrollTrigger query={query} label="Load older …" />
```

- `InfiniteScrollTrigger` (`components/ui/`) loads the next page as it nears the
  viewport (one `IntersectionObserver`, 320px ahead), keeps a real **Load more**
  button for keyboard/screen-reader users and old browsers, and on a failed page
  shows a retry and **stops auto-loading** until the user retries.
- Inside a scroll container (popover, dialog, chat pane) pass `root={ref}`.
- For a custom footer use the hook `useInfiniteScroll` directly (the chat thread
  uses it on a top sentinel for "load earlier messages").
- A polled infinite query refetches every loaded page; trim back to the first
  page when the view closes (`useTrimNotificationPages`) so the poll stays one
  request.
- Invalidate by the query-key prefix as usual; TanStack re-derives each cursor
  from the freshly fetched page before it, so nothing is skipped.

### Offset tables

`useServerTable({ pageSize })` owns page/sort/search/status and resets to page 1
on any filter change; feed `serverTable.params` to the query (with
`placeholderData: keepPreviousData`), pass `pagination`, `sorting`,
`pageCount` and `...serverTable.manual` to `useDataTable`, call
`clampToPageCount(totalPages)` in an effect, and give `DataTablePagination` the
server `total`. Column `accessorKey`s double as the API's sort keys.

### Lazy loading

- **Images in repeated rows** (`Avatar`, thumbnails, crops) get
  `loading="lazy" decoding="async"`. Above-the-fold brand images (logos, hero)
  stay eager.
- **Heavy libraries** load on first use: charts via `components/charts/Charts.tsx`
  (`React.lazy` + `Suspense` skeleton of the chart's height), pdf.js/Tesseract
  via `webpackIgnore` imports from `public/vendor/`, rarely used panels via
  `next/dynamic`. Don't import `RechartsCharts.tsx` directly.
