export const API_ROUTES = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
    profile: "/auth/profile",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password"
  },
  users: {
    list: "/users",
    create: "/users",
    get: (id: string = ":id") => `/users/${id}`,
    update: (id: string = ":id") => `/users/${id}`,
    archive: (id: string = ":id") => `/users/${id}/archive`,
    restore: (id: string = ":id") => `/users/${id}/restore`,
    delete: (id: string = ":id") => `/users/${id}`
  },
  batches: {
    list: "/batches",
    create: "/batches",
    assignableUsers: "/batches/assignable-users",
    get: (id: string = ":id") => `/batches/${id}`,
    update: (id: string = ":id") => `/batches/${id}`,
    archive: (id: string = ":id") => `/batches/${id}/archive`,
    restore: (id: string = ":id") => `/batches/${id}/restore`,
    delete: (id: string = ":id") => `/batches/${id}`
  },
  trash: {
    list: "/admin/trash",
    restoreBulk: "/admin/trash/restore",
    empty: "/admin/trash/empty",
    restoreItem: (entity: string = ":entity", id: string = ":id") => `/admin/trash/${entity}/${id}/restore`,
    deleteItem: (entity: string = ":entity", id: string = ":id") => `/admin/trash/${entity}/${id}`
  }
} as const;
