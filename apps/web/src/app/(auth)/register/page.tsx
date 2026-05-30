'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { api, ApiRequestError } from '@/lib/api/client'
import { useAuthStore } from '@/lib/stores/auth.store'
import type { AuthResult } from '@/types/api'
import { staggerItem } from '@/lib/motion/variants'
import { toast } from 'sonner'

const schema = z.object({
  firstName:  z.string().min(1, 'First name is required').max(100),
  lastName:   z.string().min(1, 'Last name is required').max(100),
  email:      z.string().email('Enter a valid email'),
  password:   z
    .string()
    .min(10, 'At least 10 characters')
    .regex(/[A-Z]/, 'One uppercase letter')
    .regex(/[0-9]/, 'One number')
    .regex(/[^A-Za-z0-9]/, 'One special character'),
  tenantName: z.string().min(2, 'Studio name required').max(255),
  tenantSlug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only'),
})
type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors }, setError, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  // Auto-generate slug from studio name
  const handleStudioNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setValue('tenantSlug', slug, { shouldValidate: true })
  }

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post<AuthResult & { tenantId: string }>('/auth/register', data),
    onSuccess: (result) => {
      setAuth(result.user, result.accessToken, result.tenantId)
      router.replace('/dashboard')
      toast.success('Welcome to Memora!')
    },
    onError: (err) => {
      if (err instanceof ApiRequestError) {
        if (err.code === 'CONFLICT') {
          if (err.message.includes('email')) {
            setError('email', { message: 'This email is already registered' })
          } else {
            setError('tenantSlug', { message: 'This studio URL is already taken' })
          }
        } else {
          toast.error('Registration failed. Please try again.')
        }
      }
    },
  })

  const Field = ({
    id, label, error, children,
  }: { id: string; label: string; error?: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )

  const inputClass = "w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"

  return (
    <motion.div
      initial="initial" animate="enter"
      variants={{ initial: {}, enter: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-6"
    >
      <motion.div variants={staggerItem} className="space-y-1">
        <h2 className="text-2xl font-bold">Create your account</h2>
        <p className="text-sm text-muted-foreground">Start your free Memora studio</p>
      </motion.div>

      <motion.form variants={staggerItem} onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id="firstName" label="First name" error={errors.firstName?.message}>
            <input id="firstName" className={inputClass} placeholder="Jane" {...register('firstName')} />
          </Field>
          <Field id="lastName" label="Last name" error={errors.lastName?.message}>
            <input id="lastName" className={inputClass} placeholder="Smith" {...register('lastName')} />
          </Field>
        </div>

        <Field id="tenantName" label="Studio name" error={errors.tenantName?.message}>
          <input
            id="tenantName" className={inputClass} placeholder="Smith Photography"
            {...register('tenantName', { onChange: handleStudioNameChange })}
          />
        </Field>

        <Field id="tenantSlug" label="Studio URL" error={errors.tenantSlug?.message}>
          <div className="flex items-center border border-input rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring">
            <span className="px-3 py-2 bg-muted text-muted-foreground text-sm border-r border-input whitespace-nowrap">
              memora.app/
            </span>
            <input
              id="tenantSlug" className="flex-1 h-10 px-3 bg-background text-sm focus:outline-none"
              placeholder="smith-photography"
              {...register('tenantSlug')}
            />
          </div>
        </Field>

        <Field id="email" label="Email" error={errors.email?.message}>
          <input id="email" type="email" autoComplete="email" className={inputClass} placeholder="jane@studio.com" {...register('email')} />
        </Field>

        <Field id="password" label="Password" error={errors.password?.message}>
          <div className="relative">
            <input
              id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
              className={`${inputClass} pr-10`} placeholder="Min 10 chars, 1 upper, 1 number, 1 special"
              {...register('password')}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <button
          type="submit" disabled={mutation.isPending}
          className="w-full h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </motion.form>

      <motion.p variants={staggerItem} className="text-sm text-muted-foreground text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
          Sign in
        </Link>
      </motion.p>
    </motion.div>
  )
}
