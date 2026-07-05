import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-nb border-2 border-nb-border text-xs font-heading font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-nb-main text-nb-main-foreground',
        neutral: 'bg-nb-secondary text-nb-foreground',
        danger: 'bg-nb-danger text-white',
        warning: 'bg-nb-warning text-black',
        info: 'bg-nb-info text-white',
        muted: 'bg-nb-secondary text-nb-muted2',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
