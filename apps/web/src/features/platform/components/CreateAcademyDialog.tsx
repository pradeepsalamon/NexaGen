"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createPlatformTenantRequestSchema, RESERVED_TENANT_SLUGS } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCreatePlatformTenant, usePlatformPlans } from "../hooks/usePlatformApi";

const formSchema = z.object({
  country: z.string().trim().length(2, "Two letters, e.g. IN."),
  email: createPlatformTenantRequestSchema.shape.superAdmin.shape.email,
  firstName: z.string().trim().min(1, "Enter a first name.").max(80),
  lastName: z.string().trim().max(80),
  name: createPlatformTenantRequestSchema.shape.name,
  planCode: z.string().min(1, "Choose a plan."),
  slug: createPlatformTenantRequestSchema.shape.slug.refine((slug) => !RESERVED_TENANT_SLUGS.has(slug), {
    message: "This address is reserved."
  }),
  timezone: z.string().trim().min(1)
});
type FormValues = z.infer<typeof formSchema>;

const slugFromName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** New academy: its subdomain, plan, and first super admin (who gets a set-password invite). */
export function CreateAcademyDialog({ onClose, rootDomain }: { onClose: () => void; rootDomain: string }) {
  const router = useRouter();
  const plans = usePlatformPlans().data?.plans.filter((plan) => plan.isActive) ?? [];
  const create = useCreatePlatformTenant();
  // One key per dialog: a double submit (or a retry after a timeout) returns the same academy.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<FormValues>({
    defaultValues: {
      country: "IN",
      email: "",
      firstName: "",
      lastName: "",
      name: "",
      planCode: "",
      slug: "",
      timezone: "Asia/Kolkata"
    },
    resolver: zodResolver(formSchema)
  });
  const { errors } = form.formState;
  const slug = form.watch("slug");

  const submit = form.handleSubmit(async (values) => {
    const result = await create.mutateAsync({
      country: values.country.toUpperCase(),
      idempotencyKey,
      name: values.name,
      planCode: values.planCode,
      slug: values.slug,
      superAdmin: { email: values.email, firstName: values.firstName, lastName: values.lastName || undefined },
      timezone: values.timezone
    });
    onClose();
    router.push(`/admin/platform/academies/${result.tenant.id}`);
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New academy</DialogTitle>
          <DialogDescription>
            The academy opens at its own address straight away. Its super admin gets an email to set a password.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" id="create-academy" noValidate onSubmit={(event) => void submit(event).catch(() => undefined)}>
          <FormField error={errors.name?.message} id="academy-name" label="Academy name" required>
            <Input
              id="academy-name"
              {...form.register("name", {
                onChange: (event: { target: { value: string } }) => {
                  if (!slugTouched) form.setValue("slug", slugFromName(event.target.value));
                }
              })}
            />
          </FormField>
          <FormField
            error={errors.slug?.message}
            hint={slug ? `${slug}.${rootDomain}` : `Lowercase letters, digits and hyphens: <name>.${rootDomain}`}
            id="academy-slug"
            label="Address"
            required
          >
            <Input id="academy-slug" {...form.register("slug", { onChange: () => setSlugTouched(true) })} />
          </FormField>
          <FormField error={errors.planCode?.message} id="academy-plan" label="Plan" required>
            <Select
              id="academy-plan"
              options={plans.map((plan) => ({
                label: plan.trialDays > 0 ? `${plan.name} (${plan.trialDays}-day trial)` : plan.name,
                value: plan.code
              }))}
              placeholder="Choose a plan"
              {...form.register("planCode")}
            />
          </FormField>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField error={errors.firstName?.message} id="academy-owner-first" label="Super admin first name" required>
              <Input autoComplete="off" id="academy-owner-first" {...form.register("firstName")} />
            </FormField>
            <FormField error={errors.lastName?.message} id="academy-owner-last" label="Last name">
              <Input autoComplete="off" id="academy-owner-last" {...form.register("lastName")} />
            </FormField>
          </div>
          <FormField error={errors.email?.message} id="academy-owner-email" label="Super admin email" required>
            <Input autoComplete="off" id="academy-owner-email" type="email" {...form.register("email")} />
          </FormField>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField error={errors.timezone?.message} id="academy-timezone" label="Time zone" required>
              <Input id="academy-timezone" {...form.register("timezone")} />
            </FormField>
            <FormField error={errors.country?.message} id="academy-country" label="Country code" required>
              <Input id="academy-country" maxLength={2} {...form.register("country")} />
            </FormField>
          </div>
        </form>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button form="create-academy" isLoading={create.isPending} type="submit">
            Create academy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
