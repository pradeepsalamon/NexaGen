import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { API_ROUTES, type PaginatedQuery } from "@nexa-chess/types";
import { Throttle } from "@nestjs/throttler";
import { optionalQueryString } from "../common/query-params";
import { RequireFeature } from "../platform/require-feature.decorator";
import { TournamentPublicService } from "./tournament-public.service";

/**
 * Anonymous spectating (docs/TOURNAMENTS.md §4.1): no session, the academy
 * from the host. A 404 unless the academy allows it and the tournament is
 * PUBLIC; only the public projection is ever returned. Listed in
 * `route-auth.spec.ts` PUBLIC_ROUTES. Throttled per IP by the global guard,
 * tighter here.
 */
@RequireFeature("tournaments")
@Controller()
export class TournamentPublicController {
  constructor(private readonly publicView: TournamentPublicService) {}

  @Get(API_ROUTES.publicTournaments.list)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Query() query: PaginatedQuery) {
    return this.publicView.list(query);
  }

  @Get(API_ROUTES.publicTournaments.get())
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  get(@Param("id") id: string) {
    return this.publicView.get(id);
  }

  @Get(API_ROUTES.publicTournaments.live())
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  live(@Param("id") id: string) {
    return this.publicView.live(id);
  }

  @Get(API_ROUTES.publicTournaments.standings())
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  standings(@Param("id") id: string) {
    return this.publicView.standings(id);
  }

  @Get(API_ROUTES.publicTournaments.game())
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  game(@Param("id") id: string, @Param("gameId") gameId: string) {
    return this.publicView.game(id, gameId);
  }

  @Get(API_ROUTES.publicTournaments.commentary())
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  commentary(@Param("id") id: string, @Query("cursor") cursor: unknown) {
    return this.publicView.commentary(id, optionalQueryString(cursor, "cursor"));
  }

  @Post(API_ROUTES.publicTournaments.realtimeToken())
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  realtimeToken(@Param("id") id: string) {
    return this.publicView.realtimeToken(id);
  }
}
