"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Trash2 } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  BRAND_ASSET_KINDS,
  BRAND_ASSET_MAX_BYTES,
  BRAND_ASSET_MIME_TYPES,
  BRAND_THEMES,
  brandColorIssue,
  HEX_COLOUR_EXAMPLE,
  HEX_COLOUR_PICKER_FALLBACK,
  type BrandAssetKind,
  type TenantBrandingResponse,
  type TenantBrandingSettings
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePlanFeature } from "@/features/subscription/hooks/useSubscription";
import {
  useClearTenantBrandAsset,
  useSetTenantWhiteLabel,
  useTenantBranding,
  useUpdateTenantBranding,
  useUploadTenantBrandAsset
} from "../hooks/useBranding";
import { AcademyDomainsSection } from "./AcademyDomainsSection";
import { WhatsAppSettingsSection } from "./WhatsAppSettingsSection";
import { useAuthStore } from "@/stores/authStore";

const hexOrBlank = z
  .string()
  .trim()
  .refine((value) => value === "" || /^#[0-9a-fA-F]{6}$/.test(value), `Use a 6-digit hex colour like ${HEX_COLOUR_EXAMPLE}.`);
const emailOrBlank = z
  .string()
  .trim()
  .refine((value) => value === "" || z.string().email().safeParse(value).success, "Enter a valid email.");

const formSchema = z
  .object({
    accentColor: hexOrBlank,
    contactEmail: emailOrBlank,
    contactPhone: z.string().trim().max(30),
    defaultTheme: z.enum(BRAND_THEMES),
    displayName: z.string().trim().max(80),
    emailSenderName: z.string().trim().max(80),
    primaryColor: hexOrBlank,
    replyToEmail: emailOrBlank,
    seoDescription: z.string().trim().max(160),
    seoTitle: z.string().trim().max(70),
    tagline: z.string().trim().max(160)
  })
  .superRefine((values, ctx) => {
    for (const [field, kind] of [["primaryColor", "primary"], ["accentColor", "accent"]] as const) {
      const issue = values[field] ? brandColorIssue(kind, values[field]) : null;
      if (issue) ctx.addIssue({ code: "custom", message: issue, path: [field] });
    }
    if (values.displayName && values.displayName.length < 2) {
      ctx.addIssue({ code: "custom", message: "At least 2 characters.", path: ["displayName"] });
    }
  });
type FormValues = z.infer<typeof formSchema>;

const ASSET_LABELS: Record<BrandAssetKind, { hint: string; label: string }> = {
  favicon: { hint: "Square, at least 64×64.", label: "Favicon" },
  loginImage: { hint: "Shown on the sign-in page.", label: "Sign-in image" },
  logoDark: { hint: "For dark backgrounds.", label: "Logo (dark theme)" },
  logoLight: { hint: "For light backgrounds.", label: "Logo (light theme)" }
};

const toForm = (b: TenantBrandingSettings): FormValues => ({
  accentColor: b.accentColor ?? "",
  contactEmail: b.contactEmail ?? "",
  contactPhone: b.contactPhone ?? "",
  defaultTheme: b.defaultTheme,
  displayName: b.displayName ?? "",
  emailSenderName: b.emailSenderName ?? "",
  primaryColor: b.primaryColor ?? "",
  replyToEmail: b.replyToEmail ?? "",
  seoDescription: b.seoDescription ?? "",
  seoTitle: b.seoTitle ?? "",
  tagline: b.tagline ?? ""
});

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

function ColorField({ form, label, name }: { form: ReturnType<typeof useForm<FormValues>>; label: string; name: "accentColor" | "primaryColor" }) {
  const value = form.watch(name);
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <FormField error={form.formState.errors[name]?.message} hint="Blank = the default theme." id={`brand-${name}`} label={label}>
      <div className="flex items-center gap-2">
        <input
          aria-label={`${label} picker`}
          className="size-9 shrink-0 cursor-pointer rounded-control border border-app-border bg-app-surface p-0.5"
          onChange={(event) => form.setValue(name, event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })}
          type="color"
          value={valid ? value : HEX_COLOUR_PICKER_FALLBACK}
        />
        <Input id={`brand-${name}`} placeholder={HEX_COLOUR_EXAMPLE} {...form.register(name)} />
      </div>
    </FormField>
  );
}

function AssetsCard({ data }: { data: TenantBrandingResponse }) {
  const upload = useUploadTenantBrandAsset();
  const clear = useClearTenantBrandAsset();
  const inputs = useRef<Partial<Record<BrandAssetKind, HTMLInputElement | null>>>({});
  const urlFor: Record<BrandAssetKind, string | null> = {
    favicon: data.branding.faviconUrl,
    loginImage: data.branding.loginImageUrl,
    logoDark: data.branding.logoDarkUrl,
    logoLight: data.branding.logoLightUrl
  };

  return (
    <SectionCard description="PNG, JPEG or WebP." title="Images">
      <ul className="grid gap-3 sm:grid-cols-2">
        {BRAND_ASSET_KINDS.map((kind) => (
          <li className="flex items-center gap-3 rounded-app border border-app-border p-3" key={kind}>
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-app bg-app-soft">
              {urlFor[kind] ? (
                // eslint-disable-next-line @next/next/no-img-element -- the academy's own uploaded image
                <img alt="" className="max-h-full max-w-full object-contain" src={urlFor[kind] ?? ""} />
              ) : (
                <ImageUp aria-hidden="true" className="size-5 text-app-muted" strokeWidth={2.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-app-text">{ASSET_LABELS[kind].label}</p>
              <p className="text-xs text-app-muted">
                {ASSET_LABELS[kind].hint} Max {Math.round(BRAND_ASSET_MAX_BYTES[kind] / 1024)} KB.
              </p>
            </div>
            <input
              accept={BRAND_ASSET_MIME_TYPES.join(",")}
              aria-label={`${ASSET_LABELS[kind].label} file`}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) upload.mutate({ file, kind });
              }}
              ref={(element) => {
                inputs.current[kind] = element;
              }}
              tabIndex={-1}
              type="file"
            />
            <RowActions
              actions={[
                {
                  ariaLabel: `Upload ${ASSET_LABELS[kind].label}`,
                  disabled: !data.canEdit || upload.isPending,
                  icon: ImageUp,
                  label: "Upload",
                  onSelect: () => inputs.current[kind]?.click()
                },
                {
                  ariaLabel: `Remove ${ASSET_LABELS[kind].label}`,
                  disabled: !data.canEdit || !urlFor[kind],
                  icon: Trash2,
                  label: "Remove",
                  onSelect: () => clear.mutate(kind),
                  tone: "danger"
                }
              ]}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function DetailsForm({ data }: { data: TenantBrandingResponse }) {
  const save = useUpdateTenantBranding();
  const form = useForm<FormValues>({ defaultValues: toForm(data.branding), resolver: zodResolver(formSchema) });
  const { errors, isDirty } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    const result = await save.mutateAsync({
      accentColor: orNull(values.accentColor),
      contactEmail: orNull(values.contactEmail),
      contactPhone: orNull(values.contactPhone),
      defaultTheme: values.defaultTheme,
      displayName: orNull(values.displayName),
      emailSenderName: orNull(values.emailSenderName),
      primaryColor: orNull(values.primaryColor),
      replyToEmail: orNull(values.replyToEmail),
      seoDescription: orNull(values.seoDescription),
      seoTitle: orNull(values.seoTitle),
      tagline: orNull(values.tagline)
    });
    form.reset(toForm(result.branding));
  });

  return (
    <form className="grid gap-6" noValidate onSubmit={(event) => void submit(event).catch(() => undefined)}>
      <fieldset className="contents" disabled={!data.canEdit}>
        <SectionCard title="Name and colours">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField error={errors.displayName?.message} hint={`Blank = ${data.tenantName}`} id="brand-displayName" label="Display name">
              <Input id="brand-displayName" {...form.register("displayName")} />
            </FormField>
            <FormField error={errors.tagline?.message} id="brand-tagline" label="Tagline">
              <Input id="brand-tagline" {...form.register("tagline")} />
            </FormField>
            <ColorField form={form} label="Main colour" name="primaryColor" />
            <ColorField form={form} label="Accent colour" name="accentColor" />
            <FormField id="brand-defaultTheme" label="Default theme">
              <Select
                id="brand-defaultTheme"
                options={[
                  { label: "Follow the device", value: "system" },
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" }
                ]}
                {...form.register("defaultTheme")}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard description="Shown on your home page and in emails." title="Contact and emails">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField error={errors.contactEmail?.message} id="brand-contactEmail" label="Contact email">
              <Input id="brand-contactEmail" type="email" {...form.register("contactEmail")} />
            </FormField>
            <FormField error={errors.contactPhone?.message} id="brand-contactPhone" label="Contact phone">
              <Input id="brand-contactPhone" {...form.register("contactPhone")} />
            </FormField>
            <FormField error={errors.emailSenderName?.message} hint="Blank = the display name." id="brand-sender" label="Email sender name">
              <Input id="brand-sender" {...form.register("emailSenderName")} />
            </FormField>
            <FormField error={errors.replyToEmail?.message} hint="Blank = the contact email." id="brand-replyTo" label="Reply-to email">
              <Input id="brand-replyTo" type="email" {...form.register("replyToEmail")} />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard description="How search engines and link previews show your academy." title="Search and sharing">
          <div className="grid gap-4">
            <FormField error={errors.seoTitle?.message} id="brand-seoTitle" label="Title">
              <Input id="brand-seoTitle" maxLength={70} {...form.register("seoTitle")} />
            </FormField>
            <FormField error={errors.seoDescription?.message} id="brand-seoDescription" label="Description">
              <Textarea id="brand-seoDescription" maxLength={160} rows={2} {...form.register("seoDescription")} />
            </FormField>
          </div>
        </SectionCard>
      </fieldset>
      <div>
        <Button disabled={!data.canEdit || !isDirty} isLoading={save.isPending} type="submit">
          Save branding
        </Button>
      </div>
    </form>
  );
}

/** `/admin/branding`: the academy's name, logo, colours and sender details (plan `brandIdentity`). */
export function BrandingClient() {
  const query = useTenantBranding();
  const whiteLabel = useSetTenantWhiteLabel();
  const hasCustomDomain = usePlanFeature("customDomain") === true;
  const isSuperAdmin = useAuthStore((state) => state.user?.role === "SUPER_ADMIN");
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        description="How your academy looks on its own address, in emails and in search results."
        title="Branding"
      />
      {query.isError ? (
        <WidgetError message="Couldn't load branding." onRetry={() => void query.refetch()} />
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {!data.canEdit ? (
            <Alert title="Not in your plan" variant="info">
              Your plan doesn&apos;t include a custom logo and colours. Ask the NexaChess team about upgrading.
            </Alert>
          ) : null}
          <AssetsCard data={data} />
          <DetailsForm data={data} key={data.branding.updatedAt ?? "new"} />
          {data.whiteLabel ? (
            <SectionCard title="White label">
              <Switch
                checked={data.hidePoweredBy}
                disabled={whiteLabel.isPending}
                id="brand-white-label"
                label='Hide "Powered by NexaChess"'
                onCheckedChange={(checked) => whiteLabel.mutate(checked)}
              />
            </SectionCard>
          ) : null}
          {hasCustomDomain ? <AcademyDomainsSection /> : null}
          {isSuperAdmin ? <WhatsAppSettingsSection /> : null}
        </>
      )}
    </div>
  );
}
