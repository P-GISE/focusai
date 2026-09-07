import type {
  APIActionRowComponent,
  APIButtonComponent,
  APIEmbed,
} from "discord.js";

import { env } from "../config/env";

export type SiteDiscordMessage = {
  content?: string;
  embeds: APIEmbed[];
  components: Array<APIActionRowComponent<APIButtonComponent>>;
};

export type SiteRaidTemplate = {
  id: string;
  name: string;
  difficulty: string;
  gates: string;
  requiredPlayers: number;
  minimumItemLevel: number | null;
  minimumCombatPower: number | null;
};

export class SiteApiError extends Error {
  readonly status: number;
  readonly linkUrl?: string;

  constructor(input: { message: string; status: number; linkUrl?: string }) {
    super(input.message);
    this.name = "SiteApiError";
    this.status = input.status;
    this.linkUrl = input.linkUrl;
  }
}

type CreateSiteBackedSignupInput = {
  discordGuildId: string;
  discordChannelId: string;
  discordUserId: string;
  templateId: string;
  title: string;
  weekStartDate: string;
  partySize: number;
  maxParties: number;
};

type SiteSignupMutationInput = {
  signupId: string;
  discordUserId: string;
};

type SiteSignupMessageResponse = {
  signupId?: string;
  message: SiteDiscordMessage;
};

function normalizeSiteUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function siteApiConfig() {
  if (!env.lostarkPartySiteUrl || !env.lostarkPartyBotApiToken) {
    return null;
  }

  return {
    token: env.lostarkPartyBotApiToken,
    url: normalizeSiteUrl(env.lostarkPartySiteUrl),
  };
}

export function isSiteApiConfigured() {
  return siteApiConfig() !== null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function siteApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = siteApiConfig();
  if (!config) {
    throw new SiteApiError({
      message: "사이트 API 설정이 없습니다.",
      status: 0,
    });
  }

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch((): unknown => ({}));

  if (!response.ok) {
    const parsed = jsonObject(body);
    throw new SiteApiError({
      linkUrl: typeof parsed.linkUrl === "string" ? parsed.linkUrl : undefined,
      message:
        typeof parsed.error === "string"
          ? parsed.error
          : "사이트 API 요청에 실패했습니다.",
      status: response.status,
    });
  }

  return body as T;
}

export async function listSiteRaidTemplates(discordGuildId: string) {
  const response = await siteApiFetch<{ templates: SiteRaidTemplate[] }>(
    `/api/bot/guilds/${encodeURIComponent(discordGuildId)}/templates`,
  );

  return response.templates;
}

export async function createSiteBackedSignup(input: CreateSiteBackedSignupInput) {
  return siteApiFetch<SiteSignupMessageResponse>(
    `/api/bot/guilds/${encodeURIComponent(input.discordGuildId)}/signups`,
    {
      body: JSON.stringify({
        discordChannelId: input.discordChannelId,
        discordUserId: input.discordUserId,
        maxParties: input.maxParties,
        partySize: input.partySize,
        templateId: input.templateId,
        title: input.title,
        weekStartDate: input.weekStartDate,
      }),
      method: "POST",
    },
  );
}

export async function applySiteBackedSignup(input: SiteSignupMutationInput) {
  return siteApiFetch<SiteSignupMessageResponse>(
    `/api/bot/signups/${encodeURIComponent(input.signupId)}/apply`,
    {
      body: JSON.stringify({ discordUserId: input.discordUserId }),
      method: "POST",
    },
  );
}

export async function cancelSiteBackedSignup(input: SiteSignupMutationInput) {
  return siteApiFetch<SiteSignupMessageResponse>(
    `/api/bot/signups/${encodeURIComponent(input.signupId)}/cancel`,
    {
      body: JSON.stringify({ discordUserId: input.discordUserId }),
      method: "POST",
    },
  );
}

export async function setSiteBackedAvailability(input: {
  signupId: string;
  discordUserId: string;
  dayIndex: number;
}) {
  return siteApiFetch<SiteSignupMessageResponse>(
    `/api/bot/signups/${encodeURIComponent(input.signupId)}/availability`,
    {
      body: JSON.stringify({
        dayIndex: input.dayIndex,
        discordUserId: input.discordUserId,
      }),
      method: "POST",
    },
  );
}

export async function closeSiteBackedSignup(input: SiteSignupMutationInput) {
  return siteApiFetch<SiteSignupMessageResponse>(
    `/api/bot/signups/${encodeURIComponent(input.signupId)}/close`,
    {
      body: JSON.stringify({ discordUserId: input.discordUserId }),
      method: "POST",
    },
  );
}

export async function recordSiteBackedSignupMessage(input: {
  signupId: string;
  discordChannelId: string;
  discordMessageId: string;
}) {
  return siteApiFetch<{
    signupId: string;
    discordChannelId: string | null;
    discordMessageId: string | null;
  }>(`/api/bot/signups/${encodeURIComponent(input.signupId)}/discord-message`, {
    body: JSON.stringify({
      discordChannelId: input.discordChannelId,
      discordMessageId: input.discordMessageId,
    }),
    method: "POST",
  });
}
