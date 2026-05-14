export type Role = "customer" | "vendor" | "admin";

export const isAdmin = (roles: Role[]) => roles.includes("admin");
export const isVendor = (roles: Role[]) => roles.includes("vendor") || roles.includes("admin");
export const isCustomer = (roles: Role[]) => roles.includes("customer") || roles.length === 0;

export const canAccessVendor = (roles: Role[]) => isVendor(roles);
export const canAccessAdmin = (roles: Role[]) => isAdmin(roles);
