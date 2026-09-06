"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import {
  Archive,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  UsersRound
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AuthUser, UserRole, UserStatus } from "@nexa-chess/types";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { Select } from "@/components/ui/Select";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";

import { UserForm } from "./UserForm";
import { UserSettings } from "./UserSettings";
import {
  useUsersQuery
} from "../hooks/useUsersApi";
import { archiveUser, restoreUser, deleteUser } from "../api/userApi";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { restoreTrashItem } from "@/features/trash/api/trashApi";
import { queryKeys } from "@/lib/queryKeys";

type UserManagementTab = "all" | "create" | "settings";

const statusOptions = [
  { label: "Active", value: "ACTIVE" },
  { label: "Pending", value: "PENDING" },
  { label: "Archived", value: "ARCHIVED" },
  { label: "Deleted", value: "DELETED" }
];

export function UserManagementClient() {
  const [activeTab, setActiveTab] = useState<UserManagementTab>("all");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Server-side pagination / search / sort / status filter (AUDIT H26).
  const serverTable = useServerTable({ pageSize: 10 });
  const { clampToPageCount } = serverTable;
  const usersQuery = useUsersQuery(serverTable.params);
  const pageCount = usersQuery.data?.pagination?.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);
  const { run: handleArchive, isPending: isArchiving } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => archiveUser(id),
    undo: (id) => restoreUser(id),
    toast: () => ({ title: "User archived" }),
    invalidates: [queryKeys.users.all, queryKeys.trash.all]
  });

  const { run: handleRestore, isPending: isRestoring } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => restoreUser(id),
    undo: (id) => archiveUser(id),
    toast: () => ({ title: "User unarchived" }),
    invalidates: [queryKeys.users.all, queryKeys.trash.all]
  });

  const { run: handleDelete, isPending: isDeleting } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => deleteUser(id),
    undo: (id) => restoreTrashItem("User", id),
    toast: () => ({ title: "User deleted" }),
    invalidates: [queryKeys.users.all, queryKeys.trash.all]
  });

  const selectedUser = useMemo(
    () =>
      usersQuery.data?.users.find((user) => user.id === editingUserId) ??
      null,
    [usersQuery.data?.users, editingUserId]
  );

  const users = usersQuery.data?.users ?? [];

  // Row selection is owned here so the row handlers below can clear it while
  // still being referenced by `columns`, which the table needs up front.
  // See AUDIT.md H4.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const editUser = useCallback((user: AuthUser) => {
    setEditingUserId(user.id);
    setActiveTab("create");
  }, []);

  function handleNewUser() {
    setEditingUserId(null);
    setActiveTab("create");
  }



  const columns = useMemo<ColumnDef<AuthUser>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows"
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(!!checked)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.firstName}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          />
        )
      },
      {
        accessorKey: "firstName",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Name"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-extrabold text-app-text">
              {row.original.firstName} {row.original.lastName}
            </p>
          </div>
        )
      },
      {
        accessorKey: "email",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Email"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => row.original.email
      },
      {
        accessorKey: "role",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Role"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {formatRole(row.original.role)}
          </Badge>
        )
      },
      {
        accessorKey: "status",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Status"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={getStatusBadgeVariant(row.original.status)}>
            {formatStatus(row.original.status)}
          </Badge>
        )
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const isArchived = row.original.status === "ARCHIVED";
          return (
            <TooltipProvider>
              <div className="flex items-center gap-2 justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={`Edit ${row.original.firstName}`}
                      className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                      onClick={() => editUser(row.original)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit user</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={isArchived ? `Restore ${row.original.firstName}` : `Archive ${row.original.firstName}`}
                      className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:border-secondary hover:bg-secondary hover:text-black"
                      disabled={isArchiving || isRestoring}
                      onClick={() => isArchived ? handleRestore(row.original.id) : handleArchive(row.original.id)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      {isArchived ? (
                        <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      ) : (
                        <Archive aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isArchived ? "Unarchive user" : "Archive user"}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={`Delete ${row.original.firstName}`}
                      className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:border-app-danger hover:bg-app-danger hover:text-white"
                      disabled={isDeleting}
                      onClick={() => handleDelete(row.original.id)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete user</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          );
        }
      }
    ],
    [
      isArchiving,
      isDeleting,
      editUser,
      handleArchive,
      handleDelete,
      handleRestore,
      isRestoring
    ]
  );

  const {
    table,
    columnVisibility,
    setColumnVisibility,
    setColumnFilters
  } = useDataTable<AuthUser, unknown>({
    columns,
    data: users,
    rowSelection,
    setRowSelection,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    sorting: serverTable.sorting,
    setSorting: serverTable.setSorting,
    pageCount,
    ...serverTable.manual
  });

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <Tabs
          onValueChange={(value) => {
            if (value === "create") {
              handleNewUser();
            } else {
              setEditingUserId(null);
              setActiveTab(value as UserManagementTab);
            }
          }}
          value={activeTab}
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase text-primary">
                User management
              </p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight text-app-text">
                Users
              </h1>
            </div>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
              <TabsTrigger value="all">
                <UsersRound aria-hidden="true" className="size-4" />
                All Users
              </TabsTrigger>
              <TabsTrigger value="create">
                {editingUserId ? (
                  <Pencil aria-hidden="true" className="size-4" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                {editingUserId ? "Edit" : "Create"}
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 aria-hidden="true" className="size-4" />
                Settings
              </TabsTrigger>
            </TabsList>
          </header>

          <TabsContent value="all" className="mt-6 outline-none">
            <Card className="grid gap-4 p-4">
              <DataTableToolbar
                actions={<ColumnVisibilityMenu table={table} />}
                filters={
                  <Select
                    className="w-40"
                    onChange={(event) => serverTable.setStatus(event.target.value)}
                    options={[{ label: "All status", value: "ALL" }, ...statusOptions]}
                    value={serverTable.status}
                  />
                }
                onSearchChange={serverTable.setSearch}
                searchPlaceholder="Search users..."
                searchValue={serverTable.search}
              />

              <DataTable
                columnsLength={columns.length}
                isLoading={usersQuery.isLoading}
                noDataText={
                  <div className="flex flex-col items-center justify-center space-y-4 py-4">
                    <p>No users found.</p>
                    <Button onClick={handleNewUser} size="sm">
                      <Plus className="mr-2 size-4" /> Create User
                    </Button>
                  </div>
                }
                table={table}
              />

              <DataTablePagination
                table={table}
                totalRows={usersQuery.data?.pagination?.total ?? 0}
              />
            </Card>
          </TabsContent>

          <TabsContent value="create" className="mt-6 outline-none">
            {/* When switching to 'create' tab via "Edit", React doesn't remount if key is same, 
                so we use key to force reset of useForm default values */}
            <UserForm
              key={editingUserId ?? "new"}
              selectedUser={selectedUser}
              onSuccess={() => setActiveTab("all")}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-6 outline-none">
            <UserSettings
              columnVisibility={columnVisibility}
              pageSize={serverTable.pagination.pageSize}
              resetTable={() => {
                serverTable.setSearch("");
                serverTable.setStatus("ALL");
                serverTable.setSorting([]);
                setColumnFilters([]);
                setColumnVisibility({});
                setRowSelection({});
                serverTable.setPagination({ pageIndex: 0, pageSize: 10 });
              }}
              setColumnVisibility={setColumnVisibility}
              setPageSize={(pageSize) =>
                serverTable.setPagination((current) => ({ ...current, pageIndex: 0, pageSize }))
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function ColumnVisibilityMenu<TData>({ table }: { table: import("@tanstack/react-table").Table<TData> }) {
  const columns = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            checked={column.getIsVisible()}
            key={column.id}
            onCheckedChange={(checked) => column.toggleVisibility(!!checked)}
          >
            {formatColumnLabel(column.id)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatStatus(status: UserStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatRole(role: UserRole) {
  return role.toLowerCase().replace("_", " ");
}

function getStatusBadgeVariant(status: UserStatus) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PENDING":
      return "warning";
    case "DELETED":
      return "secondary";
    case "ARCHIVED":
    default:
      return "default";
  }
}

function formatColumnLabel(columnId: string) {
  const labels: Record<string, string> = {
    email: "Email",
    firstName: "Name",
    role: "Role",
    status: "Status"
  };

  return labels[columnId] ?? columnId;
}
