import { Injectable, Logger, OnModuleInit, InternalServerErrorException } from "@nestjs/common";
import { RoomServiceClient, AccessToken, Room } from "livekit-server-sdk";
import { LiveKitTokenOptions } from "./types/live-class.types";
import { getApiEnv } from "@nexa-gen/config/api";

@Injectable()
export class LiveKitService implements OnModuleInit {
  private readonly logger = new Logger(LiveKitService.name);
  private roomClient!: RoomServiceClient;

  private readonly livekitUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor() {
    const env = getApiEnv();
    this.livekitUrl = env.LIVEKIT_URL ?? "";
    this.apiKey = env.LIVEKIT_API_KEY ?? "";
    this.apiSecret = env.LIVEKIT_API_SECRET ?? "";
  }

  onModuleInit() {
    if (!this.livekitUrl || !this.apiKey || !this.apiSecret) {
      this.logger.error("LiveKit configuration is missing! Please provide LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.");
      throw new InternalServerErrorException("LiveKit configuration is missing.");
    }

    this.roomClient = new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
    this.logger.log("LiveKit RoomServiceClient initialized.");
  }

  generateRoomName(scheduleId: string): string {
    return `class_${scheduleId}`;
  }

  async createRoom(roomName: string): Promise<Room> {
    try {
      this.logger.log(`Creating LiveKit room: ${roomName}`);
      const room = await this.roomClient.createRoom({
        name: roomName,
        emptyTimeout: 10 * 60, // 10 minutes timeout to prevent resource leaks
        maxParticipants: 100,
      });
      return room;
    } catch (error) {
      this.logger.error(`Failed to create LiveKit room: ${roomName}`, error);
      throw new InternalServerErrorException("Failed to create LiveKit room");
    }
  }

  async fetchRoom(roomName: string): Promise<Room | null> {
    try {
      // roomClient.listRooms returns an array of rooms
      const rooms = await this.roomClient.listRooms([roomName]);
      return rooms.length > 0 ? rooms[0] : null;
    } catch (error) {
      this.logger.warn(`Room ${roomName} not found or error fetching`, error);
      return null;
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      this.logger.log(`Deleting LiveKit room: ${roomName}`);
      await this.roomClient.deleteRoom(roomName);
    } catch (error) {
      this.logger.warn(`Failed to delete LiveKit room: ${roomName}`, error);
    }
  }

  async listParticipants(roomName: string) {
    try {
      const participants = await this.roomClient.listParticipants(roomName);
      return participants;
    } catch (error) {
      this.logger.error(`Failed to list participants for room: ${roomName}`, error);
      return [];
    }
  }

  async generateAccessToken(options: LiveKitTokenOptions): Promise<string> {
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: options.participantIdentity,
        name: options.participantName,
      });

      if (options.isCoach) {
        at.addGrant({
          roomJoin: true,
          room: options.roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          roomAdmin: true,
        });
      } else {
        at.addGrant({
          roomJoin: true,
          room: options.roomName,
          canPublish: true, // Allow students to publish video/audio
          canSubscribe: true,
          canPublishData: true,
          roomAdmin: false,
        });
      }

      return await at.toJwt();
    } catch (error) {
      this.logger.error("Failed to generate LiveKit token", error);
      throw new InternalServerErrorException("Failed to generate LiveKit access token");
    }
  }
}
