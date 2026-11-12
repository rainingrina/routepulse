import type { HomePath, Role, UserDto } from '@routepulse/shared';

/** Explicit Prisma select for UserDto — never load or return passwordHash or phone here. */
export const USER_DTO_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  customer: { select: { id: true, name: true } },
  transporter: { select: { id: true, name: true } },
} as const;

export interface UserDtoRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  customer: { id: string; name: string } | null;
  transporter: { id: string; name: string } | null;
}

export function toUserDto(row: UserDtoRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    customer: row.role === 'CUSTOMER' && row.customer ? { id: row.customer.id, name: row.customer.name } : null,
    transporter: row.role === 'DRIVER' && row.transporter ? { id: row.transporter.id, name: row.transporter.name } : null,
  };
}

export const HOME_PATH: Record<Role, HomePath> = {
  COORDINATOR: '/control-tower',
  CUSTOMER: '/orders',
  DRIVER: '/trip',
};
