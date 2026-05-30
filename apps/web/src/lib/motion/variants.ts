import type { Variants } from 'framer-motion'

// ── Alias exports for convenience ────────────────────────────────────────────
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: { duration: 0.25 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
}

// ── Page transitions ────────────────────────────────────────────────────────
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.2 } },
}

// ── Stagger containers ───────────────────────────────────────────────────────
export const staggerContainer: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
}

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  enter:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
}

// ── Photo card ───────────────────────────────────────────────────────────────
export const photoCardVariants: Variants = {
  initial: { opacity: 0, scale: 0.97 },
  enter: {
    opacity: 1, scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  hover: {
    scale: 1.01,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  tap: { scale: 0.98 },
}

// ── Lightbox ─────────────────────────────────────────────────────────────────
export const lightboxOverlayVariants: Variants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.2 } },
}

export const lightboxImageVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  enter:   { opacity: 1, scale: 1, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
}

export const lightboxSlideLeft: Variants = {
  initial: { opacity: 0, x: 40  },
  enter:   { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, x: -40, transition: { duration: 0.15 } },
}

export const lightboxSlideRight: Variants = {
  initial: { opacity: 0, x: -40 },
  enter:   { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, x: 40, transition: { duration: 0.15 } },
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
export const sidebarVariants: Variants = {
  open:   { width: 240, transition: { duration: 0.2, ease: 'easeInOut' } },
  closed: { width: 60,  transition: { duration: 0.2, ease: 'easeInOut' } },
}

// ── Upload progress ───────────────────────────────────────────────────────────
export const uploadPanelVariants: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  enter:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit:    { opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.2 } },
}

// ── Presence badge ────────────────────────────────────────────────────────────
export const presenceBadgeVariants: Variants = {
  initial: { scale: 0, opacity: 0 },
  enter:   { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 400, damping: 20 } },
  exit:    { scale: 0, opacity: 0, transition: { duration: 0.15 } },
}

// ── Shared layout transition ──────────────────────────────────────────────────
export const sharedLayoutTransition = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
}
