import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Save } from "lucide-react";
import type { AuthUser, CreateUserRequest, UpdateUserRequest } from "@nexa-chess/types";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Form } from "@/components/forms/Form";
import { FormInput } from "@/components/forms/FormInput";
import { FormSelect } from "@/components/forms/FormSelect";
import { createUser, updateUser, deleteUser } from "../api/userApi";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";

const baseUserFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.enum(["STUDENT", "COACH", "ADMIN", "SUPER_ADMIN"]),
  status: z.enum(["ACTIVE", "PENDING", "ARCHIVED", "DELETED"]),
});

type UserFormValues = z.infer<typeof baseUserFormSchema>;

const roleOptions = [
  { label: "Student", value: "STUDENT" },
  { label: "Coach", value: "COACH" },
  { label: "Admin", value: "ADMIN" },
  { label: "Super Admin", value: "SUPER_ADMIN" }
];

const statusOptions = [
  { label: "Active", value: "ACTIVE" },
  { label: "Pending", value: "PENDING" },
  { label: "Archived", value: "ARCHIVED" },
  { label: "Deleted", value: "DELETED" }
];

interface UserFormProps {
  selectedUser: AuthUser | null;
  onSuccess: () => void;
}

function toUpdatePayload(user: AuthUser): UpdateUserRequest {
  return {
    firstName: user.firstName,
    lastName: user.lastName ?? undefined,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

export function UserForm({ selectedUser, onSuccess }: UserFormProps) {
  const userFormSchema = baseUserFormSchema.superRefine((value, context) => {
    if (!selectedUser && !value.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password is required",
        path: ["password"]
      });
    }
  });

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      firstName: selectedUser?.firstName || "",
      lastName: selectedUser?.lastName || "",
      email: selectedUser?.email || "",
      password: "",
      role: selectedUser?.role || "STUDENT",
      status: selectedUser?.status || "ACTIVE",
    },
  });

  const { run: runCreate, isPending: isCreating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (payload: CreateUserRequest) => {
      const result = await createUser(payload);
      form.reset();
      onSuccess();
      return result;
    },
    undo: (_vars, result) => deleteUser(result.user.id),
    toast: (vars) => ({ title: `"${vars.firstName}" created` }),
    invalidates: [queryKeys.users.all]
  });

  const { run: runUpdate, isPending: isUpdating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateUserRequest; previous: AuthUser }) => {
      const result = await updateUser(id, payload);
      form.reset();
      onSuccess();
      return result;
    },
    undo: (vars) => updateUser(vars.id, toUpdatePayload(vars.previous)),
    toast: () => ({ title: "User updated" }),
    invalidates: [queryKeys.users.all]
  });

  const isSaving = isCreating || isUpdating;

  function onSubmit(values: UserFormValues) {
    if (selectedUser) {
      const payload: UpdateUserRequest = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        role: values.role,
        status: values.status,
      };
      if (values.password) {
        payload.password = values.password;
      }
      runUpdate({ id: selectedUser.id, payload, previous: selectedUser });
    } else {
      runCreate(values as CreateUserRequest);
    }
  }

  return (
    <Card className="p-5">
      <Form form={form} onSubmit={onSubmit} className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-primary">
              {selectedUser ? "Edit user" : "Create user"}
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-app-text">
              {selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName || ''}` : "User details"}
            </h2>
          </div>
          <div>
            <Button
              disabled={isSaving}
              isLoading={isSaving}
              type="submit"
            >
              <Save aria-hidden="true" className="size-4" strokeWidth={2.5} />
              {selectedUser ? "Save User" : "Create User"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput name="firstName" label="First Name" required />
          <FormInput name="lastName" label="Last Name" />
          <FormInput name="email" label="Email" type="email" required />
          <FormInput 
            name="password" 
            label={selectedUser ? "Password (leave blank to keep unchanged)" : "Password"} 
            type="password" 
          />
          <FormSelect name="role" label="Role" options={roleOptions} />
          <FormSelect name="status" label="Status" options={statusOptions} />
        </div>
      </Form>
    </Card>
  );
}
