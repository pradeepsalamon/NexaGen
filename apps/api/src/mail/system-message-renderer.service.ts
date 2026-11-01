import { Injectable } from "@nestjs/common";
import {
  renderFormattedTemplate,
  renderMessageTemplate,
  SYSTEM_MESSAGE_DEFINITIONS,
  type MessageVariables,
  type SystemMessageKey
} from "@nexa-chess/types";
import { ACADEMY_NAME } from "../messaging/messaging.format";
import { PrismaService } from "../prisma/prisma.service";

export interface RenderedSystemMessage {
  subject: string;
  /** Formatted source: send it through a channel's converter, never as-is. */
  body: string;
  action: { label: string; url: string } | null;
}

/** A system message in the admin's saved wording, or the default when there is none. */
@Injectable()
export class SystemMessageRenderer {
  constructor(private readonly prisma: PrismaService) {}

  async render(key: SystemMessageKey, values: MessageVariables): Promise<RenderedSystemMessage> {
    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];
    const template =
      (await this.prisma.systemMessageTemplate.findUnique({ where: { key } })) ?? definition.defaults;
    const variables: MessageVariables = { "academy.name": ACADEMY_NAME, ...values };

    const url = definition.actionVariable ? variables[definition.actionVariable] : "";
    const label = template.actionLabel ?? definition.defaults.actionLabel;

    return {
      subject: renderMessageTemplate(template.subject ?? "", variables).replace(/\s+/g, " ").trim(),
      // An empty optional value shouldn't leave a gap where its line was.
      body: renderFormattedTemplate(template.body, variables)
        .replace(/[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
      action: url && label ? { label, url } : null
    };
  }
}
