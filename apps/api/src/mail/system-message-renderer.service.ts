import { Injectable, Optional } from "@nestjs/common";
import {
  composeWhatsAppText,
  effectiveSystemChannels,
  renderFormattedTemplate,
  renderMessageTemplate,
  SYSTEM_MESSAGE_DEFINITIONS,
  type MessageVariables,
  type SystemMessageChannel,
  type SystemMessageKey
} from "@nexa-chess/types";
import { BrandingService } from "../branding/branding.service";
import { ACADEMY_NAME } from "../messaging/messaging.format";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";

export interface RenderedSystemMessage {
  subject: string;
  /** Formatted source: send it through a channel's converter, never as-is. */
  body: string;
  action: { label: string; url: string } | null;
}

export interface RenderedSystemMessageAllChannels extends RenderedSystemMessage {
  /** Formatted source for WhatsApp, with the action link written in. */
  whatsapp: string;
  /** The channels switched on (saved switches, else the defaults). */
  channels: SystemMessageChannel[];
}

/** A system message in the admin's saved wording, or the default when there is none. */
@Injectable()
export class SystemMessageRenderer {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly branding?: BrandingService
  ) {}

  async render(key: SystemMessageKey, values: MessageVariables): Promise<RenderedSystemMessage> {
    const { channels: _channels, whatsapp: _whatsapp, ...email } = await this.renderAll(key, values);
    return email;
  }

  /** Every channel's text, in the saved wording (a null part falls back to the default). */
  async renderAll(key: SystemMessageKey, values: MessageVariables): Promise<RenderedSystemMessageAllChannels> {
    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];
    const saved = await this.prisma.systemMessageTemplate.findUnique({
      where: { tenantId_key: { key, tenantId: requireTenantId("systemMessageTemplate") } }
    });
    const academyName = this.branding ? await this.branding.nameFor() : ACADEMY_NAME;
    const variables: MessageVariables = { "academy.name": academyName, ...values };

    const subject = saved?.subject ?? definition.defaults.subject;
    const body = saved?.body ?? definition.defaults.body;
    const whatsappBody = saved?.whatsappBody ?? definition.defaults.whatsappBody ?? body;
    const url = definition.actionVariable ? variables[definition.actionVariable] : "";
    const label = saved?.actionLabel ?? definition.defaults.actionLabel;
    const action = url && label ? { label, url } : null;

    return {
      action,
      body: this.formatted(body, variables),
      channels: effectiveSystemChannels(key, {
        EMAIL: saved?.emailEnabled ?? null,
        IN_APP: saved?.inAppEnabled ?? null,
        WHATSAPP: saved?.whatsappEnabled ?? null
      }),
      subject: renderMessageTemplate(subject, variables).replace(/\s+/g, " ").trim(),
      whatsapp: composeWhatsAppText(this.formatted(whatsappBody, variables), action)
    };
  }

  private formatted(template: string, variables: MessageVariables) {
    // An empty optional value shouldn't leave a gap where its line was.
    return renderFormattedTemplate(template, variables)
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
