import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-nb text-xs font-heading font-bold',
  {
    variants: {
      variant: {
        default: 'bg-nb-main text-nb-main-foreground',
        neutral: 'bg-nb-secondary text-nb-foreground',
        danger: 'bg-nb-danger text-nb-danger-foreground',
        warning: 'bg-nb-warning text-nb-warning-foreground',
        info: 'bg-nb-info text-nb-info-foreground',
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
      style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: '#000000' }}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
