import { Injectable, Logger } from "@nestjs/common";
import { encodeActivityRunMessage, LIVE_CLASS_ACTIVITY_RUN_TOPIC, type ActivityRunMessage } from "@nexa-chess/types";
import { LiveKitService } from "../live-class/livekit.service";

/** Who is watching changes rarely; a short cache spares LiveKit a call on every move. */
const MANAGER_CACHE_MS = 5_000;

/**
 * Packets are a nudge on top of REST, never the record: nothing here may throw
 * into a move, and a dropped packet only delays a board until the next poll.
 * Game state goes to the class's managers alone, so one student's game is never
 * on another student's wire.
 */
@Injectable()
export class ActivityRunEventsService {
  private readonly logger = new Logger(ActivityRunEventsService.name);
  private readonly managers = new Map<string, { at: number; identities: string[] }>();

  constructor(private readonly livekit: LiveKitService) {}

  /** Lifecycle only (no game data): every participant refetches their own view. */
  async toRoom(roomName: string, message: ActivityRunMessage): Promise<void> {
    try {
      await this.livekit.broadcastData(roomName, encodeActivityRunMessage(message), LIVE_CLASS_ACTIVITY_RUN_TOPIC);
    } catch (error) {
      this.logger.debug(`Activity run nudge failed for ${roomName}: ${(error as Error).message}`);
    }
  }

  /** Fire and forget. With no manager connected there is nobody to tell, so nothing is sent. */
  toManagers(roomName: string, message: ActivityRunMessage): void {
    void this.sendToManagers(roomName, message);
  }

  private async sendToManagers(roomName: string, message: ActivityRunMessage): Promise<void> {
    try {
      const identities = await this.managerIdentities(roomName);
      // broadcastData treats an empty list as "everyone": never call it with one.
      if (identities.length === 0) return;
      await this.livekit.broadcastData(roomName, encodeActivityRunMessage(message), LIVE_CLASS_ACTIVITY_RUN_TOPIC, identities);
    } catch (error) {
      this.logger.debug(`Activity monitor packet failed for ${roomName}: ${(error as Error).message}`);
    }
  }

  private async managerIdentities(roomName: string): Promise<string[]> {
    const cached = this.managers.get(roomName);
    if (cached && Date.now() - cached.at < MANAGER_CACHE_MS) return cached.identities;
    const participants = await this.livekit.listParticipants(roomName);
    const identities = participants.filter((p) => this.isManagerMetadata(p.metadata)).map((p) => p.identity);
    this.managers.set(roomName, { at: Date.now(), identities });
    return identities;
  }

  /** The role is in the signed token's metadata: a student can't rewrite it. */
  private isManagerMetadata(metadata: string | undefined): boolean {
    if (!metadata) return false;
    try {
      // An admin in the room joins as COACH; a hidden spectator has no use for these.
      return (JSON.parse(metadata) as { role?: unknown }).role === "COACH";
    } catch {
      return false;
    }
  }
}
