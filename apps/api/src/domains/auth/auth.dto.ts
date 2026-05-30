import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

export const RegisterSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: passwordSchema,
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  tenantName: z.string().min(2).max(255).trim(),
  tenantSlug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .trim(),
})

export const LoginSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(1).max(128),
})

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export const ForgotPasswordSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
})

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
})

export type RegisterDto = z.infer<typeof RegisterSchema>
export type LoginDto = z.infer<typeof LoginSchema>
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>
