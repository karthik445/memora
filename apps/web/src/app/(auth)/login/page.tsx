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
import { fadeIn, staggerItem } from '@/lib/motion/variants'
import { toast } from 'sonner'

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors }, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const loginMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post<AuthResult & { tenantId: string | null }>('/auth/login', data, { skipAuth: true }),
    onSuccess: (result) => {
      setAuth(result.user, result.accessToken, result.tenantId ?? '')
      router.replace('/dashboard')
    },
    onError: (err) => {
      if (err instanceof ApiRequestError) {
        if (err.code === 'INVALID_CREDENTIALS' || err.code === 'UNAUTHORIZED') {
          setError('password', { message: 'Invalid email or password' })
        } else if (err.code === 'ACCOUNT_LOCKED') {
          toast.error(err.message)
        } else {
          toast.error('Login failed. Please try again.')
        }
      }
    },
  })

  return (
    <motion.div
      initial="initial"
      animate="enter"
      variants={{ initial: {}, enter: { transition: { staggerChildren: 0.07 } } }}
      className="space-y-6"
    >
      <motion.div variants={staggerItem} className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Sign in to your Memora account</p>
      </motion.div>

      <motion.form
        variants={staggerItem}
        onSubmit={handleSubmit(data => loginMutation.mutate(data))}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            placeholder="you@studio.com"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="w-full h-10 px-3 pr-10 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              placeholder="••••••••••"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loginMutation.isPending && <Loader2 size={14} className="animate-spin" />}
          {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </motion.form>

      <motion.p variants={staggerItem} className="text-sm text-muted-foreground text-center">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
          Create one
        </Link>
      </motion.p>
    </motion.div>
  )
}
