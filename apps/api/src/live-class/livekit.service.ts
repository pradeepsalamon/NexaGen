import { Injectable, Logger, OnModuleInit, InternalServerErrorException } from "@nestjs/common";
import { RoomServiceClient, AccessToken, Room, EgressClient, EncodedFileOutput, EncodedFileType, EncodingOptionsPreset, S3Upload, TrackSource, DataPacket_Kind } from "livekit-server-sdk";
import type { DerivedLiveKitGrants, LiveKitTrackSource } from "@nexa-chess/types";
import { LiveKitTokenOptions } from "./types/live-class.types";
import { getApiEnv } from "@nexa-chess/config/api";

const TRACK_SOURCE_MAP: Record<LiveKitTrackSource, TrackSource> = {
  camera: TrackSource.CAMERA,
  microphone: TrackSource.MICROPHONE,
  screen_share: TrackSource.SCREEN_SHARE,
  screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
};

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
      // A room that doesn't exist yet is an expected, benign state (nobody has
      // joined) — return empty. Anything else is a real LiveKit failure and
      // must propagate so callers don't mistake an outage for "room empty"
      // (AUDIT M22).
      if (LiveKitService.isRoomNotFoundError(error)) {
        return [];
      }
      this.logger.error(`Failed to list participants for room: ${roomName}`, error);
      throw error;
    }
  }

  static isRoomNotFoundError(error: unknown): boolean {
    const err = error as { code?: string; message?: string; status?: number } | null;
    if (!err) return false;
    if (err.code === "not_found" || err.status === 404) return true;
    return /not[\s_-]?found|does not exist|no such room/i.test(err.message ?? "");
  }

  async generateAccessToken(options: LiveKitTokenOptions): Promise<string> {
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: options.participantIdentity,
        name: options.participantName,
        metadata: JSON.stringify({ role: options.isCoach ? 'COACH' : 'STUDENT' }),
      });

      if (options.grants) {
        // Policy-derived grants (pre-class settings). This is the server-side
        // enforcement point: a forbidden source is simply absent from
        // `canPublishSources`, so the SFU rejects the publish.
        const g = options.grants;
        at.addGrant({
          roomJoin: true,
          room: options.roomName,
          canPublish: g.canPublish,
          canPublishSources: g.canPublishSources.map((s) => TRACK_SOURCE_MAP[s]),
          canSubscribe: g.canSubscribe,
          canPublishData: g.canPublishData,
          roomAdmin: g.roomAdmin,
          canUpdateOwnMetadata: g.canUpdateOwnMetadata,
        });
      } else if (options.isCoach) {
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
          // Deliberately false: the client derives a participant's role from
          // this metadata (chat badges, video grid, and the authoritative
          // chessboard sync). Letting a student rewrite their own metadata
          // would let them impersonate the coach. See AUDIT.md C7.
          canUpdateOwnMetadata: false,
        });
      }

      return await at.toJwt();
    } catch (error) {
      this.logger.error("Failed to generate LiveKit token", error);
      throw new InternalServerErrorException("Failed to generate LiveKit access token");
    }
  }

  /** Reverse of `TRACK_SOURCE_MAP` — LiveKit enum value back to our string label. */
  private static readonly TRACK_SOURCE_LABEL: Partial<Record<number, LiveKitTrackSource>> = {
    [TrackSource.CAMERA]: "camera",
    [TrackSource.MICROPHONE]: "microphone",
    [TrackSource.SCREEN_SHARE]: "screen_share",
    [TrackSource.SCREEN_SHARE_AUDIO]: "screen_share_audio",
  };

  static trackSourceLabel(source: number | undefined): LiveKitTrackSource | null {
    return (source !== undefined && LiveKitService.TRACK_SOURCE_LABEL[source]) || null;
  }

  /**
   * Push a fresh set of publish permissions to a participant already in the
   * room (mid-class policy change). LiveKit replaces the permission set
   * atomically, so every field must be supplied.
   */
  async updateParticipantPermissions(
    roomName: string,
    identity: string,
    grants: DerivedLiveKitGrants,
  ): Promise<void> {
    await this.roomClient.updateParticipant(roomName, identity, {
      permission: {
        canSubscribe: grants.canSubscribe,
        canPublish: grants.canPublish,
        canPublishData: grants.canPublishData,
        canPublishSources: grants.canPublishSources.map((s) => TRACK_SOURCE_MAP[s]),
        canUpdateMetadata: grants.canUpdateOwnMetadata,
      },
    });
  }

  /** Force-mute one already-published track (used when a source is revoked live). */
  async muteParticipantTrack(roomName: string, identity: string, trackSid: string): Promise<void> {
    await this.roomClient.mutePublishedTrack(roomName, identity, trackSid, true);
  }

  /** Server-inject a data packet onto a topic every participant can listen on. */
  async broadcastData(roomName: string, payload: Uint8Array, topic: string): Promise<void> {
    await this.roomClient.sendData(roomName, payload, DataPacket_Kind.RELIABLE, { topic });
  }

  /**
   * Direct-to-OCI upload is opt-in. The rest of the recording stack — the
   * storage quota (`ensureStorageCapacity`), retention pruning, the storage
   * analytics and the signed `/recording/stream` endpoint — all read the local
   * volume the `egress` container shares with the API. Keying the upload off
   * "are OCI credentials present" instead sent every recording to object
   * storage the moment DB backups were configured, leaving that whole subsystem
   * looking at an empty directory.
   */
  private buildS3Output(): { case: "s3"; value: S3Upload } | undefined {
    const env = getApiEnv();
    if (env.RECORDING_STORAGE_TARGET !== "oci") return undefined;

    const { OCI_ACCESS_KEY_ID, OCI_SECRET_ACCESS_KEY, OCI_REGION, OCI_NAMESPACE, OCI_BUCKET_NAME } = process.env;
    if (!OCI_ACCESS_KEY_ID || !OCI_SECRET_ACCESS_KEY || !OCI_REGION || !OCI_NAMESPACE || !OCI_BUCKET_NAME) {
      this.logger.error(
        "RECORDING_STORAGE_TARGET=oci but the OCI_* credentials are incomplete — recording to the local volume instead."
      );
      return undefined;
    }

    return {
      case: "s3",
      value: new S3Upload({
        accessKey: OCI_ACCESS_KEY_ID,
        secret: OCI_SECRET_ACCESS_KEY,
        region: OCI_REGION,
        endpoint: `https://${OCI_NAMESPACE}.compat.objectstorage.${OCI_REGION}.oci.customer-oci.com`,
        bucket: OCI_BUCKET_NAME,
        forcePathStyle: true,
      }),
    };
  }

  async startRecording(roomName: string, filepath: string): Promise<string> {
    try {
      this.logger.log(`Starting LiveKit room composite egress for room: ${roomName}`);
      const s3Output = this.buildS3Output();

      // An S3 key has no leading slash; a local path is absolute inside the
      // egress container, which mounts the same volume as the API at
      // `RECORDING_STORAGE_DIR`.
      const egressFilepath = s3Output
        ? (filepath.startsWith("/") ? filepath.slice(1) : filepath)
        : (filepath.startsWith("/") ? filepath : `/${filepath}`);

      const fileOutput = new EncodedFileOutput({
        filepath: egressFilepath,
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
          // Pinned rather than left at the 1080p30 default: the single-node
          // egress deployment runs on a 2-vCPU box, where a 720p30 grid
          // composite peaks around 1.35 CPU and 1080p cannot keep up. Must stay
          // within `cpu_cost.room_composite_cpu_cost` in docker-compose.yml.
          encodingOptions: EncodingOptionsPreset.H264_720P_30,
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
