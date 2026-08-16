import { Injectable, Logger, OnModuleInit, InternalServerErrorException } from "@nestjs/common";
import { RoomServiceClient, AccessToken, Room, EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from "livekit-server-sdk";
import { LiveKitTokenOptions } from "./types/live-class.types";
import { getApiEnv } from "@nexa-chess/config/api";

@Injectable()
export class LiveKitService implements OnModuleInit {
  private readonly logger = new Logger(LiveKitService.name);
  private roomClient!: RoomServiceClient;
  private egressClient!: EgressClient;

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
    this.egressClient = new EgressClient(this.livekitUrl, this.apiKey, this.apiSecret);
    this.logger.log("LiveKit RoomServiceClient and EgressClient initialized.");
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
        metadata: JSON.stringify({ role: options.isCoach ? 'COACH' : 'STUDENT' }),
      });

      if (options.isCoach) {
        at.addGrant({
          roomJoin: true,
          room: options.roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          roomAdmin: true,
          canUpdateOwnMetadata: true,
        });
      } else {
        at.addGrant({
          roomJoin: true,
          room: options.roomName,
          canPublish: true, // Allow students to publish video/audio
          canSubscribe: true,
          canPublishData: true,
          roomAdmin: false,
          canUpdateOwnMetadata: true,
        });
      }

      return await at.toJwt();
    } catch (error) {
      this.logger.error("Failed to generate LiveKit token", error);
      throw new InternalServerErrorException("Failed to generate LiveKit access token");
    }
  }

  async startRecording(roomName: string, filepath: string): Promise<string> {
    try {
      this.logger.log(`Starting LiveKit room composite egress for room: ${roomName}`);
      let s3Output: { case: "s3", value: S3Upload } | undefined = undefined;
      const { OCI_ACCESS_KEY_ID, OCI_SECRET_ACCESS_KEY, OCI_REGION, OCI_NAMESPACE, OCI_BUCKET_NAME } = process.env;
      
      if (OCI_ACCESS_KEY_ID && OCI_SECRET_ACCESS_KEY && OCI_REGION && OCI_NAMESPACE && OCI_BUCKET_NAME) {
        const s3Upload = new S3Upload({
          accessKey: OCI_ACCESS_KEY_ID,
          secret: OCI_SECRET_ACCESS_KEY,
          region: OCI_REGION,
          endpoint: `https://${OCI_NAMESPACE}.compat.objectstorage.${OCI_REGION}.oci.customer-oci.com`,
          bucket: OCI_BUCKET_NAME,
          forcePathStyle: true,
        });
        s3Output = { case: "s3", value: s3Upload };
      }

      const fileOutput = new EncodedFileOutput({
        filepath,
        fileType: EncodedFileType.MP4,
        output: s3Output,
      });
      const info = await this.egressClient.startRoomCompositeEgress(
        roomName,
        {
          file: fileOutput,
        },
        {
          layout: "grid",
        }
      );
      this.logger.log(`Started recording ${roomName}, egressId: ${info.egressId}`);
      return info.egressId;
    } catch (error) {
      this.logger.error(`Failed to start recording for room: ${roomName}`, error);
      throw new InternalServerErrorException("Failed to start LiveKit recording");
    }
  }

  async stopRecording(egressId: string): Promise<void> {
    try {
      this.logger.log(`Stopping LiveKit egress: ${egressId}`);
      await this.egressClient.stopEgress(egressId);
      this.logger.log(`Stopped recording egressId: ${egressId}`);
    } catch (error) {
      this.logger.error(`Failed to stop recording for egressId: ${egressId}`, error);
      throw new InternalServerErrorException("Failed to stop LiveKit recording");
    }
  }
}
